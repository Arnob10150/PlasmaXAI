from __future__ import annotations

import json
import math
import time
from pathlib import Path

import cv2
import joblib
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import pandas as pd
import seaborn as sns
import timm
import torch
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms


ROOT = Path.cwd()
DATASET_DIR = ROOT / "data" / "raw" / "PCMMD_LOCAL" / "set1"
OUT_DIR = ROOT / "research" / "outputs" / "optimization"
CONFIG_PATH = ROOT / "artifacts" / "models" / "best_plasmaxai_hybrid_config.json"
SUMMARY_PATH = OUT_DIR / "best_framework_summary.json"
MORPH_FEATURES_PATH = OUT_DIR / "morph_features.csv"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
SEED = 42
CLASS_NAMES = ["non_plasma", "plasma"]
CLASS_MAP = {"non_plasma": 0, "plasma": 1}


class PCMMDDataset(Dataset):
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
        img = Image.open(row["path"]).convert("RGB")
        return self.transform(img), int(row["label"]), row["path"]


def load_dataset(root_path: Path) -> pd.DataFrame:
    rows = []
    for cls in CLASS_NAMES:
        for p in sorted((root_path / cls).glob("*")):
            if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}:
                rows.append({"path": str(p), "label": CLASS_MAP[cls], "class": cls})
    return pd.DataFrame(rows)


def extract_morphological_features(img_path: str) -> dict[str, float] | None:
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


def load_image_model(model_name: str, checkpoint_path: Path):
    model = timm.create_model(model_name, pretrained=False, num_classes=2).to(DEVICE)
    model.load_state_dict(torch.load(checkpoint_path, map_location=DEVICE))
    model.eval()
    return model


def predict_with_tta(model, loader):
    all_probs = []
    all_labels = []
    all_paths = []
    with torch.no_grad():
        for images, labels, paths in loader:
            images = images.to(DEVICE, non_blocking=True)
            with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
                logits = model(images)
                logits_h = model(torch.flip(images, dims=[3]))
                logits_v = model(torch.flip(images, dims=[2]))
                logits_hv = model(torch.flip(images, dims=[2, 3]))
                logits = (logits + logits_h + logits_v + logits_hv) / 4.0
                probs = torch.softmax(logits, dim=1)[:, 1]
            all_probs.append(probs.cpu().numpy())
            all_labels.append(labels.numpy())
            all_paths.extend(paths)
    return np.concatenate(all_probs), np.concatenate(all_labels), all_paths


def compute_metrics(labels, probs, threshold):
    preds = (probs >= threshold).astype(int)
    return {
        "accuracy": accuracy_score(labels, preds) * 100.0,
        "weighted_f1": f1_score(labels, preds, average="weighted") * 100.0,
        "plasma_precision": precision_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
        "plasma_recall": recall_score(labels, preds, pos_label=1, zero_division=0) * 100.0,
        "auc": roc_auc_score(labels, probs) * 100.0,
        "preds": preds,
    }


def search_best_threshold(labels, probs):
    best = None
    for threshold in np.linspace(0.05, 0.95, 181):
        metrics = compute_metrics(labels, probs, float(threshold))
        score = (
            metrics["accuracy"],
            metrics["weighted_f1"],
            metrics["auc"],
            metrics["plasma_recall"],
        )
        if best is None or score > best["score"]:
            best = {"threshold": float(threshold), "metrics": metrics, "score": score}
    return best


def measure_image_ms(model, image_size: int) -> float:
    dummy = torch.randn(1, 3, image_size, image_size, device=DEVICE)
    if DEVICE.type == "cuda":
        torch.cuda.synchronize()
        start = torch.cuda.Event(enable_timing=True)
        end = torch.cuda.Event(enable_timing=True)
        start.record()
        with torch.no_grad():
            for _ in range(50):
                _ = model(dummy)
        end.record()
        torch.cuda.synchronize()
        return start.elapsed_time(end) / 50.0
    begin = time.time()
    with torch.no_grad():
        for _ in range(50):
            _ = model(dummy)
    return (time.time() - begin) * 1000.0 / 50.0


