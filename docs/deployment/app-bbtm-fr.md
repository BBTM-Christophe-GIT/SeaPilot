# app.bbtm.fr Deployment Notes

## Domain Split

- `www.bbtm.fr` remains the public website.
- `app.bbtm.fr` hosts the private SeaPilot application.
- Do not change the existing `www.bbtm.fr` DNS record while deploying SeaPilot.

## DNS

Create a DNS record for `app.bbtm.fr` that points to the selected application host.

Use the record type required by the hosting provider:

- `CNAME` when the provider gives a target host name.
- `A` and, when available, `AAAA` when the provider gives static IP addresses.

Keep the public website and private app records separate so the public site can continue serving from `www.bbtm.fr`.

Current Vercel verification for `app.bbtm.fr` recommends this OVH DNS record:

```text
Type: A
Name: app
Value: 76.76.21.21
```

The current nameservers for `bbtm.fr` remain OVH (`dns18.ovh.net`, `ns18.ovh.net`), which is fine. Do not change nameservers unless intentionally moving all DNS management to Vercel.

## Vercel Project

Recommended hosting target for the Vite application:

- Repository: `BBTM-Christophe-GIT/SeaPilot`
- Vercel team: `BBTM` / `bbtm-app`
- Vercel project: `sea-pilot`
- Framework preset: `Vite`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Production domain: `app.bbtm.fr`

The repository includes `vercel.json` so direct links like `/login` and `/modules/planning` are rewritten to `index.html`.

As of the latest Vercel check on 2026-07-02:

- Project `bbtm-app/sea-pilot` exists and is linked locally.
- Preview deployment from `codex/seapilot-foundation` is building successfully and is ready.
- `app.bbtm.fr` has been added to the Vercel project.
- `VITE_APP_BASE_URL=https://app.bbtm.fr` is configured in Vercel for Production and Preview.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` still need production values.
- Vercel currently protects the `.vercel.app` deployments. Anonymous requests to Preview and Production aliases redirect to `https://vercel.com/login`, so these URLs are useful for project verification but not yet for normal SeaPilot users.
- The latest Preview URL is `https://sea-pilot-l9p8bw2hg-bbtm-app.vercel.app`.
- The stable branch Preview alias is `https://sea-pilot-git-codex-seapilot-foundation-bbtm-app.vercel.app`.
- The current Production alias is `https://sea-pilot-bbtm-app.vercel.app`, but it is also protected by Vercel.

To make the online app usable while keeping SeaPilot private through Supabase login:

1. Configure the production Supabase project and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel for Production and Preview.
2. Disable or relax Vercel Deployment Protection for the production domain/aliases that should be reachable by BBTM users.
3. Point `app.bbtm.fr` DNS to the Vercel target and verify the domain in Vercel.
4. Confirm the app opens to `/login`; Supabase Auth then enforces the private application access.

If deploying through the Vercel dashboard:

1. Import the GitHub repository `BBTM-Christophe-GIT/SeaPilot`.
2. Select the branch to deploy.
3. Add the production environment variables below.
4. Add the custom domain `app.bbtm.fr`.
5. Copy the DNS target shown by Vercel into the DNS zone for `bbtm.fr`.

If deploying through the CLI:

```powershell
npx vercel login
npx vercel link
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add VITE_APP_BASE_URL production
npx vercel --prod
```

## Supabase Auth

Configure Supabase Auth URL settings:

- Site URL: `https://app.bbtm.fr`
- Redirect URL: `https://app.bbtm.fr/*`
- Local redirect URL for development: `http://localhost:5173/*`

## Environment Variables

Production requires:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_APP_BASE_URL=https://app.bbtm.fr
```

Keep the Supabase anon key in the hosting provider's environment variable settings. Do not commit real production values.

## Supabase Production Migrations

After creating the Supabase production project:

```powershell
supabase login
supabase link --project-ref <production-project-ref>
supabase db push
```

Then create the first admin user in Supabase Auth and assign roles in `public.user_roles`.

## First Production Smoke Check

After the deployment is live:

1. Open `https://app.bbtm.fr`.
2. Confirm unauthenticated users are redirected to `/login`.
3. Sign in with a Supabase test user that has at least one role in `public.user_roles`.
4. Confirm the private SeaPilot navigation appears.
5. Open a protected module route, for example `/modules/planning`, and confirm it renders after authentication.
6. Confirm `www.bbtm.fr` still serves the public website independently.
