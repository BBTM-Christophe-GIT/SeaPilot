// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { seaOperationWeatherLocation } from './seaOperationWeatherLocation';
import { SEA_METEO_FRANCE_SOURCE_URL, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';

const forecast = (): SeaOperationWaypointWeather => ({
  pointId: 'marine-cell-fixture', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-22T12:00:00Z',
  attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL, wind: null, waves: null, windMessage: '', wavesMessage: '',
});

describe('forecast model-cell provenance', () => {
  it('does not invent a model location for an older snapshot without one', () => {
    expect(seaOperationWeatherLocation(forecast())).toBe('');
  });

  it('reports the actual nearby model cell and its distance without moving the waypoint or changing its forecast', () => {
    const weather = forecast();
    weather.model = { name: 'MFWAM', referenceTime: '2026-10-22T06:00:00Z', latitude: 49.7, longitude: -1.62 };
    const original = structuredClone(weather);
    expect(seaOperationWeatherLocation(weather)).toBe('Point météo : 49° 42.000′ N — 001° 37.200′ W · à 5,6 km du waypoint. Prévision de maille, position approchée.');
    expect(weather).toEqual(original);
  });

  it('keeps a genuine zero distance and the signed coordinates of a coincident model cell', () => {
    const weather = forecast();
    weather.model = { name: 'MFWAM', referenceTime: '2026-10-22T06:00:00Z', latitude: 49.65, longitude: -1.62 };
    expect(seaOperationWeatherLocation(weather)).toContain('49° 39.000′ N — 001° 37.200′ W · à 0,0 km du waypoint');
  });

  it('measures a short distance across the date line instead of almost a full circumference', () => {
    const weather = { ...forecast(), latitude: 0, longitude: 179.99,
      model: { name: 'Test de géométrie', referenceTime: '2026-10-22T06:00:00Z', latitude: 0, longitude: -179.99 } };
    expect(seaOperationWeatherLocation(weather)).toContain('00° 00.000′ N — 179° 59.400′ W · à 2,2 km du waypoint');
  });
});
