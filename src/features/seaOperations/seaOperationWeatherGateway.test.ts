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
  const handler = createSeaOperationWeatherGateway({ getEnv: (name) => name === 'SEA_OPERATION_WEATHER_PROVIDER' ? 'open-meteo' : name === 'OPEN_METEO_API_KEY' && options.configured !== false ? 'server-secret' : undefined, backend, fetcher, now: () => now });
  return { handler, authorize, backend, fetcher };
}
const request = (body: unknown = point, headers: Record<string, string> = {}) => new Request('https://app.example/api/sea-operation-weather', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer actual-jwt', ...headers }, body: JSON.stringify(body),
});

describe('authenticated sea operation weather endpoint', () => {
  it('authorizes the explicit Transit vessel/day before fetching or returning a cached forecast', async () => {
    const { handler, authorize, fetcher } = fixture();
    const transit = { date: '2026-10-22', vesselId: '2' }, input = { ...point, projectId: '', transit };
    expect((await handler(request(input))).status).toBe(200);
    expect(authorize).toHaveBeenCalledExactlyOnceWith('', transit);
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetcher).mock.invocationCallOrder[0]);
    const next = { ...transit, date: '2026-10-23' };
    expect((await handler(request({ ...input, transit: next, pointId: 'next' }))).status).toBe(200);
    expect(authorize).toHaveBeenLastCalledWith('', next); expect(fetcher).toHaveBeenCalledTimes(2);
    authorize.mockRejectedValueOnce(new Error('Assignment or module revoked'));
    expect((await handler(request(input))).ok).toBe(false); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects incomplete or mixed Transit/project contexts before authentication and provider work', async () => {
    const { handler, backend, fetcher } = fixture();
    for (const patch of [{ projectId: '' }, { transit: { date: '2026-10-22', vesselId: '2' } },
      { projectId: '', transit: { date: '2026-02-30', vesselId: '2' } }, { projectId: '', transit: { date: '2026-10-22', vesselId: '0' } }]) {
      expect((await handler(request({ ...point, ...patch }))).status).toBe(400);
    }
    expect(backend).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['denied', 'date', 'vessel', 'array'] as const)('fails closed when the actual Transit vessel RPC returns %s', async reason => {
    vi.stubEnv('SUPABASE_URL', 'https://backend.example'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const transit = { date: '2026-10-22', vesselId: '2' };
    const fetcher = vi.fn(async (url, init?: RequestInit) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'a6320000-0000-0000-0000-000000000001' });
      expect(String(url)).toBe('https://backend.example/rest/v1/rpc/sea_operation_vessel_context');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer actual-jwt');
      expect(new Headers(init?.headers).get('apikey')).toBe('public-key');
      expect(JSON.parse(init?.body as string)).toEqual({ p_date: transit.date, p_vessel_id: transit.vesselId });
      if (reason === 'denied') return Response.json({ code: '42501', message: 'Foreign company or module denied' }, { status: 403 });
      return Response.json(reason === 'array' ? [] : { date: reason === 'date' ? '2026-10-23' : transit.date, vesselId: reason === 'vessel' ? '3' : transit.vesselId });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await gateway.fetch(request({ ...point, projectId: '', transit }));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: 'WEATHER_ACCESS_DENIED' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('accepts the matching Transit RPC without a Projects lookup and keeps the verified caller token', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://backend.example'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'public-key');
    const transit = { date: '2026-10-22', vesselId: '2' };
    const fetcher = vi.fn(async (url, init?: RequestInit) => {
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'a6320000-0000-0000-0000-000000000001' });
      expect(String(url)).toBe('https://backend.example/rest/v1/rpc/sea_operation_vessel_context');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer actual-jwt');
      return Response.json({ ...transit, captains: [], canSign: false });
    });
    vi.stubGlobal('fetch', fetcher);
    // A historical ETA needs no provider request, but still requires the full current authorization.
    const response = await gateway.fetch(request({ ...point, eta: '2000-01-01T12:25', projectId: '', transit }));
    expect(response.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses public Météo-France data by default without an API subscription after authorizing the actor', async () => {
    const authorize = vi.fn().mockResolvedValue(undefined);
    const meteoFrance = vi.fn().mockResolvedValue({ pointId: point.pointId, etaUtc: '2026-10-22T10:25:00Z', wind: null, waves: null, attribution: 'Météo-France' });
    const handler = createSeaOperationWeatherGateway({ getEnv: () => undefined, backend: () => ({ user: async () => 'actual-user', authorize }), meteoFrance, now: () => now });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(authorize).toHaveBeenCalledWith(point.projectId);
    expect(meteoFrance).toHaveBeenCalledWith(point, expect.objectContaining({ now }));
    expect((await response.json()).attribution).toBe('Météo-France');
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(meteoFrance.mock.invocationCallOrder[0]);
  });

  it('reserves anonymous public-weather demonstration to server-confirmed Vercel previews', async () => {
    const backend = vi.fn();
    const meteoFrance = vi.fn().mockResolvedValue({ pointId: point.pointId, wind: null, waves: null });
    const previewRequest = () => new Request('https://app.example/api/sea-operation-weather?preview=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(point) });
    const production = createSeaOperationWeatherGateway({ getEnv: () => undefined, backend, meteoFrance });
    expect((await production(previewRequest())).status).toBe(401);
    const preview = createSeaOperationWeatherGateway({ getEnv: (name) => name === 'VERCEL_ENV' ? 'preview' : undefined, backend, meteoFrance });
    expect((await preview(previewRequest())).status).toBe(200);
    expect(backend).not.toHaveBeenCalled();
    expect(meteoFrance).toHaveBeenCalledTimes(1);
    expect((await preview(new Request('https://app.example/api/sea-operation-weather', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(point) }))).status).toBe(401);
  });

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
