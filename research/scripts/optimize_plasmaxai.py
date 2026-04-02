from __future__ import annotations

import gc
import json
import math
import random
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import joblib
import numpy as np
import pandas as pd
import timm
import torch
import torch.nn as nn
from PIL import Image
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from xgboost import XGBClassifier


SEED = 42
ROOT = Path.cwd()
DATASET_DIR = ROOT / "data" / "raw" / "PCMMD_LOCAL" / "set1"
OUTPUT_DIR = ROOT / "research" / "outputs" / "optimization"
CKPT_DIR = OUTPUT_DIR / "checkpoints"
FEATURE_CACHE = OUTPUT_DIR / "morph_features.csv"
LEADERBOARD_PATH = OUTPUT_DIR / "experiment_leaderboard.csv"
SUMMARY_PATH = OUTPUT_DIR / "best_framework_summary.json"
REPORT_PATH = OUTPUT_DIR / "best_framework_report.txt"

CLASS_NAMES = ["non_plasma", "plasma"]
CLASS_MAP = {"non_plasma": 0, "plasma": 1}
TARGET_RECALL = 90.0
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


@dataclass
class ExperimentConfig:
    name: str
    model_name: str
    image_size: int
    epochs: int
    batch_size: int
    lr: float
    weight_decay: float = 1e-4
    label_smoothing: float = 0.05
    patience: int = 5
    prefer_pretrained: bool = False


class PCMMDDataset(Dataset):
    def __init__(self, dataframe: pd.DataFrame, transform=None):
        self.data = dataframe.reset_index(drop=True)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, index: int):
        row = self.data.iloc[index]
        image = Image.open(row["path"]).convert("RGB")
        if self.transform is not None:
            image = self.transform(image)
        label = torch.tensor(int(row["label"]), dtype=torch.long)
        return image, label


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False


def ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    CKPT_DIR.mkdir(exist_ok=True)


def load_dataset(root_path: Path) -> pd.DataFrame:
    rows: List[Dict[str, object]] = []
    for cls in CLASS_NAMES:
        cls_dir = root_path / cls
        for img_path in sorted(cls_dir.glob("*")):
            if img_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}:
                rows.append(
                    {
                        "path": str(img_path),
                        "label": CLASS_MAP[cls],
                        "class": cls,
                        "image_id": img_path.name,
                    }
                )
    df = pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError(f"No images found in {root_path}")
    return df


def extract_morphological_features(img_path: str) -> Dict[str, float] | None:
    img = cv2.imread(img_path)
    if img is None:
        return None

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
    nc_ratio = nucleus_area / max(cytoplasm_area, 1e-3)
    nc_ratio = float(min(nc_ratio, 25.0))

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
        "nucleus_area": nucleus_area,
        "cytoplasm_area": cytoplasm_area,
        "nc_ratio": nc_ratio,
        "nc_ratio_log1p": float(np.log1p(nc_ratio)),
        "staining_intensity": staining_intensity,
        "granularity": granularity,
        "roundness": float(roundness),
        "mean_r": mean_r,
        "mean_g": mean_g,
        "mean_b": mean_b,
    }


def build_feature_cache(df: pd.DataFrame) -> pd.DataFrame:
    if FEATURE_CACHE.exists():
        cached = pd.read_csv(FEATURE_CACHE)
        if set(cached["path"]) == set(df["path"]):
            return cached

    rows = []
    for row in df.to_dict("records"):
        feat = extract_morphological_features(row["path"])
        if feat is None:
            continue
        feat["path"] = row["path"]
        feat["label"] = row["label"]
        feat["class"] = row["class"]
        rows.append(feat)

    feature_df = pd.DataFrame(rows)
    feature_df.to_csv(FEATURE_CACHE, index=False)
    return feature_df


