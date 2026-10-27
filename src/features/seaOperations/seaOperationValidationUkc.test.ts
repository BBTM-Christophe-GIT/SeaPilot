// @vitest-environment node
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, type SeaOperationPayload } from './seaOperationModel';
import { calculateSeaOperationCopernicusEstimate, type SeaOperationCopernicusInput } from './seaOperationCopernicusModel';
import { captureSeaOperationValidationUkc } from './seaOperationValidationUkc';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';

vi.mock('./seaOperationUkcQueries', () => ({ fetchSeaOperationWaypointUkc: vi.fn() }));
const fixture = JSON.parse(readFileSync(new URL('./testFixtures/copernicus-ukc.json', import.meta.url), 'utf8'));
const client = {} as SupabaseClient, now = Date.parse(fixture.fetchedAt);
const forecast = (input: SeaOperationCopernicusInput = fixture.input) => calculateSeaOperationCopernicusEstimate(input, fixture.provider, fixture.fetchedAt);
function payload(): SeaOperationPayload {
  const draft = emptySeaOperation();
  draft.planning = { date: '2026-10-27', operationId: '2:1', projectId: '2', captainPersonId: '3' };
  draft.vessel.id = '1'; draft.vessel.draftMeters = 2;
  draft.waypoints = [{ ...emptySeaOperationWaypoint('wp-1'), latitude: '49.65', longitude: '-1.62', eta: fixture.input.eta,
    ukcMode: 'automatic', ukc: 'Annotation manuelle conservée' }];
  return draft;
}
beforeEach(() => vi.resetAllMocks());

describe('UKC capture before save and captain signature', () => {
  it('captures an explicitly scoped Transit and preserves its manual UKC text', async () => {
    const draft = payload(); delete draft.planning; draft.transit = { date: '2026-10-27', captainPersonId: '3' };
    vi.mocked(fetchSeaOperationWaypointUkc).mockImplementation(async (_client, input) => forecast(input));
    const captured = await captureSeaOperationValidationUkc(client, draft, { now });
    expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledWith(client, expect.objectContaining({ projectId: '', vesselId: '1', transit: { date: '2026-10-27', vesselId: '1' } }), { signal: undefined });
    expect(captured.waypoints[0].ukcForecast).toMatchObject({ projectId: '', transit: { date: '2026-10-27', vesselId: '1' } });
    expect(captured.waypoints[0].ukc).toBe('Annotation manuelle conservée');
  });
  it('fills missing captures on save, preserves manual input, and refreshes a future capture before signature', async () => {
    vi.mocked(fetchSeaOperationWaypointUkc).mockImplementation(async (_client, input) => forecast(input));
    const draft = payload(), original = structuredClone(draft);
    const captured = await captureSeaOperationValidationUkc(client, draft, { now, missingOnly: true });
    expect(captured.waypoints[0].ukcForecast).toEqual(forecast());
    expect(captured.waypoints[0].ukc).toBe(draft.waypoints[0].ukc); expect(draft).toEqual(original);
    expect(await captureSeaOperationValidationUkc(client, captured, { now, missingOnly: true })).toBe(captured);
    expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(1);
    await captureSeaOperationValidationUkc(client, captured, { now, missingOnly: false });
    expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(2);
  });

  it('preserves recorded estimates after ETA and does not invent a historical forecast', async () => {
    const draft = payload(); draft.waypoints[0].ukcForecast = forecast();
    const afterEta = Date.parse(forecast().etaUtc) + 1;
    expect(await captureSeaOperationValidationUkc(client, draft, { now: afterEta })).toBe(draft);
    expect(await captureSeaOperationValidationUkc(client, payload(), { now: afterEta })).not.toHaveProperty('waypoints.0.ukcForecast');
    expect(fetchSeaOperationWaypointUkc).not.toHaveBeenCalled();
  });

  it.each(['preview', 'manual', 'project', 'draught', 'coordinates', 'eta'] as const)('skips %s contexts without sending provider requests', async reason => {
    const draft = payload();
    if (reason === 'manual') delete draft.waypoints[0].ukcMode;
    if (reason === 'project') delete draft.planning;
    if (reason === 'draught') draft.vessel.draftMeters = null;
    if (reason === 'coordinates') draft.waypoints[0].latitude = '';
    if (reason === 'eta') draft.waypoints[0].eta = '12:00';
    expect(await captureSeaOperationValidationUkc(client, draft, { now, preview: reason === 'preview' })).toBe(draft);
    expect(fetchSeaOperationWaypointUkc).not.toHaveBeenCalled();
  });

  it('reports a provider failure without making an incomplete draft unsaveable or discarding a recorded estimate', async () => {
    vi.mocked(fetchSeaOperationWaypointUkc).mockRejectedValue(new Error('Connexion Copernicus indisponible.'));
    const draft = payload(), onError = vi.fn(); draft.waypoints[0].ukcForecast = forecast();
    expect(await captureSeaOperationValidationUkc(client, draft, { now, onError })).toBe(draft);
    expect(onError).toHaveBeenCalledWith(draft.waypoints[0], 'Connexion Copernicus indisponible.');
  });

  it('rejects a response belonging to a different vessel', async () => {
    vi.mocked(fetchSeaOperationWaypointUkc).mockResolvedValue(forecast({ ...fixture.input, vesselId: '9' }));
    const draft = payload(); expect(await captureSeaOperationValidationUkc(client, draft, { now })).toBe(draft);
  });

  it('limits provider work to two concurrent waypoints', async () => {
    const resolvers: Array<() => void> = []; let running = 0, maximum = 0;
    vi.mocked(fetchSeaOperationWaypointUkc).mockImplementation((_client, input) => new Promise(resolve => {
      running++; maximum = Math.max(maximum, running);
      resolvers.push(() => { running--; resolve(forecast(input)); });
    }));
    const draft = payload(); draft.waypoints = Array.from({ length: 5 }, (_, index) => ({ ...draft.waypoints[0], id: `wp-${index + 1}` }));
    const pending = captureSeaOperationValidationUkc(client, draft, { now });
    expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(2);
    while (resolvers.length) { resolvers.shift()!(); await Promise.resolve(); await Promise.resolve(); }
    const result = await pending;
    expect(maximum).toBe(2); expect(fetchSeaOperationWaypointUkc).toHaveBeenCalledTimes(5);
    expect(result.waypoints.every(point => point.ukcForecast?.pointId === point.id)).toBe(true);
  });

  it('propagates abort so a cancelled save cannot continue into signing', async () => {
    const controller = new AbortController();
    vi.mocked(fetchSeaOperationWaypointUkc).mockImplementation(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
    await expect(captureSeaOperationValidationUkc(client, payload(), { now, signal: controller.signal })).rejects.toThrow();
  });
});
