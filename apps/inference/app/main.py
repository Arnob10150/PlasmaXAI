from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .predictor import get_predictor


app = FastAPI(
    title="PlasmaXAI Inference API",
    version="0.1.0",
    description="FastAPI service for PlasmaXAI case inference and explainability.",
)


class CaseInferenceRequest(BaseModel):
    caseId: str = Field(..., min_length=1)
    caseCode: str = Field(..., min_length=1)
    patientCode: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    imagePath: str = Field(..., min_length=1)
    imageBucket: str | None = None
    imageDataUrl: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    predictor = get_predictor()
    return {
        "status": "ok",
        "framework": "PlasmaXAI",
        "device": str(predictor.device),
    }


@app.post("/cases")
def analyze_case(payload: CaseInferenceRequest) -> dict[str, object]:
    predictor = get_predictor()

    try:
        result = predictor.predict(
            payload.imagePath,
            image_bucket=payload.imageBucket,
            image_data_url=payload.imageDataUrl,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - runtime inference protection
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc

    return {
        "caseId": payload.caseId,
        "caseCode": payload.caseCode,
        "patientCode": payload.patientCode,
        "title": payload.title,
        "status": "completed",
        **result,
    }
