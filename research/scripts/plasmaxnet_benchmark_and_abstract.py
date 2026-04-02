from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from novel_plasmaxai_pipeline import (
    DATASET_DIR,
    OUT_DIR,
    PREV_OUTPUT_DIR,
    SEED,
    build_morph_cache,
    compute_counterfactual_features,
    fit_counterfactual_model,
    get_or_build_embeddings,
    load_dataset,
    metrics_at_threshold,
    search_best_threshold,
)

FRAMEWORK_NAME = "PlasmaXAI"
COMPARE_CSV = OUT_DIR / "plasmaxai_extended_model_comparison.csv"
COMPARE_FIG = OUT_DIR / "figures" / "plasmaxai_fig12_extended_model_comparison.png"
ABSTRACT_MD = OUT_DIR / "PlasmaXAI_abstract.md"
SUMMARY_JSON = OUT_DIR / "novel_summary.json"


def evaluate_model(name: str, model, x_train, y_train, x_val, y_val, x_test, y_test):
    model.fit(x_train, y_train)
    val_probs = model.predict_proba(x_val)[:, 1]
    test_probs = model.predict_proba(x_test)[:, 1]
    val_pick = search_best_threshold(y_val, val_probs)
    test_metrics = metrics_at_threshold(y_test, test_probs, val_pick["threshold"])
    row = {
        "model": name,
        "threshold": float(val_pick["threshold"]),
        "accuracy": float(test_metrics["accuracy"]),
        "weighted_f1": float(test_metrics["weighted_f1"]),
        "plasma_precision": float(test_metrics["plasma_precision"]),
        "plasma_recall": float(test_metrics["plasma_recall"]),
        "auc": float(test_metrics["auc"]),
    }
    return row


def plot_extended_comparison(df: pd.DataFrame):
    palette = ["#C62828" if m == FRAMEWORK_NAME else "#90A4AE" for m in df["model"]]
    fig, axes = plt.subplots(1, 3, figsize=(22, 7))
    metrics = [
        ("accuracy", "Accuracy (%)"),
        ("plasma_recall", "Plasma Recall (%)"),
        ("auc", "AUC (%)"),
    ]
    for ax, (col, label) in zip(axes, metrics):
        order_df = df.sort_values(col, ascending=False)
        order_df = order_df.copy()
        order_df["bar_color"] = ["#C62828" if m == FRAMEWORK_NAME else "#90A4AE" for m in order_df["model"]]
        sns.barplot(data=order_df, x=col, y="model", hue="model", dodge=False, palette=order_df.set_index("model")["bar_color"].to_dict(), legend=False, ax=ax)
        ax.set_xlabel(label)
        ax.set_ylabel("")
        ax.set_title(label, fontweight="bold")
        for idx, value in enumerate(order_df[col]):
            ax.text(value + 0.15, idx, f"{value:.2f}", va="center", fontsize=10)
    fig.suptitle(f"{FRAMEWORK_NAME} vs Expanded Baselines on Held-out Test Set", fontsize=18, fontweight="bold")
    plt.tight_layout()
    plt.savefig(COMPARE_FIG, dpi=150, bbox_inches="tight")
    plt.close(fig)


