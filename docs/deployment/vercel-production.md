# SeaPilot Vercel Production Notes

## Current Production Target

The active public URL is:

```text
https://sea-pilot-ten.vercel.app
```

The previous custom domain `app.bbtm.fr` is no longer the deployment target. It was removed from the Vercel project on 2026-07-02.

`www.bbtm.fr` remains the existing public website and is not changed by the SeaPilot deployment.

## Vercel Project

- Repository: `BBTM-Christophe-GIT/SeaPilot`
- Vercel team: `BBTM` / `bbtm-app`
- Vercel project: `sea-pilot`
- Project id: `prj_2t0n3Kr8g3cclLWi5TawCAmDHnjj`
- Production alias: `https://sea-pilot-ten.vercel.app`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

The repository includes `vercel.json` so direct links like `/login` and `/modules/planning` are rewritten to `index.html`.

## Current Environment State

As of 2026-07-02:

- `VITE_APP_BASE_URL=https://sea-pilot-ten.vercel.app` is configured in Vercel for Production and Preview.
- `VITE_SUPABASE_URL` is configured in Vercel for Production.
- `VITE_SUPABASE_ANON_KEY` is configured in Vercel for Production.
- `VITE_SUPABASE_URL` is configured in Vercel for Preview.
- `VITE_SUPABASE_ANON_KEY` is configured in Vercel for Preview.
- Production opens the SeaPilot login page at `https://sea-pilot-ten.vercel.app/login`.
- The Supabase CLI is installed on this workstation through npm global and was updated to `2.109.0`.
- The Supabase CLI is not logged in to Supabase Cloud.
- Vercel does not expose the database password or service-role key through `vercel env pull`, so production migrations still need a Supabase CLI login, a `SUPABASE_ACCESS_TOKEN`, or the production Postgres connection string.

## Required Supabase Values

Create or open the production Supabase project, then copy these two public browser values from the Supabase project API settings when a new environment needs to be configured:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Do not use the local Docker Supabase URL (`http://127.0.0.1:54321`) for Vercel production.

## Configure Vercel Environment Variables

Use Vercel Dashboard or the CLI. With the CLI:

```powershell
$env:SEAPILOT_SUPABASE_URL = "https://your-project-ref.supabase.co"
$env:SEAPILOT_SUPABASE_ANON_KEY = "your-supabase-anon-key"

$env:SEAPILOT_SUPABASE_URL | npx vercel env add VITE_SUPABASE_URL production --scope bbtm-app
$env:SEAPILOT_SUPABASE_ANON_KEY | npx vercel env add VITE_SUPABASE_ANON_KEY production --scope bbtm-app

$env:SEAPILOT_SUPABASE_URL | npx vercel env add VITE_SUPABASE_URL preview --scope bbtm-app
$env:SEAPILOT_SUPABASE_ANON_KEY | npx vercel env add VITE_SUPABASE_ANON_KEY preview --scope bbtm-app

npx vercel deploy --prod --yes --scope bbtm-app
```

After each env var change, redeploy because Vite reads `VITE_*` variables at build time.

Production and Preview already have these three Vite variables configured. The commands above are kept for reconfiguration.

## Supabase Auth URL Settings

Configure Supabase Auth URL settings:

- Site URL: `https://sea-pilot-ten.vercel.app`
- Redirect URL: `https://sea-pilot-ten.vercel.app/*`
- Local redirect URL for development: `http://localhost:5173/*`

## Supabase Production Migrations

After creating the Supabase production project and authenticating the CLI:

```powershell
supabase login --token "<supabase-access-token>"
supabase link --project-ref <production-project-ref>
supabase db push
```

In a non-interactive terminal, `supabase login` requires `--token` or the `SUPABASE_ACCESS_TOKEN` environment variable:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<supabase-access-token>"
supabase projects list
supabase link --project-ref <production-project-ref>
supabase db push
```

Alternative, if the production Postgres connection string is available:

```powershell
supabase db push --db-url "<production-postgres-connection-string>"
```

Then create the first admin user in Supabase Auth and assign roles in `public.user_roles`.

## First Production Smoke Check

After the Supabase variables are configured and the deployment is rebuilt:

1. Open `https://sea-pilot-ten.vercel.app`.
2. Confirm unauthenticated users are redirected to `/login`.
3. Sign in with a Supabase test user that has at least one role in `public.user_roles`.
4. Confirm the private SeaPilot navigation appears.
5. Open a protected module route, for example `/modules/planning`, and confirm it renders after authentication.
6. Confirm `www.bbtm.fr` still serves the public website independently.
