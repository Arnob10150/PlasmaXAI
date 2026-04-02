# PlasmaXAI

`PlasmaXAI` is an end-to-end plasma-cell analysis project that combines:

- a doctor-facing clinical web application
- a FastAPI inference service for the final `PlasmaXAI` model
- research pipelines, evaluation outputs, figures, and competition materials

The repository is organized so the deployable application code is isolated from
the research assets and raw data.

## Top-level structure

```text
apps/
  web/                 Next.js clinical workspace
  inference/           FastAPI inference service

artifacts/
  models/              primary exported model checkpoints/configs

data/
  raw/                 extracted PCMMD datasets used during development
  archives/            zipped/raw source archives kept outside deployable apps

docs/
  VERCEL_DEPLOYMENT_READY.md

research/
  notebooks/           notebook-based experimentation
  notes/               prompt and planning notes
  scripts/             training, benchmarking, and report-generation scripts
  outputs/
    baseline/          notebook-era baseline figures
    optimization/      optimization-stage outputs and checkpoints
    novel/             final PlasmaXAI outputs, figures, reports, analysis
  package/             consolidated research records and archived diagrams

apps/web and apps/inference are the only deployable app services.
Everything else exists to document, reproduce, or analyze the research.
```

## Deployable architecture

### `apps/web`

This is the doctor-facing website built with:

- `Next.js`
- `React`
- `TypeScript`
- `Tailwind CSS`
- `Supabase`
- `Bootstrap Icons`
- `Framer Motion`

The internal structure is intentionally React/Next-oriented rather than a flat
folder dump:

```text
apps/web/src/
  app/                 routes, layouts, server actions, API routes
  components/          UI sections grouped by domain
    auth/
    cases/
    dashboard/
    patients/
    shared/
    ui/
    workspace/
  lib/                 data access, explainability formatting, reports, utils
```

That gives the web app a clear separation between:
- routing
- presentational components
- domain-specific logic
- infrastructure helpers

### `apps/inference`

This is the Python inference service built with:

- `FastAPI`
- `PyTorch`
- `timm`
- `OpenCV`

It is organized around:

```text
apps/inference/
  app/
    main.py            local FastAPI entrypoint
    app.py             Vercel-compatible entrypoint
    predictor.py       model loading and inference logic
  build.py             stages research artifacts into deployable model assets
  run_case_inference.py
  requirements.txt
  pyproject.toml
```

## Research organization

All research-side work is now grouped under `research/` instead of being mixed
into the root:

- `research/notebooks/PlasmaXAI.ipynb`
- `research/scripts/`
- `research/outputs/baseline/`
- `research/outputs/optimization/`
- `research/outputs/novel/`
- `research/package/`

This keeps:
- deployable apps in `apps/`
- reproducibility material in `research/`
- raw datasets in `data/`
- exported root-level checkpoints in `artifacts/`

## Data organization

Raw and extracted data now lives under `data/`:

- `data/raw/PCMMD Plasma Cells for Multiple Myeloma Diagnosis`
- `data/raw/PCMMD_LOCAL`
- `data/archives/PCMMD Plasma Cells for Multiple Myeloma Diagnosis.zip`

These are deliberately outside the app folders so Vercel deployments do not
look like they depend on dataset directories inside the website runtime.

## Model and output organization

Primary exported model artifacts:

- `artifacts/models/best_plasmaxai.pth`
- `artifacts/models/best_plasmaxai_hybrid_config.json`

Research outputs:

- `research/outputs/baseline/`
- `research/outputs/optimization/`
- `research/outputs/novel/`

## Deployment

This repository is organized for a root-level Vercel **Services** deployment.

- `apps/web` is mounted at `/`
- `apps/inference` is mounted at `/api/inference`

Main deployment guide:

- [VERCEL_DEPLOYMENT_READY.md](f:/BUET%20plasma/docs/VERCEL_DEPLOYMENT_READY.md)

Root Vercel config:

- [vercel.json](f:/BUET%20plasma/vercel.json)

## Local development

### Website

```powershell
cd "F:\BUET plasma\apps\web"
corepack pnpm install
bun run dev
```

### Inference

```powershell
cd "F:\BUET plasma\apps\inference"
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Core records

- [PlasmaXAI_ultra_detailed_full_record.txt](f:/BUET%20plasma/research/package/PlasmaXAI_ultra_detailed_full_record.txt)
- [PlasmaXAI_everything_master_dossier.txt](f:/BUET%20plasma/research/package/PlasmaXAI_everything_master_dossier.txt)
- [PlasmaXAI_research_master_record.txt](f:/BUET%20plasma/research/package/PlasmaXAI_research_master_record.txt)

## Practical note

The repo is organized so the website can be deployed cleanly, but the research
artifacts remain available for judging, verification, and further development.
That means the structure is not only cleaner for Vercel, but also easier for a
reviewer to navigate by purpose.
