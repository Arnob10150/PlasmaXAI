# PlasmaXAI

`PlasmaXAI` is a plasma-cell diagnostic research and deployment repository built around:

- a doctor-facing `Next.js` website
- a `FastAPI` inference service for the final `PlasmaXAI` model
- the research assets, reports, figures, and paper materials used to build and document the system

## Repository layout

```text
apps/
  web/          Next.js clinical workspace
  inference/    FastAPI inference service

research_master_package/
  detailed records, competition notes, consolidated diagrams

novel_outputs/
optimization_outputs/
  trained models, figures, evaluation artifacts

Latex/
  paper materials
```

## Vercel deployment

This repository is organized for a single Vercel **Services** project:

- `apps/web` is the primary web service mounted at `/`
- `apps/inference` is the Python inference service mounted at `/api/inference`

Root deployment config:

- `vercel.json`

Main deployment guide:

- `VERCEL_DEPLOYMENT_READY.md`

## Local development

Website:

```powershell
cd "F:\BUET plasma\apps\web"
bun install
bun run dev
```

Inference:

```powershell
cd "F:\BUET plasma\apps\inference"
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Main records

- `research_master_package/PlasmaXAI_ultra_detailed_full_record.txt`
- `research_master_package/PlasmaXAI_everything_master_dossier.txt`