def build_transforms(image_size: int) -> Tuple[transforms.Compose, transforms.Compose]:
    train_transform = transforms.Compose(
        [
            transforms.Resize((image_size + 16, image_size + 16)),
            transforms.RandomResizedCrop(image_size, scale=(0.75, 1.0), ratio=(0.9, 1.1)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.25),
            transforms.RandomRotation(degrees=20),
            transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.15, hue=0.02),
            transforms.RandomAutocontrast(p=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            transforms.RandomErasing(p=0.12, scale=(0.02, 0.08), ratio=(0.3, 3.3)),
        ]
    )
    eval_transform = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return train_transform, eval_transform


def create_loaders(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
    image_size: int,
    batch_size: int,
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    train_transform, eval_transform = build_transforms(image_size)
    train_dataset = PCMMDDataset(train_df, transform=train_transform)
    val_dataset = PCMMDDataset(val_df, transform=eval_transform)
    test_dataset = PCMMDDataset(test_df, transform=eval_transform)

    class_counts = train_df["label"].value_counts().sort_index().values
    weights = 1.0 / class_counts
    sample_weights = weights[train_df["label"].values]
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)

    common = {"num_workers": 0, "pin_memory": DEVICE.type == "cuda"}
    train_loader = DataLoader(train_dataset, batch_size=batch_size, sampler=sampler, **common)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, **common)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, **common)
    return train_loader, val_loader, test_loader


def build_model(model_name: str, prefer_pretrained: bool) -> nn.Module:
    try:
        model = timm.create_model(model_name, pretrained=prefer_pretrained, num_classes=2)
    except Exception:
        model = timm.create_model(model_name, pretrained=False, num_classes=2)
    return model.to(DEVICE)


def compute_metrics(labels: np.ndarray, probs: np.ndarray, threshold: float) -> Dict[str, float]:
    preds = (probs >= threshold).astype(np.int64)
    return {
        "accuracy": float(accuracy_score(labels, preds) * 100.0),
        "weighted_f1": float(f1_score(labels, preds, average="weighted") * 100.0),
        "macro_f1": float(f1_score(labels, preds, average="macro") * 100.0),
        "plasma_precision": float(precision_score(labels, preds, pos_label=1, zero_division=0) * 100.0),
        "plasma_recall": float(recall_score(labels, preds, pos_label=1, zero_division=0) * 100.0),
        "auc": float(roc_auc_score(labels, probs) * 100.0),
    }


def metric_priority(metrics: Dict[str, float]) -> Tuple[int, float, float, float, float]:
    return (
        int(metrics["plasma_recall"] >= TARGET_RECALL),
        metrics["weighted_f1"],
        metrics["accuracy"],
        metrics["auc"],
        metrics["plasma_recall"],
    )


def search_best_threshold(labels: np.ndarray, probs: np.ndarray, objective: str = "clinical") -> Dict[str, object]:
    best = None
    for threshold in np.linspace(0.05, 0.95, 181):
        metrics = compute_metrics(labels, probs, float(threshold))
        if objective == "acc":
            priority = (
                metrics["accuracy"],
                metrics["weighted_f1"],
                metrics["auc"],
                metrics["plasma_recall"],
            )
        elif objective == "f1":
            priority = (
                metrics["weighted_f1"],
                metrics["accuracy"],
                metrics["auc"],
                metrics["plasma_recall"],
            )
        else:
            priority = metric_priority(metrics)
        if best is None or priority > best["priority"]:
            best = {
                "threshold": float(threshold),
                "metrics": metrics,
                "priority": priority,
            }
    return best


