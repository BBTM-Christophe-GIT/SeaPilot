// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { observationFootnote, observationText, observationWaitingMessage, waypointWeatherObservation } from './seaOperationWeatherHistory';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';

const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '49°39′ N', longitude: '1°37.2′ W', eta: '2026-10-23T12:00' };
const observation = (): ObservationResult => {
  const common = { observedAt: '2026-10-23T10:15:00Z', station: { id: '62001', name: 'Bouée Manche', latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z',
    wind: { ...common, speedKnots: 12, directionDegrees: 270, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 1.2, periodSeconds: 8, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
};

describe('measured weather annex rendering data', () => {
  it('finds only the observation matching the waypoint identity, parsed position and Paris ETA', () => {
    const valid = observation();
    const rows = [{ ...valid, pointId: 'different' }, { ...valid, latitude: 48 }, { ...valid, longitude: -2 },
      { ...valid, etaUtc: '2026-10-23T11:00:00Z' }, valid];
    const original = structuredClone(rows);
    expect(waypointWeatherObservation(point, rows)).toBe(valid);
    expect(waypointWeatherObservation({ ...point, eta: '2026-10-23T13:00' }, [valid])).toBeUndefined();
    expect(waypointWeatherObservation({ ...point, latitude: '' }, rows)).toBeUndefined();
    expect(waypointWeatherObservation({ ...point, eta: '12:00' }, rows)).toBeUndefined();
    expect(rows).toEqual(original);
  });

  it('does not render malformed or untrusted observations even when their position matches', () => {
    const valid = observation();
    const malicious = { ...valid, wind: { ...valid.wind!, source: { ...valid.wind!.source, sourceUrl: 'javascript:alert(1)' } } };
    expect(waypointWeatherObservation(point, [malicious])).toBeUndefined();
    expect(waypointWeatherObservation(point, [{ ...valid, waves: { ...valid.waves!, observedAt: '2026-10-23T11:00:00Z' } }])).toBeUndefined();
  });

  it('distinguishes total sea, peak period and the measured wind instrument height from forecast metrics', () => {
    const text = observationText(observation());
    expect(text).toContain('Hs de mer totale observée : 1,2 m · période de pic : 8 s');
    expect(text).toContain('Vent mesuré à 3 m : 12 nd · de 270°');
    expect(text).toContain('Bouée Manche · 5,8 km · 23/10/2026 10:15 UTC');
    expect(text).not.toMatch(/Houle Hs|Vent moyen 10 m|rafales|Confortable|Rude/i);
    const swell = observation(); swell.waves = { ...swell.waves!, component: 'swell', periodKind: 'mean' };
    expect(observationText(swell)).toContain('Houle Hs observée : 1,2 m · période moyenne : 8 s');
  });

  it('preserves measured zeroes and reports missing components without inventing values', () => {
    const zero = observation(); zero.wind!.speedKnots = 0; zero.waves!.heightMeters = 0;
    expect(observationText(zero)).toContain('observée : 0 m');
    expect(observationText(zero)).toContain('Vent mesuré à 3 m : 0 nd');
    zero.wind = null;
    expect(observationText(zero)).toContain('Vent : aucune mesure officielle proche disponible.');
    expect(observationText(undefined)).toBe('Aucune mesure officielle enregistrée.');
    const pending = { ...observation(), status: 'pending' as const, wind: null, waves: null, message: 'Publication officielle attendue.' };
    expect(observationText(pending)).toBe('Publication officielle attendue.');
    expect(observationFootnote(pending)).toBe('');
  });

  it('retains source, licence, station position, observation time and collection time in exports', () => {
    const text = observationFootnote(observation());
    expect(text).toContain('Annexe mise à jour le 24/10/2026 08:00 UTC');
    expect(text).toContain('Stations à 50 km maximum, heure observée à 30 min maximum de l’ETA');
    expect(text).toContain('Météo-France · Bouée Manche (62001) · 49.6, -1.6 · 5.8 km · 23/10/2026 10:15 UTC · qualité non renseignée');
    expect(text).toContain(SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(text).toContain(`Licence Ouverte 2.0 · ${SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL}`);
    expect(text).toContain('Les mesures ne modifient pas la décision signée.');
  });

  it('shows availability messages for future or recent passages and does not fabricate older measurements', () => {
    expect(observationWaitingMessage(point, Date.parse('2026-10-23T08:00:00Z'))).toContain('collectées quotidiennement après le passage');
    expect(observationWaitingMessage(point, Date.parse('2026-11-01T08:00:00Z'))).toBe('Aucune mesure officielle enregistrée pour ce point.');
    expect(observationWaitingMessage({ ...point, latitude: '' })).toContain('Coordonnées manquantes');
    expect(observationWaitingMessage({ ...point, eta: '12:00' })).toContain('Une ETA complète');
  });
});
