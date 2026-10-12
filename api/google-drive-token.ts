import { createHash, timingSafeEqual } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';

const SERVICE_ACCOUNT = 'seapilot-documents-reader@seapilot-documents.iam.gserviceaccount.com';
const PRODUCTION_SUBJECT = 'owner:bbtm-app:project:sea-pilot:environment:production';
const READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_PATTERN = /^[^\s]{1,16384}$/;
const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, private', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff',
};

interface Dependencies {
  getEnv: (name: string) => string | undefined;
  getOidcToken: typeof getVercelOidcToken;
  send?: typeof fetch;
  now?: () => number;
}

class BrokerError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

/** Server-to-server only. Google validates the Vercel signature and subject in STS. */
export function createGoogleDriveTokenBroker({ getEnv, getOidcToken, send = fetch, now = Date.now }: Dependencies) {
  let cached: { access_token: string; expires: number } | null = null;
  let refreshing: Promise<void> | null = null;
  const error = (status: number, code: string) => Response.json({ error: code }, { status, headers: RESPONSE_HEADERS });
  const refresh = async () => {
    const projectNumber = getEnv('GCP_PROJECT_NUMBER');
    const pool = getEnv('GCP_WORKLOAD_IDENTITY_POOL_ID');
    const provider = getEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID');
    if (!projectNumber || !/^\d{6,20}$/.test(projectNumber) || pool !== 'seapilot-production' || provider !== 'vercel'
      || getEnv('GCP_SERVICE_ACCOUNT_EMAIL') !== SERVICE_ACCOUNT) throw new BrokerError(503, 'GOOGLE_FEDERATION_NOT_CONFIGURED');
    const resource = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`;
    const audience = `https:${resource}`;
    let oidc: string;
    try { oidc = await getOidcToken({ audience }); }
    catch { throw new BrokerError(503, 'VERCEL_OIDC_UNAVAILABLE'); }
    // This check is defense in depth, never a replacement for Google's signature verification.
    let claims: Record<string, unknown>;
    try { claims = JSON.parse(Buffer.from(oidc.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new BrokerError(503, 'VERCEL_OIDC_INVALID'); }
    if (claims.sub !== PRODUCTION_SUBJECT || claims.iss !== 'https://oidc.vercel.com/bbtm-app' || claims.aud !== audience
      || typeof claims.exp !== 'number' || claims.exp <= now() / 1000) throw new BrokerError(503, 'VERCEL_OIDC_INVALID');
    const request = async (url: string, init: RequestInit) => {
      try { return await send(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
      catch { throw new BrokerError(502, 'GOOGLE_FEDERATION_UNAVAILABLE'); }
    };
    const exchange = await request('https://sts.googleapis.com/v1/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        grantType: 'urn:ietf:params:oauth:grant-type:token-exchange', audience: resource,
        scope: 'https://www.googleapis.com/auth/cloud-platform', requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
        subjectToken: oidc, subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      }),
    });
    const exchanged = await exchange.json().catch(() => null);
    if (!exchange.ok || typeof exchanged?.access_token !== 'string' || !TOKEN_PATTERN.test(exchanged.access_token)
      || exchanged.token_type !== 'Bearer') throw new BrokerError(503, 'GOOGLE_TOKEN_EXCHANGE_FAILED');
    const impersonation = await request(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT}:generateAccessToken`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${exchanged.access_token}` },
      body: JSON.stringify({ scope: [READONLY_SCOPE], lifetime: '600s' }),
    });
    const result = await impersonation.json().catch(() => null);
    const expires = typeof result?.expireTime === 'string' ? Date.parse(result.expireTime) : NaN;
    if (!impersonation.ok || typeof result?.accessToken !== 'string' || !TOKEN_PATTERN.test(result.accessToken)
      || !Number.isFinite(expires) || expires <= now() + 1_000) throw new BrokerError(503, 'GOOGLE_TOKEN_IMPERSONATION_FAILED');
    cached = { access_token: result.accessToken, expires: Math.min(expires, now() + 600_000) };
  };
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...RESPONSE_HEADERS, Allow: 'POST' } });
    // Node/Deno fetch may set Sec-Fetch-Mode without a browser origin.
    if (request.headers.has('origin') || request.headers.has('sec-fetch-site')) return error(403, 'SERVER_REQUEST_REQUIRED');
    if (getEnv('VERCEL_ENV') !== 'production') return error(503, 'PRODUCTION_ONLY');
    const expected = getEnv('GOOGLE_DRIVE_TOKEN_BROKER_SECRET');
    if (!expected || !/^[\x21-\x7e]{43,256}$/.test(expected)) return error(503, 'BROKER_NOT_CONFIGURED');
    const authorization = request.headers.get('authorization') || '';
    const provided = /^Bearer ([^\s]{1,256})$/.exec(authorization)?.[1] || '';
    // Both buffers always contain 32 bytes; secret length does not change comparison timing.
    if (!timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest())) return error(401, 'BROKER_UNAUTHORIZED');
    const url = new URL(request.url);
    if (url.pathname !== '/api/google-drive-token' || url.search) return error(400, 'EMPTY_REQUEST_REQUIRED');
    const length = request.headers.get('content-length');
    if (length !== null && (!/^0+$/.test(length))) return error(400, 'EMPTY_REQUEST_REQUIRED');
    // Vercel can provide a non-null stream for an empty POST. Inspect the stream
    // without collecting it: the first byte rejects the request immediately.
    if (request.body) {
      const reader = request.body.getReader();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Body timeout')), 2_000); });
      try {
        for (;;) {
          const part = await Promise.race([reader.read(), expired]);
          if (part.done) break;
          if (part.value.byteLength !== 0) return error(400, 'EMPTY_REQUEST_REQUIRED');
        }
      } catch { return error(400, 'EMPTY_REQUEST_REQUIRED'); }
      finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
    }
    try {
      if (!cached || cached.expires <= now() + 60_000) {
        if (!refreshing) refreshing = refresh().finally(() => { refreshing = null; });
        await refreshing;
      }
      if (!cached) throw new BrokerError(503, 'GOOGLE_TOKEN_UNAVAILABLE');
      return Response.json({ access_token: cached.access_token, expires_in: Math.max(1, Math.floor((cached.expires - now()) / 1000)) }, { headers: RESPONSE_HEADERS });
    } catch (cause) {
      return error(cause instanceof BrokerError ? cause.status : 503, cause instanceof BrokerError ? cause.code : 'GOOGLE_TOKEN_UNAVAILABLE');
    }
  };
}

const broker = createGoogleDriveTokenBroker({ getEnv: (name) => process.env[name], getOidcToken: getVercelOidcToken });
export default { fetch: broker };
