// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';
import { calculateSeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';

const point = { projectId: '12', pointId: 'wp-1', vesselId: '2', latitude: 49.65, longitude: -1.62, eta: '2026-10-27T12:05', draftMeters: 3 };
const result = calculateSeaOperationCopernicusEstimate(point, { status: 'unavailable', message: 'Hors horizon', source: null, cell: null, waterLevel: null }, '2026-10-26T08:00:00Z');
function fixture() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'user-token', user: { id: 'actual-captain' } } }, error: null });
  return { getSession, client: { auth: { getSession } } as unknown as SupabaseClient };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('authenticated Copernicus UKC client', () => {
  it('sends an explicit Transit vessel/day and rejects a capture made for another operation day', async () => {
    const { client } = fixture(), transit = { date: '2026-10-27', vesselId: point.vesselId };
    const input = { ...point, projectId: '', transit };
    const capture = calculateSeaOperationCopernicusEstimate(input, { status: 'unavailable', message: 'Hors horizon', source: null, cell: null, waterLevel: null }, '2026-10-26T08:00:00Z');
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(capture))
      .mockResolvedValueOnce(Response.json({ ...capture, transit: { ...transit, date: '2026-10-28' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchSeaOperationWaypointUkc(client, input)).toEqual(capture);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
    await expect(fetchSeaOperationWaypointUkc(client, input)).rejects.toThrow('ne correspond pas');
  });
  it('sends only waypoint and vessel metadata with the existing session, forwarding cancellation', async () => {
    const { client } = fixture(), controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(Response.json(result)); vi.stubGlobal('fetch', fetcher);
    expect(await fetchSeaOperationWaypointUkc(client, point, { signal: controller.signal })).toEqual(result);
    expect(fetcher).toHaveBeenCalledWith('/api/sea-operation-ukc', expect.objectContaining({ method: 'POST', credentials: 'same-origin', cache: 'no-store',
      signal: controller.signal, headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' } }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(point);
  });
  it('does not call an anonymous demonstration or provider endpoint without a real session', async () => {
    const { client, getSession } = fixture(); getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('Reconnectez-vous');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects delayed responses after an account switch', async () => {
    const { client, getSession } = fixture();
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'user-token', user: { id: 'actual-captain' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'new-token', user: { id: 'other-user' } } }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result)));
    await expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('Reconnectez-vous');
  });
  it.each([{ projectId: '13' }, { vesselId: '4' }, { draftMeters: 4 }, { pointId: 'wp-2' }, { latitude: 48 }, { etaUtc: '2026-10-27T12:05:00Z' }])('rejects another request identity %o', patch => {
    const { client } = fixture(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...result, ...patch })));
    return expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('ne correspond pas');
  });
  it('reports configuration and changed canonical draught errors without exposing server details', async () => {
    const { client } = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'UKC_NOT_CONFIGURED', detail: 'secret' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: 'UKC_DRAFT_CHANGED' }, { status: 409 }))
      .mockResolvedValueOnce(new Response('FUNCTION_INVOCATION_FAILED', { status: 500 })));
    await expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('connexion Copernicus');
    await expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('tirant d’eau du navire a changé');
    await expect(fetchSeaOperationWaypointUkc(client, point)).rejects.toThrow('temporairement indisponible');
  });
  it('does not authenticate or fetch invalid input and honours an already cancelled request', async () => {
    const { client, getSession } = fixture(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationWaypointUkc(client, { ...point, eta: '12:05' })).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(fetchSeaOperationWaypointUkc(client, point, { signal: controller.signal })).rejects.toThrow();
    expect(getSession).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
});
