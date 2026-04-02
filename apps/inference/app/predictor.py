from __future__ import annotations

import io
import json
import os
import urllib.parse
import urllib.request
import base64
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import joblib
import numpy as np
import timm
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms


MORPH_FEATURE_COLUMNS = [
    "nc_ratio",
    "nc_ratio_log1p",
    "nucleus_area",
    "cytoplasm_area",
    "staining_intensity",
    "granularity",
    "roundness",
    "mean_r",
    "mean_g",
    "mean_b",
]


class CounterfactualGuidedFusionNet(nn.Module):
    def __init__(self, res_dim: int, den_dim: int, morph_dim: int, cf_dim: int, score_dim: int, hidden_dim: int, tabular_dim: int, dropout: float):
        super().__init__()
        h = hidden_dim
        t = tabular_dim
        self.res_encoder = nn.Sequential(nn.LayerNorm(res_dim), nn.Linear(res_dim, h), nn.GELU(), nn.Dropout(dropout))
        self.den_encoder = nn.Sequential(nn.LayerNorm(den_dim), nn.Linear(den_dim, h), nn.GELU(), nn.Dropout(dropout))
        self.morph_encoder = nn.Sequential(nn.LayerNorm(morph_dim), nn.Linear(morph_dim, t), nn.GELU(), nn.Dropout(dropout))
        self.cf_encoder = nn.Sequential(nn.LayerNorm(cf_dim), nn.Linear(cf_dim, t), nn.GELU(), nn.Dropout(dropout))
        self.score_encoder = nn.Sequential(nn.LayerNorm(score_dim), nn.Linear(score_dim, t), nn.GELU(), nn.Dropout(dropout))
        self.cf_to_res = nn.Sequential(nn.Linear(t, h), nn.Sigmoid())
        self.cf_to_den = nn.Sequential(nn.Linear(t, h), nn.Sigmoid())
        self.morph_to_scores = nn.Sequential(nn.Linear(t + t, t), nn.GELU(), nn.Dropout(dropout))
        self.modality_gate = nn.Sequential(nn.LayerNorm(h + h + t + t + t), nn.Linear(h + h + t + t + t, 4))
        self.res_unify = nn.Linear(h, h)
        self.den_unify = nn.Linear(h, h)
        self.morph_unify = nn.Linear(t, h)
        self.cf_unify = nn.Linear(t, h)
        self.score_unify = nn.Linear(t, h)
        self.classifier = nn.Sequential(nn.LayerNorm(h * 2), nn.Linear(h * 2, h), nn.GELU(), nn.Dropout(dropout), nn.Linear(h, 2))

    def forward(self, res_emb, den_emb, morph_x, cf_x, score_x):
        res_feat = self.res_encoder(res_emb)
        den_feat = self.den_encoder(den_emb)
        morph_feat = self.morph_encoder(morph_x)
        cf_feat = self.cf_encoder(cf_x)
        score_feat = self.score_encoder(score_x)
        res_feat = res_feat * self.cf_to_res(cf_feat)
        den_feat = den_feat * self.cf_to_den(cf_feat)
        score_feat = score_feat + self.morph_to_scores(torch.cat([morph_feat, cf_feat], dim=1))
        gates = torch.softmax(self.modality_gate(torch.cat([res_feat, den_feat, morph_feat, cf_feat, score_feat], dim=1)), dim=1)
        fused_modal = (
            gates[:, 0:1] * self.res_unify(res_feat)
            + gates[:, 1:2] * self.den_unify(den_feat)
            + gates[:, 2:3] * self.morph_unify(morph_feat)
            + gates[:, 3:4] * self.cf_unify(cf_feat)
        )
        fused = torch.cat([fused_modal, self.score_unify(score_feat)], dim=1)
        logits = self.classifier(fused)
        return logits, gates


@dataclass
class PredictorConfig:
    project_root: Path
    novel_outputs_dir: Path
    checkpoints_dir: Path
    device: torch.device
    supabase_url: str
    supabase_service_role_key: str