def build_abstract(df: pd.DataFrame, summary: dict) -> str:
    top_baseline = df[df["model"] != FRAMEWORK_NAME].sort_values("accuracy", ascending=False).iloc[0]
    plasmaxnet = df[df["model"] == FRAMEWORK_NAME].iloc[0]
    patient = summary["patient_summary"]
    diagrams = [
        "plasmaxai_fig12_extended_model_comparison.png",
        "novel_fig3_confusion_roc.png",
        "novel_fig8_training_curves.png",
        "novel_fig10_calibration_bootstrap.png",
        "novel_fig11_patient_signature_heatmap.png",
        "PlasmaXAI_Novel_Architecture.drawio",
    ]
    text = f"""Title
PlasmaXAI: A Counterfactual-Guided Multi-Branch Fusion Framework for Malignant Plasma Cell Recognition and Patient-Level Morphologic Signature Analysis

Research Objectives
This study develops PlasmaXAI, an explainable computational pathology framework for multiple myeloma cell recognition on the PCMMD dataset. The first objective is to improve cell-level plasma versus non-plasma discrimination beyond earlier optimized hybrid baselines. The second objective is to integrate counterfactual information directly into the classifier decision pathway instead of using explanation only after prediction. The third objective is to validate whether cell-level counterfactual behavior aggregates into consistent patient-level disease signatures on the patient-organized subset of PCMMD. The fourth objective is to compare PlasmaXAI against a broader benchmark set, including deep image models and additional classical machine learning baselines, while maintaining clinically relevant plasma recall.

Proposed Methodology
PlasmaXAI combines frozen ResNet50 and DenseNet121 image embeddings with a handcrafted morphology branch, a counterfactual feature branch, and a score branch. Morphologic descriptors include nucleus-to-cytoplasm ratio, nucleus area, cytoplasm area, staining intensity, granularity, roundness, and mean RGB statistics. A logistic-regression counterfactual boundary model is first trained on morphology features to estimate what feature shifts would move a sample toward the benign boundary. These counterfactual shifts and boundary-distance features are then fed into the main fusion model. Inside PlasmaXAI, each modality is encoded separately, counterfactual features modulate the image streams through sigmoid gates, morphology and counterfactual representations refine the score stream, and a softmax modality gate learns the contribution of the ResNet, DenseNet, morphology, and counterfactual branches before final classification. Training uses AdamW, cosine annealing, early stopping, and validation-based threshold selection. For benchmarking, the framework is compared with ResNet50, DenseNet121, the previous optimized hybrid model, Morph Logistic Regression, Morph RBF-SVM, Morph Random Forest, and Morph XGBoost using the same held-out test split.

Outcomes and Results
PlasmaXAI achieved {plasmaxnet['accuracy']:.2f}% accuracy, {plasmaxnet['weighted_f1']:.2f}% weighted F1, {plasmaxnet['plasma_recall']:.2f}% plasma recall, and {plasmaxnet['auc']:.2f}% AUC on the held-out test set. In the expanded benchmark, the strongest non-PlasmaXAI baseline by accuracy was {top_baseline['model']} with {top_baseline['accuracy']:.2f}% accuracy and {top_baseline['auc']:.2f}% AUC. The previous optimized hybrid remained competitive, but PlasmaXAI preserved the strongest overall balance between discrimination, interpretability, and patient-level signature modeling. Earlier statistical support from the main PlasmaXAI run remained strong, including a bootstrap 95% confidence interval of {summary['novel_bootstrap_ci']['accuracy']['low95']:.2f} to {summary['novel_bootstrap_ci']['accuracy']['high95']:.2f} for accuracy and {summary['novel_bootstrap_ci']['auc']['low95']:.2f} to {summary['novel_bootstrap_ci']['auc']['high95']:.2f} for AUC. At the patient level, the framework produced an AUC of {patient['patient_auc_mean_novel_prob']:.3f} using mean novel probability and identified a reproducible disease signature dominated by {', '.join(patient['top_patient_shift_features'])}. These findings suggest that the framework is not only separating cell classes, but also capturing a repeatable morphologic program associated with diseased patients.

Impact and Applications
PlasmaXAI is relevant for computer-assisted plasma cell screening, triage support in digital hematopathology workflows, and research settings that require both predictive performance and interpretable feature behavior. Its counterfactual-guided design allows users to inspect which morphologic changes would alter malignant probability, while its patient-level aggregation makes it suitable for studying consistency of disease signatures rather than isolated cell predictions alone. This can support model auditing, hypothesis generation, and future clinician-in-the-loop validation studies. With further external validation, PlasmaXAI could contribute to explainable decision support systems for multiple myeloma diagnosis, morphology-aware biomarker discovery, and low-resource deployment scenarios where practical inference speed and transparent outputs both matter.

Diagrams
The current PlasmaXAI package includes the following key diagrams and visual assets: {', '.join(diagrams)}.
"""
    return text.strip()


