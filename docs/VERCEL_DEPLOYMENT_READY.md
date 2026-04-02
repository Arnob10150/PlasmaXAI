PlasmaXAI Vercel Deployment Guide
==========================================================================

This repository is now organized as a single Vercel **Services** project.

Deployable applications
--------------------------------------------------------------------------

1. `apps/web`
   - Next.js clinical workspace
   - mounted at `/`

2. `apps/inference`
   - FastAPI inference service
   - mounted at `/api/inference`


Root-level Vercel config
--------------------------------------------------------------------------

The repository root now contains the only Vercel config that matters:

- `vercel.json`

It declares two services:
- `web` -> `apps/web`
- `inference` -> `apps/inference/app/app.py`

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
- one inference service
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

`apps/inference` is mounted at `/api/inference`.

That means:
- service health route becomes `/api/inference/health`
- case inference route becomes `/api/inference/cases`

The FastAPI code does **not** repeat `/api/inference` in its route
definitions because Vercel strips the service prefix before forwarding.


Auto-generated service URLs
--------------------------------------------------------------------------

With Vercel Services, Vercel automatically exposes cross-service URLs.

For the `inference` service, the important generated variables are:
- `INFERENCE_URL`
- `NEXT_PUBLIC_INFERENCE_URL`

The website now supports this directly.

`apps/web/src/lib/inference/service.ts` resolves inference in this order:
1. `INFERENCE_API_URL`
2. `INFERENCE_URL`
3. `NEXT_PUBLIC_INFERENCE_URL`
4. local Python fallback when not hosted

So in production, the website can work without manually hardcoding the
inference URL if the Vercel Services deployment is configured correctly.


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

Optional:
- `INFERENCE_API_URL`

If you use the single-project Services setup, the auto-generated
`INFERENCE_URL` is usually enough. `INFERENCE_API_URL` is only needed if you
want to override the service target with an external deployment.


Inference environment variables
--------------------------------------------------------------------------

Set these for the same Vercel project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `PLASMAXAI_PROJECT_ROOT`

In hosted builds, the inference service stages required model assets into
`apps/inference/model_assets/` during the build. The predictor prefers that
staged asset directory automatically.


How inference assets are staged
--------------------------------------------------------------------------

`apps/inference/build.py` copies the required model files from the research
artifact directories into:

- `apps/inference/model_assets/research/outputs/novel/...`
- `apps/inference/model_assets/research/outputs/optimization/checkpoints/...`

That staged directory is then included in the Vercel inference service
package through the root `vercel.json`.

This keeps the runtime lookup simple and avoids relying on a fragile
production filesystem layout.


Verification checklist
--------------------------------------------------------------------------

What was updated to support this deployment shape:

- moved website source to `apps/web`
- moved inference source to `apps/inference`
- added root `vercel.json`
- removed nested service-level `vercel.json` files
- updated website inference path resolution for the new folder layout
- updated inference asset staging logic for the new folder layout
- updated local fallback paths for `run_case_inference.py`
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


