from __future__ import annotations

import json
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import torch
from sklearn.calibration import calibration_curve
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from novel_plasmaxai_pipeline import (
    DATASET_DIR,
    DEVICE,
    OUT_DIR,
    PREV_OUTPUT_DIR,
    SEED,
    CounterfactualGuidedFusionNet,
    FusionConfig,
    bootstrap_metric_summary,
    build_morph_cache,
    build_tensor_dataset,
    compute_counterfactual_features,
    evaluate_fusion,
    fit_counterfactual_model,
    get_feature_blocks,
    get_or_build_embeddings,
    load_dataset,
    merge_modalities,
)

ROOT = Path.cwd()
FIG_DIR = OUT_DIR / 'figures'
MODEL_THRESHOLD = 0.72
BASELINE_THRESHOLD = 0.55


def load_modal_data():
    summary = json.loads((OUT_DIR / 'novel_summary.json').read_text(encoding='utf-8'))
    scalers = joblib.load(OUT_DIR / 'fusion_scalers.joblib')
    state = torch.load(OUT_DIR / 'novel_fusion_model.pth', map_location=DEVICE)

    df = load_dataset(DATASET_DIR)
    train_df, temp_df = train_test_split(df, test_size=0.30, stratify=df['label'], random_state=SEED)
    val_df, test_df = train_test_split(temp_df, test_size=0.50, stratify=temp_df['label'], random_state=SEED)

    feat_df = build_morph_cache(df)
    train_feat = feat_df[feat_df['path'].isin(train_df['path'])].copy()
    test_feat = feat_df[feat_df['path'].isin(test_df['path'])].copy()

    cf_bundle = fit_counterfactual_model(train_feat)
    cf_test = compute_counterfactual_features(cf_bundle, test_feat)

    emb_test = get_or_build_embeddings(test_df, 'test')
    merged_train = merge_modalities(train_df, train_feat, get_or_build_embeddings(train_df, 'train'), compute_counterfactual_features(cf_bundle, train_feat))
    merged_test = merge_modalities(test_df, test_feat, emb_test, cf_test)

    feature_blocks = get_feature_blocks(merged_train)
    _, _, morph_cols, cf_cols, score_cols = feature_blocks
    merged_test.loc[:, morph_cols] = scalers['morph'].transform(merged_test[morph_cols].values)
    merged_test.loc[:, cf_cols] = scalers['cf'].transform(merged_test[cf_cols].values)
    merged_test.loc[:, score_cols] = scalers['scores'].transform(merged_test[score_cols].values)

    res_cols, den_cols, morph_cols, cf_cols, score_cols = feature_blocks
    cfg = FusionConfig(**summary['best_fusion_config'])
    model = CounterfactualGuidedFusionNet(len(res_cols), len(den_cols), len(morph_cols), len(cf_cols), len(score_cols), cfg).to(DEVICE)
    model.load_state_dict(state)
    model.eval()

    test_loader = DataLoader(build_tensor_dataset(merged_test, feature_blocks), batch_size=256, shuffle=False)
    _, test_probs, test_labels, test_gates = evaluate_fusion(model, test_loader)

    hybrid_cfg = json.loads((ROOT / 'best_plasmaxai_hybrid_config.json').read_text(encoding='utf-8'))
    morph_bundle = joblib.load(PREV_OUTPUT_DIR / 'best_morph_model.joblib')
    morph_test_probs = morph_bundle['model'].predict_proba(
        morph_bundle['scaler'].transform(test_feat[morph_bundle['feature_columns']].values)
    )[:, 1]
    baseline_probs = (
        (1.0 - hybrid_cfg['morph_weight'])
        * (hybrid_cfg['resnet_weight'] * emb_test['resnet_prob'].values + hybrid_cfg['densenet_weight'] * emb_test['densenet_prob'].values)
        + hybrid_cfg['morph_weight'] * morph_test_probs
    )

    novel_bootstrap = bootstrap_metric_summary(test_labels, test_probs, MODEL_THRESHOLD)
    prev_bootstrap = bootstrap_metric_summary(test_labels, baseline_probs, BASELINE_THRESHOLD)

    return {
        'labels': test_labels,
        'model_probs': test_probs,
        'baseline_probs': baseline_probs,
        'gates': test_gates,
        'cf_test': cf_test,
        'novel_bootstrap': novel_bootstrap,
        'prev_bootstrap': prev_bootstrap,
    }


def plot_counterfactual_explanation(gates: np.ndarray, cf_df: pd.DataFrame):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle('PlasmaXAI Counterfactual Explanation Analysis', fontsize=17, fontweight='bold')

    gate_df = pd.DataFrame({
        'modality': ['ResNet50', 'DenseNet121', 'Morphology', 'Counterfactual'],
        'weight': gates.mean(axis=0),
    })
    sns.barplot(
        data=gate_df,
        x='modality',
        y='weight',
        hue='modality',
        legend=False,
        palette=['#1565C0', '#2E7D32', '#FF8F00', '#E53935'],
        ax=axes[0],
    )
    axes[0].set_title('Learned Modality Weights', fontweight='bold')
    axes[0].set_xlabel('')
    axes[0].set_ylabel('Average Gate Weight')
    axes[0].tick_params(axis='x', rotation=8)
    for p in axes[0].patches:
        axes[0].annotate(f"{p.get_height():.3f}", (p.get_x() + p.get_width() / 2, p.get_height()), ha='center', va='bottom', fontsize=9, xytext=(0, 3), textcoords='offset points')

    mean_abs = cf_df[[c for c in cf_df.columns if c.startswith('cf_shift_')]].abs().mean().sort_values(ascending=False).head(8)
    sns.barplot(x=mean_abs.values, y=[c.replace('cf_shift_', '') for c in mean_abs.index], color='#E53935', ax=axes[1])
    axes[1].set_title('Top Counterfactual Drivers in Decision Path', fontweight='bold')
    axes[1].set_xlabel('Mean |counterfactual shift|')
    axes[1].set_ylabel('')

    for ax in axes:
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

    plt.tight_layout()
    out = FIG_DIR / 'plasmaxai_fig4_counterfactual_explanation.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close(fig)
    return out


