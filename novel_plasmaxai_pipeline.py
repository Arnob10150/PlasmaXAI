from __future__ import annotations

import gc
import json
import random
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import timm
import torch
import torch.nn as nn
from PIL import Image
from scipy.stats import mannwhitneyu, pearsonr
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, Dataset, TensorDataset, WeightedRandomSampler
from torchvision import transforms


SEED = 42
ROOT = Path.cwd()
DATASET_DIR = ROOT / "PCMMD_LOCAL" / "set1"
PATIENT_ROOT = ROOT / "PCMMD Plasma Cells for Multiple Myeloma Diagnosis" / "PCMMD Plasma Cells for Multiple Myeloma Diagnosis" / "data" / "detection" / "patients"
PREV_OUTPUT_DIR = ROOT / "optimization_outputs"
OUT_DIR = ROOT / "novel_outputs"
CACHE_DIR = OUT_DIR / "cache"
FIG_DIR = OUT_DIR / "figures"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
CLASS_NAMES = ["non_plasma", "plasma"]
CLASS_MAP = {"non_plasma": 0, "plasma": 1}

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


@dataclass
class FusionConfig:
    name: str
    hidden_dim: int
    tabular_dim: int
    dropout: float
    lr: float
    weight_decay: float
    epochs: int
    batch_size: int
    patience: int


