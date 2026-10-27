// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSeaOperationPointCharts } from './seaOperationChartQueries';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const input = { projectId: '12', pointId: 'p1', latitude: 48.36, longitude: -4.53 };
const result = { ...input, fetchedAt: '2026-10-23T00:00:00Z', sourceUrl: 'https://services.data.shom.fr/INSPIRE/wfs', truncated: false,
  charts: [{ id: 'shom-paper:7399', number: '7399', title: 'Port de Brest', scale: 7500, catalogueUrl: 'https://diffusion.shom.fr/catalogsearch/result/?q=7399' }] };
function fixture() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'actor' } } }, error: null });
  return { getSession, client: { auth: { getSession } } as unknown as SupabaseClient };
}
describe('SHOM chart browser queries', () => {
  it('sends Transit context and rejects a response for another operation date', async () => {
    const { client } = fixture();
    const transit = { date: '2026-10-27', vesselId: '1' }, query = { ...input, projectId: '', transit };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...result, ...query }));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchSeaOperationPointCharts(client, query)).toEqual({ ...result, ...query });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(query);
    fetcher.mockResolvedValue(Response.json({ ...result, ...query, transit: { ...transit, date: '2026-10-28' } }));
    await expect(fetchSeaOperationPointCharts(client, query)).rejects.toThrow('correspond pas');
  });
  it('uses the current JWT, cancels requests and checks the resulting account and point', async () => {
    const { client, getSession } = fixture();
    const fetcher = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await fetchSeaOperationPointCharts(client, input, { signal: controller.signal })).toEqual(result);
    expect(fetcher).toHaveBeenCalledWith('/api/sea-operation-charts', expect.objectContaining({ signal: controller.signal, body: JSON.stringify(input), headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } }));
    expect(getSession).toHaveBeenCalledTimes(2);
  });
  it('rejects a changed account, a mismatched result or untrusted catalogue URL', async () => {
    const { client, getSession } = fixture();
    const fetcher = vi.fn().mockImplementation(async () => Response.json(result));
    vi.stubGlobal('fetch', fetcher);
    getSession.mockResolvedValueOnce({ data: { session: { access_token: 'token', user: { id: 'old' } } } });
    await expect(fetchSeaOperationPointCharts(client, input)).rejects.toThrow('Reconnectez');
    fetcher.mockResolvedValueOnce(Response.json({ ...result, projectId: '13' }));
    await expect(fetchSeaOperationPointCharts(client, input)).rejects.toThrow('correspond pas');
    fetcher.mockResolvedValueOnce(Response.json({ ...result, charts: [{ ...result.charts[0], catalogueUrl: 'https://untrusted.example/' }] }));
    await expect(fetchSeaOperationPointCharts(client, input)).rejects.toThrow('correspond pas');
  });
  it('only enables anonymous demo on a recognized preview and hides platform errors', async () => {
    const { client, getSession } = fixture();
    vi.stubGlobal('window', { location: { hostname: 'sea-pilot.example', search: '?preview=1' } });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSeaOperationPointCharts(client, input, { preview: true })).rejects.toThrow('préversion');
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubGlobal('window', { location: { hostname: 'sea-pilot-git-codex-sea-operations-bbtm-app.vercel.app', search: '?preview=1' } });
    fetcher.mockResolvedValueOnce(Response.json(result));
    expect(await fetchSeaOperationPointCharts(client, input, { preview: true })).toEqual(result);
    expect(getSession).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response('FUNCTION_INVOCATION_FAILED', { status: 500 }));
    await expect(fetchSeaOperationPointCharts(client, input, { preview: true })).rejects.toThrow('temporairement indisponible');
  });
  it('rejects anonymous real accounts and gives a useful retry error', async () => {
    const { client, getSession } = fixture();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'CHARTS_RATE_LIMIT' }, { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(fetchSeaOperationPointCharts(client, input)).rejects.toThrow('Reconnectez');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(fetchSeaOperationPointCharts(client, input)).rejects.toThrow('une minute');
  });
});
