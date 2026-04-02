from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from app.predictor import get_predictor


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run PlasmaXAI inference for one case.")
    parser.add_argument("--case-id", required=True)
    parser.add_argument("--case-code", required=True)
    parser.add_argument("--patient-code", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--image-path", required=True)
    parser.add_argument("--image-bucket", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    os.environ.setdefault(
        "PLASMAXAI_PROJECT_ROOT",
        str(Path(__file__).resolve().parents[2]),
    )

    predictor = get_predictor()
    result = predictor.predict(args.image_path, image_bucket=args.image_bucket)
    payload = {
        "caseId": args.case_id,
        "caseCode": args.case_code,
        "patientCode": args.patient_code,
        "title": args.title,
        "status": "completed",
        **result,
    }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
