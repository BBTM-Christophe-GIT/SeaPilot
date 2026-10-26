import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SeaOperationWeatherCard } from './SeaOperationWeatherCard';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';

function point(): SeaOperationWaypoint {
  return { id: 'p1', number: 'WP1', descriptionVhf: '', latitude: '49.65', longitude: '-1.62', eta: '2026-10-23T12:00', ukc: '', denseTraffic: false,
    weather: { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-23T04:00:00Z',
      attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
      wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12.5, directionDegrees: 270, gustKnots: 99 },
      waves: { time: '2026-10-23T10:00:00Z', heightMeters: .6, periodSeconds: 6, directionDegrees: 220, component: 'swell' }, windMessage: '', wavesMessage: '' } };
}

function observed(): ObservationResult {
  const common = { observedAt: '2026-10-23T10:15:00Z', station: { id: '62001', name: 'Bouée Manche', latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z',
    wind: { ...common, speedKnots: 14, directionDegrees: 280, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 1.2, periodSeconds: 8, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
}
describe('waypoint weather card', () => {
  it('shows acquisition and prerequisite errors directly beside the waypoint', () => {
    const record = point(); record.weather = undefined;
    const view = render(<SeaOperationWeatherCard point={record} requestStatus={{ loading: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des prévisions météo…');
    view.rerender(<SeaOperationWeatherCard point={record} requestStatus={{ loading: false, error: 'Sélectionnez un projet du planning pour consulter la météo.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Sélectionnez un projet du planning');
    expect(screen.queryByText(/Prévisions météo non enregistrées/)).not.toBeInTheDocument();
  });
  it('keeps the saved metrics when a refresh fails and shows the actual nearby model location', () => {
    const record = point();
    record.weather!.model = { name: 'MFWAM', referenceTime: '2026-10-23T00:00:00Z', latitude: 49.675, longitude: -1.625 };
    const { container } = render(<SeaOperationWeatherCard point={record} requestStatus={{ loading: false, error: 'Connexion météo indisponible.' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Les prévisions déjà enregistrées sont conservées.');
    expect(container.textContent).toContain('0,60 m');
    expect(container.textContent).toContain('12,5 nd');
    expect(container.textContent).toContain('Point météo : 49° 40.500′ N — 001° 37.500′ W · à 2,8 km du waypoint.');
  });
  it('labels the swell period and Hs explicitly and keeps mean wind without gusts', () => {
    const { container } = render(<SeaOperationWeatherCard point={point()} matrix={GOURY_WEATHER_MATRIX} />);
    expect(screen.getByText('Période')).toBeVisible();
    expect(screen.getByText('Houle Hs')).toBeVisible();
    expect(screen.getByText('Confortable')).toBeVisible();
    expect(container.textContent).toContain('0,60 m');
    expect(container.textContent).toContain('6 s');
    expect(container.textContent).toContain('12,5 nd');
    expect(container.textContent).toContain('Modèle houle : 23/10');
    expect(container.textContent).not.toMatch(/rafale|99/);
  });
  it('changes the textual indicator when the predicted sea state crosses a matrix boundary', () => {
    const record = point(); record.weather!.waves!.heightMeters = 2.2; record.weather!.waves!.periodSeconds = 4;
    render(<SeaOperationWeatherCard point={record} matrix={GOURY_WEATHER_MATRIX} />);
    expect(screen.getByText('Rude')).toHaveClass('is-critical');
  });
  it('shows unavailable data after coordinates change instead of reusing an obsolete forecast', () => {
    const record = point(); record.longitude = '-4.53';
    const { container } = render(<SeaOperationWeatherCard point={record} matrix={GOURY_WEATHER_MATRIX} />);
    expect(screen.getByText('Hs / période indisponible')).toBeVisible();
    expect(container.textContent).toContain('Prévisions météo non enregistrées');
    expect(container.textContent).not.toContain('0,60');
  });
  it('does not apply the GOURY reference to a vessel with no configuration', () => {
    render(<SeaOperationWeatherCard point={point()} />);
    expect(screen.queryByText('Matrice non renseignée')).not.toBeInTheDocument();
    expect(screen.queryByText('Confortable')).not.toBeInTheDocument();
  });
  it('hides the indicator for an empty matrix or an undefined cell without hiding weather', () => {
    const matrix = structuredClone(GOURY_WEATHER_MATRIX);
    matrix.levels[1][1] = null;
    const { container } = render(<SeaOperationWeatherCard point={point()} matrix={matrix} />);
    expect(container.querySelector('.so-sea-state')).toBeNull();
    expect(container.textContent).toContain('0,60 m');
    expect(container.textContent).toContain('6 s');
  });
  it('can show a weather card without duplicating the dedicated living-conditions indicator', () => {
    const { container } = render(<SeaOperationWeatherCard point={point()} matrix={GOURY_WEATHER_MATRIX} showIndicator={false} />);
    expect(container.querySelector('.so-sea-state')).toBeNull();
    expect(container.textContent).toContain('0,60 m');
    expect(container.textContent).toContain('6 s');
  });
  it('provides a dedicated editor variant while retaining weather, assessment, UTC times and source', () => {
    const { container } = render(<SeaOperationWeatherCard point={point()} matrix={GOURY_WEATHER_MATRIX} compact variant="editor" />);
    expect(container.firstElementChild).toHaveClass('is-editor', 'is-compact');
    expect(container.firstElementChild).not.toHaveClass('is-unavailable');
    expect(screen.getByText('Confortable')).toHaveClass('is-success');
    for (const label of ['0,60 m', '6 s', '12,5 nd', '220°', '270°', 'ETA : 23/10', 'Open-Meteo', 'Modèle houle', 'Modèle vent', 'UTC']) expect(container.textContent).toContain(label);
    expect(container.textContent).not.toMatch(/rafale|99/);
  });
  it('marks missing editor forecasts without retaining stale metrics or inventing a sea-state level', () => {
    const record = point(); record.eta = '2026-10-23T13:00';
    const { container } = render(<SeaOperationWeatherCard point={record} matrix={GOURY_WEATHER_MATRIX} variant="editor" />);
    expect(container.firstElementChild).toHaveClass('is-editor', 'is-unavailable');
    expect(container.textContent).toContain('Prévisions météo non enregistrées pour cette position et cette ETA.');
    expect(container.textContent).not.toMatch(/Confortable|0,60|12,5/);
    expect(container.querySelector('.so-waypoint-weather-metrics')).toBeNull();
  });
  it('keeps the existing printable compact card outside the editor variant', () => {
    const { container } = render(<SeaOperationWeatherCard point={point()} compact />);
    expect(container.firstElementChild).toHaveClass('is-compact');
    expect(container.firstElementChild).not.toHaveClass('is-editor');
    expect(screen.getByText('État de mer prévu')).toBeVisible();
  });
});

describe('saved waypoint weather comparison', () => {
  it('compares the immutable signed forecast with nearby official measurements and collapses their provenance', () => {
    const record = point(); const observation = observed(); const original = structuredClone({ record, observation });
    const { container } = render(<SeaOperationWeatherCard point={record} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observation]} matrix={GOURY_WEATHER_MATRIX} />);
    expect(screen.getByRole('region', { name: 'Comparaison météo du waypoint WP1' })).toBeVisible();
    const predicted = screen.getByRole('region', { name: 'Données prévues à la signature du Capitaine' });
    const measured = screen.getByRole('region', { name: 'Données réelles à l’ETA' });
    expect(predicted.textContent).toContain('Prévision figée');
    expect(predicted.textContent).toContain('Signature : 23/10/2026 06:00 UTC');
    for (const label of ['0,60 m', '6 s', '12,5 nd', '220°', '270°', 'Hs · houle', 'Période Tm']) expect(predicted.textContent).toContain(label);
    for (const label of ['1,20 m', '8 s', '14 nd', '250°', '280°', 'Hs · mer totale', 'Période Tp', '23/10/2026 10:15 UTC', '5,8 km', 'mesuré à 3 m']) expect(measured.textContent).toContain(label);
    expect(screen.getByText(/À lire séparément/)).toHaveTextContent('houle prévue et mer totale mesurée ; période moyenne Tm et période de pic Tp');
    for (const details of container.querySelectorAll('details')) expect(details).not.toHaveAttribute('open');
    fireEvent.click(within(measured).getByText('Stations, sources et qualité'));
    expect(measured.querySelector('details')).toHaveAttribute('open');
    expect(within(measured).getAllByText('Bouée Manche · 5,8 km · 23/10/2026 10:15 UTC')[0]).toBeVisible();
    expect(within(measured).getAllByRole('link', { name: 'Météo-France' })[0]).toHaveAttribute('href', SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(within(measured).getAllByRole('link', { name: 'Licence Ouverte 2.0' })[0]).toHaveAttribute('href', SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL);
    expect(container.textContent).not.toMatch(/rafale|99|réanalyse/i);
    expect({ record, observation }).toEqual(original);
  });
  it('identifies an unsigned saved draft without claiming a captain signature', () => {
    const { container } = render(<SeaOperationWeatherCard point={point()} variant="comparison" observations={[observed()]} />);
    expect(screen.getByRole('region', { name: 'Prévisions du brouillon' })).toHaveTextContent('Non signé');
    expect(container.textContent).toContain('Données de l’enregistrement sauvegardé.');
    expect(container.textContent).not.toContain('Données prévues à la signature du Capitaine');
    expect(container.textContent).not.toContain('Prévision figée');
    const measured = screen.getByRole('region', { name: 'Données réelles à l’ETA' });
    expect(measured).toHaveTextContent('En attente');
    expect(measured).toHaveTextContent('après la signature du Capitaine et le passage à l’ETA');
    expect(measured.textContent).not.toMatch(/14 nd|1,20 m|Aucune mesure/);
  });
  it('does not claim a later forecast as the forecast retained at signature', () => {
    const record = point(); record.weather!.fetchedAt = '2026-10-23T07:00:00Z';
    render(<SeaOperationWeatherCard point={record} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observed()]} />);
    const predicted = screen.getByRole('region', { name: 'Données prévues à la signature du Capitaine' });
    expect(predicted).toHaveTextContent('Aucune prévision conservée à la signature pour ce waypoint.');
    expect(predicted.textContent).not.toContain('12,5 nd');
    expect(screen.getByRole('region', { name: 'Données réelles à l’ETA' })).toHaveTextContent('14 nd');
  });
  it('never substitutes another position or ETA or borrows a missing measurement from the forecast', () => {
    const record = point(); record.eta = '2026-10-23T13:00';
    const view = render(<SeaOperationWeatherCard point={record} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observed()]} />);
    expect(view.container.textContent).not.toMatch(/0,60|1,20|12,5 nd|14 nd/);
    const observation = observed(); observation.waves = null;
    view.rerender(<SeaOperationWeatherCard point={point()} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observation]} />);
    const measured = screen.getByRole('region', { name: 'Données réelles à l’ETA' });
    expect(measured).toHaveTextContent('Hs et période : aucune mesure officielle proche disponible.');
    expect(measured).toHaveTextContent('14 nd');
    expect(measured.textContent).not.toMatch(/0,60|1,20|8 s|Hs · houle/);
  });
  it('shows pending official availability without displaying hypothetical actual values', () => {
    const pending: ObservationResult = { ...observed(), status: 'pending', wind: null, waves: null, message: 'Publication officielle attendue.' };
    render(<SeaOperationWeatherCard point={point()} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[pending]} />);
    const measured = screen.getByRole('region', { name: 'Données réelles à l’ETA' });
    expect(measured).toHaveTextContent('En attente');
    expect(measured).toHaveTextContent('Publication officielle attendue.');
    expect(measured.querySelector('dl')).toBeNull();
  });
  it('keeps zero measurements and labels swell/mean periods only when actually measured', () => {
    const observation = observed();
    observation.waves = { ...observation.waves!, heightMeters: 0, component: 'swell', periodKind: 'mean' };
    observation.wind = { ...observation.wind!, speedKnots: 0, instrumentHeightMeters: 10 };
    render(<SeaOperationWeatherCard point={point()} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observation]} />);
    const measured = screen.getByRole('region', { name: 'Données réelles à l’ETA' });
    expect(measured).toHaveTextContent('0,00 m'); expect(measured).toHaveTextContent('0 nd');
    expect(measured).toHaveTextContent('Hs · houle'); expect(measured).toHaveTextContent('Période Tm');
    expect(measured.textContent).not.toMatch(/Hs · mer totale|Période Tp/);
    expect(screen.queryByText(/À lire séparément/)).not.toBeInTheDocument();
  });
  it('rejects nonofficial observations and keeps default export markup outside the comparison variant', () => {
    const observation = observed(); observation.wind!.source.sourceUrl = 'https://unofficial.example/reanalysis';
    const view = render(<SeaOperationWeatherCard point={point()} variant="comparison" validatedAt="2026-10-23T06:00:00Z" observations={[observation]} />);
    expect(screen.getByRole('region', { name: 'Données réelles à l’ETA' }).textContent).not.toMatch(/14 nd|1,20/);
    view.rerender(<SeaOperationWeatherCard point={point()} compact validatedAt="2026-10-23T06:00:00Z" showObservations observations={[observed()]} />);
    expect(view.container.querySelector('.is-comparison')).toBeNull();
    expect(view.container.querySelector('.so-weather-observations')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Données réelles à l’ETA' })).not.toBeInTheDocument();
  });
});
