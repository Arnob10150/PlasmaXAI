from __future__ import annotations

import shutil
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SERVICE_ROOT.parents[1]
ASSET_ROOT = SERVICE_ROOT / "model_assets"

REQUIRED_FILES = [
    (
        "research/outputs/novel/novel_fusion_model.pth",
        "research/outputs/novel/novel_fusion_model.pth",
    ),
    (
        "research/outputs/novel/fusion_scalers.joblib",
        "research/outputs/novel/fusion_scalers.joblib",
    ),
    (
        "research/outputs/novel/counterfactual_bundle.joblib",
        "research/outputs/novel/counterfactual_bundle.joblib",
    ),
    (
        "research/outputs/novel/novel_summary.json",
        "research/outputs/novel/novel_summary.json",
    ),
    (
        "research/outputs/novel/plasmaxai_operating_point.json",
        "research/outputs/novel/plasmaxai_operating_point.json",
    ),
    (
        "research/outputs/optimization/checkpoints/resnet50_final.pth",
        "research/outputs/optimization/checkpoints/resnet50_final.pth",
    ),
    (
        "research/outputs/optimization/checkpoints/densenet121_final.pth",
        "research/outputs/optimization/checkpoints/densenet121_final.pth",
    ),
]


def stage_asset(source_rel: str, dest_rel: str) -> None:
    source = REPO_ROOT / source_rel
    destination = ASSET_ROOT / dest_rel

    if not source.exists():
        raise FileNotFoundError(f"Required model asset was not found: {source}")

    destination.parent.mkdir(parents=True, exist_ok=True)

    if destination.exists() and destination.stat().st_size == source.stat().st_size:
        print(f"[build] Skipping unchanged asset: {dest_rel}")
        return

    shutil.copy2(source, destination)
    print(f"[build] Staged asset: {dest_rel}")


def main() -> None:
    for source_rel, dest_rel in REQUIRED_FILES:
        stage_asset(source_rel, dest_rel)


if __name__ == "__main__":
    main()
