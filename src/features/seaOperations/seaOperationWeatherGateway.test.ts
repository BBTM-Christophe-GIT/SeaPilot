// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway, { createSeaOperationWeatherGateway } from '../../../api/sea-operation-weather';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const point = { projectId: '12', pointId: 'p1', latitude: 49.7, longitude: -1.6, eta: '2026-10-22T12:25' };
const now = Date.parse('2026-10-20T06:00:00Z');
const hour = Date.parse('2026-10-22T10:00:00Z') / 1000;
function fixture(options: { configured?: boolean; user?: string | null; denied?: boolean } = {}) {
  const authorize = options.denied ? vi.fn().mockRejectedValue(new Error('refused')) : vi.fn().mockResolvedValue(undefined);
  const backend = vi.fn(() => ({ user: vi.fn().mockResolvedValue(options.user === undefined ? 'actual-user' : options.user), authorize }));
  const fetcher = vi.fn(async (url) => {
    const marine = String(url).includes('/marine?');
    const variables = marine ? ['swell_wave_height', 'swell_wave_period', 'swell_wave_direction'] : ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m'];
    return Response.json({ utc_offset_seconds: 0, hourly: { time: [hour], ...Object.fromEntries(variables.map((key) => [key, [2]])) },
      hourly_units: Object.fromEntries(variables.map((key, index) => [key, (marine ? ['m', 's', '°'] : ['kn', 'kn', '°'])[index]])) });
  }) as typeof fetch;
  const handler = createSeaOperationWeatherGateway({ getEnv: () => options.configured === false ? undefined : 'server-secret', backend, fetcher, now: () => now });
  return { handler, authorize, backend, fetcher };
}
const request = (body: unknown = point, headers: Record<string, string> = {}) => new Request('https://app.example/api/sea-operation-weather', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer actual-jwt', ...headers }, body: JSON.stringify(body),
});

describe('authenticated sea operation weather endpoint', () => {
  it('requires POST, bearer authentication, same origin and validated coordinates before querying a provider', async () => {
    const { handler, fetcher } = fixture();
    expect((await handler(new Request('https://app.example/api/sea-operation-weather'))).status).toBe(405);
    expect((await handler(request(point, { authorization: '' }))).status).toBe(401);
    expect((await handler(request(point, { origin: 'https://foreign.example' }))).status).toBe(403);
    expect((await handler(request({ ...point, longitude: 181 }))).status).toBe(400);
    expect((await handler(request({ ...point, eta: '2026-10-25T02:30' }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('authenticates the real actor and authorizes the selected project before fetching commercial data', async () => {
    const { handler, authorize, backend, fetcher } = fixture();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(backend).toHaveBeenCalledWith('actual-jwt');
    expect(authorize).toHaveBeenCalledWith('12');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.text();
    expect(body).toContain('Open-Meteo');
    expect(body).not.toContain('server-secret');
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toContain('customer-api.open-meteo.com');
  });

  it('returns a clear configuration failure and never silently falls back to the public commercial API', async () => {
    const { handler, fetcher } = fixture({ configured: false });
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'WEATHER_NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('denies expired identity and failed company/module/project authorization without contacting the provider', async () => {
    const missing = fixture({ user: null });
    expect((await missing.handler(request())).status).toBe(401);
    expect(missing.authorize).not.toHaveBeenCalled();
    const denied = fixture({ denied: true });
    expect((await denied.handler(request())).ok).toBe(false);
    expect(denied.fetcher).not.toHaveBeenCalled();
  });

  it('uses the actual selected-project RPC under the verified actor JWT and propagates its access refusal', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://backend.example');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-key');
    vi.stubEnv('OPEN_METEO_API_KEY', 'server-secret');
    const fetcher = vi.fn(async (url, init?: RequestInit) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'a6320000-0000-0000-0000-000000000001' });
      expect(String(url)).toBe('https://backend.example/rest/v1/rpc/sea_operation_project_documents');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer actual-jwt');
      expect(JSON.parse(init?.body as string)).toEqual({ p_project_id: '12' });
      return Response.json({ code: '42501', message: 'Company or module access refused' }, { status: 403 });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await gateway.fetch(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'WEATHER_ACCESS_DENIED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rechecks authorization on cache hits and attaches the current waypoint identity', async () => {
    const { handler, authorize, fetcher } = fixture();
    await handler(request());
    const response = await handler(request({ ...point, pointId: 'p2' }));
    expect((await response.json()).pointId).toBe('p2');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledTimes(2);
    authorize.mockRejectedValueOnce(new Error('revoked'));
    expect((await handler(request())).ok).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds repeated requests per real actor even when a forecast is cached', async () => {
    const { handler, fetcher } = fixture();
    for (let index = 0; index < 30; index += 1) expect((await handler(request())).status).toBe(200);
    const response = await handler(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'WEATHER_RATE_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