def _resolve_asset_directories(project_root: Path) -> tuple[Path, Path]:
    nested_novel = project_root / "research" / "outputs" / "novel"
    nested_checkpoints = project_root / "research" / "outputs" / "optimization" / "checkpoints"

    if nested_novel.exists() and nested_checkpoints.exists():
        return nested_novel, nested_checkpoints

    flat_novel = project_root / "novel_outputs"
    flat_checkpoints = project_root / "optimization_outputs" / "checkpoints"

    if flat_novel.exists() and flat_checkpoints.exists():
        return flat_novel, flat_checkpoints

    return nested_novel, nested_checkpoints


class PlasmaXAIPredictor:
    def __init__(self, config: PredictorConfig):
        self.config = config
        self.device = config.device
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def warmup(self) -> None:
        self._ensure_loaded()

    def _load_backbone(self, model_name: str, checkpoint_path: Path):
        model = timm.create_model(model_name, pretrained=False, num_classes=2).to(self.device)
        model.load_state_dict(torch.load(checkpoint_path, map_location=self.device))
        model.eval()
        return model

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return

        root = self.config.novel_outputs_dir
        self.operating_point = json.loads((root / "plasmaxai_operating_point.json").read_text(encoding="utf-8"))
        self.scalers = joblib.load(root / "fusion_scalers.joblib")
        self.cf_bundle = joblib.load(root / "counterfactual_bundle.joblib")
        self.base_summary = json.loads((root / "novel_summary.json").read_text(encoding="utf-8"))
        self.feature_blocks = self.scalers["feature_blocks"]
        fusion_config = self.base_summary["best_fusion_config"]

        self.resnet = self._load_backbone("resnet50", self.config.checkpoints_dir / "resnet50_final.pth")
        self.densenet = self._load_backbone("densenet121", self.config.checkpoints_dir / "densenet121_final.pth")
        self.model = CounterfactualGuidedFusionNet(
            res_dim=len(self.feature_blocks[0]),
            den_dim=len(self.feature_blocks[1]),
            morph_dim=len(self.feature_blocks[2]),
            cf_dim=len(self.feature_blocks[3]),
            score_dim=len(self.feature_blocks[4]),
            hidden_dim=fusion_config["hidden_dim"],
            tabular_dim=fusion_config["tabular_dim"],
            dropout=fusion_config["dropout"],
        ).to(self.device)
        self.model.load_state_dict(torch.load(root / "novel_fusion_model.pth", map_location=self.device))
        self.model.eval()
        self.threshold = float(self.operating_point.get("threshold", 0.5))
        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )
        self._loaded = True

    def _fetch_bytes(
        self,
        image_path: str,
        image_bucket: str | None = None,
        image_data_url: str | None = None,
    ) -> bytes:
        source = image_data_url or image_path
        if source.startswith("data:"):
            try:
                _, payload = source.split(",", 1)
                return base64.b64decode(payload)
            except Exception as exc:
                raise RuntimeError("Unable to decode provided image data URL.") from exc

        parsed = urllib.parse.urlparse(image_path)
        if parsed.scheme in {"http", "https"}:
            with urllib.request.urlopen(image_path) as response:
                return response.read()

        local_path = Path(image_path)
        if local_path.exists():
            return local_path.read_bytes()

        if image_bucket and self.config.supabase_url and self.config.supabase_service_role_key:
            encoded_path = urllib.parse.quote(image_path, safe="/")
            url = f"{self.config.supabase_url.rstrip('/')}/storage/v1/object/authenticated/{image_bucket}/{encoded_path}"
            request = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {self.config.supabase_service_role_key}",
                    "apikey": self.config.supabase_service_role_key,
                },
            )
            with urllib.request.urlopen(request) as response:
                return response.read()

        raise FileNotFoundError(f"Could not resolve image source: {image_path}")

    def _decode_rgb(self, image_bytes: bytes) -> np.ndarray:
        array = np.frombuffer(image_bytes, dtype=np.uint8)
        image_bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if image_bgr is None:
            raise RuntimeError("Unable to decode image bytes.")
        return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

    def _extract_morphological_features(self, image_rgb: np.ndarray) -> dict[str, float]:
        img_resized = cv2.resize(image_rgb, (128, 128))
        mean_r = float(np.mean(img_resized[:, :, 0]) / 255.0)
        mean_g = float(np.mean(img_resized[:, :, 1]) / 255.0)
        mean_b = float(np.mean(img_resized[:, :, 2]) / 255.0)
        staining_intensity = float(1.0 - np.mean(img_resized) / 255.0)
        gray = cv2.cvtColor(img_resized, cv2.COLOR_RGB2GRAY)
        _, nucleus_mask = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)
        _, cell_mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
        nucleus_area = float(np.sum(nucleus_mask > 0) / (128 * 128))
        cell_area = float(np.sum(cell_mask > 0) / (128 * 128))
        cytoplasm_area = float(max(0.0, cell_area - nucleus_area))
        nc_ratio = float(min(nucleus_area / max(cytoplasm_area, 1e-3), 25.0))
        granularity = float(cv2.Laplacian(gray, cv2.CV_64F).var() / 1000.0)
        contours, _ = cv2.findContours(nucleus_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        roundness = 0.0
        if contours:
            cnt = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(cnt)
            perimeter = cv2.arcLength(cnt, True)
            if perimeter > 0:
                roundness = float((4 * np.pi * area) / (perimeter ** 2))
        return {
            "nc_ratio": nc_ratio,
            "nc_ratio_log1p": float(np.log1p(nc_ratio)),
            "nucleus_area": nucleus_area,
            "cytoplasm_area": cytoplasm_area,
            "staining_intensity": staining_intensity,
            "granularity": granularity,
            "roundness": roundness,
            "mean_r": mean_r,
            "mean_g": mean_g,
            "mean_b": mean_b,
        }

    def _image_tensor(self, image_bytes: bytes):
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return self.transform(pil_image).unsqueeze(0).to(self.device)

    def _extract_backbone_embedding(self, model, image_tensor):
        with torch.no_grad():
            with torch.autocast(device_type=self.device.type, enabled=self.device.type == "cuda"):
                feat_map = model.forward_features(image_tensor)
                emb = model.forward_head(feat_map, pre_logits=True)
                prob = torch.softmax(model.forward_head(feat_map), dim=1)[:, 1]
        return emb.float(), prob.float()

    def _top_counterfactual_features(self, delta: np.ndarray, count: int = 3) -> list[str]:
        ranked = np.argsort(np.abs(delta))[::-1][:count]
        return [MORPH_FEATURE_COLUMNS[idx] for idx in ranked]

    def _risk_level(self, probability: float) -> str:
        if probability >= max(self.threshold + 0.15, 0.85):
            return "high"
        if probability >= self.threshold:
            return "moderate"
        return "low"

    def predict(
        self,
        image_path: str,
        image_bucket: str | None = None,
        image_data_url: str | None = None,
    ) -> dict[str, Any]:
        self._ensure_loaded()
        image_bytes = self._fetch_bytes(
            image_path,
            image_bucket=image_bucket,
            image_data_url=image_data_url,
        )
        image_rgb = self._decode_rgb(image_bytes)
        image_tensor = self._image_tensor(image_bytes)

        res_emb, res_prob = self._extract_backbone_embedding(self.resnet, image_tensor)
        den_emb, den_prob = self._extract_backbone_embedding(self.densenet, image_tensor)
        morph = self._extract_morphological_features(image_rgb)
        morph_df = np.array([[morph[col] for col in MORPH_FEATURE_COLUMNS]], dtype=np.float32)
        x_scaled = self.cf_bundle["scaler"].transform(morph_df)
        clf = self.cf_bundle["model"]
        margin = clf.decision_function(x_scaled)
        plasma_prob_cf = clf.predict_proba(x_scaled)[:, 1]
        weights = clf.coef_[0]
        denom = float(np.dot(weights, weights) + 1e-8)
        delta = (-np.maximum(margin, 0.0)[:, None] / denom) * weights[None, :]
        proto_delta = self.cf_bundle["benign_proto"][None, :] - x_scaled
        cf_features = np.concatenate(
            [
                delta,
                proto_delta,
                np.array(
                    [[margin[0], np.linalg.norm(delta[0]), np.abs(delta[0]).sum(), np.linalg.norm(proto_delta[0])]],
                    dtype=np.float32,
                ),
            ],
            axis=1,
        )
        score_features = np.array(
            [[float(res_prob.item()), float(den_prob.item()), float(plasma_prob_cf[0])]],
            dtype=np.float32,
        )

        morph_tensor = torch.tensor(self.scalers["morph"].transform(morph_df), dtype=torch.float32, device=self.device)
        cf_tensor = torch.tensor(self.scalers["cf"].transform(cf_features), dtype=torch.float32, device=self.device)
        score_tensor = torch.tensor(self.scalers["scores"].transform(score_features), dtype=torch.float32, device=self.device)

        with torch.no_grad():
            logits, gates = self.model(res_emb, den_emb, morph_tensor, cf_tensor, score_tensor)
            prob = torch.softmax(logits, dim=1)[:, 1].item()
            gates = gates.squeeze(0).cpu().numpy().tolist()

        top_features = self._top_counterfactual_features(delta[0])
        prediction = "plasma" if prob >= self.threshold else "non_plasma"
        risk_level = self._risk_level(prob)
        confidence = prob if prediction == "plasma" else 1.0 - prob
        counterfactual_text = (
            f"Minimal benign shift would most strongly reduce {', '.join(top_features)}. "
            f"Current decision margin is {float(margin[0]):.3f} relative to the calibrated PlasmaXAI boundary."
        )
        dominant_modality = ["resnet50", "densenet121", "morphology", "counterfactual"][int(np.argmax(gates))]
        clinical_insight_text = (
            f"The case is driven primarily by the {dominant_modality} branch with supportive shifts in {', '.join(top_features)}. "
            f"Calibrated malignant probability is {prob:.3f} against a deployment threshold of {self.threshold:.2f}."
        )

        return {
            "framework": "PlasmaXAI",
            "modelVersion": "PlasmaXAI-novel",
            "device": str(self.device),
            "threshold": self.threshold,
            "prediction": {
                "label": prediction,
                "confidence": float(confidence),
                "plasmaProbability": float(prob),
                "riskLevel": risk_level,
                "predictedClassText": "Malignant plasma cell likely" if prediction == "plasma" else "Non-plasma / benign leaning",
            },
            "probabilities": {
                "plasmaxai": float(prob),
                "resnet50": float(res_prob.item()),
                "densenet121": float(den_prob.item()),
                "counterfactual": float(plasma_prob_cf[0]),
            },
            "modalityGates": {
                "resnet50": float(gates[0]),
                "densenet121": float(gates[1]),
                "morphology": float(gates[2]),
                "counterfactual": float(gates[3]),
            },
            "explanation": {
                "counterfactualText": counterfactual_text,
                "clinicalInsightText": clinical_insight_text,
                "topFeatures": top_features,
            },
            "morphology": morph,
        }


@lru_cache(maxsize=1)
def get_predictor() -> PlasmaXAIPredictor:
    service_root = Path(__file__).resolve().parents[1]
    staged_asset_root = service_root / "model_assets"
    default_project_root = staged_asset_root if staged_asset_root.exists() else Path(__file__).resolve().parents[3]
    project_root = Path(os.environ.get("PLASMAXAI_PROJECT_ROOT", default_project_root))
    novel_outputs_dir, checkpoints_dir = _resolve_asset_directories(project_root)
    config = PredictorConfig(
        project_root=project_root,
        novel_outputs_dir=novel_outputs_dir,
        checkpoints_dir=checkpoints_dir,
        device=torch.device("cuda" if torch.cuda.is_available() else "cpu"),
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
    )
    return PlasmaXAIPredictor(config)