def plot_calibration_bootstrap(y_true, baseline_probs, model_probs, prev_bootstrap, novel_bootstrap):
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle('PlasmaXAI Calibration and Bootstrap Analysis', fontsize=17, fontweight='bold')

    for name, probs, color in [('Previous Hybrid', baseline_probs, '#607D8B'), ('PlasmaXAI', model_probs, '#C62828')]:
        frac_pos, mean_pred = calibration_curve(y_true, probs, n_bins=10, strategy='quantile')
        axes[0].plot(mean_pred, frac_pos, marker='o', linewidth=2, color=color, label=name)
    axes[0].plot([0, 1], [0, 1], linestyle='--', color='black', linewidth=1)
    axes[0].set_title('Reliability Curve', fontweight='bold')
    axes[0].set_xlabel('Mean Predicted Probability')
    axes[0].set_ylabel('Observed Plasma Frequency')
    axes[0].legend()

    metric_order = ['accuracy', 'weighted_f1', 'plasma_recall', 'auc']
    y_positions = np.arange(len(metric_order))
    for offset, source, color in [(-0.08, prev_bootstrap, '#607D8B'), (0.08, novel_bootstrap, '#C62828')]:
        means = [source[m]['mean'] for m in metric_order]
        lows = [source[m]['mean'] - source[m]['low95'] for m in metric_order]
        highs = [source[m]['high95'] - source[m]['mean'] for m in metric_order]
        axes[1].errorbar(means, y_positions + offset, xerr=[lows, highs], fmt='o', color=color, capsize=4)
    axes[1].set_yticks(y_positions)
    axes[1].set_yticklabels([m.replace('_', ' ').title() for m in metric_order])
    axes[1].set_title('Bootstrap 95% Confidence Intervals', fontweight='bold')
    axes[1].set_xlabel('Score (%)')
    axes[1].legend(['Previous Hybrid', 'PlasmaXAI'], loc='lower right')
    axes[1].spines['top'].set_visible(False)
    axes[1].spines['right'].set_visible(False)

    plt.tight_layout()
    out = FIG_DIR / 'plasmaxai_fig10_calibration_bootstrap.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close(fig)
    return out


def plot_clinical_insight():
    patient_df = pd.read_csv(OUT_DIR / 'patient_counterfactual_summary.csv')
    summary = json.loads((OUT_DIR / 'novel_summary.json').read_text(encoding='utf-8'))['patient_summary']
    feature_names = summary['top_patient_shift_features']
    rows = []
    for feat in feature_names:
        col = f'mean_cf_shift_{feat}'
        for _, row in patient_df.iterrows():
            rows.append({'feature': feat, 'diagnosis': row['diagnosis'], 'value': row[col]})
    plot_df = pd.DataFrame(rows)

    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle('PlasmaXAI Clinical Insight Analysis', fontsize=17, fontweight='bold')
    sns.boxplot(data=plot_df, x='feature', y='value', hue='diagnosis', palette={'diseased': '#E53935', 'normal': '#1565C0'}, ax=axes[0])
    axes[0].set_title('Dominant Patient-Level Counterfactual Shifts', fontweight='bold')
    axes[0].set_xlabel('')
    axes[0].set_ylabel('Mean Counterfactual Shift')
    axes[0].tick_params(axis='x', rotation=12)

    axes[1].scatter(patient_df['mean_novel_prob'], patient_df['mean_cf_distance_plasma'], c=patient_df['diseased_label'], cmap='coolwarm', s=130, edgecolors='white', linewidth=1.5)
    for _, row in patient_df.iterrows():
        axes[1].annotate(f"P{int(row['patient_id']):02d}", (row['mean_novel_prob'], row['mean_cf_distance_plasma']), textcoords='offset points', xytext=(6, 4))
    axes[1].set_title('Disease Signature Space', fontweight='bold')
    axes[1].set_xlabel('Mean PlasmaXAI Probability')
    axes[1].set_ylabel('Mean Counterfactual Distance')

    for ax in axes:
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

    plt.tight_layout()
    out = FIG_DIR / 'plasmaxai_fig6_clinical_insight.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close(fig)
    return out


def main():
    bundle = load_modal_data()
    out1 = plot_counterfactual_explanation(bundle['gates'], bundle['cf_test'])
    out2 = plot_calibration_bootstrap(bundle['labels'], bundle['baseline_probs'], bundle['model_probs'], bundle['prev_bootstrap'], bundle['novel_bootstrap'])
    out3 = plot_clinical_insight()
    print(out1)
    print(out2)
    print(out3)


if __name__ == '__main__':
    main()
