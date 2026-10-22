// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSeaOperationChartsGateway } from '../../../api/sea-operation-charts';

const point = { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53 };
const result = { charts: [], sourceUrl: 'https://services.data.shom.fr/INSPIRE/wfs', fetchedAt: '2026-10-23T00:00:00Z', truncated: false };
function fixture(options: { demo?: boolean; user?: string | null; denied?: boolean } = {}) {
  const authorize = options.denied ? vi.fn().mockRejectedValue(new Error('denied')) : vi.fn().mockResolvedValue(undefined);
  const backend = vi.fn(() => ({ user: vi.fn().mockResolvedValue(options.user === undefined ? 'actor' : options.user), authorize }));
  const lookup = vi.fn().mockResolvedValue(result);
  const handler = createSeaOperationChartsGateway({ getEnv: (key) => options.demo && key === 'VERCEL_ENV' ? 'preview' : undefined, backend, lookup });
  return { handler, backend, authorize, lookup };
}
const request = (body: unknown = point, headers: Record<string, string> = {}, preview = false) => new Request(`https://app.example/api/sea-operation-charts${preview ? '?preview=1' : ''}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer actual-jwt', ...headers }, body: JSON.stringify(body),
});

describe('SHOM chart gateway', () => {
  it('authenticates and authorizes the selected project before lookup/cache access', async () => {
    const { handler, authorize, lookup } = fixture();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ ...point, ...result });
    expect(authorize).toHaveBeenCalledWith('12');
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(lookup.mock.invocationCallOrder[0]);
    await handler(request());
    expect(authorize).toHaveBeenCalledTimes(2);
  });
  it('rejects expired/revoked accounts, cross origin and forged requests without SHOM queries', async () => {
    const normal = fixture();
    expect((await normal.handler(new Request('https://app.example/api/sea-operation-charts'))).status).toBe(405);
    expect((await normal.handler(request(point, { Authorization: '' }))).status).toBe(401);
    expect((await normal.handler(request(point, { Origin: 'https://foreign.example' }))).status).toBe(403);
    expect((await normal.handler(request(point, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await normal.handler(request({ ...point, longitude: 181 }))).status).toBe(400);
    expect((await normal.handler(request({ ...point, latitude: null }))).status).toBe(400);
    expect((await normal.handler(request({ ...point, projectId: '9223372036854775808' }))).status).toBe(400);
    expect((await normal.handler(request({ ...point, pointId: 'a'.repeat(5000) }))).status).toBe(413);
    expect(normal.lookup).not.toHaveBeenCalled();
    const expired = fixture({ user: null });
    expect((await expired.handler(request())).status).toBe(401);
    expect(expired.authorize).not.toHaveBeenCalled();
    const denied = fixture({ denied: true });
    expect((await denied.handler(request())).ok).toBe(false);
    expect(denied.lookup).not.toHaveBeenCalled();
  });
  it('opens the anonymous demonstration only when both server environment and URL opt in', async () => {
    const production = fixture();
    expect((await production.handler(request(point, { Authorization: '' }, true))).status).toBe(401);
    const preview = fixture({ demo: true });
    expect((await preview.handler(request(point, { Authorization: '' }))).status).toBe(401);
    expect((await preview.handler(request(point, { Authorization: '' }, true))).status).toBe(200);
    expect(preview.backend).not.toHaveBeenCalled();
  });
  it('bounds per-actor request rate and provider concurrency', async () => {
    const { handler, lookup } = fixture();
    for (let i = 0; i < 30; i++) expect((await handler(request())).status).toBe(200);
    expect((await handler(request())).status).toBe(429);
    expect(lookup).toHaveBeenCalledTimes(30);
    const busy = fixture();
    let complete!: (value: typeof result) => void;
    busy.lookup.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const calls = Array.from({ length: 4 }, () => busy.handler(request()));
    await vi.waitFor(() => expect(busy.lookup).toHaveBeenCalledTimes(4));
    expect((await busy.handler(request())).status).toBe(503);
    complete(result);
    expect((await Promise.all(calls)).every((response) => response.ok)).toBe(true);
  });
  it('does not convert upstream failures to empty coverage or leak their details', async () => {
    const { handler, lookup } = fixture();
    lookup.mockRejectedValue(new Error('private upstream detail'));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'CHARTS_SERVICE_UNAVAILABLE' });
  });
});
