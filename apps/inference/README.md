# PlasmaXAI Inference Service

FastAPI wrapper around the final PlasmaXAI model artifacts.

## Location

- Repository path: `apps/inference`
- intended deployment target: external Python host such as `Render`, `Railway`, `Fly.io`, or a VM

## What it does

- lazily loads the final PlasmaXAI fusion model
- reads microscopy images from local paths, URLs, or Supabase Storage
- returns prediction, confidence, clinical explanation, and morphology cues

## Key files

- `app/main.py`
- `app/app.py`
- `app/predictor.py`
- `build.py`
- `requirements.txt`
- `pyproject.toml`
- `.env.example`

## Local environment

Copy `.env.example` to `.env` and set:

```env
PLASMAXAI_PROJECT_ROOT=F:\BUET plasma
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
HOST=0.0.0.0
PORT=8000
```

`PLASMAXAI_PROJECT_ROOT` should point to the repository root containing:
- `research/outputs/novel/`
- `research/outputs/optimization/checkpoints/`

## Local install

```powershell
cd "F:\BUET plasma\apps\inference"
python -m pip install -r requirements.txt
```

## Local run

```powershell
cd "F:\BUET plasma\apps\inference"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Why this is not deployed on Vercel

The real PlasmaXAI inference stack includes:

- `torch`
- `torchvision`
- `timm`
- `opencv-python-headless`
- staged model checkpoints

That package set exceeds Vercel's Python function bundle limits. The website is
therefore deployed on Vercel, while the real model should be deployed on an
external Python host.

During hosted builds on an external Python platform:

- `build.py` stages required model files into `model_assets/`
- `app/predictor.py` prefers `model_assets/` automatically

## Routes

- `GET /health`
- `POST /cases`

Typical external deployment routes:

- `https://your-inference-host/health`
- `https://your-inference-host/cases`

## Website integration

`apps/web` calls this service through `src/lib/inference/service.ts`.

Set one of these in the Vercel web project:

- `INFERENCE_API_URL`
- `INFERENCE_URL`
- `NEXT_PUBLIC_INFERENCE_URL`

Example:

```env
INFERENCE_API_URL=https://plasmaxai-inference.onrender.com
```

## Docker deployment

This folder now includes a `Dockerfile` so the service can be deployed as a
container on platforms like Render, Railway, Fly.io, or any OCI-compatible
host.

For Render:

- keep `Root Directory` empty
- set `Dockerfile Path` to `apps/inference/Dockerfile`

This is important because `build.py` needs access to the repository-level
`research/outputs/...` model artifacts during the container build.

Basic flow:

```powershell
cd "F:\BUET plasma"
docker build -f apps/inference/Dockerfile -t plasmaxai-inference .
docker run -p 8000:8000 plasmaxai-inference
```