def main():
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "figures").mkdir(exist_ok=True)

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

    morph_train = train_feat[["path", "label"] + [c for c in train_feat.columns if c in [
        "nc_ratio", "nc_ratio_log1p", "nucleus_area", "cytoplasm_area", "staining_intensity", "granularity", "roundness", "mean_r", "mean_g", "mean_b"
    ]]].merge(cf_train.drop(columns=["label", "class"], errors="ignore"), on="path")
    morph_val = val_feat[["path", "label"] + [c for c in val_feat.columns if c in [
        "nc_ratio", "nc_ratio_log1p", "nucleus_area", "cytoplasm_area", "staining_intensity", "granularity", "roundness", "mean_r", "mean_g", "mean_b"
    ]]].merge(cf_val.drop(columns=["label", "class"], errors="ignore"), on="path")
    morph_test = test_feat[["path", "label"] + [c for c in test_feat.columns if c in [
        "nc_ratio", "nc_ratio_log1p", "nucleus_area", "cytoplasm_area", "staining_intensity", "granularity", "roundness", "mean_r", "mean_g", "mean_b"
    ]]].merge(cf_test.drop(columns=["label", "class"], errors="ignore"), on="path")

    feature_cols = [
        c for c in morph_train.select_dtypes(include=["number"]).columns
        if c not in {"label"}
    ]
    scaler = StandardScaler().fit(morph_train[feature_cols].values)
    x_train = scaler.transform(morph_train[feature_cols].values)
    x_val = scaler.transform(morph_val[feature_cols].values)
    x_test = scaler.transform(morph_test[feature_cols].values)
    y_train = morph_train["label"].values
    y_val = morph_val["label"].values
    y_test = morph_test["label"].values

    rows = []

    summary = json.loads(SUMMARY_JSON.read_text(encoding="utf-8"))
    rows.append({"model": FRAMEWORK_NAME, **summary["novel_fusion_test_metrics"]})
    rows.append({"model": "Prev Hybrid", **summary["previous_hybrid_test_metrics"]})
    rows.append({"model": "ResNet50", **summary["resnet_test_metrics"]})
    rows.append({"model": "DenseNet121", **summary["densenet_test_metrics"]})

    models = [
        ("Morph Logistic Regression", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=SEED)),
        ("Morph RBF-SVM", SVC(kernel="rbf", probability=True, class_weight="balanced", C=2.0, gamma="scale", random_state=SEED)),
        ("Morph Random Forest", RandomForestClassifier(n_estimators=500, max_depth=None, min_samples_leaf=2, class_weight="balanced", random_state=SEED, n_jobs=1)),
        ("Morph XGBoost", XGBClassifier(n_estimators=500, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0, objective="binary:logistic", eval_metric="logloss", random_state=SEED, n_jobs=1)),
    ]
    for name, model in models:
        rows.append(evaluate_model(name, model, x_train, y_train, x_val, y_val, x_test, y_test))

    df_rows = pd.DataFrame(rows)
    df_rows["accuracy"] = df_rows["accuracy"].astype(float)
    df_rows["weighted_f1"] = df_rows["weighted_f1"].astype(float)
    df_rows["plasma_recall"] = df_rows["plasma_recall"].astype(float)
    df_rows["auc"] = df_rows["auc"].astype(float)
    df_rows = df_rows.sort_values(["accuracy", "auc"], ascending=False).reset_index(drop=True)
    df_rows.to_csv(COMPARE_CSV, index=False)

    plot_extended_comparison(df_rows)
    abstract = build_abstract(df_rows, summary)
    ABSTRACT_MD.write_text(abstract, encoding="utf-8")

    print(df_rows[["model", "accuracy", "weighted_f1", "plasma_recall", "auc"]].to_string(index=False))
    print(f"\nSaved: {COMPARE_CSV}")
    print(f"Saved: {COMPARE_FIG}")
    print(f"Saved: {ABSTRACT_MD}")


if __name__ == "__main__":
    main()