def train_one_epoch(model, loader, criterion, optimizer, scheduler, scaler) -> Tuple[float, float]:
    model.train()
    total_loss = 0.0
    total_correct = 0
    total_count = 0

    for images, labels in loader:
        images = images.to(DEVICE, non_blocking=True)
        labels = labels.to(DEVICE, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
            logits = model(images)
            loss = criterion(logits, labels)

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        scheduler.step()

        total_loss += loss.item() * labels.size(0)
        preds = logits.argmax(dim=1)
        total_correct += int((preds == labels).sum().item())
        total_count += int(labels.size(0))

    return total_loss / total_count, (total_correct / total_count) * 100.0


def predict_probs(model, loader, criterion, use_tta: bool = False) -> Tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    total_loss = 0.0
    total_count = 0
    all_probs: List[np.ndarray] = []
    all_labels: List[np.ndarray] = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(DEVICE, non_blocking=True)
            labels = labels.to(DEVICE, non_blocking=True)

            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                logits = model(images)
                if use_tta:
                    logits_h = model(torch.flip(images, dims=[3]))
                    logits_v = model(torch.flip(images, dims=[2]))
                    logits_hv = model(torch.flip(images, dims=[2, 3]))
                    logits = (logits + logits_h + logits_v + logits_hv) / 4.0
                loss = criterion(logits, labels)

            probs = torch.softmax(logits, dim=1)[:, 1]
            total_loss += loss.item() * labels.size(0)
            total_count += int(labels.size(0))
            all_probs.append(probs.cpu().numpy())
            all_labels.append(labels.cpu().numpy())

    return total_loss / total_count, np.concatenate(all_probs), np.concatenate(all_labels)


def measure_inference_ms(model, image_size: int) -> float:
    dummy = torch.randn(1, 3, image_size, image_size, device=DEVICE)
    model.eval()
    if DEVICE.type == "cuda":
        torch.cuda.synchronize()
    start = torch.cuda.Event(enable_timing=True) if DEVICE.type == "cuda" else None
    end = torch.cuda.Event(enable_timing=True) if DEVICE.type == "cuda" else None
    if DEVICE.type == "cuda":
        start.record()
        for _ in range(100):
            with torch.no_grad():
                _ = model(dummy)
        end.record()
        torch.cuda.synchronize()
        return float(start.elapsed_time(end) / 100.0)

    import time

    begin = time.time()
    for _ in range(100):
        with torch.no_grad():
            _ = model(dummy)
    return float((time.time() - begin) * 10.0)


def save_checkpoint(model: nn.Module, path: Path) -> None:
    torch.save(model.state_dict(), path)


def load_checkpoint(model: nn.Module, path: Path) -> None:
    state = torch.load(path, map_location=DEVICE)
    model.load_state_dict(state)


def run_image_experiment(
    cfg: ExperimentConfig,
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> Dict[str, object]:
    print(f"\n[Experiment] {cfg.name} ({cfg.model_name})")
    train_loader, val_loader, test_loader = create_loaders(
        train_df=train_df,
        val_df=val_df,
        test_df=test_df,
        image_size=cfg.image_size,
        batch_size=cfg.batch_size,
    )

    model = build_model(cfg.model_name, prefer_pretrained=cfg.prefer_pretrained)
    criterion = nn.CrossEntropyLoss(label_smoothing=cfg.label_smoothing)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer,
        max_lr=cfg.lr,
        steps_per_epoch=len(train_loader),
        epochs=cfg.epochs,
        pct_start=0.2,
        div_factor=10.0,
        final_div_factor=100.0,
    )
    scaler = torch.amp.GradScaler(enabled=DEVICE.type == "cuda")

    best_priority = None
    best_epoch = -1
    bad_epochs = 0
    history: List[Dict[str, float]] = []
    ckpt_path = CKPT_DIR / f"{cfg.name}.pth"

    for epoch in range(cfg.epochs):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, scheduler, scaler)
        val_loss, val_probs, val_labels = predict_probs(model, val_loader, criterion, use_tta=False)
        best_threshold = search_best_threshold(val_labels, val_probs)
        priority = best_threshold["priority"]

        history.append(
            {
                "epoch": epoch + 1,
                "train_loss": train_loss,
                "train_acc": train_acc,
                "val_loss": val_loss,
                "val_threshold": best_threshold["threshold"],
                "val_accuracy": best_threshold["metrics"]["accuracy"],
                "val_weighted_f1": best_threshold["metrics"]["weighted_f1"],
                "val_auc": best_threshold["metrics"]["auc"],
                "val_plasma_recall": best_threshold["metrics"]["plasma_recall"],
            }
        )

        if best_priority is None or priority > best_priority:
            best_priority = priority
            best_epoch = epoch + 1
            bad_epochs = 0
            save_checkpoint(model, ckpt_path)
            print(
                f"  epoch {epoch + 1:02d}: val_acc={best_threshold['metrics']['accuracy']:.2f} "
                f"val_f1={best_threshold['metrics']['weighted_f1']:.2f} "
                f"val_recall={best_threshold['metrics']['plasma_recall']:.2f} "
                f"thr={best_threshold['threshold']:.2f} [best]"
            )
        else:
            bad_epochs += 1

        if bad_epochs >= cfg.patience:
            print(f"  early stop at epoch {epoch + 1}")
            break

    load_checkpoint(model, ckpt_path)

    val_loss, val_probs, val_labels = predict_probs(model, val_loader, criterion, use_tta=True)
    val_best = search_best_threshold(val_labels, val_probs)
    test_loss, test_probs, test_labels = predict_probs(model, test_loader, criterion, use_tta=True)
    test_metrics = compute_metrics(test_labels, test_probs, val_best["threshold"])
    inference_ms = measure_inference_ms(model, cfg.image_size)
    params_m = sum(p.numel() for p in model.parameters()) / 1e6

    result = {
        "name": cfg.name,
        "model_name": cfg.model_name,
        "family": "image",
        "config": asdict(cfg),
        "best_epoch": best_epoch,
        "checkpoint": str(ckpt_path),
        "val_threshold": val_best["threshold"],
        "val_metrics": val_best["metrics"],
        "test_metrics": test_metrics,
        "inference_ms": inference_ms,
        "params_m": params_m,
        "history": history,
        "val_probs": val_probs.tolist(),
        "val_labels": val_labels.tolist(),
        "test_probs": test_probs.tolist(),
        "test_labels": test_labels.tolist(),
    }

    print(
        f"  final: test_acc={test_metrics['accuracy']:.2f} "
        f"test_f1={test_metrics['weighted_f1']:.2f} "
        f"test_recall={test_metrics['plasma_recall']:.2f} "
        f"test_auc={test_metrics['auc']:.2f}"
    )

    del model, train_loader, val_loader, test_loader
    gc.collect()
    if DEVICE.type == "cuda":
        torch.cuda.empty_cache()
    return result


