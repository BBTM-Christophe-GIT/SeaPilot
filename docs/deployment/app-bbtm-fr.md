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

## First Production Smoke Check

After the deployment is live:

1. Open `https://app.bbtm.fr`.
2. Confirm unauthenticated users are redirected to `/login`.
3. Sign in with a Supabase test user that has at least one role in `public.user_roles`.
4. Confirm the private SeaPilot navigation appears.
5. Open a protected module route, for example `/modules/planning`, and confirm it renders after authentication.
6. Confirm `www.bbtm.fr` still serves the public website independently.
