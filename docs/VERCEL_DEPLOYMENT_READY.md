PlasmaXAI Vercel Deployment Guide
==========================================================================

This repository is now organized for a Vercel-hosted **web application**
paired with an external **Python inference service**.

Deployable applications
--------------------------------------------------------------------------

1. `apps/web`
   - Next.js clinical workspace
   - mounted at `/`

2. `apps/inference`
   - FastAPI inference service
   - deploy separately on Render, Railway, Fly.io, or a VM


Root-level Vercel config
--------------------------------------------------------------------------

The repository root now contains the only Vercel config that matters:

- `vercel.json`

It declares the web service only:
- `web` -> `apps/web`

Important Vercel setting:
- Framework Preset: `Services`


Why this structure is better
--------------------------------------------------------------------------

Before this reorganization, the repo expected two separate root directories
and separate nested `vercel.json` files. That worked, but it was awkward to
understand and easy to misconfigure.

Now the deployment shape is explicit:
- one repository root
- one root `vercel.json`
- one web service
- one separately hosted inference API
- clean `apps/` folder for deployable code
- research assets kept outside the app folders


Repository structure
--------------------------------------------------------------------------

```text
apps/
  web/
    src/
    public/
    supabase/
    package.json
    README.md
    VERSION.md
  inference/
    app/
    build.py
    pyproject.toml
    requirements.txt
    README.md

artifacts/
  models/

data/
  raw/
  archives/

docs/
  VERCEL_DEPLOYMENT_READY.md

research/
  notebooks/
  notes/
  scripts/
  outputs/
    baseline/
    optimization/
    novel/
  package/

vercel.json
README.md
```


How routing works
--------------------------------------------------------------------------

`apps/web` serves the main website at `/`.

`apps/inference` is not deployed inside Vercel.

Instead, deploy it externally and point the web app to that URL.


Inference URL resolution
--------------------------------------------------------------------------

`apps/web/src/lib/inference/service.ts` resolves inference in this order:
1. `INFERENCE_API_URL`
2. `INFERENCE_URL`
3. `NEXT_PUBLIC_INFERENCE_URL`
4. local Python fallback when not hosted

In production, set one of those environment variables to your deployed
external inference URL.


Website environment variables
--------------------------------------------------------------------------

Set these for the Vercel project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET`
- `NEXT_PUBLIC_SUPABASE_REPORT_BUCKET`
- `PLASMAXAI_DISABLE_LOCAL_INFERENCE=1`

Required for real hosted inference:
- `INFERENCE_API_URL`

Optional aliases:
- `INFERENCE_URL`
- `NEXT_PUBLIC_INFERENCE_URL`


Inference deployment
--------------------------------------------------------------------------

Deploy `apps/inference` to an external Python platform.

Recommended options:
- `Render`
- `Railway`
- `Fly.io`
- a Docker-capable VM

Important reason:
- the real PlasmaXAI inference stack exceeds Vercel's Python function bundle limits
- trying to deploy the real model inside Vercel Python functions results in bundle-size failures

The `apps/inference` folder now includes:
- `Dockerfile`
- `build.py`
- `pyproject.toml`
- `requirements.txt`


Verification checklist
--------------------------------------------------------------------------

What was updated to support this deployment shape:

- moved website source to `apps/web`
- moved inference source to `apps/inference`
- added root `vercel.json`
- removed hosted inference from the root Vercel service map
- updated website inference path resolution for external API usage
- updated inference asset staging logic for external/container deployment
- updated project docs and records to reflect the `apps/` structure


Build validation
--------------------------------------------------------------------------

The web application was validated with:

```powershell
cd "F:\BUET plasma\apps\web"
bun run build
```

The inference service syntax was validated with:

```powershell
cd "F:\BUET plasma\apps\inference"
python -m py_compile app\app.py app\main.py app\predictor.py build.py run_case_inference.py
```


How to deploy on Vercel
--------------------------------------------------------------------------

1. Import `Arnob10150/PlasmaXAI` into Vercel.
2. Keep the Root Directory at the repository root.
3. Deploy the web app.
4. Deploy `apps/inference` separately.
5. Set `INFERENCE_API_URL` in the Vercel web project to the external inference URL.
3. Set Framework Preset to `Services`.
4. Add the required environment variables.
5. Deploy.

After deployment:
- the website should be available at the project root URL
- the inference API should be reachable at `/api/inference/health`


Supabase schema
--------------------------------------------------------------------------

Run the website SQL schema from:

- `apps/web/supabase/migrations/20260401_initial_schema.sql`

That creates:
- profiles
- organizations
- patients
- cases
- case images
- predictions
- explanations
- reports
- review requests
- audit logs
- case-image storage bucket
- report storage bucket


Practical note
--------------------------------------------------------------------------

This repo is now truly organized for Vercel from a code/configuration
perspective.

The biggest remaining practical constraint is not repo structure anymore;
it is PyTorch inference cost/runtime behavior on Vercel itself.

For demos, judging, and clean cloud hosting, this Services-based structure is
the right organization. For heavy sustained production inference, a dedicated
GPU host can still be the better long-term option.