def serializable_result(result: Dict[str, object]) -> Dict[str, object]:
    clean = {}
    for key, value in result.items():
        if key in {"model", "scaler", "history", "val_probs", "val_labels", "test_probs", "test_labels"}:
            continue
        clean[key] = value
    return clean


def fit_morph_models(
    features_df: pd.DataFrame,
    train_paths: List[str],
    val_paths: List[str],
    test_paths: List[str],
) -> Dict[str, object]:
    feat_cols = [
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
    feats = features_df.copy()
    train_df = feats[feats["path"].isin(train_paths)].copy()
    val_df = feats[feats["path"].isin(val_paths)].copy()
    test_df = feats[feats["path"].isin(test_paths)].copy()

    scaler = StandardScaler()
    x_train = scaler.fit_transform(train_df[feat_cols].fillna(0.0).values)
    x_val = scaler.transform(val_df[feat_cols].fillna(0.0).values)
    x_test = scaler.transform(test_df[feat_cols].fillna(0.0).values)
    y_train = train_df["label"].values.astype(np.int64)
    y_val = val_df["label"].values.astype(np.int64)
    y_test = test_df["label"].values.astype(np.int64)

    candidates = {
        "rf_morph": RandomForestClassifier(
            n_estimators=400,
            max_depth=None,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=SEED,
            n_jobs=1,
        ),
        "xgb_morph": XGBClassifier(
            n_estimators=350,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            reg_lambda=1.0,
            random_state=SEED,
            eval_metric="logloss",
            tree_method="hist",
        ),
    }

    best = None
    for name, clf in candidates.items():
        clf.fit(x_train, y_train)
        val_probs = clf.predict_proba(x_val)[:, 1]
        test_probs = clf.predict_proba(x_test)[:, 1]
        val_best = search_best_threshold(y_val, val_probs, objective="acc")
        test_metrics = compute_metrics(y_test, test_probs, val_best["threshold"])
        record = {
            "name": name,
            "family": "morphology",
            "model": clf,
            "scaler": scaler,
            "feature_columns": feat_cols,
            "val_threshold": val_best["threshold"],
            "val_metrics": val_best["metrics"],
            "test_metrics": test_metrics,
            "val_probs": val_probs.tolist(),
            "val_labels": y_val.tolist(),
            "test_probs": test_probs.tolist(),
            "test_labels": y_test.tolist(),
        }
        print(
            f"[Morph] {name}: val_f1={val_best['metrics']['weighted_f1']:.2f} "
            f"test_acc={test_metrics['accuracy']:.2f} test_recall={test_metrics['plasma_recall']:.2f}"
        )
        if best is None or metric_priority(record["val_metrics"]) > metric_priority(best["val_metrics"]):
            best = record

    model_path = OUTPUT_DIR / "best_morph_model.joblib"
    joblib.dump(
        {
            "model": best["model"],
            "scaler": best["scaler"],
            "feature_columns": best["feature_columns"],
        },
        model_path,
    )
    best["model_path"] = str(model_path)
    return best


def build_leaderboard(results: List[Dict[str, object]]) -> pd.DataFrame:
    rows = []
    for res in results:
        val_metrics = res["val_metrics"]
        test_metrics = res["test_metrics"]
        rows.append(
            {
                "name": res["name"],
                "family": res["family"],
                "val_accuracy": val_metrics["accuracy"],
                "val_weighted_f1": val_metrics["weighted_f1"],
                "val_plasma_recall": val_metrics["plasma_recall"],
                "val_auc": val_metrics["auc"],
                "test_accuracy": test_metrics["accuracy"],
                "test_weighted_f1": test_metrics["weighted_f1"],
                "test_plasma_recall": test_metrics["plasma_recall"],
                "test_auc": test_metrics["auc"],
            }
        )
    board = pd.DataFrame(rows)
    board = board.sort_values(
        by=["val_accuracy", "val_weighted_f1", "val_auc", "val_plasma_recall"],
        ascending=False,
    )
    board.to_csv(LEADERBOARD_PATH, index=False)
    return board


def blend_two(p1: np.ndarray, p2: np.ndarray, w: float) -> np.ndarray:
    return w * p1 + (1.0 - w) * p2


def search_hybrid_framework(
    image_a: Dict[str, object],
    image_b: Dict[str, object],
    morph: Dict[str, object],
) -> Dict[str, object]:
    val_labels = np.array(image_a["val_labels"], dtype=np.int64)
    test_labels = np.array(image_a["test_labels"], dtype=np.int64)
    p1_val = np.array(image_a["val_probs"], dtype=np.float32)
    p2_val = np.array(image_b["val_probs"], dtype=np.float32)
    pm_val = np.array(morph["val_probs"], dtype=np.float32)
    p1_test = np.array(image_a["test_probs"], dtype=np.float32)
    p2_test = np.array(image_b["test_probs"], dtype=np.float32)
    pm_test = np.array(morph["test_probs"], dtype=np.float32)

    best = None
    for image_mix in np.linspace(0.0, 1.0, 21):
        blended_images_val = blend_two(p1_val, p2_val, float(image_mix))
        blended_images_test = blend_two(p1_test, p2_test, float(image_mix))
        for morph_weight in np.linspace(0.0, 1.0, 21):
            val_probs = morph_weight * pm_val + (1.0 - morph_weight) * blended_images_val
            test_probs = morph_weight * pm_test + (1.0 - morph_weight) * blended_images_test
            val_best = search_best_threshold(val_labels, val_probs, objective="acc")
            test_metrics = compute_metrics(test_labels, test_probs, val_best["threshold"])
            record = {
                "name": "plasmaxai_hybrid_best",
                "family": "hybrid",
                "image_a": image_a["name"],
                "image_b": image_b["name"],
                "morph_model": morph["name"],
                "image_mix_weight": float(image_mix),
                "morph_weight": float(morph_weight),
                "val_threshold": val_best["threshold"],
                "val_metrics": val_best["metrics"],
                "test_metrics": test_metrics,
                "test_probs": test_probs.tolist(),
                "test_labels": test_labels.tolist(),
            }
            if best is None or metric_priority(record["val_metrics"]) > metric_priority(best["val_metrics"]):
                best = record
    return best


def write_report(best_framework: Dict[str, object], leaderboard: pd.DataFrame) -> None:
    lines = []
    lines.append("PlasmaXAI Optimization Report")
    lines.append("=" * 80)
    lines.append(f"Device: {DEVICE}")
    lines.append("")
    lines.append("Leaderboard (validation-ranked):")
    lines.append(leaderboard.to_string(index=False))
    lines.append("")
    lines.append("Best framework summary:")
    lines.append(json.dumps(best_framework, indent=2))
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    seed_everything(SEED)
    ensure_dirs()

    print(f"Device: {DEVICE}")
    if DEVICE.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    df = load_dataset(DATASET_DIR)
    features_df = build_feature_cache(df)

    train_df, temp_df = train_test_split(df, test_size=0.30, stratify=df["label"], random_state=SEED)
    val_df, test_df = train_test_split(temp_df, test_size=0.50, stratify=temp_df["label"], random_state=SEED)

    search_configs = [
        ExperimentConfig("resnet50_search", "resnet50", image_size=224, epochs=12, batch_size=48, lr=3e-4),
        ExperimentConfig("densenet121_search", "densenet121", image_size=224, epochs=12, batch_size=48, lr=3e-4),
    ]

    search_results = [run_image_experiment(cfg, train_df, val_df, test_df) for cfg in search_configs]
    search_ranked = sorted(search_results, key=lambda r: metric_priority(r["val_metrics"]), reverse=True)
    finalists = search_ranked[:2]

    final_configs = []
    for result in finalists:
        final_configs.append(
            ExperimentConfig(
                name=result["name"].replace("_search", "_final"),
                model_name=result["model_name"],
                image_size=result["config"]["image_size"],
                epochs=28,
                batch_size=result["config"]["batch_size"],
                lr=result["config"]["lr"],
                patience=7,
                prefer_pretrained=False,
            )
        )

    final_image_results = [run_image_experiment(cfg, train_df, val_df, test_df) for cfg in final_configs]
    morph_result = fit_morph_models(
        features_df=features_df,
        train_paths=train_df["path"].tolist(),
        val_paths=val_df["path"].tolist(),
        test_paths=test_df["path"].tolist(),
    )

    all_results: List[Dict[str, object]] = final_image_results + [morph_result]
    if len(final_image_results) >= 2:
        hybrid_result = search_hybrid_framework(final_image_results[0], final_image_results[1], morph_result)
        all_results.append(hybrid_result)
    else:
        hybrid_result = None

    leaderboard = build_leaderboard(all_results)
    best_framework = max(all_results, key=lambda r: metric_priority(r["val_metrics"]))

    best_summary = {
        "device": str(DEVICE),
        "dataset_size": int(len(df)),
        "train_size": int(len(train_df)),
        "val_size": int(len(val_df)),
        "test_size": int(len(test_df)),
        "best_framework": serializable_result(best_framework),
        "finalists": [r["name"] for r in final_image_results],
    }
    SUMMARY_PATH.write_text(json.dumps(best_summary, indent=2), encoding="utf-8")
    write_report(best_summary, leaderboard)

    if best_framework["family"] == "image":
        shutil.copyfile(best_framework["checkpoint"], ROOT / "best_plasmaxai_optimized.pth")

    print("\nBest validation-selected framework:")
    print(json.dumps(serializable_result(best_framework), indent=2))
    print(f"\nSaved leaderboard to {LEADERBOARD_PATH}")
    print(f"Saved summary to {SUMMARY_PATH}")
    print(f"Saved report to {REPORT_PATH}")


if __name__ == "__main__":
    main()

