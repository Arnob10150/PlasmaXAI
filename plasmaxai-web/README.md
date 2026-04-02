# PlasmaXAI Web

`PlasmaXAI Web` is a doctor-facing hematology review workspace built with `Next.js`, `TypeScript`, `Tailwind CSS`, `shadcn/ui` patterns, `Bootstrap Icons`, `Recharts`, and `Supabase-ready` auth/data wiring.

This version is prepared as a website-only release so it can be pushed to GitHub and hosted on Vercel.

## Release

- Version: `v1.2.0`
- Release date: `2026-04-02`
- Target: `Vercel hosting`

## Features

- Doctor login and account-aware workspace
- Interactive dashboard for saved cases and patient history
- New-case upload flow
- Case review page with:
  - microscopy image viewer
  - zoom / pan / contrast controls
  - focus-map overlay
  - clinician-friendly explainability
  - downloadable PDF report
- Patient history and report screens
- Local mode fallback for demo and offline testing
- Supabase-ready auth, database, and storage integration

## Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `Framer Motion`
- `Recharts`
- `Supabase`
- `Bun`

## Local Development

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Build

```bash
bun run build
```

## Environment

Copy `.env.example` to `.env.local` and set the required variables if you want live Supabase mode.

If no Supabase environment is configured, the site falls back to local workstation mode for local evaluation only.

## Vercel Deployment

Create one Vercel project for the website:

1. Import `Arnob10150/PlasmaXAI` into Vercel.
2. Set the Root Directory to `plasmaxai-web`.
3. Vercel will detect the local `vercel.json`.
4. Add the environment variables from `.env.example`.
5. Set `INFERENCE_API_URL` to the live PlasmaXAI inference service URL.
6. Deploy.

Recommended Vercel settings:

- Framework preset: `Next.js`
- Root Directory: `plasmaxai-web`
- Install command: `bun install`
- Build command: `bun run build`
- Output directory: default

Important production note:

- For a real hosted deployment, configure `Supabase` and `INFERENCE_API_URL`.
- The local filesystem fallback is intended for local review/testing, not persistent production hosting.

## Notes

- `.next`, `node_modules`, local temp files, and env files are ignored.
- The website project is prepared for Vercel, but the full end-to-end workflow depends on the separate PlasmaXAI inference service being reachable.
