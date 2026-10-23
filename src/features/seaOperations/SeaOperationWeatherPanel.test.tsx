import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationWeatherPanel } from './SeaOperationWeatherPanel';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { fetchSeaOperationWaypointWeather, type SeaOperationWaypointWeather } from './seaOperationWeatherQueries';

vi.mock('./seaOperationWeatherQueries', () => ({ fetchSeaOperationWaypointWeather: vi.fn() }));
const client = {} as SupabaseClient;
const point = { ...emptySeaOperationWaypoint('p1'), number: '1', latitude: '49.65 N', longitude: '1.62 W', eta: '2026-10-23T12:00' };
const weather: SeaOperationWaypointWeather = { pointId: 'p1', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-23T10:00:00.000Z', fetchedAt: '2026-10-22T12:00:00Z', wind: { time: '2026-10-23T10:00:00Z', speedKnots: 12, gustKnots: 18, directionDegrees: 270 }, waves: { time: '2026-10-23T10:00:00Z', heightMeters: 0.6, periodSeconds: 6, directionDegrees: 220, component: 'swell' }, windMessage: '', wavesMessage: '', attribution: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/en/docs/marine-weather-api' };
const load = async () => { await act(() => new Promise((resolve) => setTimeout(resolve, 750))); };
beforeEach(() => vi.clearAllMocks());
describe('waypoint weather', () => {
  it('loads wind and significant swell for the coordinates and complete ETA', async () => {
    const onWeatherLoaded = vi.fn();
    vi.mocked(fetchSeaOperationWaypointWeather).mockResolvedValue(weather);
    render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[point]} onWeatherLoaded={onWeatherLoaded} />);
    await load();
    expect(fetchSeaOperationWaypointWeather).toHaveBeenCalledWith(client, { projectId: '1', pointId: 'p1', latitude: 49.65, longitude: -1.62, eta: point.eta }, expect.objectContaining({ preview: false }));
    expect(screen.getByText('Houle significative (Hs)')).toBeVisible();
    expect(screen.getByText('Hs 0,6 m · 6 s')).toBeVisible();
    expect(screen.getByText(/12 nd · de 270/)).toBeVisible();
    expect(screen.queryByText(/Rafales/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Heure modèle : 23\/10\/2026 10:00 UTC/)).toHaveLength(2);
    expect(onWeatherLoaded).toHaveBeenCalledWith(weather, { projectId: '1', pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta }, client);
  });
  it('does not request missing coordinates, date or project', async () => {
    const view = render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[{ ...point, eta: '12:00' }, { ...point, id: 'p2', latitude: '' }]} />);
    await load();
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
    expect(screen.getByText(/ETA complète/)).toBeVisible();
    expect(screen.getByText('Renseignez la latitude et la longitude.')).toBeVisible();
    view.rerender(<SeaOperationWeatherPanel client={client} projectId="" waypoints={[point]} />);
    expect(screen.getByText(/Sélectionnez le projet/)).toBeVisible();
  });
  it('keeps wind when swell is not available and exposes network errors', async () => {
    vi.mocked(fetchSeaOperationWaypointWeather).mockResolvedValueOnce({ ...weather, waves: null, wavesMessage: 'Houle hors horizon.' }).mockRejectedValueOnce(new Error('Connexion météo indisponible.'));
    render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[point, { ...point, id: 'p2' }]} />);
    await load();
    expect(screen.getByText('Houle hors horizon.')).toBeVisible();
    expect(screen.getByText(/12 nd · de 270/)).toBeVisible();
    expect(screen.getByText('Connexion météo indisponible.')).toBeVisible();
  });
  it('aborts old coordinates and never displays the old project’s delayed response', async () => {
    const onWeatherLoaded = vi.fn();
    let resolveOld!: (value: SeaOperationWaypointWeather) => void;
    vi.mocked(fetchSeaOperationWaypointWeather).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ ...weather, wind: null, windMessage: 'Nouveau projet.', waves: null });
    const view = render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[point]} onWeatherLoaded={onWeatherLoaded} />);
    await load();
    const signal = vi.mocked(fetchSeaOperationWaypointWeather).mock.calls[0][2]?.signal;
    view.rerender(<SeaOperationWeatherPanel client={client} projectId="2" waypoints={[point]} onWeatherLoaded={onWeatherLoaded} />);
    expect(signal?.aborted).toBe(true);
    await load();
    await act(async () => resolveOld(weather));
    expect(screen.getByText('Nouveau projet.')).toBeVisible();
    expect(screen.queryByText(/12 nd · de 270/)).not.toBeInTheDocument();
    expect(onWeatherLoaded).toHaveBeenCalledTimes(1);
    expect(onWeatherLoaded.mock.calls[0][1].projectId).toBe('2');
  });
  it('shows the recorded forecast without refreshing it and preserves it if explicit refresh fails', async () => {
    const onWeatherLoaded = vi.fn();
    vi.mocked(fetchSeaOperationWaypointWeather).mockRejectedValue(new Error('Réseau indisponible.'));
    render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[{ ...point, weather }]} onWeatherLoaded={onWeatherLoaded} />);
    expect(screen.getByText(/12 nd · de 270/)).toBeVisible();
    await load();
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser la météo' }));
    await load();
    expect(screen.getByText('Réseau indisponible.')).toBeVisible();
    expect(screen.getByText(/12 nd · de 270/)).toBeVisible();
    expect(onWeatherLoaded).not.toHaveBeenCalled();
  });
  it('waits until Passage Plan is opened before making requests', async () => {
    vi.mocked(fetchSeaOperationWaypointWeather).mockResolvedValue(weather);
    const view = render(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[point]} active={false} />);
    await load();
    expect(fetchSeaOperationWaypointWeather).not.toHaveBeenCalled();
    view.rerender(<SeaOperationWeatherPanel client={client} projectId="1" waypoints={[point]} active />);
    await waitFor(() => expect(fetchSeaOperationWaypointWeather).toHaveBeenCalled(), { timeout: 2000 });
  });
});
