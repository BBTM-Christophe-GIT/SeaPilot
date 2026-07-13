# SeaPilot Vercel Production Notes

## Application shell and navigation permissions

SeaPilot displays its semantic application version in the sidebar. The source version is kept in
`src/config/appVersion.ts` and follows the dashboard convention: major for incompatible or structural changes,
minor for compatible features, and patch for fixes, performance, stability, or security work.

Apply `supabase/migrations/202607100001_role_module_permissions.sql` before deploying this shell version. The
`role_module_permissions` table is the source of truth for menu visibility and direct-route access. Authenticated
users can read the matrix; only administrators can change it from the Administration module.

Apply `supabase/migrations/202607100002_navigation_structure.sql` for version `1.1.0`. It adds the role defaults
required by the approved navigation structure: QHSE, Operations, Purchasing, Planning, Human Resources,
Maintenance, and Lifting. The hierarchy and labels live in `src/features/permissions/moduleAccess.ts`; the
administrator matrix continues to decide which of those items each role can see.

Apply `supabase/migrations/202607130003_planning_publication_workflow.sql` before deploying version `1.6.0`.
The Planning client requires `planning_publications` during its initial parallel load. The migration adds the
publication/version tables, the authenticated transition RPC, server-side period locks and transactional audit
triggers. Deploying the client first would make the Planning route fail to load until the migration is applied.

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

As of 2026-07-13:

- `VITE_APP_BASE_URL=https://sea-pilot-ten.vercel.app` is configured in Vercel for Production and Preview.
- `VITE_SUPABASE_URL` is configured in Vercel for Production.
- `VITE_SUPABASE_ANON_KEY` is configured in Vercel for Production.
- `VITE_SUPABASE_URL` is configured in Vercel for Preview.
- `VITE_SUPABASE_ANON_KEY` is configured in Vercel for Preview.
- Production opens the SeaPilot login page at `https://sea-pilot-ten.vercel.app/login`.
- The Supabase CLI is installed on this workstation through npm global and was updated to `2.109.0`.
- The Supabase CLI is logged in to Supabase Cloud.
- The local project is linked to Supabase project `szlvyrrmvdvhzixilymh` (`SeaPilot`, `eu-west-3`).
- The 26 local migrations, through `202607130003_planning_publication_workflow.sql`, have been pushed to Supabase Cloud.
- `supabase db push --dry-run` reports the remote database is up to date.
- `supabase db lint --linked` reports no schema errors.
- Supabase Auth `site_url` is set to `https://sea-pilot-ten.vercel.app`.
- Supabase Auth redirect allow-list includes the production URL, current Vercel aliases, branch preview alias, and local dev URLs.
- Supabase public signup is disabled; users must be created or invited administratively.
- The first production admin user `christophe@bbtm.fr` exists in Supabase Auth, has a matching `public.profiles` row, and has the `admin` role in `public.user_roles`.
- Production login was validated with this admin user, including access to the private navigation and `/modules/planning`.

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

Supabase Auth URL settings are currently configured as:

- Site URL: `https://sea-pilot-ten.vercel.app`
- Redirect URLs:
  - `https://sea-pilot-ten.vercel.app`
  - `https://sea-pilot-ten.vercel.app/**`
  - `https://sea-pilot-bbtm-app.vercel.app`
  - `https://sea-pilot-bbtm-app.vercel.app/**`
  - `https://sea-pilot-christophe-5647-bbtm-app.vercel.app`
  - `https://sea-pilot-christophe-5647-bbtm-app.vercel.app/**`
  - `https://sea-pilot-git-codex-seapilot-foundation-bbtm-app.vercel.app`
  - `https://sea-pilot-git-codex-seapilot-foundation-bbtm-app.vercel.app/**`
  - `http://localhost:5173`
  - `http://localhost:5173/**`
  - `http://127.0.0.1:5173`
  - `http://127.0.0.1:5173/**`
- Public signup: disabled.

## Supabase Production Migrations

The current production project is already linked and migrated. For a fresh workstation or a future project, authenticate the CLI and link the project:

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

The current first admin user has already been created for `christophe@bbtm.fr`. Do not store passwords in this repository or in deployment notes.

## First Production Smoke Check

After creating the first admin user:

1. Open `https://sea-pilot-ten.vercel.app`.
2. Confirm unauthenticated users are redirected to `/login`.
3. Sign in with a Supabase test user that has at least one role in `public.user_roles`.
4. Confirm the private SeaPilot navigation appears.
5. Open a protected module route, for example `/modules/planning`, and confirm it renders after authentication.
6. Confirm `www.bbtm.fr` still serves the public website independently.
