import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint, isSeaOperationPayload } from './seaOperationModel';
import { captureSeaOperationRadios, retainSeaOperationWeather, updateSeaOperationWaypoint, waypointRadioSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';

const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '49°39′ N', longitude: '1°37.2′ W', eta: '2026-10-23T12:00', ukc: '2.3' };
const weather: SeaOperationWaypointWeather = {
  pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-22T12:00:00Z',
  wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: null, directionDegrees: 270 },
  waves: { time: '2026-10-23T10:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
  windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg',
};
const payload = () => ({ ...emptySeaOperation(), planning: { date: '2026-10-23', operationId: '10:20', projectId: '1', captainPersonId: '3' }, waypoints: [{ ...point }] });
const context = { projectId: '1', pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta };

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
