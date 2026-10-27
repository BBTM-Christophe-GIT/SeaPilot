// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSeaOperationWaypointWeather } from './seaOperationWeatherQueries';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const point = { projectId: '12', pointId: 'p1', latitude: 49.7, longitude: -1.6, eta: '2026-10-22T12:25' };
const result = { ...point, etaUtc: '2026-10-22T10:25:00.000Z', fetchedAt: '2026-10-20T06:00:00Z', wind: null, waves: null,
  windMessage: 'Hors horizon', wavesMessage: 'Hors horizon', attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api' };
function fixture() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'actual-token', user: { id: 'actual-user' } } }, error: null });
  return { getSession, client: { auth: { getSession } } as unknown as SupabaseClient };
}

describe('sea operation weather queries', () => {
  it('authenticates a Transit using explicit vessel/day metadata without substituting a project ID', async () => {
    const { client } = fixture();
    const input = { ...point, projectId: '', transit: { date: '2026-10-22', vesselId: '2' } };
    const fetcher = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal('fetch', fetcher);
    expect(await fetchSeaOperationWaypointWeather(client, input)).toEqual(result);
    expect(fetcher).toHaveBeenCalledWith('/api/sea-operation-weather', expect.objectContaining({
      headers: { Authorization: 'Bearer actual-token', 'Content-Type': 'application/json' } }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it('uses the server public-data demo only on a real preview and accepts a traced Météo-France model', async () => {
    const { client, getSession } = fixture();
    vi.stubGlobal('window', { location: { hostname: 'sea-pilot-git-codex-sea-operations-bbtm-app.vercel.app', search: '?preview=1' } });
    const forecast = { ...result, attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg', model: { name: 'MFWAM', referenceTime: '2026-10-22T00:00:00Z', latitude: 49.7, longitude: -1.6 } };
    const fetcher = vi.fn().mockResolvedValue(Response.json(forecast));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchSeaOperationWaypointWeather(client, point, { preview: true })).toEqual(forecast);
    expect(getSession).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith('/api/sea-operation-weather?preview=1', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }));
  });

  it('reports a provider function startup failure in plain language when the platform returns text', async () => {
    const { client } = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('FUNCTION_INVOCATION_FAILED', { status: 500 })));
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('temporairement indisponible');
  });

  it('sends only point metadata using the current token and forwards cancellation', async () => {
    const { client } = fixture();
    const fetcher = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await fetchSeaOperationWaypointWeather(client, point, { signal: controller.signal })).toEqual(result);
    expect(fetcher).toHaveBeenCalledWith('/api/sea-operation-weather', expect.objectContaining({
      method: 'POST', signal: controller.signal, body: JSON.stringify(point), headers: { Authorization: 'Bearer actual-token', 'Content-Type': 'application/json' },
    }));
  });

  it('reports missing commercial configuration without using a free provider endpoint', async () => {
    const { client } = fixture();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'WEATHER_NOT_CONFIGURED' }, { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('Le service météo n’est pas encore activé. Contactez l’Armement.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects stale results after an account change', async () => {
    const { client, getSession } = fixture();
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'actual-token', user: { id: 'actual-user' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'new-token', user: { id: 'different-user' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('Reconnectez');
  });

  it('does not accept a result for another point, position or ETA', async () => {
    const { client } = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result, etaUtc: '2026-10-22T12:25:00.000Z' })));
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('correspond pas');
  });

  it('rejects malformed weather values and untrusted attribution links before rendering', async () => {
    const { client } = fixture();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...result, wind: { time: result.etaUtc, speedKnots: '12', gustKnots: 18, directionDegrees: 270 } }))
      .mockResolvedValueOnce(Response.json({ ...result, sourceUrl: 'javascript:alert(1)' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('correspond pas');
    await expect(fetchSeaOperationWaypointWeather(client, point)).rejects.toThrow('correspond pas');
  });

  it('rejects public API evaluation mode outside the real preview environment', async () => {
    const { client } = fixture();
    vi.stubGlobal('window', { location: { hostname: 'sea-pilot-ten.vercel.app', search: '?preview=1' } });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationWaypointWeather(client, point, { preview: true })).rejects.toThrow('préversion');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
