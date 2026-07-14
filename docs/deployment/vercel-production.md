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

Apply `supabase/migrations/202607130004_planning_p01_foundations.sql` before deploying version `1.6.1`.
The migration repairs the existing inconsistent Planning day with a transactional audit entry, validates the
day/date invariant, adds the missing foreign-key indexes, and optimizes Planning RLS evaluation without changing
its role scopes. It is data-preserving and idempotent; its rollback procedure is documented in the migration and
in `docs/PLANNING_ARCHITECTURE.md`.

Apply `supabase/migrations/202607130005_planning_p02_event_views.sql` before deploying version `1.7.0`.
The Planning P0.2 client selects typed fleet events and assignment confirmation states during its initial load. The
migration extends the existing project and assignment tables without creating a competing event table, preserves
historical rows with safe defaults, adds filter indexes, and recreates the authenticated assignment overview RPC.

Apply `supabase/migrations/202607130006_planning_p03_assignments_handovers.sql` before deploying version `1.8.0`.
The P0.3 client requires UTC assignment timestamps, handover/position tables, derogations, the transactional
handover RPC and the extended assignment overview. The migration backfills existing dates without deleting rows,
adds indexed foreign keys and RLS, and documents the rollback sequence. It was applied and linted before the client
deployment.

Apply `supabase/migrations/202607130007_planning_p04_governance_v1.sql` before deploying version `1.9.0`.
The P0.4 client loads workflow authors, immutable version metadata and semantic history. The migration backfills all
existing data into BBTM before enforcing company scope, adds action/vessel permissions, fixes the P0.3 publication
audit constraint, and recreates publication/handover RPCs with company-aware authorization. The full procedure and
rollback strategy are in `docs/deployment/planning-p0-v1.md`.
Apply `supabase/migrations/202607130008_planning_p04_audit_backfill_cleanup.sql` immediately afterwards. It removes
only anonymous audit entries whose snapshots differ solely by the technical `company_id` backfill.

Apply `supabase/migrations/202607130009_planning_p11_rotations_templates_manning.sql`, then
`202607130010_planning_p11_rotation_lint_cleanup.sql`, before deploying version `2.0.0`. The P1.1 panel reads five
new company-scoped tables and calls transactional RPCs for rotations, templates
and manning matrices. The migration preserves P0 rows, generates operational rotation periods in the existing
`planning_assignments` table, is safe to replay, and documents its export-first rollback. The detailed sequence is
in `docs/deployment/planning-p1-1.md`.

Apply `supabase/migrations/202607140001_planning_p12_absences_conflict_center.sql` before deploying version `2.1.0`.
P1.2 adds company-scoped absence requests, persistent conflict treatment and its audit trail without changing P0
assignments or P1.1 matrices. All writes use authorized RPCs; authenticated clients retain select-only table access.
The replacement search remains advisory and prepares the existing provisional assignment form only after a manual
choice. The detailed migration, RLS checks, smoke recipe and export-first rollback are in
`docs/deployment/planning-p1-2.md`.

Apply `supabase/migrations/202607140002_planning_p13_work_rest_notifications_exports.sql` before deploying
version `2.2.0`. P1.3 adds nullable detailed rest metrics, administrator-owned work/rest policies, recipient-specific
notifications and audited operational dependencies. It does not seed regulatory thresholds or rewrite existing
Planning rows. The client also adds the dashboard and lazy Excel/PDF/ICS exports. The complete V2 sequence,
permission checks, smoke tests and export-first rollback are in `docs/deployment/planning-p1-3-v2.md`.

Apply `supabase/migrations/202607140003_planning_p21_maritime_assistant.sql` before deploying version `2.3.0`.
P2.1 adds the administrator/office pilot allowlist and an immutable human decision journal. The assistant is
advisory only and the client bundle keeps it disabled unless `VITE_PLANNING_ASSISTANT_ENABLED=true`. Enable the
flag only after the migration and pilot assignments are verified. The complete rollout and rollback sequence is in
`docs/deployment/planning-p2-1.md`.

Version `3.0.0` adds the P2.2 descriptive projections and local what-if scenarios without a database migration.
Deploy it only after the same 36 migrations are aligned. Keep `VITE_PLANNING_PREDICTIONS_ENABLED=false` until the
P2.1 pilot access, data-quality gates and V3 browser recipe are approved. P2.2 performs no Supabase mutation and
does not enable statistical forecasts or external integrations when their data prerequisites are missing. The full
rollout and rollback sequence is in `docs/deployment/planning-p2-2-v3.md`.

Version `3.0.1` corrects rotation-save feedback without a database migration. A successful transactional save is
now distinguished from a later display refresh failure, preventing duplicate retries. Rotation overlaps, invalid
inputs and essential assignment controls also receive actionable messages. Deploy it over `3.0.0` with the same
36 aligned migrations and environment variables.

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
- `VITE_PLANNING_ASSISTANT_ENABLED` defaults to `false`; set it to `true` only for an approved pilot environment.
- `VITE_PLANNING_PREDICTIONS_ENABLED` defaults to `false`; set it to `true` only after the V3 data-quality and access review.
- Production opens the SeaPilot login page at `https://sea-pilot-ten.vercel.app/login`.
- The Supabase CLI is installed on this workstation through npm global and was updated to `2.109.0`.
- The Supabase CLI is logged in to Supabase Cloud.
- The local project is linked to Supabase project `szlvyrrmvdvhzixilymh` (`SeaPilot`, `eu-west-3`).
- The Planning V3 target still contains 36 local and remote migrations through `202607140003_planning_p21_maritime_assistant.sql`; P2.2 creates no migration. Verify `supabase migration list` before each deployment.
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
