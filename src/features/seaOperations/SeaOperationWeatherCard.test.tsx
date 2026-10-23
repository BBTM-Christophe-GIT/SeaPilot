import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GOURY_WEATHER_MATRIX } from '../fleet/vesselWeatherMatrix';
import { SeaOperationWeatherCard } from './SeaOperationWeatherCard';
import type { SeaOperationWaypoint } from './seaOperationModel';

function point(): SeaOperationWaypoint {
  return { id: 'p1', number: 'WP1', descriptionVhf: '', latitude: '49.65', longitude: '-1.62', eta: '2026-10-23T12:00', ukc: '', denseTraffic: false,
    weather: { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00Z', fetchedAt: '2026-10-23T04:00:00Z',
      attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api',
      wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12.5, directionDegrees: 270, gustKnots: 99 },
      waves: { time: '2026-10-23T10:00:00Z', heightMeters: .6, periodSeconds: 6, directionDegrees: 220, component: 'swell' }, windMessage: '', wavesMessage: '' } };
}
describe('waypoint weather card', () => {
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
});
