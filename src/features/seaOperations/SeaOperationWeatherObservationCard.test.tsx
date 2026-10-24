import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { SeaOperationWeatherObservationCard } from './SeaOperationWeatherObservationCard';
import { SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, SEA_METEO_FRANCE_OBSERVATIONS_URL, type ObservationResult } from './seaOperationWeatherObservationsModel';

const point = { ...emptySeaOperationWaypoint('p1'), number: '3', latitude: '49.65', longitude: '-1.62', eta: '2026-10-23T12:00' };
function observation(): ObservationResult {
  const common = { observedAt: '2026-10-23T10:15:00Z', station: { id: '62001', name: 'Bouée Manche', latitude: 49.6, longitude: -1.6, distanceKm: 5.8 },
    source: { provider: 'Météo-France' as const, sourceUrl: SEA_METEO_FRANCE_OBSERVATIONS_URL, license: 'Licence Ouverte 2.0',
      licenseUrl: SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL, quality: 'not_provided' as const } };
  return { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z',
    wind: { ...common, speedKnots: 12, directionDegrees: 270, instrumentHeightMeters: 3 },
    waves: { ...common, heightMeters: 1.2, periodSeconds: 8, directionDegrees: 250, component: 'total', periodKind: 'peak' }, status: 'recorded', message: '' };
}

describe('measured weather card', () => {
  it('shows the measured total sea and peak period separately from wind at its real instrument height', () => {
    const row = observation();
    const original = structuredClone(row);
    const { container } = render(<SeaOperationWeatherObservationCard point={point} observations={[row]} />);
    expect(screen.getByRole('region', { name: 'Mesures météo du waypoint 3' })).toBeVisible();
    expect(screen.getByText('Hs de mer totale observée')).toBeVisible();
    expect(screen.getByText('1,2 m · période de pic : 8 s')).toBeVisible();
    expect(screen.getByText('Vent mesuré à 3 m')).toBeVisible();
    expect(screen.getByText('12 nd · de 270°')).toBeVisible();
    expect(screen.getAllByText('Bouée Manche · 5,8 km · 23/10/2026 10:15 UTC')).toHaveLength(2);
    expect(screen.getAllByText('49° 36.000′ N — 001° 36.000′ W')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Météo-France' })[0]).toHaveAttribute('href', SEA_METEO_FRANCE_OBSERVATIONS_URL);
    expect(screen.getAllByRole('link', { name: 'Licence Ouverte 2.0' })[0]).toHaveAttribute('href', SEA_METEO_FRANCE_OBSERVATIONS_LICENSE_URL);
    expect(screen.getAllByText(/qualité non renseignée/)).toHaveLength(2);
    expect(screen.getByText(/Annexe mise à jour le 24\/10\/2026 08:00 UTC/)).toBeVisible();
    expect(screen.queryByText(/rafales|10 m|Houle Hs|Confortable|Rude/i)).not.toBeInTheDocument();
    expect(container.querySelector('.so-sea-state')).toBeNull();
    expect(row).toEqual(original);
  });

  it('labels swell and its mean period without converting the measurement to total sea', () => {
    const row = observation();
    row.waves = { ...row.waves!, component: 'swell', periodKind: 'mean' };
    render(<SeaOperationWeatherObservationCard point={point} observations={[row]} />);
    expect(screen.getByText('Houle Hs observée')).toBeVisible();
    expect(screen.getByText('1,2 m · période moyenne : 8 s')).toBeVisible();
    expect(screen.queryByText('Hs de mer totale observée')).not.toBeInTheDocument();
  });

  it('retains zero wind and Hs values and exposes an unknown instrument height', () => {
    const row = observation(); row.wind!.speedKnots = 0; row.wind!.instrumentHeightMeters = null; row.waves!.heightMeters = 0;
    render(<SeaOperationWeatherObservationCard point={point} observations={[row]} />);
    expect(screen.getByText('0 m · période de pic : 8 s')).toBeVisible();
    expect(screen.getByText('0 nd · de 270°')).toBeVisible();
    expect(screen.getByText('Hauteur de mesure non renseignée.')).toBeVisible();
    expect(screen.queryByText(/Vent mesuré à/)).not.toBeInTheDocument();
  });

  it('displays absent components without borrowing forecast values or another point’s observation', () => {
    const row = observation(); row.waves = null;
    const view = render(<SeaOperationWeatherObservationCard point={point} observations={[row]} />);
    expect(screen.getByText('Hs / période : aucune mesure officielle proche disponible.')).toBeVisible();
    expect(screen.getByText('12 nd · de 270°')).toBeVisible();
    view.rerender(<SeaOperationWeatherObservationCard point={point} observations={[{ ...row, pointId: 'another-point' }]} />);
    expect(screen.queryByText('12 nd · de 270°')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Météo-France' })).not.toBeInTheDocument();
    expect(screen.getByText(/mesures officielles.*collectées|Aucune mesure officielle enregistrée/i)).toBeVisible();
  });

  it('shows pending official availability without presenting it as measured conditions', () => {
    const row: ObservationResult = { ...observation(), status: 'pending', wind: null, waves: null, message: 'Publication officielle attendue.' };
    render(<SeaOperationWeatherObservationCard point={point} observations={[row]} />);
    expect(screen.getByText('Publication officielle attendue.')).toBeVisible();
    expect(screen.queryByText(/nd · de/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Météo-France' })).not.toBeInTheDocument();
  });
});
