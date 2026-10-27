import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { initialSeaOperationWeatherStatus, weatherRequestKey } from './seaOperationWeatherStatus';
import { SEA_METEO_FRANCE_SOURCE_URL, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';

const point = { ...emptySeaOperationWaypoint('p1'), latitude: '49.65', longitude: '-1.62', eta: '2026-10-24T12:00' };

describe('inline weather acquisition status', () => {
  it('isolates Transit by vessel and operation date without inventing a project', () => {
    const reference = { projectId: '', transit: { date: '2026-10-27', vesselId: '1' } };
    expect(initialSeaOperationWeatherStatus(reference, point)).toEqual({ loading: true });
    expect(weatherRequestKey(reference, point)).not.toBe(weatherRequestKey('', point));
    for (const transit of [{ date: '2026-10-28', vesselId: '1' }, { date: '2026-10-27', vesselId: '2' }]) {
      expect(weatherRequestKey({ projectId: '', transit }, point)).not.toBe(weatherRequestKey(reference, point));
    }
    expect(initialSeaOperationWeatherStatus({ ...reference, transit: { ...reference.transit, vesselId: '' } }, point).loading).toBe(false);
  });
  it('identifies incomplete inputs before starting a forecast', () => {
    expect(initialSeaOperationWeatherStatus('', point).error).toContain('projet du planning');
    expect(initialSeaOperationWeatherStatus('1', { ...point, latitude: '' }).error).toContain('latitude');
    expect(initialSeaOperationWeatherStatus('1', { ...point, eta: '12:00' }).error).toContain('ETA complète');
    expect(initialSeaOperationWeatherStatus('1', { ...point, eta: '2026-10-25T02:30' }).error).toBeTruthy();
    expect(initialSeaOperationWeatherStatus('1', point)).toEqual({ loading: true });
  });
  it('keeps a valid stored horizon explanation without a permanent spinner', () => {
    const weather: SeaOperationWaypointWeather = { pointId: point.id, latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-24T10:00:00Z', fetchedAt: '2026-10-23T12:00:00Z',
      wind: null, waves: null, windMessage: 'Hors horizon.', wavesMessage: 'Hors horizon.', attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL };
    const record = { ...point, weather };
    expect(initialSeaOperationWeatherStatus('1', record)).toEqual({ loading: false });
    expect(initialSeaOperationWeatherStatus('1', { ...record, longitude: '1.0' })).toEqual({ loading: true });
  });
  it('isolates request state by project, coordinates and ETA while excluding weather snapshots', () => {
    const key = weatherRequestKey('1', point);
    for (const changed of [{ ...point, id: 'p2' }, { ...point, latitude: '50' }, { ...point, longitude: '1' }, { ...point, eta: '2026-10-24T13:00' }]) {
      expect(weatherRequestKey('1', changed)).not.toBe(key);
    }
    expect(weatherRequestKey('2', point)).not.toBe(key);
    const withWeather = { ...point, weather: undefined };
    expect(weatherRequestKey('1', withWeather)).toBe(key);
  });
});
