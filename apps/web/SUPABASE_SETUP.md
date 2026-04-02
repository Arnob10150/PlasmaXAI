# PlasmaXAI Web Supabase Setup

## 1. Create the Supabase project

- create a Supabase project for the clinical workspace
- copy the project URL and API keys from `Settings -> API`

## 2. Configure `apps/web/.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET=plasmaxai-case-images
NEXT_PUBLIC_SUPABASE_REPORT_BUCKET=plasmaxai-reports
INFERENCE_API_URL=http://127.0.0.1:8000
PLASMAXAI_DISABLE_LOCAL_INFERENCE=0
```

Notes:
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can reuse the anon key if needed
- in hosted Vercel Services deployments, `INFERENCE_API_URL` can usually be omitted because the app can use the generated `INFERENCE_URL`

## 3. Apply the SQL schema

Run:

- `supabase/migrations/20260401_initial_schema.sql`

This creates:
- organizations
- profiles
- patients
- cases
- case_images
- predictions
- explanations
- reports
- review_requests
- audit_logs
- the case-image bucket
- the report bucket

## 4. Configure auth URLs

In Supabase Authentication:
- add `http://localhost:3000`
- add your hosted production URL later

## 5. Run the inference service

For local development:

```powershell
cd "F:\BUET plasma\apps\inference"
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 6. Run the website

```powershell
cd "F:\BUET plasma\apps\web"
bun install
bun run dev
```

## Hosted note

When the project is deployed on Vercel with the root `vercel.json` and
Framework Preset `Services`, the site can talk to the inference service using
the generated cross-service URL automatically.

