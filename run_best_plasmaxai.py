from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import joblib
import numpy as np
import timm
import torch
from PIL import Image
from torchvision import transforms


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_config(config_path: Path) -> dict:
    return json.loads(config_path.read_text(encoding="utf-8"))


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
        "nc_ratio": nc_ratio,
        "nc_ratio_log1p": float(np.log1p(nc_ratio)),
        "nucleus_area": nucleus_area,
        "cytoplasm_area": cytoplasm_area,
        "staining_intensity": staining_intensity,
        "granularity": granularity,
        "roundness": float(roundness),
        "mean_r": mean_r,
        "mean_g": mean_g,
        "mean_b": mean_b,
    }


def load_image_model(model_name: str, checkpoint_path: Path) -> torch.nn.Module:
    model = timm.create_model(model_name, pretrained=False, num_classes=2).to(DEVICE)
    state = torch.load(checkpoint_path, map_location=DEVICE)
    model.load_state_dict(state)
    model.eval()
    return model


def image_transform(image_size: int):
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )


def predict_image_prob(model: torch.nn.Module, image_path: Path, image_size: int) -> float:
    tfm = image_transform(image_size)
    image = tfm(Image.open(image_path).convert("RGB")).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        with torch.autocast(device_type=DEVICE.type, enabled=DEVICE.type == "cuda"):
            logits = model(image)
            logits = (
                logits
                + model(torch.flip(image, dims=[3]))
                + model(torch.flip(image, dims=[2]))
                + model(torch.flip(image, dims=[2, 3]))
            ) / 4.0
            prob = torch.softmax(logits, dim=1)[:, 1]
    return float(prob.item())


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the best calibrated PlasmaXAI hybrid framework on one image.")
    parser.add_argument("image_path", help="Path to a single cell image.")
    parser.add_argument(
        "--config",
        default="best_plasmaxai_hybrid_config.json",
        help="Path to the saved hybrid configuration JSON.",
    )
    args = parser.parse_args()

    root = Path.cwd()
    config_path = root / args.config
    config = load_config(config_path)

    image_path = Path(args.image_path)
    resnet = load_image_model("resnet50", root / config["resnet_checkpoint"])
    densenet = load_image_model("densenet121", root / config["densenet_checkpoint"])
    morph_bundle = joblib.load(root / config["morph_model"])

    resnet_prob = predict_image_prob(resnet, image_path, config["image_size"])
    densenet_prob = predict_image_prob(densenet, image_path, config["image_size"])
    morph_features = extract_morphological_features(str(image_path))
    if morph_features is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    feature_columns = morph_bundle["feature_columns"]
    morph_vector = np.array([[morph_features[col] for col in feature_columns]], dtype=np.float32)
    morph_vector = morph_bundle["scaler"].transform(morph_vector)
    morph_prob = float(morph_bundle["model"].predict_proba(morph_vector)[0, 1])

    image_prob = config["resnet_weight"] * resnet_prob + config["densenet_weight"] * densenet_prob
    final_prob = (1.0 - config["morph_weight"]) * image_prob + config["morph_weight"] * morph_prob
    predicted_label = "plasma" if final_prob >= config["threshold"] else "non_plasma"

    result = {
        "device": str(DEVICE),
        "image_path": str(image_path),
        "prediction": predicted_label,
        "threshold": config["threshold"],
        "final_plasma_probability": final_prob,
        "resnet50_probability": resnet_prob,
        "densenet121_probability": densenet_prob,
        "morphology_probability": morph_prob,
        "morph_features": morph_features,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
