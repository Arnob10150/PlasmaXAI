# PlasmaXAI Supabase Setup

## 1. Create a Supabase project
- Open the Supabase dashboard.
- Create a new project for `plasmaxai-web`.
- Copy the project URL and publishable key from `Settings -> API`.

## 2. Fill environment variables
Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_CASE_IMAGE_BUCKET=plasmaxai-case-images
NEXT_PUBLIC_SUPABASE_REPORT_BUCKET=plasmaxai-reports
INFERENCE_API_URL=http://127.0.0.1:8000
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can reuse the anon key if your project only exposes that key.

## 3. Apply the SQL schema
Run the SQL file below in the Supabase SQL editor:

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
- the `plasmaxai-case-images` storage bucket
- the `plasmaxai-reports` storage bucket
- storage policies for authenticated users to upload, read, update, and delete both case images and report files

It also enables row-level security and creates a profile bootstrap trigger for new auth users.

## 4. Configure auth
In `Authentication -> URL Configuration`:
- add `http://localhost:3000` as the site URL for local development
- add your deployed production URL later

If you want magic links to land on the dashboard, keep `/dashboard` reachable in your redirect settings.

## 5. Run the inference service
Set up and run `plasmaxai-inference` separately:
- read `plasmaxai-inference/README.md`
- point `INFERENCE_API_URL` at that FastAPI service

## 6. Start the website
```powershell
corepack pnpm dev
```

## Current behavior
- `/login` and `/register` are public.
- `/dashboard`, `/cases/[id]`, `/patients`, `/history`, `/reports`, `/profile`, `/settings`, and `/new-case` are protected.
- sign in, sign up, magic link, and sign out are wired to Supabase Auth.
- on first authenticated workspace load, the app attempts to sync doctor profile metadata into `profiles` and create an organization record when the database schema is present.
- new cases can upload a microscopy image into Supabase Storage or store a manual image reference.
- case detail pages can generate signed image previews for uploaded Supabase-hosted files.
- when `INFERENCE_API_URL` is available, the website calls the FastAPI service, writes prediction and explanation rows back into Supabase, and automatically creates a downloadable HTML report artifact in storage.

## Next recommended build step
Add clinician-facing report export options such as print-friendly PDF generation, branded templates, and downloadable case bundles.
