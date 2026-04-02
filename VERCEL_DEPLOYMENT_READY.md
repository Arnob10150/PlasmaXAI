PlasmaXAI Vercel Deployment Guide
==========================================================================

This repository is prepared for a two-project Vercel deployment:

1. `plasmaxai-web`
   - Next.js doctor-facing workspace
2. `plasmaxai-inference`
   - FastAPI inference service


Recommended deployment layout
--------------------------------------------------------------------------
Project A: Web application
- Repository: `Arnob10150/PlasmaXAI`
- Root Directory: `plasmaxai-web`
- Framework: `Next.js`
- Install Command: `bun install`
- Build Command: `bun run build`

Project B: Inference service
- Repository: `Arnob10150/PlasmaXAI`
- Root Directory: `plasmaxai-inference`
- Framework: `FastAPI`
- Important project setting:
  Enable `Include source files outside of the Root Directory`


Why two Vercel projects are used
--------------------------------------------------------------------------
The web app and the inference API have different runtime requirements.
Separating them keeps deployment simpler and lets the web application
point at the inference URL through an environment variable.


Website environment variables
--------------------------------------------------------------------------
Set these in the `plasmaxai-web` Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET`
- `NEXT_PUBLIC_SUPABASE_REPORT_BUCKET`
- `INFERENCE_API_URL`
- `PLASMAXAI_DISABLE_LOCAL_INFERENCE=1`

Important:
- `INFERENCE_API_URL` should point to the deployed FastAPI service URL
- `PLASMAXAI_DISABLE_LOCAL_INFERENCE=1` prevents the hosted web app from
  trying to spawn the local Python fallback


Inference environment variables
--------------------------------------------------------------------------
Set these in the `plasmaxai-inference` Vercel project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `PLASMAXAI_PROJECT_ROOT`

If omitted, the service will prefer staged `model_assets/` generated
during the build, then fall back to the repository root layout.


What makes the repo deployment-ready now
--------------------------------------------------------------------------
Website:
- `plasmaxai-web/vercel.json`
- `plasmaxai-web/README.md`
- `plasmaxai-web/.env.example`
- production-safe inference behavior in
  `plasmaxai-web/src/lib/inference/service.ts`

Inference:
- `plasmaxai-inference/app/app.py` for Vercel-supported FastAPI entry
- `plasmaxai-inference/build.py` to stage model assets during build
- `plasmaxai-inference/pyproject.toml` with Vercel build hook
- `plasmaxai-inference/vercel.json` for function settings
- `plasmaxai-inference/README.md`


Deployment sequence
--------------------------------------------------------------------------
1. Deploy the inference project first.
2. Copy the inference deployment URL.
3. Add that URL as `INFERENCE_API_URL` in the web project.
4. Deploy the web project.
5. Configure Supabase buckets and SQL migration from:
   `plasmaxai-web/supabase/migrations/20260401_initial_schema.sql`


Practical limitations
--------------------------------------------------------------------------
This repository is ready for Vercel deployment from a code and config
perspective, but there are still practical constraints:

- PyTorch inference on Vercel may have cold-start and runtime overhead.
- The best long-term production inference target is still a dedicated
  persistent Python/GPU host.
- The local fallback mode is intended for local evaluation, not for
  persistent hosted storage or production-grade multi-user review.


Bottom line
--------------------------------------------------------------------------
The repository now supports a clean Vercel deployment pattern:
- website on Vercel
- inference API on Vercel or another host
- Supabase for storage/auth/data

For competition/demo hosting, this is the cleanest honest setup.