def save_framework_overview(config: dict, summary: dict):
    fig, ax = plt.subplots(figsize=(14, 8))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 8)
    ax.axis("off")

    colors = {
        "data": "#1565C0",
        "cnn1": "#E53935",
        "cnn2": "#2E7D32",
        "morph": "#FF8F00",
        "blend": "#6A1B9A",
        "out": "#263238",
    }

    boxes = [
        ((0.6, 3.0), 2.2, 1.8, colors["data"], "Cell Image\n224x224"),
        ((3.4, 5.1), 2.8, 1.5, colors["cnn1"], "ResNet50\nweight 0.55"),
        ((3.4, 3.0), 2.8, 1.5, colors["cnn2"], "DenseNet121\nweight 0.45"),
        ((3.4, 0.9), 2.8, 1.5, colors["morph"], "Morphology XGBoost\nweight 0.02"),
        ((7.4, 3.0), 2.9, 1.8, colors["blend"], "Calibrated Hybrid\nthreshold 0.55"),
        ((11.0, 3.0), 2.2, 1.8, colors["out"], "Prediction\nPlasma / Non-plasma"),
    ]

    for (x, y), w, h, color, label in boxes:
        rect = patches.FancyBboxPatch(
            (x, y), w, h, boxstyle="round,pad=0.03,rounding_size=0.08",
            linewidth=2, edgecolor="white", facecolor=color, alpha=0.95
        )
        ax.add_patch(rect)
        ax.text(x + w / 2, y + h / 2, label, ha="center", va="center", color="white", fontsize=14, fontweight="bold")

    arrows = [
        ((2.8, 4.0), (3.4, 5.85)),
        ((2.8, 4.0), (3.4, 3.75)),
        ((2.8, 4.0), (3.4, 1.65)),
        ((6.2, 5.85), (7.4, 4.5)),
        ((6.2, 3.75), (7.4, 3.9)),
        ((6.2, 1.65), (7.4, 3.3)),
        ((10.3, 3.9), (11.0, 3.9)),
    ]
    for a, b in arrows:
        ax.annotate("", xy=b, xytext=a, arrowprops=dict(arrowstyle="-|>", lw=2.5, color="#455A64"))

    title = "Optimized PlasmaXAI Framework"
    subtitle = (
        f"Validation: Acc {summary['best_framework']['validation_metrics']['accuracy']:.2f}% | "
        f"F1 {summary['best_framework']['validation_metrics']['weighted_f1']:.2f}% | "
        f"Recall {summary['best_framework']['validation_metrics']['plasma_recall']:.2f}%\n"
        f"Test: Acc {summary['best_framework']['test_metrics']['accuracy']:.2f}% | "
        f"F1 {summary['best_framework']['test_metrics']['weighted_f1']:.2f}% | "
        f"Recall {summary['best_framework']['test_metrics']['plasma_recall']:.2f}% | "
        f"AUC {summary['best_framework']['test_metrics']['auc']:.2f}%"
    )
    ax.text(7, 7.45, title, ha="center", va="center", fontsize=22, fontweight="bold")
    ax.text(7, 6.9, subtitle, ha="center", va="center", fontsize=12.5, color="#37474F")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig1_framework_overview.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_model_comparison(comparison_df: pd.DataFrame):
    metrics = ["accuracy", "weighted_f1", "plasma_recall", "auc"]
    titles = ["Accuracy (%)", "Weighted F1 (%)", "Plasma Recall (%)", "AUC (%)"]
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle("Optimized PlasmaXAI Comparison on Held-out Test Set", fontsize=18, fontweight="bold")

    palette = ["#E53935", "#2E7D32", "#FF8F00", "#1565C0"]
    for ax, metric, title in zip(axes.flat, metrics, titles):
        sns.barplot(data=comparison_df, x="model", y=metric, palette=palette[: len(comparison_df)], ax=ax)
        ax.set_title(title, fontweight="bold")
        ax.set_xlabel("")
        ax.set_ylabel(title)
        ax.tick_params(axis="x", rotation=12)
        for p in ax.patches:
            ax.annotate(f"{p.get_height():.2f}", (p.get_x() + p.get_width() / 2, p.get_height()),
                        ha="center", va="bottom", fontsize=10, xytext=(0, 4), textcoords="offset points")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig2_model_comparison.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_confusion_matrices(y_true, resnet_preds, hybrid_preds):
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))
    fig.suptitle("Confusion Matrices: Best Single Model vs Best Hybrid", fontsize=16, fontweight="bold")

    for ax, preds, title, cmap in [
        (axes[0], resnet_preds, "ResNet50 Final", "Reds"),
        (axes[1], hybrid_preds, "Optimized Hybrid", "Blues"),
    ]:
        cm = confusion_matrix(y_true, preds)
        sns.heatmap(cm, annot=True, fmt="d", cmap=cmap, cbar=False, square=True,
                    xticklabels=CLASS_NAMES, yticklabels=CLASS_NAMES, ax=ax)
        ax.set_title(title, fontweight="bold")
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig3_confusion_matrices.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_roc_curves(curves: dict[str, tuple[np.ndarray, np.ndarray, float]]):
    fig, ax = plt.subplots(figsize=(9, 7))
    colors = {
        "ResNet50 Final": "#E53935",
        "DenseNet121 Final": "#2E7D32",
        "Morphology XGBoost": "#FF8F00",
        "Optimized Hybrid": "#1565C0",
    }
    for name, (labels, probs, auc_pct) in curves.items():
        fpr, tpr, _ = roc_curve(labels, probs)
        lw = 3 if "Hybrid" in name else 2
        ax.plot(fpr, tpr, linewidth=lw, color=colors[name], label=f"{name} (AUC={auc_pct:.2f}%)")
    ax.plot([0, 1], [0, 1], linestyle="--", color="#607D8B", linewidth=1)
    ax.set_title("ROC Curves on Held-out Test Set", fontsize=16, fontweight="bold")
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.legend(loc="lower right")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig4_roc_curves.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_probability_plot(y_true, hybrid_probs, threshold):
    fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))
    fig.suptitle("Optimized Hybrid Probability Behavior", fontsize=16, fontweight="bold")

    axes[0].hist(hybrid_probs[y_true == 0], bins=25, alpha=0.7, color="#1565C0", label="Non-plasma")
    axes[0].hist(hybrid_probs[y_true == 1], bins=25, alpha=0.7, color="#E53935", label="Plasma")
    axes[0].axvline(threshold, color="#263238", linestyle="--", linewidth=2, label=f"Threshold={threshold:.2f}")
    axes[0].set_title("Class-wise Probability Distribution", fontweight="bold")
    axes[0].set_xlabel("Predicted Plasma Probability")
    axes[0].set_ylabel("Count")
    axes[0].legend()

    sorted_idx = np.argsort(hybrid_probs)
    sorted_probs = hybrid_probs[sorted_idx]
    sorted_labels = y_true[sorted_idx]
    x = np.arange(len(sorted_probs))
    axes[1].scatter(x[sorted_labels == 0], sorted_probs[sorted_labels == 0], s=18, color="#1565C0", label="Non-plasma")
    axes[1].scatter(x[sorted_labels == 1], sorted_probs[sorted_labels == 1], s=18, color="#E53935", label="Plasma")
    axes[1].axhline(threshold, color="#263238", linestyle="--", linewidth=2)
    axes[1].set_title("Sorted Test Predictions", fontweight="bold")
    axes[1].set_xlabel("Test Samples (sorted by probability)")
    axes[1].set_ylabel("Predicted Plasma Probability")
    axes[1].legend()

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig5_probability_analysis.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_morphology_importance(morph_bundle, config):
    model = morph_bundle["model"]
    feat_cols = morph_bundle["feature_columns"]
    importances = getattr(model, "feature_importances_", np.zeros(len(feat_cols)))
    ranking = pd.DataFrame({"feature": feat_cols, "importance": importances}).sort_values("importance", ascending=False)

    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Morphology and Fusion Weights in Optimized PlasmaXAI", fontsize=16, fontweight="bold")

    sns.barplot(data=ranking.head(8), y="feature", x="importance", color="#FF8F00", ax=axes[0])
    axes[0].set_title("Top Morphological Drivers (XGBoost)", fontweight="bold")
    axes[0].set_xlabel("Feature Importance")
    axes[0].set_ylabel("")

    fusion = pd.DataFrame(
        {
            "component": ["ResNet50", "DenseNet121", "Morphology"],
            "weight": [config["resnet_weight"], config["densenet_weight"], config["morph_weight"]],
        }
    )
    sns.barplot(data=fusion, x="component", y="weight", palette=["#E53935", "#2E7D32", "#FF8F00"], ax=axes[1])
    axes[1].set_title("Final Fusion Weights", fontweight="bold")
    axes[1].set_xlabel("")
    axes[1].set_ylabel("Blend Weight")
    for p in axes[1].patches:
        axes[1].annotate(f"{p.get_height():.2f}", (p.get_x() + p.get_width() / 2, p.get_height()),
                         ha="center", va="bottom", fontsize=10, xytext=(0, 4), textcoords="offset points")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig6_morphology_fusion.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def save_deployment_figure(inference_df: pd.DataFrame, hybrid_metrics: dict):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle("Optimized Deployment Profile", fontsize=16, fontweight="bold")

    sns.barplot(data=inference_df, x="component", y="gpu_ms", palette=["#E53935", "#2E7D32", "#FF8F00", "#1565C0"], ax=axes[0])
    axes[0].set_title("Approximate GPU Inference Time", fontweight="bold")
    axes[0].set_xlabel("")
    axes[0].set_ylabel("Milliseconds / image")
    axes[0].tick_params(axis="x", rotation=12)
    for p in axes[0].patches:
        axes[0].annotate(f"{p.get_height():.2f} ms", (p.get_x() + p.get_width() / 2, p.get_height()),
                         ha="center", va="bottom", fontsize=10, xytext=(0, 4), textcoords="offset points")

    metrics_df = pd.DataFrame(
        {
            "metric": ["Accuracy", "Weighted F1", "Plasma Recall", "AUC"],
            "value": [
                hybrid_metrics["accuracy"],
                hybrid_metrics["weighted_f1"],
                hybrid_metrics["plasma_recall"],
                hybrid_metrics["auc"],
            ],
        }
    )
    sns.barplot(data=metrics_df, x="metric", y="value", palette=["#1565C0", "#2E7D32", "#E53935", "#6A1B9A"], ax=axes[1])
    axes[1].set_title("Optimized Hybrid Test Metrics", fontweight="bold")
    axes[1].set_xlabel("")
    axes[1].set_ylabel("Score (%)")
    axes[1].axhline(90, color="#455A64", linestyle="--", linewidth=1.5, label="90% clinical mark")
    axes[1].legend()
    for p in axes[1].patches:
        axes[1].annotate(f"{p.get_height():.2f}", (p.get_x() + p.get_width() / 2, p.get_height()),
                         ha="center", va="bottom", fontsize=10, xytext=(0, 4), textcoords="offset points")

    plt.tight_layout()
    plt.savefig(OUT_DIR / "optimized_fig7_deployment_profile.png", dpi=150, bbox_inches="tight")
    plt.close(fig)