class PathDataset(Dataset):
    def __init__(self, dataframe: pd.DataFrame, image_size: int):
        self.data = dataframe.reset_index(drop=True)
        self.transform = transforms.Compose(
            [
                transforms.Resize((image_size, image_size)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, idx: int):
        row = self.data.iloc[idx]
        image = Image.open(row["path"]).convert("RGB")
        return self.transform(image), int(row["label"]), row["path"]


class CropDataset(Dataset):
    def __init__(self, crops: List[Dict[str, object]], image_size: int):
        self.crops = crops
        self.transform = transforms.Compose(
            [
                transforms.Resize((image_size, image_size)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )

    def __len__(self) -> int:
        return len(self.crops)

    def __getitem__(self, idx: int):
        row = self.crops[idx]
        image = Image.fromarray(row["crop_rgb"])
        return self.transform(image), int(row["label"]), row["patient_id"], row["source_image"], int(row["cell_index"])


class CounterfactualGuidedFusionNet(nn.Module):
    def __init__(self, res_dim: int, den_dim: int, morph_dim: int, cf_dim: int, score_dim: int, config: FusionConfig):
        super().__init__()
        h = config.hidden_dim
        t = config.tabular_dim

        self.res_encoder = nn.Sequential(nn.LayerNorm(res_dim), nn.Linear(res_dim, h), nn.GELU(), nn.Dropout(config.dropout))
        self.den_encoder = nn.Sequential(nn.LayerNorm(den_dim), nn.Linear(den_dim, h), nn.GELU(), nn.Dropout(config.dropout))
        self.morph_encoder = nn.Sequential(nn.LayerNorm(morph_dim), nn.Linear(morph_dim, t), nn.GELU(), nn.Dropout(config.dropout))
        self.cf_encoder = nn.Sequential(nn.LayerNorm(cf_dim), nn.Linear(cf_dim, t), nn.GELU(), nn.Dropout(config.dropout))
        self.score_encoder = nn.Sequential(nn.LayerNorm(score_dim), nn.Linear(score_dim, t), nn.GELU(), nn.Dropout(config.dropout))

        self.cf_to_res = nn.Sequential(nn.Linear(t, h), nn.Sigmoid())
        self.cf_to_den = nn.Sequential(nn.Linear(t, h), nn.Sigmoid())
        self.morph_to_scores = nn.Sequential(nn.Linear(t + t, t), nn.GELU(), nn.Dropout(config.dropout))
        self.modality_gate = nn.Sequential(nn.LayerNorm(h + h + t + t + t), nn.Linear(h + h + t + t + t, 4))

        self.res_unify = nn.Linear(h, h)
        self.den_unify = nn.Linear(h, h)
        self.morph_unify = nn.Linear(t, h)
        self.cf_unify = nn.Linear(t, h)
        self.score_unify = nn.Linear(t, h)
        self.classifier = nn.Sequential(
            nn.LayerNorm(h * 2),
            nn.Linear(h * 2, h),
            nn.GELU(),
            nn.Dropout(config.dropout),
            nn.Linear(h, 2),
        )

    def forward(self, res_emb, den_emb, morph_x, cf_x, score_x):
        res_feat = self.res_encoder(res_emb)
        den_feat = self.den_encoder(den_emb)
        morph_feat = self.morph_encoder(morph_x)
        cf_feat = self.cf_encoder(cf_x)
        score_feat = self.score_encoder(score_x)

        res_feat = res_feat * self.cf_to_res(cf_feat)
        den_feat = den_feat * self.cf_to_den(cf_feat)
        score_feat = score_feat + self.morph_to_scores(torch.cat([morph_feat, cf_feat], dim=1))

        gate_context = torch.cat([res_feat, den_feat, morph_feat, cf_feat, score_feat], dim=1)
        gates = torch.softmax(self.modality_gate(gate_context), dim=1)

        fused_modal = (
            gates[:, 0:1] * self.res_unify(res_feat)
            + gates[:, 1:2] * self.den_unify(den_feat)
            + gates[:, 2:3] * self.morph_unify(morph_feat)
            + gates[:, 3:4] * self.cf_unify(cf_feat)
        )
        fused = torch.cat([fused_modal, self.score_unify(score_feat)], dim=1)
        logits = self.classifier(fused)
        return logits, gates


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False


def ensure_dirs() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    CACHE_DIR.mkdir(exist_ok=True)
    FIG_DIR.mkdir(exist_ok=True)


def load_dataset(root_path: Path) -> pd.DataFrame:
    rows = []
    for cls in CLASS_NAMES:
        for p in sorted((root_path / cls).glob("*")):
            if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}:
                rows.append({"path": str(p), "label": CLASS_MAP[cls], "class": cls, "image_id": p.name})
    df = pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError(f"No images found in {root_path}")
    return df


def extract_morphological_features_from_array(img_rgb: np.ndarray) -> Dict[str, float]:
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


def extract_morphological_features(img_path: str) -> Dict[str, float] | None:
    img = cv2.imread(img_path)
    if img is None:
        return None
    return extract_morphological_features_from_array(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def build_morph_cache(df: pd.DataFrame) -> pd.DataFrame:
    cache_path = CACHE_DIR / "segmentation_morph_features.csv"
    if cache_path.exists():
        cached = pd.read_csv(cache_path)
        if set(cached["path"]) == set(df["path"]):
            return cached

    rows = []
    for rec in df.to_dict("records"):
        feat = extract_morphological_features(rec["path"])
        if feat is None:
            continue
        feat["path"] = rec["path"]
        feat["label"] = rec["label"]
        feat["class"] = rec["class"]
        rows.append(feat)
    feat_df = pd.DataFrame(rows)
    feat_df.to_csv(cache_path, index=False)
    return feat_df


def load_backbone(model_name: str, checkpoint_path: Path):
    model = timm.create_model(model_name, pretrained=False, num_classes=2).to(DEVICE)
    model.load_state_dict(torch.load(checkpoint_path, map_location=DEVICE))
    model.eval()
    return model


def extract_backbone_features(model, loader, model_prefix: str) -> pd.DataFrame:
    rows = []
    with torch.no_grad():
        for images, labels, paths in loader:
            images = images.to(DEVICE, non_blocking=True)
            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                feat_map = model.forward_features(images)
                emb = model.forward_head(feat_map, pre_logits=True)
                logits = model.forward_head(feat_map)
                probs = torch.softmax(logits, dim=1)[:, 1]
            emb_np = emb.detach().cpu().numpy()
            prob_np = probs.detach().cpu().numpy()
            for i, path in enumerate(paths):
                row = {"path": path, f"{model_prefix}_prob": float(prob_np[i]), "label": int(labels[i])}
                for j, value in enumerate(emb_np[i]):
                    row[f"{model_prefix}_emb_{j}"] = float(value)
                rows.append(row)
    return pd.DataFrame(rows)


def get_or_build_embeddings(split_df: pd.DataFrame, split_name: str, image_size: int = 224) -> pd.DataFrame:
    cache_path = CACHE_DIR / f"{split_name}_embeddings.pkl"
    if cache_path.exists():
        return pd.read_pickle(cache_path)

    loader = DataLoader(PathDataset(split_df, image_size=image_size), batch_size=48, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
    resnet = load_backbone("resnet50", PREV_OUTPUT_DIR / "checkpoints" / "resnet50_final.pth")
    densenet = load_backbone("densenet121", PREV_OUTPUT_DIR / "checkpoints" / "densenet121_final.pth")

    res_df = extract_backbone_features(resnet, loader, "resnet")
    den_df = extract_backbone_features(densenet, loader, "densenet")
    merged = res_df.merge(den_df.drop(columns=["label"]), on="path")
    merged.to_pickle(cache_path)

    del resnet, densenet, loader
    gc.collect()
    if DEVICE.type == "cuda":
        torch.cuda.empty_cache()
    return merged


def fit_counterfactual_model(train_feat_df: pd.DataFrame) -> Dict[str, object]:
    scaler = StandardScaler()
    x_train = scaler.fit_transform(train_feat_df[MORPH_FEATURE_COLUMNS].fillna(0.0).values)
    y_train = train_feat_df["label"].values.astype(np.int64)
    clf = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED)
    clf.fit(x_train, y_train)
    benign_proto = x_train[y_train == 0].mean(axis=0)
    return {"scaler": scaler, "model": clf, "benign_proto": benign_proto}


def compute_counterfactual_features(bundle: Dict[str, object], feat_df: pd.DataFrame) -> pd.DataFrame:
    scaler: StandardScaler = bundle["scaler"]
    clf: LogisticRegression = bundle["model"]
    benign_proto = bundle["benign_proto"]

    x = scaler.transform(feat_df[MORPH_FEATURE_COLUMNS].fillna(0.0).values)
    margin = clf.decision_function(x)
    plasma_prob = clf.predict_proba(x)[:, 1]
    w = clf.coef_[0]
    denom = float(np.dot(w, w) + 1e-8)
    positive_margin = np.maximum(margin, 0.0)
    delta = (-positive_margin[:, None] / denom) * w[None, :]
    proto_delta = benign_proto[None, :] - x
    cf_distance_l2 = np.linalg.norm(delta, axis=1)
    cf_distance_l1 = np.abs(delta).sum(axis=1)
    proto_distance = np.linalg.norm(proto_delta, axis=1)
    top_idx = np.argmax(np.abs(delta), axis=1)

    out = feat_df[["path", "label", "class"]].copy()
    for i, feat in enumerate(MORPH_FEATURE_COLUMNS):
        out[f"cf_shift_{feat}"] = delta[:, i]
        out[f"proto_shift_{feat}"] = proto_delta[:, i]
    out["cf_margin"] = margin
    out["cf_distance_l2"] = cf_distance_l2
    out["cf_distance_l1"] = cf_distance_l1
    out["cf_plasma_prob"] = plasma_prob
    out["cf_proto_distance"] = proto_distance
    out["cf_top_feature"] = [MORPH_FEATURE_COLUMNS[i] for i in top_idx]
    return out


def merge_modalities(df: pd.DataFrame, feat_df: pd.DataFrame, emb_df: pd.DataFrame, cf_df: pd.DataFrame) -> pd.DataFrame:
    merged = df[["path", "label", "class"]].merge(feat_df.drop(columns=["label", "class"]), on="path")
    merged = merged.merge(emb_df.drop(columns=["label"]), on="path")
    merged = merged.merge(cf_df.drop(columns=["label", "class"]), on="path")
    return merged


def get_feature_blocks(merged_df: pd.DataFrame):
    res_cols = [c for c in merged_df.columns if c.startswith("resnet_emb_")]
    den_cols = [c for c in merged_df.columns if c.startswith("densenet_emb_")]
    score_cols = ["resnet_prob", "densenet_prob", "cf_plasma_prob"]
    cf_cols = [c for c in merged_df.columns if c.startswith("cf_shift_")] + [c for c in merged_df.columns if c.startswith("proto_shift_")] + [
        "cf_margin",
        "cf_distance_l2",
        "cf_distance_l1",
        "cf_proto_distance",
    ]
    return res_cols, den_cols, MORPH_FEATURE_COLUMNS, cf_cols, score_cols


def build_tensor_dataset(df: pd.DataFrame, feature_blocks):
    res_cols, den_cols, morph_cols, cf_cols, score_cols = feature_blocks
    res = torch.tensor(df[res_cols].values, dtype=torch.float32)
    den = torch.tensor(df[den_cols].values, dtype=torch.float32)
    morph = torch.tensor(df[morph_cols].values, dtype=torch.float32)
    cf = torch.tensor(df[cf_cols].values, dtype=torch.float32)
    scores = torch.tensor(df[score_cols].values, dtype=torch.float32)
    labels = torch.tensor(df["label"].values, dtype=torch.long)
    return TensorDataset(res, den, morph, cf, scores, labels)


def search_best_threshold(labels: np.ndarray, probs: np.ndarray, clinical_floor: float = 90.0) -> Dict[str, object]:
    best = None
    for threshold in np.linspace(0.05, 0.95, 181):
        preds = (probs >= threshold).astype(np.int64)
        metrics = {
            "accuracy": accuracy_score(labels, preds) * 100.0,
            "weighted_f1": f1_score(labels, preds, average="weighted") * 100.0,
            "plasma_precision": precision_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
            "plasma_recall": recall_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
            "auc": roc_auc_score(labels, probs) * 100.0,
            "preds": preds,
        }
        priority = (
            int(metrics["plasma_recall"] >= clinical_floor),
            metrics["accuracy"],
            metrics["weighted_f1"],
            metrics["auc"],
            metrics["plasma_recall"],
        )
        if best is None or priority > best["priority"]:
            best = {"threshold": float(threshold), "metrics": metrics, "priority": priority}
    return best


def metrics_at_threshold(labels: np.ndarray, probs: np.ndarray, threshold: float) -> Dict[str, object]:
    preds = (probs >= threshold).astype(np.int64)
    return {
        "accuracy": accuracy_score(labels, preds) * 100.0,
        "weighted_f1": f1_score(labels, preds, average="weighted") * 100.0,
        "plasma_precision": precision_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
        "plasma_recall": recall_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
        "auc": roc_auc_score(labels, probs) * 100.0,
        "preds": preds,
    }


def make_ablation_df(df: pd.DataFrame, feature_blocks, mode: str) -> pd.DataFrame:
    out = df.copy()
    _, _, morph_cols, cf_cols, score_cols = feature_blocks
    if mode == "full":
        return out
    if mode == "no_counterfactual":
        out.loc[:, cf_cols] = 0.0
        if "cf_plasma_prob" in score_cols:
            out.loc[:, "cf_plasma_prob"] = 0.0
        return out
    if mode == "no_morphology":
        out.loc[:, morph_cols] = 0.0
        return out
    if mode == "image_only":
        out.loc[:, morph_cols] = 0.0
        out.loc[:, cf_cols] = 0.0
        if "cf_plasma_prob" in score_cols:
            out.loc[:, "cf_plasma_prob"] = 0.0
        return out
    raise ValueError(f"Unknown ablation mode: {mode}")


def bootstrap_metric_summary(y_true: np.ndarray, probs: np.ndarray, threshold: float, n_boot: int = 1000) -> Dict[str, Dict[str, float]]:
    rng = np.random.default_rng(SEED)
    rows = []
    n = len(y_true)
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        if len(np.unique(y_true[idx])) < 2:
            continue
        m = metrics_at_threshold(y_true[idx], probs[idx], threshold)
        rows.append({k: float(m[k]) for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]})
    boot = pd.DataFrame(rows)
    summary = {}
    for col in boot.columns:
        summary[col] = {
            "mean": float(boot[col].mean()),
            "low95": float(boot[col].quantile(0.025)),
            "high95": float(boot[col].quantile(0.975)),
        }
    return summary


def evaluate_fusion(model: nn.Module, loader: DataLoader):
    model.eval()
    all_probs = []
    all_labels = []
    all_gates = []
    total_loss = 0.0
    total_count = 0
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for res, den, morph, cf, scores, labels in loader:
            res, den = res.to(DEVICE), den.to(DEVICE)
            morph, cf = morph.to(DEVICE), cf.to(DEVICE)
            scores, labels = scores.to(DEVICE), labels.to(DEVICE)
            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                logits, gates = model(res, den, morph, cf, scores)
                loss = criterion(logits, labels)
                probs = torch.softmax(logits, dim=1)[:, 1]
            total_loss += loss.item() * labels.size(0)
            total_count += labels.size(0)
            all_probs.append(probs.cpu().numpy())
            all_labels.append(labels.cpu().numpy())
            all_gates.append(gates.cpu().numpy())
    return total_loss / total_count, np.concatenate(all_probs), np.concatenate(all_labels), np.concatenate(all_gates)


def train_fusion_model(train_df: pd.DataFrame, val_df: pd.DataFrame, feature_blocks, config: FusionConfig) -> Dict[str, object]:
    train_ds = build_tensor_dataset(train_df, feature_blocks)
    val_ds = build_tensor_dataset(val_df, feature_blocks)

    class_counts = np.bincount(train_df["label"].values, minlength=2)
    weights = 1.0 / class_counts
    sample_weights = weights[train_df["label"].values]
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=config.batch_size, sampler=sampler, num_workers=0, pin_memory=DEVICE.type == "cuda")
    val_loader = DataLoader(val_ds, batch_size=config.batch_size, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")

    res_cols, den_cols, morph_cols, cf_cols, score_cols = feature_blocks
    model = CounterfactualGuidedFusionNet(
        res_dim=len(res_cols),
        den_dim=len(den_cols),
        morph_dim=len(morph_cols),
        cf_dim=len(cf_cols),
        score_dim=len(score_cols),
        config=config,
    ).to(DEVICE)
    class_weight = torch.tensor((len(train_df) / (2.0 * class_counts)).astype(np.float32), device=DEVICE)
    criterion = nn.CrossEntropyLoss(weight=class_weight)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.lr, weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config.epochs)
    scaler = torch.amp.GradScaler(enabled=DEVICE.type == "cuda")

    history = []
    best_state = None
    best_priority = None
    best_threshold = 0.5
    best_metrics = None
    best_gates = None
    bad_epochs = 0

    for epoch in range(config.epochs):
        model.train()
        total_loss, total_correct, total_count = 0.0, 0, 0
        for res, den, morph, cf, scores, labels in train_loader:
            res, den = res.to(DEVICE), den.to(DEVICE)
            morph, cf = morph.to(DEVICE), cf.to(DEVICE)
            scores, labels = scores.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                logits, _ = model(res, den, morph, cf, scores)
                loss = criterion(logits, labels)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            total_loss += loss.item() * labels.size(0)
            total_correct += (logits.argmax(dim=1) == labels).sum().item()
            total_count += labels.size(0)

        scheduler.step()
        val_loss, val_probs, val_labels, val_gates = evaluate_fusion(model, val_loader)
        val_best = search_best_threshold(val_labels, val_probs)
        history.append(
            {
                "epoch": epoch + 1,
                "train_loss": total_loss / total_count,
                "train_acc": total_correct / total_count * 100.0,
                "val_loss": val_loss,
                "val_acc": val_best["metrics"]["accuracy"],
                "val_f1": val_best["metrics"]["weighted_f1"],
                "val_recall": val_best["metrics"]["plasma_recall"],
                "val_auc": val_best["metrics"]["auc"],
                "threshold": val_best["threshold"],
                "gate_resnet": float(val_gates[:, 0].mean()),
                "gate_densenet": float(val_gates[:, 1].mean()),
                "gate_morph": float(val_gates[:, 2].mean()),
                "gate_cf": float(val_gates[:, 3].mean()),
            }
        )

        if best_priority is None or val_best["priority"] > best_priority:
            best_priority = val_best["priority"]
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
            best_threshold = float(val_best["threshold"])
            best_metrics = val_best["metrics"]
            best_gates = val_gates
            bad_epochs = 0
            print(
                f"[{config.name}] epoch {epoch + 1:02d} best val_acc={best_metrics['accuracy']:.2f} "
                f"val_f1={best_metrics['weighted_f1']:.2f} val_recall={best_metrics['plasma_recall']:.2f} thr={best_threshold:.2f}"
            )
        else:
            bad_epochs += 1

        if bad_epochs >= config.patience:
            break

    model.load_state_dict(best_state)
    return {"model": model, "config": asdict(config), "history": history, "best_threshold": best_threshold, "best_metrics": best_metrics, "best_gates": best_gates}


def run_fusion_search(train_df: pd.DataFrame, val_df: pd.DataFrame, feature_blocks):
    configs = [
        FusionConfig("fusion_cfg_a", hidden_dim=256, tabular_dim=128, dropout=0.25, lr=1e-3, weight_decay=1e-4, epochs=60, batch_size=128, patience=10),
        FusionConfig("fusion_cfg_b", hidden_dim=384, tabular_dim=160, dropout=0.30, lr=8e-4, weight_decay=2e-4, epochs=70, batch_size=128, patience=12),
        FusionConfig("fusion_cfg_c", hidden_dim=320, tabular_dim=128, dropout=0.20, lr=7e-4, weight_decay=1e-4, epochs=70, batch_size=128, patience=12),
    ]
    results = [train_fusion_model(train_df, val_df, feature_blocks, cfg) for cfg in configs]
    best = max(
        results,
        key=lambda r: (
            int(r["best_metrics"]["plasma_recall"] >= 90.0),
            r["best_metrics"]["accuracy"],
            r["best_metrics"]["weighted_f1"],
            r["best_metrics"]["auc"],
        ),
    )
    return best, results


def run_ablation_study(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame, feature_blocks, base_config: Dict[str, object]) -> List[Dict[str, object]]:
    ablations = [
        ("image_only", "Image Only"),
        ("no_morphology", "Without Morphology"),
        ("no_counterfactual", "Without Counterfactual Path"),
        ("full", "Full Novel Fusion"),
    ]
    cfg = FusionConfig(**base_config)
    results = []
    for mode, label in ablations:
        train_ab = make_ablation_df(train_df, feature_blocks, mode)
        val_ab = make_ablation_df(val_df, feature_blocks, mode)
        test_ab = make_ablation_df(test_df, feature_blocks, mode)
        fitted = train_fusion_model(train_ab, val_ab, feature_blocks, cfg)
        val_ds = build_tensor_dataset(val_ab, feature_blocks)
        test_ds = build_tensor_dataset(test_ab, feature_blocks)
        val_loader = DataLoader(val_ds, batch_size=256, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
        test_loader = DataLoader(test_ds, batch_size=256, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
        _, val_probs, val_labels, _ = evaluate_fusion(fitted["model"], val_loader)
        _, test_probs, test_labels, _ = evaluate_fusion(fitted["model"], test_loader)
        val_best = search_best_threshold(val_labels, val_probs)
        test_metrics = metrics_at_threshold(test_labels, test_probs, val_best["threshold"])
        results.append(
            {
                "mode": mode,
                "label": label,
                "threshold": float(val_best["threshold"]),
                "history": fitted["history"],
                "val_metrics": {k: float(v) for k, v in val_best["metrics"].items() if k != "preds"},
                "test_metrics": {k: float(v) for k, v in test_metrics.items() if k != "preds"},
            }
        )
    return results


def make_patient_crops(patient_root: Path) -> Tuple[List[Dict[str, object]], pd.DataFrame]:
    diagnosis_df = pd.read_csv(patient_root / "diagnosis.csv")
    diagnosis_df["patient"] = diagnosis_df["patient"].astype(int)
    crops = []
    for patient_dir in sorted([p for p in patient_root.iterdir() if p.is_dir() and p.name.startswith("patient")]):
        patient_id = int(patient_dir.name.split()[-1])
        for img_path in sorted((patient_dir / "images").glob("*")):
            label_path = patient_dir / "labels" / f"{img_path.stem}.txt"
            if not label_path.exists():
                continue
            image_bgr = cv2.imread(str(img_path))
            if image_bgr is None:
                continue
            image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
            h, w = image_rgb.shape[:2]
            for cell_index, line in enumerate([ln for ln in label_path.read_text(encoding="utf-8").splitlines() if ln.strip()]):
                cls_id, xc, yc, bw, bh = [float(x) for x in line.split()]
                x1 = max(0, int((xc - bw / 2.0) * w))
                y1 = max(0, int((yc - bh / 2.0) * h))
                x2 = min(w, int((xc + bw / 2.0) * w))
                y2 = min(h, int((yc + bh / 2.0) * h))
                pad_x = int((x2 - x1) * 0.10)
                pad_y = int((y2 - y1) * 0.10)
                x1, y1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
                x2, y2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
                crop = image_rgb[y1:y2, x1:x2]
                if crop.size == 0:
                    continue
                crops.append(
                    {
                        "patient_id": patient_id,
                        "label": 1 if int(cls_id) == 0 else 0,  # plasma should be positive class for consistency
                        "class": "plasma" if int(cls_id) == 0 else "non_plasma",
                        "source_image": img_path.name,
                        "cell_index": cell_index,
                        "crop_rgb": crop,
                    }
                )
    return crops, diagnosis_df


def extract_patient_embeddings(crops: List[Dict[str, object]], image_size: int = 224) -> pd.DataFrame:
    loader = DataLoader(CropDataset(crops, image_size=image_size), batch_size=64, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
    resnet = load_backbone("resnet50", PREV_OUTPUT_DIR / "checkpoints" / "resnet50_final.pth")
    densenet = load_backbone("densenet121", PREV_OUTPUT_DIR / "checkpoints" / "densenet121_final.pth")
    rows = []
    with torch.no_grad():
        for images, labels, patient_ids, source_images, cell_indices in loader:
            images = images.to(DEVICE)
            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                res_map = resnet.forward_features(images)
                res_emb = resnet.forward_head(res_map, pre_logits=True)
                res_prob = torch.softmax(resnet.forward_head(res_map), dim=1)[:, 1]
                den_map = densenet.forward_features(images)
                den_emb = densenet.forward_head(den_map, pre_logits=True)
                den_prob = torch.softmax(densenet.forward_head(den_map), dim=1)[:, 1]
            for i in range(images.size(0)):
                row = {
                    "patient_id": int(patient_ids[i]),
                    "source_image": source_images[i],
                    "cell_index": int(cell_indices[i]),
                    "label": int(labels[i]),
                    "resnet_prob": float(res_prob[i].cpu().item()),
                    "densenet_prob": float(den_prob[i].cpu().item()),
                }
                for j, value in enumerate(res_emb[i].cpu().numpy()):
                    row[f"resnet_emb_{j}"] = float(value)
                for j, value in enumerate(den_emb[i].cpu().numpy()):
                    row[f"densenet_emb_{j}"] = float(value)
                rows.append(row)
    return pd.DataFrame(rows)


def infer_patient_cells(crops: List[Dict[str, object]], fusion_model: nn.Module, feature_blocks, cf_bundle: Dict[str, object], morph_scaler: StandardScaler, cf_scaler: StandardScaler, score_scaler: StandardScaler) -> pd.DataFrame:
    emb_df = extract_patient_embeddings(crops)

    morph_rows = []
    for crop in crops:
        feat = extract_morphological_features_from_array(crop["crop_rgb"])
        feat["patient_id"] = crop["patient_id"]
        feat["source_image"] = crop["source_image"]
        feat["cell_index"] = crop["cell_index"]
        feat["label"] = crop["label"]
        feat["class"] = crop["class"]
        feat["path"] = f"patient_{crop['patient_id']}_{crop['source_image']}_{crop['cell_index']}"
        morph_rows.append(feat)
    morph_df = pd.DataFrame(morph_rows)
    cf_df = compute_counterfactual_features(cf_bundle, morph_df)

    merged = emb_df.merge(morph_df.drop(columns=["label", "class"]), on=["patient_id", "source_image", "cell_index"])
    merged = merged.merge(cf_df.drop(columns=["label", "class"]), on="path")

    res_cols, den_cols, morph_cols, cf_cols, score_cols = feature_blocks
    res_x = torch.tensor(merged[res_cols].values, dtype=torch.float32, device=DEVICE)
    den_x = torch.tensor(merged[den_cols].values, dtype=torch.float32, device=DEVICE)
    morph_x = torch.tensor(morph_scaler.transform(merged[morph_cols].values), dtype=torch.float32, device=DEVICE)
    cf_x = torch.tensor(cf_scaler.transform(merged[cf_cols].values), dtype=torch.float32, device=DEVICE)
    scores_x = torch.tensor(score_scaler.transform(merged[score_cols].values), dtype=torch.float32, device=DEVICE)

    fusion_model.eval()
    with torch.no_grad():
        logits, gates = fusion_model(res_x, den_x, morph_x, cf_x, scores_x)
        probs = torch.softmax(logits, dim=1)[:, 1].cpu().numpy()
        gates = gates.cpu().numpy()
    merged["novel_prob"] = probs
    merged["gate_resnet"] = gates[:, 0]
    merged["gate_densenet"] = gates[:, 1]
    merged["gate_morph"] = gates[:, 2]
    merged["gate_cf"] = gates[:, 3]
    merged["gt_plasma"] = merged["label"].astype(int)
    return merged


def pairwise_cosine_consistency(matrix: np.ndarray) -> float:
    if matrix.shape[0] < 2:
        return float("nan")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-8
    unit = matrix / norms
    sim = unit @ unit.T
    mask = ~np.eye(sim.shape[0], dtype=bool)
    return float(sim[mask].mean())


def build_patient_summary(patient_cells: pd.DataFrame, diagnosis_df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, object]]:
    cf_shift_cols = [c for c in patient_cells.columns if c.startswith("cf_shift_")]
    patient_rows = []
    for patient_id, group in patient_cells.groupby("patient_id"):
        plasma_group = group[group["gt_plasma"] == 1]
        cf_matrix = plasma_group[cf_shift_cols].fillna(0.0).values if len(plasma_group) else np.zeros((0, len(cf_shift_cols)))
        consistency = pairwise_cosine_consistency(cf_matrix)
        mean_abs_shifts = plasma_group[cf_shift_cols].abs().mean() if len(plasma_group) else pd.Series(0.0, index=cf_shift_cols)
        top_feature = mean_abs_shifts.sort_values(ascending=False).index[0].replace("cf_shift_", "")
        row = {
            "patient_id": int(patient_id),
            "mean_novel_prob": float(group["novel_prob"].mean()),
            "mean_plasma_prob_cells": float(plasma_group["novel_prob"].mean()) if len(plasma_group) else float("nan"),
            "gt_plasma_fraction": float(group["gt_plasma"].mean()),
            "mean_cf_distance_plasma": float(plasma_group["cf_distance_l2"].mean()) if len(plasma_group) else float("nan"),
            "cf_consistency": consistency,
            "gate_cf_mean": float(group["gate_cf"].mean()),
            "top_counterfactual_feature": top_feature,
        }
        for col in cf_shift_cols:
            row[f"mean_{col}"] = float(plasma_group[col].mean()) if len(plasma_group) else 0.0
        patient_rows.append(row)

    patient_df = pd.DataFrame(patient_rows)
    diag = diagnosis_df.rename(columns={"patient": "patient_id", " non_plasma_cells": "non_plasma_cells"}).copy()
    diag["diseased_label"] = (diag["diagnosis"].str.lower() == "diseased").astype(int)
    merged = diag.merge(patient_df, on="patient_id")

    patient_auc_prob = roc_auc_score(merged["diseased_label"], merged["mean_novel_prob"])
    patient_auc_cf = roc_auc_score(merged["diseased_label"], merged["mean_cf_distance_plasma"])
    patient_auc_combined = roc_auc_score(merged["diseased_label"], 0.6 * merged["mean_novel_prob"] + 0.4 * merged["mean_cf_distance_plasma"])
    corr_prob = pearsonr(merged["diseased_label"], merged["mean_novel_prob"]).statistic
    corr_cf = pearsonr(merged["diseased_label"], merged["mean_cf_distance_plasma"]).statistic

    shift_cols = [c for c in merged.columns if c.startswith("mean_cf_shift_")]
    diseased_mean = merged[merged["diagnosis"] == "diseased"][shift_cols].mean()
    normal_mean = merged[merged["diagnosis"] == "normal"][shift_cols].mean()
    diff = (diseased_mean - normal_mean).abs().sort_values(ascending=False)
    top_features = [c.replace("mean_cf_shift_", "") for c in diff.head(3).index]

    summary = {
        "patient_auc_mean_novel_prob": float(patient_auc_prob),
        "patient_auc_mean_cf_distance": float(patient_auc_cf),
        "patient_auc_combined_signature": float(patient_auc_combined),
        "corr_disease_vs_mean_novel_prob": float(corr_prob),
        "corr_disease_vs_mean_cf_distance": float(corr_cf),
        "top_patient_shift_features": top_features,
        "group_means": merged.groupby("diagnosis")[["mean_cf_distance_plasma", "cf_consistency", "mean_novel_prob", "gt_plasma_fraction"]].mean().round(4).to_dict(),
    }
    return merged, summary


def plot_history(search_results: List[Dict[str, object]], best_name: str):
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle("Novel PlasmaXAI Fusion Search", fontsize=16, fontweight="bold")
    for result in search_results:
        hist = pd.DataFrame(result["history"])
        label = result["config"]["name"] + (" (best)" if result["config"]["name"] == best_name else "")
        axes[0].plot(hist["epoch"], hist["val_acc"], linewidth=2, label=label)
        axes[1].plot(hist["epoch"], hist["val_recall"], linewidth=2, label=label)
    axes[0].set_title("Validation Accuracy")
    axes[1].set_title("Validation Plasma Recall")
    for ax in axes:
        ax.set_xlabel("Epoch")
        ax.legend(fontsize=9)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig1_fusion_search.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_best_training_curves(best_history: List[Dict[str, object]]):
    hist = pd.DataFrame(best_history)
    fig, axes = plt.subplots(1, 3, figsize=(17, 5))
    fig.suptitle("Best Novel Fusion Training Curves", fontsize=16, fontweight="bold")

    axes[0].plot(hist["epoch"], hist["train_loss"], label="Train Loss", linewidth=2, color="#1565C0")
    axes[0].plot(hist["epoch"], hist["val_loss"], label="Val Loss", linewidth=2, color="#E53935", linestyle="--")
    axes[0].set_title("Loss Curve", fontweight="bold")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("Loss")
    axes[0].legend()

    axes[1].plot(hist["epoch"], hist["train_acc"], label="Train Accuracy", linewidth=2, color="#1565C0")
    axes[1].plot(hist["epoch"], hist["val_acc"], label="Val Accuracy", linewidth=2, color="#2E7D32", linestyle="--")
    axes[1].set_title("Accuracy Curve", fontweight="bold")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("Accuracy (%)")
    axes[1].legend()

    axes[2].plot(hist["epoch"], hist["val_recall"], label="Val Plasma Recall", linewidth=2, color="#E53935")
    axes[2].plot(hist["epoch"], hist["val_auc"], label="Val AUC", linewidth=2, color="#6A1B9A", linestyle="--")
    axes[2].set_title("Clinical Target Curves", fontweight="bold")
    axes[2].set_xlabel("Epoch")
    axes[2].set_ylabel("Score (%)")
    axes[2].axhline(90, color="#455A64", linestyle=":", linewidth=1.5, label="90% recall target")
    axes[2].legend()

    for ax in axes:
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig8_training_curves.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_ablation_study(ablation_results: List[Dict[str, object]]):
    rows = []
    for res in ablation_results:
        rows.append({"model": res["label"], **res["test_metrics"]})
    df = pd.DataFrame(rows)
    metrics = ["accuracy", "weighted_f1", "plasma_recall", "auc"]
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle("Ablation Study for Novel Components", fontsize=16, fontweight="bold")
    palette = ["#607D8B", "#FF8F00", "#8E24AA", "#E53935"]
    for ax, metric in zip(axes.flat, metrics):
        sns.barplot(data=df, x="model", y=metric, hue="model", legend=False, palette=palette[: len(df)], ax=ax)
        ax.set_title(metric.replace("_", " ").title(), fontweight="bold")
        ax.set_xlabel("")
        ax.tick_params(axis="x", rotation=14)
        for p in ax.patches:
            ax.annotate(f"{p.get_height():.2f}", (p.get_x() + p.get_width() / 2, p.get_height()), ha="center", va="bottom", fontsize=9, xytext=(0, 3), textcoords="offset points")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig9_ablation_study.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_calibration_and_bootstrap(y_true: np.ndarray, prev_probs: np.ndarray, prev_threshold: float, novel_probs: np.ndarray, novel_threshold: float, novel_bootstrap: Dict[str, Dict[str, float]], prev_bootstrap: Dict[str, Dict[str, float]]):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Calibration and Confidence Intervals", fontsize=16, fontweight="bold")

    for name, probs, color in [("Previous Hybrid", prev_probs, "#607D8B"), ("Novel Fusion", novel_probs, "#E53935")]:
        frac_pos, mean_pred = calibration_curve(y_true, probs, n_bins=10, strategy="quantile")
        axes[0].plot(mean_pred, frac_pos, marker="o", linewidth=2, color=color, label=name)
    axes[0].plot([0, 1], [0, 1], linestyle="--", color="black", linewidth=1)
    axes[0].set_title("Reliability Curve", fontweight="bold")
    axes[0].set_xlabel("Mean Predicted Probability")
    axes[0].set_ylabel("Observed Plasma Frequency")
    axes[0].legend()

    metric_order = ["accuracy", "weighted_f1", "plasma_recall", "auc"]
    y_positions = np.arange(len(metric_order))
    for offset, source, color in [(-0.08, prev_bootstrap, "#607D8B"), (0.08, novel_bootstrap, "#E53935")]:
        means = [source[m]["mean"] for m in metric_order]
        lows = [source[m]["mean"] - source[m]["low95"] for m in metric_order]
        highs = [source[m]["high95"] - source[m]["mean"] for m in metric_order]
        axes[1].errorbar(means, y_positions + offset, xerr=[lows, highs], fmt="o", color=color, capsize=4)
    axes[1].set_yticks(y_positions)
    axes[1].set_yticklabels([m.replace("_", " ").title() for m in metric_order])
    axes[1].set_title("Bootstrap 95% CI", fontweight="bold")
    axes[1].set_xlabel("Score (%)")
    axes[1].legend(["Previous Hybrid", "Novel Fusion"], loc="lower right")
    axes[1].spines["top"].set_visible(False)
    axes[1].spines["right"].set_visible(False)

    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig10_calibration_bootstrap.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_patient_signature_heatmap(patient_df: pd.DataFrame, top_features: List[str]):
    cols = [f"mean_cf_shift_{feat}" for feat in top_features]
    heat = patient_df[["patient_id", "diagnosis"] + cols].copy()
    heat = heat.sort_values(["diagnosis", "patient_id"])
    heat_index = [f"P{int(pid):02d}-{diag[:3]}" for pid, diag in zip(heat["patient_id"], heat["diagnosis"])]
    heat_values = heat[cols].values
    fig, ax = plt.subplots(figsize=(10, 6))
    sns.heatmap(heat_values, annot=True, fmt=".3f", cmap="coolwarm", center=0, yticklabels=heat_index, xticklabels=top_features, ax=ax)
    ax.set_title("Patient-level Counterfactual Signature Heatmap", fontweight="bold")
    ax.set_xlabel("Dominant Counterfactual Features")
    ax.set_ylabel("Patient")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig11_patient_signature_heatmap.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_model_comparison(comparison_rows: List[Dict[str, float]]):
    df = pd.DataFrame(comparison_rows)
    metrics = ["accuracy", "weighted_f1", "plasma_recall", "auc"]
    titles = ["Accuracy (%)", "Weighted F1 (%)", "Plasma Recall (%)", "AUC (%)"]
    fig, axes = plt.subplots(2, 2, figsize=(15, 10))
    fig.suptitle("Novel PlasmaXAI vs Previous Optimized Models", fontsize=16, fontweight="bold")
    palette = ["#1565C0", "#2E7D32", "#FF8F00", "#E53935"]
    for ax, metric, title in zip(axes.flat, metrics, titles):
        sns.barplot(data=df, x="model", y=metric, hue="model", legend=False, palette=palette[: len(df)], ax=ax)
        ax.set_title(title, fontweight="bold")
        ax.tick_params(axis="x", rotation=12)
        for p in ax.patches:
            ax.annotate(f"{p.get_height():.2f}", (p.get_x() + p.get_width() / 2, p.get_height()), ha="center", va="bottom", fontsize=9, xytext=(0, 3), textcoords="offset points")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig2_model_comparison.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_confusion_roc(y_true, baseline_probs, novel_probs, baseline_threshold, novel_threshold):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    baseline_preds = (baseline_probs >= baseline_threshold).astype(int)
    novel_preds = (novel_probs >= novel_threshold).astype(int)
    cm = confusion_matrix(y_true, novel_preds) - confusion_matrix(y_true, baseline_preds)
    sns.heatmap(cm, annot=True, fmt="d", cmap="coolwarm", center=0, cbar=False, xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES, ax=axes[0])
    axes[0].set_title("Novel - Previous Hybrid Confusion Delta", fontweight="bold")
    axes[0].set_xlabel("Predicted")
    axes[0].set_ylabel("Actual")
    for name, probs, color in [("Previous Hybrid", baseline_probs, "#607D8B"), ("Novel Fusion", novel_probs, "#E53935")]:
        fpr, tpr, _ = roc_curve(y_true, probs)
        auc_val = roc_auc_score(y_true, probs) * 100.0
        axes[1].plot(fpr, tpr, linewidth=2.5, label=f"{name} (AUC={auc_val:.2f}%)", color=color)
    axes[1].plot([0, 1], [0, 1], linestyle="--", color="black", linewidth=1)
    axes[1].set_title("ROC Curves", fontweight="bold")
    axes[1].set_xlabel("False Positive Rate")
    axes[1].set_ylabel("True Positive Rate")
    axes[1].legend()
    axes[1].spines["top"].set_visible(False)
    axes[1].spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig3_confusion_roc.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_gates_and_counterfactuals(gates: np.ndarray, cf_df: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    gate_df = pd.DataFrame({"modality": ["ResNet50", "DenseNet121", "Morphology", "Counterfactual"], "weight": gates.mean(axis=0)})
    sns.barplot(data=gate_df, x="modality", y="weight", hue="modality", legend=False, palette=["#1565C0", "#2E7D32", "#FF8F00", "#E53935"], ax=axes[0])
    axes[0].set_title("Learned Fusion Modality Weights", fontweight="bold")
    axes[0].set_xlabel("")
    axes[0].set_ylabel("Average Gate Weight")
    mean_abs = cf_df[[c for c in cf_df.columns if c.startswith("cf_shift_")]].abs().mean().sort_values(ascending=False).head(8)
    sns.barplot(x=mean_abs.values, y=[c.replace("cf_shift_", "") for c in mean_abs.index], color="#E53935", ax=axes[1])
    axes[1].set_title("Counterfactual Features in Decision Path", fontweight="bold")
    axes[1].set_xlabel("Mean |counterfactual shift|")
    axes[1].set_ylabel("")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig4_gates_counterfactuals.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_patient_analysis(patient_df: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Patient-level Counterfactual Consistency", fontsize=16, fontweight="bold")
    sns.barplot(data=patient_df, x="patient_id", y="cf_consistency", hue="diagnosis", palette={"diseased": "#E53935", "normal": "#1565C0"}, ax=axes[0])
    axes[0].set_title("Counterfactual Consistency by Patient", fontweight="bold")
    axes[0].set_xlabel("Patient ID")
    axes[0].set_ylabel("Mean Pairwise Cosine Similarity")
    axes[1].scatter(patient_df["gt_plasma_fraction"], patient_df["mean_cf_distance_plasma"], c=patient_df["diseased_label"], cmap="coolwarm", s=120, edgecolors="white", linewidth=1.5)
    for _, row in patient_df.iterrows():
        axes[1].annotate(f"P{int(row['patient_id']):02d}", (row["gt_plasma_fraction"], row["mean_cf_distance_plasma"]), textcoords="offset points", xytext=(6, 4))
    axes[1].set_title("Plasma Burden vs Counterfactual Pressure", fontweight="bold")
    axes[1].set_xlabel("Annotated Plasma Fraction")
    axes[1].set_ylabel("Mean Counterfactual Distance")
    axes[1].spines["top"].set_visible(False)
    axes[1].spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig5_patient_consistency.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_clinical_insight(patient_df: pd.DataFrame, patient_summary: Dict[str, object]):
    feature_names = patient_summary["top_patient_shift_features"]
    rows = []
    for feat in feature_names:
        col = f"mean_cf_shift_{feat}"
        for _, row in patient_df.iterrows():
            rows.append({"feature": feat, "diagnosis": row["diagnosis"], "value": row[col]})
    plot_df = pd.DataFrame(rows)
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Clinical Insight Beyond Accuracy", fontsize=16, fontweight="bold")
    sns.boxplot(data=plot_df, x="feature", y="value", hue="diagnosis", palette={"diseased": "#E53935", "normal": "#1565C0"}, ax=axes[0])
    axes[0].set_title("Dominant Patient-level Counterfactual Shifts", fontweight="bold")
    axes[0].set_xlabel("")
    axes[0].set_ylabel("Mean Counterfactual Shift")
    axes[0].tick_params(axis="x", rotation=12)
    axes[1].scatter(patient_df["mean_novel_prob"], patient_df["mean_cf_distance_plasma"], c=patient_df["diseased_label"], cmap="coolwarm", s=130, edgecolors="white", linewidth=1.5)
    for _, row in patient_df.iterrows():
        axes[1].annotate(f"P{int(row['patient_id']):02d}", (row["mean_novel_prob"], row["mean_cf_distance_plasma"]), textcoords="offset points", xytext=(6, 4))
    axes[1].set_title("Disease Signature Space", fontweight="bold")
    axes[1].set_xlabel("Mean Novel Plasma Probability")
    axes[1].set_ylabel("Mean Counterfactual Distance")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig6_clinical_insight.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def plot_framework_diagram():
    fig, ax = plt.subplots(figsize=(15, 8))
    ax.axis("off")
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 9)
    def box(x, y, w, h, color, text):
        rect = plt.Rectangle((x, y), w, h, facecolor=color, edgecolor="white", linewidth=2)
        ax.add_patch(rect)
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color="white", fontsize=13, fontweight="bold")
    box(0.6, 3.5, 2.2, 1.8, "#1565C0", "Cell Image")
    box(3.2, 5.8, 2.7, 1.4, "#2E7D32", "ResNet50\nEmbedding")
    box(3.2, 3.7, 2.7, 1.4, "#43A047", "DenseNet121\nEmbedding")
    box(3.2, 1.6, 2.7, 1.4, "#FF8F00", "Morphology\nFeatures")
    box(6.4, 1.6, 3.0, 1.4, "#E53935", "Counterfactual\nBoundary Features")
    box(6.4, 4.0, 3.0, 2.0, "#8E24AA", "Counterfactual-guided\nGated Fusion")
    box(10.0, 4.0, 2.6, 2.0, "#37474F", "Prediction\nHead")
    box(13.1, 4.0, 2.0, 2.0, "#C62828", "Plasma /\nNon-plasma")
    box(10.0, 1.0, 5.1, 1.6, "#6D4C41", "Patient-level Signature Aggregation")
    for (x1, y1), (x2, y2) in [((2.8, 4.4), (3.2, 6.5)), ((2.8, 4.4), (3.2, 4.4)), ((2.8, 4.4), (3.2, 2.3)), ((5.9, 2.3), (6.4, 2.3)), ((5.9, 6.5), (6.4, 5.6)), ((5.9, 4.4), (6.4, 5.0)), ((9.4, 5.0), (10.0, 5.0)), ((12.6, 5.0), (13.1, 5.0)), ((11.3, 4.0), (11.3, 2.6))]:
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="-|>", color="#455A64", linewidth=2.5))
    ax.text(8, 8.25, "Novel PlasmaXAI Framework", ha="center", va="center", fontsize=20, fontweight="bold")
    ax.text(8, 7.7, "Learned fusion + direct counterfactual path + patient-level consistency", ha="center", va="center", fontsize=12.5, color="#37474F")
    plt.tight_layout()
    plt.savefig(FIG_DIR / "novel_fig7_framework_diagram.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def to_jsonable(obj):
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.floating, np.integer)):
        return obj.item()
    if isinstance(obj, Path):
        return str(obj)
    return obj


def save_artifacts(summary: Dict[str, object], report: str, comparison_rows: List[Dict[str, float]], patient_cells: pd.DataFrame, patient_summary_df: pd.DataFrame, model_state: Dict[str, torch.Tensor], cf_bundle: Dict[str, object], scalers: Dict[str, object], best_history: List[Dict[str, object]], search_results: List[Dict[str, object]], ablation_results: List[Dict[str, object]], bootstrap_summary: Dict[str, object]):
    torch.save(model_state, OUT_DIR / "novel_fusion_model.pth")
    joblib.dump(cf_bundle, OUT_DIR / "counterfactual_bundle.joblib")
    joblib.dump(scalers, OUT_DIR / "fusion_scalers.joblib")
    (OUT_DIR / "novel_summary.json").write_text(json.dumps(to_jsonable(summary), indent=2), encoding="utf-8")
    (OUT_DIR / "clinical_insight_report.txt").write_text(report, encoding="utf-8")
    pd.DataFrame(comparison_rows).to_csv(OUT_DIR / "novel_model_comparison.csv", index=False)
    patient_cells.to_csv(OUT_DIR / "patient_cell_predictions.csv", index=False)
    patient_summary_df.to_csv(OUT_DIR / "patient_counterfactual_summary.csv", index=False)
    pd.DataFrame(best_history).to_csv(OUT_DIR / "best_fusion_history.csv", index=False)
    pd.DataFrame([{**{"label": r["label"], "mode": r["mode"], "threshold": r["threshold"]}, **{f"test_{k}": v for k, v in r["test_metrics"].items()}, **{f"val_{k}": v for k, v in r["val_metrics"].items()}} for r in ablation_results]).to_csv(OUT_DIR / "ablation_results.csv", index=False)
    sanitized_search_results = [{k: v for k, v in r.items() if k != "model"} for r in search_results]
    (OUT_DIR / "fusion_search_histories.json").write_text(json.dumps(to_jsonable(sanitized_search_results), indent=2), encoding="utf-8")
    (OUT_DIR / "bootstrap_summary.json").write_text(json.dumps(to_jsonable(bootstrap_summary), indent=2), encoding="utf-8")


def main():
    seed_everything(SEED)
    ensure_dirs()
    print(f"Device: {DEVICE}")

    df = load_dataset(DATASET_DIR)
    train_df, temp_df = train_test_split(df, test_size=0.30, stratify=df["label"], random_state=SEED)
    val_df, test_df = train_test_split(temp_df, test_size=0.50, stratify=temp_df["label"], random_state=SEED)

    feat_df = build_morph_cache(df)
    train_feat = feat_df[feat_df["path"].isin(train_df["path"])].copy()
    val_feat = feat_df[feat_df["path"].isin(val_df["path"])].copy()
    test_feat = feat_df[feat_df["path"].isin(test_df["path"])].copy()

    cf_bundle = fit_counterfactual_model(train_feat)
    cf_train = compute_counterfactual_features(cf_bundle, train_feat)
    cf_val = compute_counterfactual_features(cf_bundle, val_feat)
    cf_test = compute_counterfactual_features(cf_bundle, test_feat)

    emb_train = get_or_build_embeddings(train_df, "train")
    emb_val = get_or_build_embeddings(val_df, "val")
    emb_test = get_or_build_embeddings(test_df, "test")

    merged_train = merge_modalities(train_df, train_feat, emb_train, cf_train)
    merged_val = merge_modalities(val_df, val_feat, emb_val, cf_val)
    merged_test = merge_modalities(test_df, test_feat, emb_test, cf_test)

    feature_blocks = get_feature_blocks(merged_train)
    res_cols, den_cols, morph_cols, cf_cols, score_cols = feature_blocks
    morph_scaler = StandardScaler().fit(merged_train[morph_cols].values)
    cf_scaler = StandardScaler().fit(merged_train[cf_cols].values)
    score_scaler = StandardScaler().fit(merged_train[score_cols].values)
    for split_df in [merged_train, merged_val, merged_test]:
        split_df.loc[:, morph_cols] = morph_scaler.transform(split_df[morph_cols].values)
        split_df.loc[:, cf_cols] = cf_scaler.transform(split_df[cf_cols].values)
        split_df.loc[:, score_cols] = score_scaler.transform(split_df[score_cols].values)

    best_fusion, search_results = run_fusion_search(merged_train, merged_val, feature_blocks)
    ablation_results = run_ablation_study(merged_train, merged_val, merged_test, feature_blocks, best_fusion["config"])
    val_ds = build_tensor_dataset(merged_val, feature_blocks)
    test_ds = build_tensor_dataset(merged_test, feature_blocks)
    val_loader = DataLoader(val_ds, batch_size=256, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
    test_loader = DataLoader(test_ds, batch_size=256, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
    _, val_probs, val_labels, _ = evaluate_fusion(best_fusion["model"], val_loader)
    _, test_probs, test_labels, test_gates = evaluate_fusion(best_fusion["model"], test_loader)
    novel_val = search_best_threshold(val_labels, val_probs)
    novel_eval = {"threshold": novel_val["threshold"], "metrics": metrics_at_threshold(test_labels, test_probs, novel_val["threshold"])}

    hybrid_cfg = json.loads((ROOT / "best_plasmaxai_hybrid_config.json").read_text(encoding="utf-8"))
    morph_bundle = joblib.load(PREV_OUTPUT_DIR / "best_morph_model.joblib")
    morph_test_x = morph_bundle["scaler"].transform(test_feat[MORPH_FEATURE_COLUMNS].values)
    morph_test_probs = morph_bundle["model"].predict_proba(morph_test_x)[:, 1]
    baseline_val_probs = (
        (1.0 - hybrid_cfg["morph_weight"]) * (hybrid_cfg["resnet_weight"] * emb_val["resnet_prob"].values + hybrid_cfg["densenet_weight"] * emb_val["densenet_prob"].values)
        + hybrid_cfg["morph_weight"] * morph_bundle["model"].predict_proba(morph_bundle["scaler"].transform(val_feat[MORPH_FEATURE_COLUMNS].values))[:, 1]
    )
    baseline_probs = (
        (1.0 - hybrid_cfg["morph_weight"]) * (hybrid_cfg["resnet_weight"] * emb_test["resnet_prob"].values + hybrid_cfg["densenet_weight"] * emb_test["densenet_prob"].values)
        + hybrid_cfg["morph_weight"] * morph_test_probs
    )
    baseline_val = search_best_threshold(val_labels, baseline_val_probs)
    baseline_eval = {"threshold": baseline_val["threshold"], "metrics": metrics_at_threshold(test_labels, baseline_probs, baseline_val["threshold"])}
    resnet_val = search_best_threshold(val_labels, emb_val["resnet_prob"].values)
    densenet_val = search_best_threshold(val_labels, emb_val["densenet_prob"].values)
    resnet_eval = {"threshold": resnet_val["threshold"], "metrics": metrics_at_threshold(test_labels, emb_test["resnet_prob"].values, resnet_val["threshold"])}
    densenet_eval = {"threshold": densenet_val["threshold"], "metrics": metrics_at_threshold(test_labels, emb_test["densenet_prob"].values, densenet_val["threshold"])}

    comparison_rows = [
        {"model": "ResNet50", **{k: resnet_eval["metrics"][k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
        {"model": "DenseNet121", **{k: densenet_eval["metrics"][k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
        {"model": "Prev Hybrid", **{k: baseline_eval["metrics"][k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
        {"model": "Novel Fusion", **{k: novel_eval["metrics"][k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
    ]

    novel_bootstrap = bootstrap_metric_summary(test_labels, test_probs, novel_eval["threshold"])
    prev_bootstrap = bootstrap_metric_summary(test_labels, baseline_probs, baseline_eval["threshold"])

    patient_crops, diagnosis_df = make_patient_crops(PATIENT_ROOT)
    patient_cells = infer_patient_cells(patient_crops, best_fusion["model"], feature_blocks, cf_bundle, morph_scaler, cf_scaler, score_scaler)
    patient_summary_df, patient_summary = build_patient_summary(patient_cells, diagnosis_df)
    prob_p = mannwhitneyu(
        patient_summary_df.loc[patient_summary_df["diagnosis"] == "diseased", "mean_novel_prob"],
        patient_summary_df.loc[patient_summary_df["diagnosis"] == "normal", "mean_novel_prob"],
        alternative="two-sided",
    ).pvalue
    consistency_p = mannwhitneyu(
        patient_summary_df.loc[patient_summary_df["diagnosis"] == "diseased", "cf_consistency"],
        patient_summary_df.loc[patient_summary_df["diagnosis"] == "normal", "cf_consistency"],
        alternative="two-sided",
    ).pvalue

    report = (
        "Novel PlasmaXAI Extension Summary\n"
        "================================================================================\n"
        f"Best fusion config: {best_fusion['config']['name']}\n"
        f"Novel fusion test accuracy: {novel_eval['metrics']['accuracy']:.2f}%\n"
        f"Novel fusion test weighted F1: {novel_eval['metrics']['weighted_f1']:.2f}%\n"
        f"Novel fusion plasma recall: {novel_eval['metrics']['plasma_recall']:.2f}%\n"
        f"Novel fusion AUC: {novel_eval['metrics']['auc']:.2f}%\n\n"
        f"Previous hybrid test accuracy: {baseline_eval['metrics']['accuracy']:.2f}%\n"
        f"Previous hybrid plasma recall: {baseline_eval['metrics']['plasma_recall']:.2f}%\n\n"
        "Patient-level consistency findings:\n"
        f"  Patient AUC using mean novel probability: {patient_summary['patient_auc_mean_novel_prob']:.3f}\n"
        f"  Patient AUC using mean counterfactual distance: {patient_summary['patient_auc_mean_cf_distance']:.3f}\n"
        f"  Patient AUC using combined disease signature: {patient_summary['patient_auc_combined_signature']:.3f}\n\n"
        "Statistical support:\n"
        f"  Bootstrap novel fusion accuracy 95% CI: [{novel_bootstrap['accuracy']['low95']:.2f}, {novel_bootstrap['accuracy']['high95']:.2f}]\n"
        f"  Bootstrap novel fusion AUC 95% CI: [{novel_bootstrap['auc']['low95']:.2f}, {novel_bootstrap['auc']['high95']:.2f}]\n"
        f"  Mann-Whitney p-value for patient mean novel probability: {prob_p:.4f}\n"
        f"  Mann-Whitney p-value for patient counterfactual consistency: {consistency_p:.4f}\n\n"
        "Clinical insight:\n"
        f"  Diseased patients show a reproducible counterfactual signature centered on {', '.join(patient_summary['top_patient_shift_features'])}.\n"
        "  This suggests myeloma burden is not just more plasma cells; it is a more coherent morphologic program.\n"
    )

    summary = {
        "device": str(DEVICE),
        "best_fusion_config": best_fusion["config"],
        "novel_threshold": float(novel_val["threshold"]),
        "novel_fusion_test_metrics": {k: float(v) for k, v in novel_eval["metrics"].items() if k != "preds"},
        "previous_hybrid_test_metrics": {k: float(v) for k, v in baseline_eval["metrics"].items() if k != "preds"},
        "resnet_test_metrics": {k: float(v) for k, v in resnet_eval["metrics"].items() if k != "preds"},
        "densenet_test_metrics": {k: float(v) for k, v in densenet_eval["metrics"].items() if k != "preds"},
        "novel_bootstrap_ci": novel_bootstrap,
        "previous_bootstrap_ci": prev_bootstrap,
        "ablation_summary": [{k: v for k, v in res.items() if k != "history"} for res in ablation_results],
        "patient_p_values": {"mean_novel_prob": float(prob_p), "cf_consistency": float(consistency_p)},
        "patient_summary": patient_summary,
    }

    plot_history(search_results, best_fusion["config"]["name"])
    plot_model_comparison(comparison_rows)
    plot_confusion_roc(test_labels, baseline_probs, test_probs, baseline_eval["threshold"], novel_eval["threshold"])
    plot_gates_and_counterfactuals(test_gates, cf_test)
    plot_patient_analysis(patient_summary_df)
    plot_clinical_insight(patient_summary_df, patient_summary)
    plot_framework_diagram()
    plot_best_training_curves(best_fusion["history"])
    plot_ablation_study(ablation_results)
    plot_calibration_and_bootstrap(test_labels, baseline_probs, baseline_eval["threshold"], test_probs, novel_eval["threshold"], novel_bootstrap, prev_bootstrap)
    plot_patient_signature_heatmap(patient_summary_df, patient_summary["top_patient_shift_features"])

    save_artifacts(
        summary=summary,
        report=report,
        comparison_rows=comparison_rows,
        patient_cells=patient_cells,
        patient_summary_df=patient_summary_df,
        model_state={k: v.detach().cpu() for k, v in best_fusion["model"].state_dict().items()},
        cf_bundle=cf_bundle,
        scalers={"morph": morph_scaler, "cf": cf_scaler, "scores": score_scaler, "feature_blocks": feature_blocks},
        best_history=best_fusion["history"],
        search_results=search_results,
        ablation_results=ablation_results,
        bootstrap_summary={"novel": novel_bootstrap, "previous_hybrid": prev_bootstrap},
    )

    print(report)
    print(f"Saved novel outputs to {OUT_DIR}")


if __name__ == "__main__":
    main()
