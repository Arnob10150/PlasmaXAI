from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import joblib
import numpy as np
import timm
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ROOT = Path.cwd()

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


def extract_morphological_features(image_path: Path) -> dict[str, float]:
    img = cv2.imread(str(image_path))
    if img is None:
        raise RuntimeError(f"Could not read image: {image_path}")
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (128, 128))
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


def load_backbone(model_name: str, checkpoint_path: Path):
    model = timm.create_model(model_name, pretrained=False, num_classes=2).to(DEVICE)
    model.load_state_dict(torch.load(checkpoint_path, map_location=DEVICE))
    model.eval()
    return model


def image_tensor(image_path: Path, image_size: int = 224):
    tfm = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return tfm(Image.open(image_path).convert("RGB")).unsqueeze(0).to(DEVICE)


def extract_backbone_embedding(model, image):
    with torch.no_grad():
        with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
            feat_map = model.forward_features(image)
            emb = model.forward_head(feat_map, pre_logits=True)
            prob = torch.softmax(model.forward_head(feat_map), dim=1)[:, 1]
    return emb.float(), prob.float()


def main():
    parser = argparse.ArgumentParser(description="Run the PlasmaXAI model on a single cell image.")
    parser.add_argument("image_path", help="Path to a single cell image.")
    args = parser.parse_args()

    summary = json.loads((ROOT / "research" / "outputs" / "novel" / "plasmaxai_operating_point.json").read_text(encoding="utf-8"))
    scalers = joblib.load(ROOT / "research" / "outputs" / "novel" / "fusion_scalers.joblib")
    cf_bundle = joblib.load(ROOT / "research" / "outputs" / "novel" / "counterfactual_bundle.joblib")
    feature_blocks = scalers["feature_blocks"]
    base_summary = json.loads((ROOT / "research" / "outputs" / "novel" / "novel_summary.json").read_text(encoding="utf-8"))
    config = base_summary["best_fusion_config"]

    resnet = load_backbone("resnet50", ROOT / "research" / "outputs" / "optimization" / "checkpoints" / "resnet50_final.pth")
    densenet = load_backbone("densenet121", ROOT / "research" / "outputs" / "optimization" / "checkpoints" / "densenet121_final.pth")

    model = CounterfactualGuidedFusionNet(
        res_dim=len(feature_blocks[0]),
        den_dim=len(feature_blocks[1]),
        morph_dim=len(feature_blocks[2]),
        cf_dim=len(feature_blocks[3]),
        score_dim=len(feature_blocks[4]),
        hidden_dim=config["hidden_dim"],
        tabular_dim=config["tabular_dim"],
        dropout=config["dropout"],
    ).to(DEVICE)
    model.load_state_dict(torch.load(ROOT / "research" / "outputs" / "novel" / "novel_fusion_model.pth", map_location=DEVICE))
    model.eval()

    image_path = Path(args.image_path)
    image = image_tensor(image_path)
    res_emb, res_prob = extract_backbone_embedding(resnet, image)
    den_emb, den_prob = extract_backbone_embedding(densenet, image)
    morph = extract_morphological_features(image_path)
    morph_df = np.array([[morph[col] for col in MORPH_FEATURE_COLUMNS]], dtype=np.float32)
    x_scaled = cf_bundle["scaler"].transform(morph_df)
    clf = cf_bundle["model"]
    margin = clf.decision_function(x_scaled)
    plasma_prob_cf = clf.predict_proba(x_scaled)[:, 1]
    w = clf.coef_[0]
    denom = float(np.dot(w, w) + 1e-8)
    delta = (-np.maximum(margin, 0.0)[:, None] / denom) * w[None, :]
    proto_delta = cf_bundle["benign_proto"][None, :] - x_scaled
    cf_features = np.concatenate([delta, proto_delta, np.array([[margin[0], np.linalg.norm(delta[0]), np.abs(delta[0]).sum(), np.linalg.norm(proto_delta[0])]], dtype=np.float32)], axis=1)
    score_features = np.array([[float(res_prob.item()), float(den_prob.item()), float(plasma_prob_cf[0])]], dtype=np.float32)

    morph_tensor = torch.tensor(scalers["morph"].transform(morph_df), dtype=torch.float32, device=DEVICE)
    cf_tensor = torch.tensor(scalers["cf"].transform(cf_features), dtype=torch.float32, device=DEVICE)
    score_tensor = torch.tensor(scalers["scores"].transform(score_features), dtype=torch.float32, device=DEVICE)

    with torch.no_grad():
        logits, gates = model(res_emb, den_emb, morph_tensor, cf_tensor, score_tensor)
        prob = torch.softmax(logits, dim=1)[:, 1].item()
        gates = gates.squeeze(0).cpu().numpy().tolist()

    threshold = float(summary.get("threshold", 0.5))
    prediction = "plasma" if prob >= threshold else "non_plasma"
    result = {
        "framework": "PlasmaXAI",
        "device": str(DEVICE),
        "image_path": str(image_path),
        "prediction": prediction,
        "plasma_probability": prob,
        "resnet50_probability": float(res_prob.item()),
        "densenet121_probability": float(den_prob.item()),
        "counterfactual_probability": float(plasma_prob_cf[0]),
        "modality_gates": {
            "resnet50": gates[0],
            "densenet121": gates[1],
            "morphology": gates[2],
            "counterfactual": gates[3],
        },
        "morph_features": morph,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

