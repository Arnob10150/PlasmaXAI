# PlasmaXAI Web

`PlasmaXAI Web` is the doctor-facing clinical workspace for the PlasmaXAI system.

## Location

- Repository path: `apps/web`
- Deployment route in Vercel Services: `/`

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `Framer Motion`
- `Bootstrap Icons`
- `Recharts`
- `Supabase`
- `Bun`

## Key features

- doctor login and registration
- responsive clinical dashboard
- new-case upload workflow
- image review workspace with zoom/pan and focus-map support
- clinician-friendly case interpretation
- patient history and report views
- local/offline fallback mode

## Local development

```powershell
cd "F:\BUET plasma\apps\web"
bun install
bun run dev
```

## Local build

```powershell
cd "F:\BUET plasma\apps\web"
bun run build
```

## Environment

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET`
- `NEXT_PUBLIC_SUPABASE_REPORT_BUCKET`
- `PLASMAXAI_DISABLE_LOCAL_INFERENCE`

Optional:
- `INFERENCE_API_URL`

On Vercel Services, the site can also use the auto-generated `INFERENCE_URL`
or `NEXT_PUBLIC_INFERENCE_URL` values from the `inference` service.

## Vercel deployment

This app is intended to be deployed from the repository root using:

- root `vercel.json`
- Framework Preset: `Services`

See:

- `../../VERCEL_DEPLOYMENT_READY.md`

## Notes

- Local fallback mode is useful for demos and offline review.
- For hosted clinical behavior, configure Supabase and the inference service.
