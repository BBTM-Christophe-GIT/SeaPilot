import { describe, expect, it } from 'vitest';
import { isSeaOperationWeatherObservation, isSeaOperationWeatherObservationInput,
  SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL,
  type ObservationResult } from './seaOperationWeatherObservationsModel';

function observed(): ObservationResult {
  return { pointId: 'wp1', latitude: 45.23, longitude: -5, etaUtc: '2026-10-22T23:00:00.000Z', recordedAt: '2026-10-23T12:00:00.000Z',
    wind: { observedAt: '2026-10-22T23:00:00.000Z', speedKnots: 0, directionDegrees: null, instrumentHeightMeters: null,
      station: { id: '6200001', name: 'BOUEE_GASCOGNE', latitude: 45.23, longitude: -5, distanceKm: 0 },
      source: { provider: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, quality: 'not_provided',
        license: 'Licence Ouverte 2.0', licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL } },
    waves: null, status: 'recorded', message: 'Mesure officielle à la station.' };
}

describe('measured waypoint weather contract', () => {
  it('accepts partial official measurements and keeps zero distinct from missing', () => {
    expect(isSeaOperationWeatherObservation(observed())).toBe(true);
    expect(isSeaOperationWeatherObservation({ ...observed(), wind: { ...observed().wind, speedKnots: null } })).toBe(false);
  });

  it.each([
    { latitude: 91 }, { longitude: NaN }, { etaUtc: '2026-02-30T10:00:00Z' }, { etaUtc: '2026-10-23T10:00' },
    { pointId: '' }, { pointId: 'p'.repeat(2049) },
  ])('rejects invalid request metadata %j', (change) => {
    expect(isSeaOperationWeatherObservationInput({ ...observed(), ...change })).toBe(false);
  });

  it('retains valid legacy waypoint identifiers up to the existing 2048 character bound', () => {
    expect(isSeaOperationWeatherObservationInput({ ...observed(), pointId: 'p'.repeat(2048) })).toBe(true);
  });

  it('rejects an unknown provider, forged quality or changed licence/source link', () => {
    const value = observed();
    for (const change of [{ provider: 'Reanalysis' }, { quality: 'good' }, { sourceUrl: 'https://example.com' }, { licenseUrl: 'https://example.com' }]) {
      expect(isSeaOperationWeatherObservation({ ...value, wind: { ...value.wind, source: { ...value.wind!.source, ...change } } })).toBe(false);
    }
  });

  it('rejects a measurement outside the distance, time or known numeric bounds', () => {
    const value = observed();
    for (const change of [{ observedAt: '2026-10-22T22:29:59Z' }, { observedAt: '2026-10-24T12:00:00Z' },
      { station: { ...value.wind!.station, distanceKm: 50.001 } }, { speedKnots: -1 }, { directionDegrees: 361 }]) {
      expect(isSeaOperationWeatherObservation({ ...value, wind: { ...value.wind, ...change } })).toBe(false);
    }
  });

  it('does not accept a forecast or a pending record pretending to contain measured values', () => {
    expect(isSeaOperationWeatherObservation({ ...observed(), status: 'pending' })).toBe(false);
    expect(isSeaOperationWeatherObservation({ ...observed(), status: 'recorded', wind: null })).toBe(false);
    expect(isSeaOperationWeatherObservation({ ...observed(), status: 'pending', wind: null })).toBe(true);
  });
});
