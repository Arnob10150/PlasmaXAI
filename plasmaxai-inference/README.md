# PlasmaXAI Inference Service

FastAPI wrapper around the current PlasmaXAI model artifacts.

## What it does
- loads the best PlasmaXAI fusion model lazily
- accepts a case request from `plasmaxai-web`
- reads image bytes from:
  - a local file path
  - a signed/public URL
  - a Supabase Storage object path using the service role key
- returns prediction, confidence, modality gates, counterfactual explanation, clinical insight, and morphology features

## Files
- `app/main.py` - FastAPI entrypoint
- `app/predictor.py` - model loading and inference logic
- `requirements.txt` - Python dependencies
- `.env.example` - runtime environment template

## Environment
Copy `.env.example` to `.env` and set:

```env
PLASMAXAI_PROJECT_ROOT=F:\BUET plasma
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
HOST=0.0.0.0
PORT=8000
```

`PLASMAXAI_PROJECT_ROOT` should point at the folder containing:
- `novel_outputs/`
- `optimization_outputs/checkpoints/`

## Install
```powershell
cd "F:\BUET plasma\plasmaxai-inference"
python -m pip install -r requirements.txt
```

## Run
```powershell
cd "F:\BUET plasma\plasmaxai-inference"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Endpoints
### `GET /health`
Returns service health and active device.

### `POST /cases`
Request body:
```json
{
  "caseId": "...",
  "caseCode": "...",
  "patientCode": "...",
  "title": "...",
  "imagePath": "user-id/patient/case/file.png",
  "imageBucket": "plasmaxai-case-images"
}
```

Response includes:
- prediction label and confidence
- calibrated plasma probability
- modality gates
- top counterfactual features
- clinical insight text
- morphology features

## Website integration
`plasmaxai-web` already calls this service from `src/lib/inference/service.ts`.
When `INFERENCE_API_URL` is set in the website, new cases can immediately create:
- `predictions` row
- `explanations` row

inside Supabase after a successful inference response.
