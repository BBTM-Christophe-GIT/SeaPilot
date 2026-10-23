// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, type SeaOperationPayload } from './seaOperationModel';
import { captureSeaOperationValidationWeather } from './seaOperationValidationWeather';
import { seaOperationEtaUtc, type SeaOperationWeatherInput, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { fetchSeaOperationWaypointWeather } from './seaOperationWeatherQueries';

vi.mock('./seaOperationWeatherQueries', () => ({ fetchSeaOperationWaypointWeather: vi.fn() }));
const client = {} as SupabaseClient;
const now = Date.parse('2026-10-23T08:00:00Z');
const payload = (): SeaOperationPayload => ({ ...emptySeaOperation(), planning: { date: '2026-10-23', operationId: '10:20', projectId: '1', captainPersonId: '3' },
  risks: 'Manœuvre à confirmer', waypoints: [{ ...emptySeaOperationWaypoint('p1'), latitude: '49.65', longitude: '-1.62', eta: '2026-10-23T12:00', ukc: '2.3' }] });
const forecast = (input: SeaOperationWeatherInput): SeaOperationWaypointWeather => ({ pointId: input.pointId, latitude: input.latitude, longitude: input.longitude,
  etaUtc: seaOperationEtaUtc(input.eta), fetchedAt: '2026-10-23T08:00:00Z',
  wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: null, directionDegrees: 270 },
  waves: { time: '2026-10-23T10:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
  windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg' });
const input = { projectId: '1', pointId: 'p1', latitude: 49.65, longitude: -1.62, eta: '2026-10-23T12:00' };
beforeEach(() => vi.resetAllMocks());

describe('forecast capture before captain validation', () => {
  it('waits for the forecast and captures only the matching waypoint without changing preparation fields', async () => {
    let resolve!: (weather: SeaOperationWaypointWeather) => void;
    vi.mocked(fetchSeaOperationWaypointWeather).mockReturnValue(new Promise((done) => { resolve = done; }));
    const draft = payload();
    const original = structuredClone(draft);
    let complete = false;
    const pending = captureSeaOperationValidationWeather(client, draft, { now, preview: true }).then((captured) => { complete = true; return captured; });
    await Promise.resolve();
    expect(complete).toBe(false);
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalledWith(client, input, { preview: true, signal: undefined });
    resolve(forecast(input));
    const captured = await pending;
    expect(captured.waypoints[0].weather).toEqual(forecast(input));
    expect(captured.risks).toBe(original.risks);
    expect(captured.waypoints[0].ukc).toBe('2.3');
    expect(draft).toEqual(original);
  });

  it('preserves a recorded forecast after ETA without requesting or inventing a historical forecast', async () => {
    const draft = payload();
    draft.waypoints[0].weather = forecast(input);
    expect(await captureSeaOperationValidationWeather(client, draft, { now: Date.parse('2026-10-23T10:01:00Z') })).toBe(draft);
    const missing = payload();
    expect(await captureSeaOperationValidationWeather(client, missing, { now: Date.parse('2026-10-23T10:01:00Z') })).toBe(missing);
    expect(missing.waypoints[0]).not.toHaveProperty('weather');
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
  });

  it('leaves invalid or unlinked points to form validation without sending requests', async () => {
    const draft = payload();
    draft.waypoints.push({ ...draft.waypoints[0], id: 'p2', eta: '12:00' });
    draft.waypoints[0].latitude = '';
    expect(await captureSeaOperationValidationWeather(client, draft, { now })).toBe(draft);
    const unlinked = { ...payload(), planning: undefined };
    expect(await captureSeaOperationValidationWeather(client, unlinked, { now })).toBe(unlinked);
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
  });

  it.each(['failure', 'empty'] as const)('keeps existing data through a %s without deciding GO or NO GO', async (mode) => {
    const draft = payload();
    draft.waypoints[0].weather = forecast(input);
    if (mode === 'failure') vi.mocked(fetchSeaOperationWaypointWeather).mockRejectedValue(new Error('Indisponible'));
    else vi.mocked(fetchSeaOperationWaypointWeather).mockResolvedValue({ ...forecast(input), wind: null, waves: null });
    const captured = await captureSeaOperationValidationWeather(client, draft, { now });
    expect(captured).toBe(draft);
    expect(captured.decision).toBe(draft.decision);
    expect(captured.waypoints[0].weather).toEqual(forecast(input));
  });

  it('does not save a response for different coordinates or ETA', async () => {
    vi.mocked(fetchSeaOperationWaypointWeather).mockResolvedValue({ ...forecast(input), latitude: 48 });
    const draft = payload();
    expect(await captureSeaOperationValidationWeather(client, draft, { now })).toBe(draft);
    expect(draft.waypoints[0]).not.toHaveProperty('weather');
  });

  it('limits concurrent retrievals to three while collecting every valid point', async () => {
    const resolvers: Array<() => void> = [];
    let running = 0;
    let maximum = 0;
    vi.mocked(fetchSeaOperationWaypointWeather).mockImplementation((_client, input) => new Promise((resolve) => {
      running += 1; maximum = Math.max(maximum, running);
      resolvers.push(() => { running -= 1; resolve(forecast(input)); });
    }));
    const draft = payload();
    draft.waypoints = Array.from({ length: 5 }, (_, index) => ({ ...draft.waypoints[0], id: `p${index + 1}` }));
    const pending = captureSeaOperationValidationWeather(client, draft, { now });
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalledTimes(3);
    while (resolvers.length) { resolvers.shift()!(); await Promise.resolve(); await Promise.resolve(); }
    const captured = await pending;
    expect(maximum).toBe(3);
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalledTimes(5);
    expect(captured.waypoints.every((point) => point.weather?.pointId === point.id)).toBe(true);
  });

  it('propagates cancellation instead of allowing a later signature to continue', async () => {
    const controller = new AbortController();
    vi.mocked(fetchSeaOperationWaypointWeather).mockImplementation(async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
    await expect(captureSeaOperationValidationWeather(client, payload(), { now, signal: controller.signal })).rejects.toThrow();
  });
});