def main():
    sns.set_theme(style="whitegrid")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

    df = load_dataset(DATASET_DIR)
    train_df, temp_df = train_test_split(df, test_size=0.30, stratify=df["label"], random_state=SEED)
    val_df, test_df = train_test_split(temp_df, test_size=0.50, stratify=temp_df["label"], random_state=SEED)
    val_loader = DataLoader(PCMMDDataset(val_df, config["image_size"]), batch_size=48, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")
    test_loader = DataLoader(PCMMDDataset(test_df, config["image_size"]), batch_size=48, shuffle=False, num_workers=0, pin_memory=DEVICE.type == "cuda")

    resnet = load_image_model("resnet50", ROOT / config["resnet_checkpoint"])
    densenet = load_image_model("densenet121", ROOT / config["densenet_checkpoint"])
    morph_bundle = joblib.load(ROOT / config["morph_model"])

    res_val_probs, y_val, val_paths = predict_with_tta(resnet, val_loader)
    res_test_probs, y_test, test_paths = predict_with_tta(resnet, test_loader)
    den_val_probs, _, _ = predict_with_tta(densenet, val_loader)
    den_test_probs, _, _ = predict_with_tta(densenet, test_loader)

    feat_df = pd.read_csv(MORPH_FEATURES_PATH).set_index("path")
    feat_cols = morph_bundle["feature_columns"]
    x_val = morph_bundle["scaler"].transform(feat_df.loc[val_paths, feat_cols].fillna(0.0).values)
    x_test = morph_bundle["scaler"].transform(feat_df.loc[test_paths, feat_cols].fillna(0.0).values)
    morph_val_probs = morph_bundle["model"].predict_proba(x_val)[:, 1]
    morph_test_probs = morph_bundle["model"].predict_proba(x_test)[:, 1]

    resnet_thr = search_best_threshold(y_val, res_val_probs)["threshold"]
    densenet_thr = search_best_threshold(y_val, den_val_probs)["threshold"]
    morph_thr = search_best_threshold(y_val, morph_val_probs)["threshold"]

    image_mix_val = config["resnet_weight"] * res_val_probs + config["densenet_weight"] * den_val_probs
    image_mix_test = config["resnet_weight"] * res_test_probs + config["densenet_weight"] * den_test_probs
    hybrid_val_probs = (1.0 - config["morph_weight"]) * image_mix_val + config["morph_weight"] * morph_val_probs
    hybrid_test_probs = (1.0 - config["morph_weight"]) * image_mix_test + config["morph_weight"] * morph_test_probs
    hybrid_threshold = float(config["threshold"])

    resnet_metrics = compute_metrics(y_test, res_test_probs, resnet_thr)
    densenet_metrics = compute_metrics(y_test, den_test_probs, densenet_thr)
    morph_metrics = compute_metrics(y_test, morph_test_probs, morph_thr)
    hybrid_metrics = compute_metrics(y_test, hybrid_test_probs, hybrid_threshold)

    comparison_df = pd.DataFrame(
        [
            {"model": "ResNet50", **{k: resnet_metrics[k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
            {"model": "DenseNet121", **{k: densenet_metrics[k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
            {"model": "Morph XGBoost", **{k: morph_metrics[k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
            {"model": "Best Hybrid", **{k: hybrid_metrics[k] for k in ["accuracy", "weighted_f1", "plasma_recall", "auc"]}},
        ]
    )

    curves = {
        "ResNet50 Final": (y_test, res_test_probs, resnet_metrics["auc"]),
        "DenseNet121 Final": (y_test, den_test_probs, densenet_metrics["auc"]),
        "Morphology XGBoost": (y_test, morph_test_probs, morph_metrics["auc"]),
        "Optimized Hybrid": (y_test, hybrid_test_probs, hybrid_metrics["auc"]),
    }

    resnet_ms = measure_image_ms(resnet, config["image_size"])
    densenet_ms = measure_image_ms(densenet, config["image_size"])
    morph_ms = 0.2
    hybrid_ms = resnet_ms + densenet_ms + morph_ms
    inference_df = pd.DataFrame(
        [
            {"component": "ResNet50", "gpu_ms": resnet_ms},
            {"component": "DenseNet121", "gpu_ms": densenet_ms},
            {"component": "Morphology", "gpu_ms": morph_ms},
            {"component": "Hybrid Total", "gpu_ms": hybrid_ms},
        ]
    )

    save_framework_overview(config, summary)
    save_model_comparison(comparison_df)
    save_confusion_matrices(y_test, resnet_metrics["preds"], hybrid_metrics["preds"])
    save_roc_curves(curves)
    save_probability_plot(y_test, hybrid_test_probs, hybrid_threshold)
    save_morphology_importance(morph_bundle, config)
    save_deployment_figure(inference_df, hybrid_metrics)

    figure_list = [
        "optimized_fig1_framework_overview.png",
        "optimized_fig2_model_comparison.png",
        "optimized_fig3_confusion_matrices.png",
        "optimized_fig4_roc_curves.png",
        "optimized_fig5_probability_analysis.png",
        "optimized_fig6_morphology_fusion.png",
        "optimized_fig7_deployment_profile.png",
    ]
    (OUT_DIR / "optimized_figures_manifest.txt").write_text("\n".join(figure_list), encoding="utf-8")
    print("Generated optimized figures:")
    for name in figure_list:
        print(name)


if __name__ == "__main__":
    main()

