// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint, type SeaOperationWaypoint } from './seaOperationModel';
import { SEA_METEO_FRANCE_SOURCE_URL } from './seaOperationWeatherModel';
import { passagePlanCellData } from './seaOperationPassagePlan';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';

function recordedObservation(): ObservationResult {
  const common = { observedAt: '2026-10-23T10:15:00Z', station: { id: '62001', name: 'Bouée Manche', latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId: 'route-1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z',
    wind: { ...common, speedKnots: 22, directionDegrees: 280, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 4.2, periodSeconds: 11, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
}

function recordedPoint(): SeaOperationWaypoint {
  return { ...emptySeaOperationWaypoint('route-1'), number: 'WP1', descriptionVhf: 'Approche du port', latitude: '49.65 N', longitude: '1.62 W', eta: '2026-10-23T12:00', ukc: '2 m',
    weather: { pointId: 'route-1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00.000Z', fetchedAt: '2026-10-22T12:00:00Z',
      wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: 37, directionDegrees: 270 },
      waves: { time: '2026-10-23T10:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' },
      windMessage: '', wavesMessage: '', attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL,
      model: { name: 'MFWAM', referenceTime: '2026-10-22T06:00:00Z', latitude: 49.65, longitude: -1.625 } },
    radio: { version: 1, latitude: 49.65, longitude: -1.62, capturedAt: '2026-10-22T12:00:00Z', verifiedOn: '2026-10-22',
      contacts: [{ id: 'cherbourg-port', kind: 'port', name: 'Cherbourg · Capitainerie', area: 'Port', vhf: '12', phone: '+33 2 33 20 41 25',
        source: 'https://portsdenormandie.fr/en/harbour-masters-office/cherbourg', sourceLabel: 'Ports de Normandie', distanceNm: 0 }] } };
}

describe('recorded Passage Plan presentation', () => {
  it('keeps a missing automatic capture unavailable instead of presenting the manual value', () => {
    const point = { ...recordedPoint(), ukcMode: 'automatic' as const, ukc: 'MANUAL-OLD' };
    const row = passagePlanCellData(point);
    expect(row.ukc).toBe('Indisponible');
    expect(row.ukcPresentation.rawValue).toBe('');
    expect(row.ukcFootnote).toContain('UKC automatique indisponible');
    expect(row.ukcFootnote).not.toContain('MANUAL-OLD');
  });
  it('keeps each waypoint’s VHF, wind and Hs together with their recorded times and sources, without gusts', () => {
    const row = passagePlanCellData(recordedPoint());
    expect(row).toMatchObject({ waypoint: 'WP1', eta: '23/10/2026 à 12:00', ukc: '2 m', denseTraffic: 'Non' });
    expect(row.vhf).toContain('Cherbourg · Capitainerie · Ch 12');
    expect(row.vhf).toContain('Tél. +33 2 33 20 41 25');
    expect(row.weather).toContain('Vent moyen 10 m : 12 nd · de 270°');
    expect(row.weather).toContain('Houle Hs : 0,60 m\nPériode : 6 s\nProvenance houle : 220°');
    expect(row.weather).not.toContain('23/10/2026 10:00 UTC');
    expect(row.weatherFootnote).toContain('modèle houle : 23/10/2026 10:00 UTC');
    expect(row.weather).not.toMatch(/rafale|37/i);
    expect(row.weatherFootnote).toContain('Météo-France · consultée le 22/10/2026 12:00 UTC');
    expect(row.weatherFootnote).toContain('réseau du 22/10/2026 06:00 UTC');
    expect(row.radioFootnote).toContain('Ports de Normandie');
  });
  it('never fills an old signed record with today’s forecast or contact directory', () => {
    const point = recordedPoint();
    delete point.radio; delete point.weather;
    expect(passagePlanCellData(point)).toMatchObject({ vhf: 'Contacts VHF non enregistrés.', weather: 'Prévisions météo non enregistrées pour cette position et cette ETA.' });
    expect(passagePlanCellData(point, { allowLiveRadio: true }).vhf).toContain('Cherbourg');
  });
  it('does not present a stored forecast for a changed ETA or stored contacts for a changed position', () => {
    const point = recordedPoint();
    expect(passagePlanCellData({ ...point, eta: '2026-10-23T15:00' }).weather).toContain('non enregistrées');
    const changed = passagePlanCellData({ ...point, longitude: '-4.53' });
    expect(changed.vhf).toContain('non enregistrés');
    expect(changed.weather).toContain('non enregistrées');
  });
  it('preserves genuine zeroes and distinguishes unavailable data', () => {
    const point = recordedPoint();
    point.weather!.wind!.speedKnots = 0;
    point.weather!.waves!.heightMeters = 0;
    expect(passagePlanCellData(point).weather).toContain('Vent moyen 10 m : 0 nd');
    expect(passagePlanCellData(point).weather).toContain('Houle Hs : 0,00 m');
    point.weather!.wind = null; point.weather!.windMessage = 'Horizon dépassé.';
    expect(passagePlanCellData(point).weather).toContain('Vent : Horizon dépassé.');
  });
  it('evaluates only the captured matrix and matching Hs-period pair, with no wind limit or automatic GO', () => {
    const point = recordedPoint();
    const row = passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX });
    expect(row.weather).toMatch(/^Confortable\n/);
    expect(row.seaState).toMatchObject({ code: 'comfortable', tone: 'success' });
    expect(row.weatherFootnote).toContain('Matrice du navire enregistrée');
    point.weather!.waves!.heightMeters = 2.2; point.weather!.waves!.periodSeconds = 4;
    point.weather!.wind!.speedKnots = 0;
    expect(passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX }).seaState.code).toBe('unlivable');
    point.weather!.wind!.speedKnots = 200;
    expect(passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX }).seaState.code).toBe('unlivable');
    expect(passagePlanCellData(point).seaState.code).toBe('no_matrix');
    expect(passagePlanCellData(point).weather).not.toMatch(/Matrice non renseignée|Condition non définie/);
    expect(passagePlanCellData(point).hasSeaStateIndicator).toBe(false);
    point.weather!.waves!.heightMeters = 4;
    expect(passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX }).seaState.code).toBe('outside_matrix');
    point.weather!.waves!.periodSeconds = null;
    expect(passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX }).seaState.code).toBe('no_forecast');
  });
  it('keeps official measurements separate from the validated forecast and its original matrix assessment', () => {
    const point = recordedPoint();
    const observation = recordedObservation();
    const original = structuredClone({ point, observation });
    const row = passagePlanCellData(point, { weatherMatrix: GOURY_WEATHER_MATRIX, observations: [observation], includeObservations: true, validatedAt: '2026-10-22T12:00:00Z' });
    expect(row.weather).toContain('Prévision conservée à la validation du 22/10/2026 12:00 UTC');
    expect(row.weather).toContain('Houle Hs : 0,60 m');
    expect(row.weather).toContain('Vent moyen 10 m : 12 nd');
    expect(row.observedWeather).toContain('Hs de mer totale observée : 4,2 m · période de pic : 11 s');
    expect(row.observedWeather).toContain('Vent mesuré à 3 m : 22 nd');
    expect(row.seaState).toMatchObject({ code: 'comfortable', label: 'Confortable' });
    expect(row.weather).not.toMatch(/rafales|37 nd|Rude|Hors matrice/i);
    expect(row.weatherFootnote).toContain('Bouée Manche (62001) · 49° 36.000′ N — 001° 36.000′ W · 5.8 km · 23/10/2026 10:15 UTC');
    expect(row.weatherFootnote).toContain(SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(row.weatherFootnote).toContain(`Licence Ouverte 2.0 · ${SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL}`);
    expect({ point, observation }).toEqual(original);
  });
  it('does not expose an annex for drafts or attach measured conditions to a changed waypoint', () => {
    const point = recordedPoint();
    const options = { observations: [recordedObservation()] };
    const draft = passagePlanCellData(point, options);
    expect(draft.observedWeather).toBe('');
    expect(draft.observation).toBeUndefined();
    expect(draft.weatherFootnote).not.toContain(SEA_METEO_FRANCE_OBSERVATIONS_URL);
    const changed = passagePlanCellData({ ...point, eta: '2026-10-23T13:00' }, { ...options, includeObservations: true });
    expect(changed.observation).toBeUndefined();
    expect(changed.observedWeather).not.toContain('4,2 m');
  });

  it('keeps the waypoint position distinct from the nearby marine forecast cell in its recorded sources', () => {
    const point = recordedPoint();
    point.weather!.model!.latitude = 49.7;
    point.weather!.model!.longitude = -1.62;
    const original = structuredClone(point);
    const row = passagePlanCellData(point);
    expect(row.latitude).toBe('49° 39.000′ N');
    expect(row.longitude).toBe('001° 37.200′ W');
    expect(row.weatherFootnote).toContain('Point météo : 49° 42.000′ N — 001° 37.200′ W · à 5,6 km du waypoint. Prévision de maille, position approchée.');
    expect(row.weather).toContain('Houle Hs : 0,60 m');
    expect(point).toEqual(original);
    const stale = passagePlanCellData({ ...point, eta: '2026-10-23T15:00' });
    expect(stale.weather).toContain('non enregistrées');
    expect(stale.weatherFootnote).not.toContain('Point météo');
  });

  it('retains the recorded horizon explanation without claiming a marine location that was not returned', () => {
    const point = recordedPoint();
    point.weather!.wind = null; point.weather!.waves = null;
    point.weather!.windMessage = point.weather!.wavesMessage = 'Aucune prévision disponible à cette ETA : horizon dépassé.';
    delete point.weather!.model;
    const row = passagePlanCellData(point);
    expect(row.weather).toContain('horizon dépassé');
    expect(row.weather).not.toContain('non enregistrées');
    expect(row.weatherFootnote).toContain('Météo-France');
    expect(row.weatherFootnote).not.toContain('Point météo');
  });
});
