import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, isSeaOperationPayload } from './seaOperationModel';
import { captureSeaOperationRadios, effectiveSeaOperationUkc, invalidateSeaOperationUkc, retainSeaOperationUkc, retainSeaOperationWeather,
  seaOperationUkcReference, updateSeaOperationWaypoint, waypointRadioSnapshot, waypointUkcSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { COPERNICUS_UKC_PRODUCTS, calculateSeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';

const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '49°39′ N', longitude: '1°37.2′ W', eta: '2026-10-23T12:00', ukc: '2.3' };
const weather: SeaOperationWaypointWeather = {
  pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-22T12:00:00Z',
  wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: null, directionDegrees: 270 },
  waves: { time: '2026-10-23T10:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
  windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg',
};
const payload = () => ({ ...emptySeaOperation(), planning: { date: '2026-10-23', operationId: '10:20', projectId: '1', captainPersonId: '3' }, waypoints: [{ ...point }] });
const context = { projectId: '1', pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta };

function ukcFixture() {
  const draft = payload();
  draft.vessel.id = '2'; draft.vessel.draftMeters = 3;
  draft.waypoints[0].ukcMode = 'automatic';
  const input = { projectId: '1', pointId: 'p1', vesselId: '2', latitude: 49.65, longitude: -1.62, eta: point.eta, draftMeters: 3 };
  const forecast = calculateSeaOperationCopernicusEstimate(input, { status: 'available', message: '',
    source: { model: 'NWS', ...COPERNICUS_UKC_PRODUCTS.NWS, datum: 'model-geoid', referenceTimeUtc: null,
      sourceUrl: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' },
    cell: { latitude: 49.65, longitude: -1.62, bounds: { west: -1.635, east: -1.605, south: 49.643243, north: 49.656757 },
      resolutionMeters: 2200, depthMeters: 20, depthMinMeters: null, depthMaxMeters: null },
    waterLevel: { timeBeforeUtc: '2026-10-23T10:00:00Z', timeAfterUtc: '2026-10-23T10:15:00Z', heightBeforeMeters: 1, heightAfterMeters: 2 } }, '2026-10-22T12:00:00Z');
  const request = { ...context, vesselId: '2', draftMeters: 3 };
  return { draft, forecast, request };
}

describe('retained Copernicus UKC assistance', () => {
  it('retains an exact automatic capture without overwriting any manual text or other form edits', () => {
    const { draft, forecast, request } = ukcFixture(); draft.risks = 'Travaux en cours';
    const stored = retainSeaOperationUkc(draft, forecast, request);
    expect(stored).not.toBe(draft); expect(stored.risks).toBe('Travaux en cours');
    expect(stored.waypoints[0].ukc).toBe('2.3'); expect(draft.waypoints[0]).not.toHaveProperty('ukcForecast');
    expect(effectiveSeaOperationUkc(stored, stored.waypoints[0])).toBe('18');
    expect(waypointUkcSnapshot(stored.waypoints[0], seaOperationUkcReference(stored))).toEqual(forecast);
    expect(isSeaOperationPayload(stored)).toBe(true);
    expect(retainSeaOperationUkc(stored, forecast, request)).toBe(stored);
  });

  it('keeps historical manual values and ignores any queued automatic response after selecting manual mode', () => {
    const { draft, forecast, request } = ukcFixture(); delete draft.waypoints[0].ukcMode;
    expect(effectiveSeaOperationUkc(draft, draft.waypoints[0])).toBe('2.3');
    expect(retainSeaOperationUkc(draft, forecast, request)).toBe(draft);
    draft.waypoints[0].ukcMode = 'manual';
    expect(retainSeaOperationUkc(draft, forecast, request)).toBe(draft);
  });

  it.each([{ projectId: '2' }, { vesselId: '3' }, { draftMeters: 4 }, { pointId: 'elsewhere' }, { latitude: '49.65' }, { longitude: '-1.62' }, { eta: '2026-10-23T13:00' }])('ignores a delayed result for changed request %o', patch => {
    const { draft, forecast, request } = ukcFixture();
    expect(retainSeaOperationUkc(draft, forecast, { ...request, ...patch })).toBe(draft);
  });

  it('does not substitute the old manual value when an automatic estimate is unavailable or stale', () => {
    const { draft, forecast, request } = ukcFixture();
    expect(effectiveSeaOperationUkc(draft, draft.waypoints[0])).toBe('');
    const unavailable = { ...forecast, status: 'unavailable' as const, estimate: null, message: 'Hors horizon' };
    const empty = retainSeaOperationUkc(draft, unavailable, request);
    expect(effectiveSeaOperationUkc(empty, empty.waypoints[0])).toBe('');
    expect(empty.waypoints[0].ukc).toBe('2.3'); expect(isSeaOperationPayload(empty)).toBe(true);
    const stored = retainSeaOperationUkc(draft, forecast, request);
    expect(retainSeaOperationUkc(stored, { ...unavailable, fetchedAt: '2026-10-23T11:00:00Z' }, request)).toBe(stored);
    expect(effectiveSeaOperationUkc(stored, { ...stored.waypoints[0], eta: '2026-10-23T13:00' })).toBe('');
  });

  it('drops a calculation after position or ETA changes and uses manual mode only after an explicit manual edit', () => {
    const { draft, forecast, request } = ukcFixture();
    const stored = retainSeaOperationUkc(draft, forecast, request);
    for (const patch of [{ latitude: '48 N' }, { eta: '2026-10-23T13:00' }]) {
      expect(updateSeaOperationWaypoint(stored.waypoints[0], patch)).not.toHaveProperty('ukcForecast');
    }
    const manual = updateSeaOperationWaypoint(stored.waypoints[0], { ukc: '4.2' });
    expect(manual.ukcMode).toBe('manual'); expect(manual).not.toHaveProperty('ukcForecast');
    expect(effectiveSeaOperationUkc(stored, manual)).toBe('4.2');
    expect(updateSeaOperationWaypoint(stored.waypoints[0], { descriptionVhf: 'Route modifiée' }).ukcForecast).toEqual(forecast);
    expect(updateSeaOperationWaypoint(stored.waypoints[0], { latitude: '49.65' }).ukcForecast).toEqual(forecast);
  });

  it('invalidates only the moved waypoint captures while preserving manual UKC text and the rest of the passage plan', () => {
    const { draft, forecast, request } = ukcFixture();
    const captured = captureSeaOperationRadios(retainSeaOperationWeather(retainSeaOperationUkc(draft, forecast, request), weather, context));
    const movedPoint = captured.waypoints[0];
    movedPoint.descriptionVhf = 'Approche du chenal'; movedPoint.denseTraffic = true;
    const otherPoint = { ...movedPoint, id: 'p2', number: '2',
      weather: { ...movedPoint.weather!, pointId: 'p2' }, ukcForecast: { ...movedPoint.ukcForecast!, pointId: 'p2' } };
    captured.waypoints.push(otherPoint);
    const original = structuredClone(captured);
    expect(waypointWeatherSnapshot(movedPoint)).toBeDefined();
    expect(waypointRadioSnapshot(movedPoint)).toBeDefined();
    expect(waypointUkcSnapshot(movedPoint, seaOperationUkcReference(captured))).toBeDefined();

    const updated = invalidateSeaOperationUkc({ ...captured, waypoints: captured.waypoints.map(item => item.id === 'p1'
      ? updateSeaOperationWaypoint(item, { latitude: '49.7', longitude: '-1.7' }) : item) });
    const changed = updated.waypoints[0];
    expect(changed).toMatchObject({ id: 'p1', number: '1', descriptionVhf: 'Approche du chenal', denseTraffic: true,
      eta: movedPoint.eta, latitude: '49.7', longitude: '-1.7', ukc: '2.3', ukcMode: 'automatic' });
    for (const key of ['weather', 'radio', 'ukcForecast']) expect(changed).not.toHaveProperty(key);
    expect(effectiveSeaOperationUkc(updated, changed)).toBe('');
    expect(updated.waypoints[1]).toBe(otherPoint);
    expect(waypointWeatherSnapshot(otherPoint)).toBe(otherPoint.weather);
    expect(waypointRadioSnapshot(otherPoint)).toBe(otherPoint.radio);
    expect(waypointUkcSnapshot(otherPoint, seaOperationUkcReference(updated))).toBe(otherPoint.ukcForecast);
    expect(retainSeaOperationWeather(updated, weather, context)).toBe(updated);
    expect(retainSeaOperationUkc(updated, forecast, request)).toBe(updated);
    expect(captured).toEqual(original);
  });

  it('ignores pending weather and UKC responses after deletion without changing the surviving manual waypoint', () => {
    const { draft, forecast, request } = ukcFixture();
    const captured = retainSeaOperationWeather(retainSeaOperationUkc(draft, forecast, request), weather, context);
    const survivor = { ...emptySeaOperationWaypoint('p2'), number: '2', latitude: '48 N', longitude: '2 W',
      eta: point.eta, ukc: '4,75', ukcMode: 'manual' as const, descriptionVhf: 'Point conservé' };
    captured.waypoints.push(survivor);
    const original = structuredClone(captured);
    const deleted = { ...captured, waypoints: captured.waypoints.filter(item => item.id !== 'p1') };

    expect(retainSeaOperationWeather(deleted, weather, context)).toBe(deleted);
    expect(retainSeaOperationUkc(deleted, forecast, request)).toBe(deleted);
    expect(deleted.waypoints).toEqual([survivor]);
    expect(deleted.waypoints[0]).toBe(survivor);
    expect(effectiveSeaOperationUkc(deleted, survivor)).toBe('4,75');
    expect(survivor).not.toHaveProperty('weather');
    expect(survivor).not.toHaveProperty('ukcForecast');
    expect(captured).toEqual(original);
  });

  it.each(['project', 'vessel', 'draught'] as const)('invalidates a capture after parent %s changes, including a canonical save response', field => {
    const { draft, forecast, request } = ukcFixture(); const stored = retainSeaOperationUkc(draft, forecast, request);
    const changed = structuredClone(stored);
    if (field === 'project') changed.planning!.projectId = '3';
    else if (field === 'vessel') changed.vessel.id = '3';
    else changed.vessel.draftMeters = 4;
    expect(isSeaOperationPayload(changed)).toBe(false);
    const cleaned = invalidateSeaOperationUkc(changed);
    expect(cleaned.waypoints[0]).not.toHaveProperty('ukcForecast');
    expect(cleaned.waypoints[0].ukcMode).toBe('automatic'); expect(cleaned.waypoints[0].ukc).toBe('2.3');
    expect(effectiveSeaOperationUkc(cleaned, cleaned.waypoints[0])).toBe('');
    expect(isSeaOperationPayload(cleaned)).toBe(true); expect(invalidateSeaOperationUkc(cleaned)).toBe(cleaned);
  });

  it('rejects malformed calculations and does not let older requests replace a newer capture', () => {
    const { draft, forecast, request } = ukcFixture();
    const latest = { ...forecast, fetchedAt: '2026-10-22T13:00:00Z' };
    const stored = retainSeaOperationUkc(draft, latest, request);
    expect(retainSeaOperationUkc(stored, forecast, request)).toBe(stored);
    const forged = structuredClone(forecast); forged.estimate!.ukcMeters = 999;
    expect(retainSeaOperationUkc(draft, forged, request)).toBe(draft);
    expect(isSeaOperationPayload({ ...stored, waypoints: [{ ...stored.waypoints[0], ukcForecast: forged }] })).toBe(false);
  });
});

describe('recorded waypoint assistance', () => {
  it('keeps old forms valid and accepts optional captures without changing the schema version', () => {
    const draft = payload();
    expect(isSeaOperationPayload(draft)).toBe(true);
    const captured = captureSeaOperationRadios(retainSeaOperationWeather(draft, weather, context), '2026-10-23T09:00:00Z');
    expect(isSeaOperationPayload(captured)).toBe(true);
    expect(captured.version).toBe(1);
    expect(draft.waypoints[0]).not.toHaveProperty('weather');
    expect(draft.waypoints[0]).not.toHaveProperty('radio');
    expect(captured.waypoints[0].ukc).toBe('2.3');
    expect(captured.waypoints[0].radio?.contacts.map((contact) => contact.id)).toEqual(expect.arrayContaining(['cross-jobourg', 'cherbourg-port']));
    expect(captured.waypoints[0].radio?.contacts[0]).not.toHaveProperty('position');
  });
  it('compares equivalent UTC instants and parsed DMS coordinates', () => {
    expect(waypointWeatherSnapshot({ ...point, weather })).toBe(weather);
    expect(waypointWeatherSnapshot({ ...point, weather: { ...weather, etaUtc: '2026-10-23T10:00:00.000Z' } })).toBeDefined();
  });
  it.each([{ projectId: '2' }, { latitude: '49.65' }, { longitude: '-1.62' }, { eta: '2026-10-23T13:00' }, { pointId: 'different' }])('rejects a delayed response for another request %o', (patch) => {
    const draft = payload();
    expect(retainSeaOperationWeather(draft, weather, { ...context, ...patch })).toBe(draft);
  });
  it('retains manual changes and deduplicates the same response', () => {
    const draft = payload(); draft.risks = 'Manœuvre retardée'; draft.waypoints[0].ukc = '3.1';
    const captured = retainSeaOperationWeather(draft, weather, context);
    expect(captured.risks).toBe(draft.risks);
    expect(captured.waypoints[0].ukc).toBe('3.1');
    expect(retainSeaOperationWeather(captured, weather, context)).toBe(captured);
  });
  it('ignores an older queued forecast after a more recent capture and accepts a later refresh', () => {
    const latest = { ...weather, fetchedAt: '2026-10-22T13:00:00Z', wind: { ...weather.wind!, speedKnots: 18 }, waves: { ...weather.waves!, heightMeters: 1.2 } };
    const captured = retainSeaOperationWeather(payload(), latest, context);
    expect(retainSeaOperationWeather(captured, weather, context)).toBe(captured);
    expect(captured.waypoints[0].weather).toEqual(latest);

    const refresh = { ...weather, fetchedAt: '2026-10-22T14:00:00Z' };
    const refreshed = retainSeaOperationWeather(captured, refresh, context);
    expect(refreshed).not.toBe(captured);
    expect(refreshed.waypoints[0].weather).toEqual(refresh);
  });
  it('keeps the newer unavailable response when an older response arrives for the same point', () => {
    const latest = { ...weather, fetchedAt: '2026-10-22T13:00:00Z', wind: null, waves: null,
      windMessage: 'Échéance non disponible.', wavesMessage: 'Échéance non disponible.' };
    const captured = retainSeaOperationWeather(payload(), latest, context);
    expect(retainSeaOperationWeather(captured, weather, context)).toBe(captured);
    expect(retainSeaOperationWeather(captured, { ...latest, fetchedAt: weather.fetchedAt, windMessage: 'Ancienne réponse.' }, context)).toBe(captured);
    expect(captured.waypoints[0].weather).toEqual(latest);
  });
  it('keeps the recorded forecast when a successful refresh has no weather after the ETA', () => {
    const captured = retainSeaOperationWeather(payload(), weather, context);
    const unavailable = { ...weather, fetchedAt: '2026-10-23T12:00:00Z', wind: null, waves: null,
      windMessage: 'L’ETA est passée.', wavesMessage: 'L’ETA est passée.' };
    expect(retainSeaOperationWeather(captured, unavailable, context)).toBe(captured);
    expect(captured.waypoints[0].weather).toEqual(weather);
    const edited = { ...captured, waypoints: [updateSeaOperationWaypoint(captured.waypoints[0], { eta: '2026-10-23T13:00' })] };
    expect(retainSeaOperationWeather(edited, unavailable, context)).toBe(edited);
    expect(edited.waypoints[0]).not.toHaveProperty('weather');
  });
  it('invalidates forecast on ETA edit and both captures on coordinate edit', () => {
    const captured = captureSeaOperationRadios(retainSeaOperationWeather(payload(), weather, context)).waypoints[0];
    const changedEta = updateSeaOperationWaypoint(captured, { eta: '2026-10-23T13:00' });
    expect(changedEta.weather).toBeUndefined(); expect(changedEta.radio).toBeDefined();
    const changedPosition = updateSeaOperationWaypoint(captured, { latitude: '48 N' });
    expect(changedPosition.weather).toBeUndefined(); expect(changedPosition.radio).toBeUndefined();
    expect(updateSeaOperationWaypoint(captured, { descriptionVhf: 'Nouveau descriptif' }).weather).toBe(captured.weather);
  });
  it('rejects malformed, mismatched or untrusted optional captures', () => {
    const captured = captureSeaOperationRadios(payload()).waypoints[0];
    expect(waypointRadioSnapshot(captured)).toBeDefined();
    expect(waypointRadioSnapshot({ ...captured, radio: { ...captured.radio!, latitude: 48 } })).toBeUndefined();
    expect(waypointRadioSnapshot({ ...captured, radio: { ...captured.radio!, contacts: [{ ...captured.radio!.contacts[0], source: 'javascript:alert(1)' }] } })).toBeUndefined();
    expect(waypointRadioSnapshot({ ...captured, radio: { ...captured.radio!, capturedAt: '0001-01-01T00:00:00Z' } })).toBeUndefined();
    expect(waypointRadioSnapshot({ ...captured, radio: { ...captured.radio!, verifiedOn: '0001-01-01' } })).toBeUndefined();
    expect(waypointWeatherSnapshot({ ...point, weather: { ...weather, pointId: 'wrong' } })).toBeUndefined();
    expect(waypointWeatherSnapshot({ ...point, weather: { ...weather, fetchedAt: '2026-02-30T12:00:00Z' } })).toBeUndefined();
    expect(isSeaOperationPayload({ ...payload(), waypoints: [{ ...point, weather: { ...weather, latitude: 48 } }] })).toBe(false);
  });
  it('leaves missing coordinates and legacy ETA without fabricated forecasts', () => {
    const draft = payload(); draft.waypoints[0].latitude = '';
    expect(captureSeaOperationRadios(draft).waypoints[0].radio).toBeUndefined();
    expect(waypointWeatherSnapshot({ ...point, eta: '12:00', weather })).toBeUndefined();
  });
});
