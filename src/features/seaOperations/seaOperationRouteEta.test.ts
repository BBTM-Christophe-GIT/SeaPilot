// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, isSeaOperationPayload, type SeaOperationPayload, type SeaOperationWaypoint } from './seaOperationModel';
import { initialSeaOperationDepartureEta, seaOperationWaypointEtaIsAutomatic, updateSeaOperationRouteEtas } from './seaOperationRouteEta';
import { captureSeaOperationRadios } from './seaOperationWaypointSnapshots';
import { COPERNICUS_UKC_PRODUCTS, calculateSeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';

const point = (id: string, longitude: string, eta = '', etaMode?: SeaOperationWaypoint['etaMode']): SeaOperationWaypoint => ({
  ...emptySeaOperationWaypoint(id), number: id, latitude: '0', longitude, eta, ...(etaMode === undefined ? {} : { etaMode }) });
const payload = (waypoints: SeaOperationWaypoint[]): SeaOperationPayload => ({ ...emptySeaOperation(), waypoints });

describe('editable automatic waypoint ETAs', () => {
  it.each([
    ['2026-10-27T13:27:59Z', '2026-10-27T14:25'],
    ['2026-07-11T22:02:00Z', '2026-07-12T00:00'],
    ['2026-12-31T23:59:00Z', '2027-01-01T00:55'],
    ['2026-10-25T01:15:00Z', ''],
  ])('defaults new departures in Paris at five-minute precision for %s', (now, eta) => {
    expect(initialSeaOperationDepartureEta(new Date(now))).toBe(eta);
  });

  it('populates blank downstream slots at minute accuracy without per-leg rounding drift or mutation', () => {
    const draft = payload([point('a', '0', '2026-10-27T12:00'), point('b', '0.002'), point('c', '0.004')]);
    const original = structuredClone(draft); Object.freeze(draft.waypoints); draft.waypoints.forEach(Object.freeze);
    const result = updateSeaOperationRouteEtas(draft, 20);
    expect(result.waypoints.map(item => item.eta)).toEqual(['2026-10-27T12:00', '2026-10-27T12:01', '2026-10-27T12:01']);
    expect(result.waypoints.slice(1).every(item => item.etaMode === 'automatic')).toBe(true);
    expect(result.waypoints[0]).toBe(draft.waypoints[0]); expect(draft).toEqual(original); expect(isSeaOperationPayload(result)).toBe(true);
    expect(updateSeaOperationRouteEtas(result, 20)).toBe(result);
  });

  it('preserves a manually adjusted point as a fresh anchor when earlier dates, positions or speed change', () => {
    const draft = payload([point('a', '0', '2026-10-27T10:00', 'manual'), point('b', '0.2'),
      point('c', '0.4', '2026-10-27T14:20', 'manual'), point('d', '0.6')]);
    const result = updateSeaOperationRouteEtas(draft, 20);
    expect(result.waypoints[1].eta).toBe('2026-10-27T11:00'); expect(result.waypoints[3].eta).toBe('2026-10-27T15:20');
    const changed = { ...result, waypoints: result.waypoints.map((item, index) => index === 0 ? { ...item, eta: '2026-10-28T01:00', longitude: '-1' } : item) };
    const faster = updateSeaOperationRouteEtas(changed, 40);
    expect(faster.waypoints[2]).toBe(result.waypoints[2]); expect(faster.waypoints[3].eta).toBe('2026-10-27T14:50');
  });

  it('treats historical unmarked nonempty ETAs as manual and never takes the planning ETD as its first anchor', () => {
    const firstBlank = payload([point('a', '0'), point('b', '0.2')]); firstBlank.vessel.etd = '2026-10-27T10:00';
    expect(updateSeaOperationRouteEtas(firstBlank, 20)).toBe(firstBlank);
    const historical = payload([point('a', '0', '2026-10-27T10:00'), point('b', '0.2', '2026-10-27T14:07'), point('c', '0.4')]);
    const result = updateSeaOperationRouteEtas(historical, 20);
    expect(result.waypoints[1]).toBe(historical.waypoints[1]); expect(result.waypoints[2].eta).toBe('2026-10-27T15:07');
    expect(seaOperationWaypointEtaIsAutomatic(historical.waypoints[1])).toBe(false);
  });

  it('keeps an explicitly cleared manual slot empty until automatic calculation is explicitly resumed', () => {
    const draft = payload([point('a', '0', '2026-10-27T10:00'), point('b', '0.2', '', 'manual'), point('c', '0.4', '2026-10-27T12:00', 'automatic')]);
    const stopped = updateSeaOperationRouteEtas(draft, 20);
    expect(stopped.waypoints[1]).toBe(draft.waypoints[1]); expect(stopped.waypoints[2].eta).toBe('');
    const resumed = updateSeaOperationRouteEtas({ ...stopped, waypoints: stopped.waypoints.map((item, index) => index === 1 ? { ...item, etaMode: 'automatic' } : item) }, 20);
    expect(resumed.waypoints.map(item => item.eta)).toEqual(['2026-10-27T10:00', '2026-10-27T11:00', '2026-10-27T12:00']);
  });

  it('breaks at a missing position and resumes only from a later explicit manual anchor', () => {
    const draft = payload([point('a', '0', '2026-10-27T10:00'), point('bad', '', '2026-10-27T11:00', 'automatic'),
      point('c', '0.4', '2026-10-27T12:00', 'automatic'), point('d', '0.6', '2026-10-27T14:00', 'manual'), point('e', '0.8')]);
    const result = updateSeaOperationRouteEtas(draft, 20);
    expect(result.waypoints.map(item => item.eta)).toEqual(['2026-10-27T10:00', '', '', '2026-10-27T14:00', '2026-10-27T15:00']);
  });

  it.each([undefined, null, 0, Number.NaN])('clears only previous automatic ETAs when speed %s is unavailable and can restore them afterward', speed => {
    const ready = updateSeaOperationRouteEtas(payload([point('a', '0', '2026-10-27T10:00'), point('b', '0.2')]), 20);
    const missing = updateSeaOperationRouteEtas(ready, speed);
    expect(missing.waypoints[0]).toBe(ready.waypoints[0]); expect(missing.waypoints[1]).toMatchObject({ eta: '', etaMode: 'automatic' });
    expect(updateSeaOperationRouteEtas(missing, 20).waypoints[1].eta).toBe(ready.waypoints[1].eta);
  });

  it.each(['10:00', '2026-10-27', '2026-03-29T02:30', '2026-10-25T02:30'])('does not guess an anchor from incomplete or ambiguous %s', eta => {
    const draft = payload([point('a', '0', eta), point('b', '0.2', '2026-10-27T11:00', 'automatic')]);
    expect(updateSeaOperationRouteEtas(draft, 20).waypoints[1].eta).toBe(''); expect(draft.waypoints[0].eta).toBe(eta);
  });

  it('does not promote an automatic point to a manual anchor after deleting the former first point', () => {
    const result = updateSeaOperationRouteEtas(payload([point('a', '0', '2026-10-27T10:00'), point('b', '0.2'), point('c', '0.4')]), 20);
    const shortened = updateSeaOperationRouteEtas({ ...result, waypoints: result.waypoints.slice(1) }, 20);
    expect(shortened.waypoints.map(item => item.eta)).toEqual(['', '']);
  });

  it('recomputes automatic slots after inserting or moving a point, without changing manual anchors', () => {
    const original = updateSeaOperationRouteEtas(payload([point('a', '0', '2026-10-27T10:00'), point('b', '0.2')]), 20);
    const inserted = updateSeaOperationRouteEtas({ ...original, waypoints: [original.waypoints[0], point('detour', '0.4'), original.waypoints[1]] }, 20);
    expect(inserted.waypoints.map(item => item.eta)).toEqual(['2026-10-27T10:00', '2026-10-27T12:00', '2026-10-27T13:00']);
  });

  it('uses elapsed UTC time over year boundaries and the spring DST gap, leaving an ambiguous automatic arrival blank', () => {
    expect(updateSeaOperationRouteEtas(payload([point('a', '0', '2026-12-31T23:30'), point('b', '0.2')]), 20).waypoints[1].eta).toBe('2027-01-01T00:30');
    expect(updateSeaOperationRouteEtas(payload([point('a', '0', '2026-03-29T01:30'), point('b', '0.2')]), 20).waypoints[1].eta).toBe('2026-03-29T03:30');
    const autumn = updateSeaOperationRouteEtas(payload([point('a', '0', '2026-10-25T01:30'), point('b', '0.2'), point('c', '0.6')]), 20);
    expect(autumn.waypoints[1].eta).toBe(''); expect(autumn.waypoints[2].eta).toBe('2026-10-25T03:30');
  });

  it('drops weather and UKC captures only when the calculated ETA changes and keeps still-valid radio positions', () => {
    const first = { ...point('a', '-1.62', '2026-10-27T12:00'), latitude: '49.65' };
    const second = { ...point('b', '-1.60', '2026-10-27T12:05', 'automatic'), latitude: '49.65', ukcMode: 'automatic' as const };
    second.weather = { pointId: 'b', latitude: 49.65, longitude: -1.60, etaUtc: '2026-10-27T11:05:00.000Z', fetchedAt: '2026-10-26T08:00:00Z', wind: null, waves: null,
      windMessage: 'Pas de vent', wavesMessage: 'Pas de Hs', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg' };
    second.ukcForecast = calculateSeaOperationCopernicusEstimate({ projectId: '1', vesselId: '2', pointId: 'b', latitude: 49.65, longitude: -1.60, eta: second.eta, draftMeters: 2 }, {
      status: 'available', message: '', source: { model: 'NWS', ...COPERNICUS_UKC_PRODUCTS.NWS, datum: 'model-geoid', referenceTimeUtc: null,
        sourceUrl: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' },
      cell: { latitude: 49.65, longitude: -1.60, bounds: { west: -1.615, east: -1.585, south: 49.64, north: 49.66 }, resolutionMeters: 2300, depthMeters: 20, depthMinMeters: null, depthMaxMeters: null },
      waterLevel: { timeBeforeUtc: '2026-10-27T11:00:00Z', timeAfterUtc: '2026-10-27T11:15:00Z', heightBeforeMeters: 1, heightAfterMeters: 2 } }, '2026-10-26T08:00:00Z');
    const draft = payload([first, second]); draft.planning = { date: '2026-10-27', projectId: '1', operationId: '1:2', captainPersonId: '3' }; draft.vessel.id = '2'; draft.vessel.draftMeters = 2;
    const captured = captureSeaOperationRadios(draft); expect(isSeaOperationPayload(captured)).toBe(true);
    const result = updateSeaOperationRouteEtas(captured, 20);
    expect(result.waypoints[1].eta).toBe('2026-10-27T12:04');
    expect(result.waypoints[1]).not.toHaveProperty('weather'); expect(result.waypoints[1]).not.toHaveProperty('ukcForecast');
    expect(result.waypoints[1].radio).toBe(captured.waypoints[1].radio);
    expect(updateSeaOperationRouteEtas(result, 20)).toBe(result); expect(isSeaOperationPayload(result)).toBe(true);
  });
});
