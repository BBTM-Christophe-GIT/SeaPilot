// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGoogleDriveTokenBroker } from '../../api/google-drive-token';

const secret = 's'.repeat(64);
const audience = 'https://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/seapilot-production/providers/vercel';
const now = Date.parse('2026-10-12T12:00:00Z');
const claims = { sub: 'owner:bbtm-app:project:sea-pilot:environment:production', iss: 'https://oidc.vercel.com/bbtm-app', aud: audience, exp: now / 1000 + 3600 };
const jwt = (extra: Record<string, unknown> = {}) => `header.${Buffer.from(JSON.stringify({ ...claims, ...extra })).toString('base64url')}.signature`;
function setup(overrides: Record<string, string | undefined> = {}) {
  let clock = now;
  const getEnv = (name: string) => ({ VERCEL_ENV: 'production', GOOGLE_DRIVE_TOKEN_BROKER_SECRET: secret, GCP_PROJECT_NUMBER: '123456789012',
    GCP_WORKLOAD_IDENTITY_POOL_ID: 'seapilot-production', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel',
    GCP_SERVICE_ACCOUNT_EMAIL: 'seapilot-documents-reader@seapilot-documents.iam.gserviceaccount.com', ...overrides } as Record<string, string | undefined>)[name];
  const getOidcToken = vi.fn().mockResolvedValue(jwt());
  const send = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'federated-token', token_type: 'Bearer', expires_in: 3600 }))
    .mockResolvedValueOnce(Response.json({ accessToken: 'google-reader-token', expireTime: new Date(now + 600_000).toISOString() }));
  const handler = createGoogleDriveTokenBroker({ getEnv, getOidcToken, send, now: () => clock });
  const request = (options: RequestInit = {}) => new Request('https://sea-pilot-ten.vercel.app/api/google-drive-token', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}` }, ...options,
  });
  return { handler, request, getOidcToken, send, advance: (milliseconds: number) => { clock += milliseconds; } };
}

describe('Vercel Google Drive token broker', () => {
  it('rejects anonymous, wrong, browser and non-POST requests before obtaining an OIDC token', async () => {
    const t = setup();
    const requests: Record<string,string>[] = [{}, { Authorization: 'Bearer wrong' }, { Authorization: `Bearer ${secret}`, Origin: 'https://sea-pilot-ten.vercel.app' },
      { Authorization: `Bearer ${secret}`, 'Sec-Fetch-Mode': 'cors' }];
    for (const headers of requests) {
      expect((await t.handler(t.request({ headers }))).status).toBe(headers.Origin || 'Sec-Fetch-Mode' in headers ? 403 : 401);
    }
    for (const method of ['GET', 'OPTIONS', 'PUT']) expect((await t.handler(t.request({ method }))).status).toBe(405);
    expect(t.getOidcToken).not.toHaveBeenCalled(); expect(t.send).not.toHaveBeenCalled();
  });
  it('requires production and exact safe federation configuration', async () => {
    for (const override of [{ VERCEL_ENV: 'preview' }, { GOOGLE_DRIVE_TOKEN_BROKER_SECRET: 'short' }, { GCP_PROJECT_NUMBER: '123/../../' },
      { GCP_WORKLOAD_IDENTITY_POOL_ID: 'other-pool' }, { GCP_SERVICE_ACCOUNT_EMAIL: 'editor@foreign.iam.gserviceaccount.com' }]) {
      const t = setup(override); expect((await t.handler(t.request())).status).toBe(503); expect(t.send).not.toHaveBeenCalled();
    }
  });
  it('never accepts a body, query or caller-selected identity', async () => {
    const t = setup(); expect((await t.handler(t.request({ body: JSON.stringify({ scope: ['https://www.googleapis.com/auth/drive'] }) }))).status).toBe(400);
    expect((await t.handler(new Request(`${t.request().url}?file=foreign`, t.request()))).status).toBe(400);
    expect(t.getOidcToken).not.toHaveBeenCalled();
  });
  it('uses fixed STS and IAM endpoints and emits only the readonly ten-minute token without caching or CORS headers', async () => {
    const t = setup(); const response = await t.handler(t.request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ access_token: 'google-reader-token', expires_in: 600 });
    expect(response.headers.get('Cache-Control')).toBe('no-store, private'); expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(t.getOidcToken).toHaveBeenCalledWith({ audience });
    expect(t.send.mock.calls[0][0]).toBe('https://sts.googleapis.com/v1/token');
    const sts = t.send.mock.calls[0][1]; expect(sts.headers.Authorization).toBeUndefined(); expect(sts.redirect).toBe('error');
    expect(JSON.parse(sts.body)).toMatchObject({ audience: audience.slice(6), subjectToken: jwt(), scope: 'https://www.googleapis.com/auth/cloud-platform' });
    expect(t.send.mock.calls[1][0]).toBe('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/seapilot-documents-reader@seapilot-documents.iam.gserviceaccount.com:generateAccessToken');
    const iam = t.send.mock.calls[1][1]; expect(iam.headers.Authorization).toBe('Bearer federated-token');
    expect(JSON.parse(iam.body)).toEqual({ scope: ['https://www.googleapis.com/auth/drive.readonly'], lifetime: '600s' });
    expect(JSON.stringify(await (await t.handler(t.request())).json())).not.toContain('federated-token'); expect(t.send).toHaveBeenCalledTimes(2);
  });
  it('does not allow a cached token to bypass server authentication and returns remaining TTL', async () => {
    const t = setup(); await t.handler(t.request()); t.advance(100_000);
    expect(await (await t.handler(t.request())).json()).toEqual({ access_token: 'google-reader-token', expires_in: 500 });
    expect((await t.handler(t.request({ headers: {} }))).status).toBe(401); expect(t.send).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent refreshes', async () => {
    const t = setup(); const responses = await Promise.all([t.handler(t.request()), t.handler(t.request()), t.handler(t.request())]);
    expect(responses.every(response => response.status === 200)).toBe(true); expect(t.getOidcToken).toHaveBeenCalledTimes(1); expect(t.send).toHaveBeenCalledTimes(2);
  });
  it.each([{ sub: 'owner:bbtm-app:project:sea-pilot:environment:preview' }, { iss: 'https://foreign.test' }, { aud: 'https://vercel.com/foreign' }, { exp: now / 1000 - 1 }])
    ('rejects unexpected runtime OIDC claims before Google exchange: %j', async (extra) => {
      const t = setup(); t.getOidcToken.mockResolvedValue(jwt(extra)); expect((await t.handler(t.request())).status).toBe(503); expect(t.send).not.toHaveBeenCalled();
    });
  it('never exposes upstream OIDC or Google error details', async () => {
    const t = setup(); t.send.mockReset().mockResolvedValue(Response.json({ error_description: `${secret} ${jwt()} upstream-private-details` }, { status: 403 }));
    const response = await t.handler(t.request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'GOOGLE_TOKEN_EXCHANGE_FAILED' });
    const o = setup(); o.getOidcToken.mockRejectedValue(new Error('private-runtime-token')); expect(await (await o.handler(o.request())).json()).toEqual({ error: 'VERCEL_OIDC_UNAVAILABLE' });
  });
  it('rejects malformed and expired impersonation replies', async () => {
    for (const value of [{ accessToken: 'wrong\nheader', expireTime: new Date(now + 600_000).toISOString() }, { accessToken: 'valid', expireTime: new Date(now - 1).toISOString() }, { accessToken: 'valid' }]) {
      const t = setup(); t.send.mockReset().mockResolvedValueOnce(Response.json({ access_token: 'federated-token', token_type: 'Bearer' })).mockResolvedValueOnce(Response.json(value));
      const response = await t.handler(t.request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'GOOGLE_TOKEN_IMPERSONATION_FAILED' });
    }
  });
});
