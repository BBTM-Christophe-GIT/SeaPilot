import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { SEA_OPERATION_MAP_PORT_CATALOG } from './seaOperationMapPlaces';
import { formatProjectPort } from '../projects/projectPorts';

function point(index: number, latitude: string, longitude: string, number = `WP${index}`): SeaOperationWaypoint {
  return { id: `point-${index}`, number, descriptionVhf: `Description du point ${index}`, latitude, longitude, eta: '', ukc: '', denseTraffic: false };
}
const channelRoute = () => [point(1, '49.65', '-1.62'), point(2, '48.36', '-4.53'), point(3, '50.37', '-4.14')];

afterEach(() => { vi.unstubAllGlobals(); });

describe('SeaOperationRouteMap', () => {
  it('shows leg distances, elapsed duration and Paris ETD/estimated ETA without changing waypoint ETA', () => {
    const points = [point(1, '0', '0'), point(2, '0', '1')]; points[1].eta = '2026-10-27T19:15';
    const original = structuredClone(points);
    const { container } = render(<SeaOperationRouteMap waypoints={points} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" />);
    expect(screen.getByRole('img', { name: 'Waypoint 1 vers 2 : 60,0 NM · 07:30' })).toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('60,0 NM'); expect(summary).toHaveTextContent('07:30');
    expect(summary).toHaveTextContent('27/10/2026 – 10:00'); expect(summary).toHaveTextContent('27/10/2026 – 17:30');
    expect(summary).toHaveTextContent('ETA estimée');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('Estimations à 8 nd');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('60 % de la vitesse maximale');
    expect(points).toEqual(original);
  });

  it('uses a compact leg list on narrow maps and reports unavailable duration/ETA instead of inventing speed', () => {
    let resize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe() {} disconnect() {} });
    const { container } = render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs etd="2026-10-27T10:00" />);
    act(() => resize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(container.querySelector('.so-route-map-leg-labels')).toBeNull();
    expect(screen.getByRole('list', { name: 'Distances et durées entre les waypoints' })).toHaveTextContent('1 → 2');
    expect(screen.getByRole('list', { name: 'Distances et durées entre les waypoints' })).toHaveTextContent('60,0 NM · Durée indisponible');
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('ETD27/10/2026 – 10:00'); expect(summary).toHaveTextContent('ETA estiméeIndisponible');
    expect(container.querySelector('.so-route-map-leg-summary')).toHaveTextContent('durée indisponible sans vitesse maximale du navire');
    expect(summary.closest('.so-route-map-frame')).toBeNull();
    expect(summary.parentElement).toBe(screen.getByRole('figure'));
    expect(summary).toHaveClass('is-below-map');
    expect(screen.getAllByRole('complementary', { name: 'Estimation du parcours' })).toHaveLength(1);
  });

  it('retains the supplied arrival time instead of replacing a manually adjusted final waypoint ETA', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" eta="2026-10-27T19:15" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('09:15'); expect(summary).toHaveTextContent('60,0 NM');
    expect(summary).toHaveTextContent('ETA arrivée27/10/2026 – 19:15');
    expect(summary).not.toHaveTextContent('17:30');
  });

  it('shows constant-speed transit duration before departure is entered without inventing dates', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('60,0 NM'); expect(summary).toHaveTextContent('07:30');
    expect(summary).toHaveTextContent('Durée estimée à vitesse constante.');
    expect(summary).toHaveTextContent('ETDÀ renseigner'); expect(summary).toHaveTextContent('ETA estiméeIndisponible');
    expect(summary.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('keeps an invalid retained arrival unavailable while clearly qualifying the transit-duration fallback', () => {
    render(<SeaOperationRouteMap waypoints={[point(1, '0', '0'), point(2, '0', '1')]} showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" eta="2026-10-27T09:00" />);
    const summary = screen.getByRole('complementary', { name: 'Estimation du parcours' });
    expect(summary).toHaveTextContent('07:30'); expect(summary).toHaveTextContent('Durée estimée à vitesse constante.');
    expect(summary).toHaveTextContent('ETA arrivéeIndisponible'); expect(summary).not.toHaveTextContent('17:30');
  });

  it('offers only genuinely located regional ports as explicit choices and keeps compact export free of new controls', () => {
    const select = vi.fn();
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} showPlaces viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} onPortSelect={select} />);
    fireEvent.click(screen.getByText(/^Ports dans cette région/));
    const port = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Port de Barfleur')!;
    fireEvent.click(screen.getByRole('button', { name: `Choisir le port ${formatProjectPort(port.port)}` }));
    expect(select).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ key: port.key, location: port.location })]);
    const unlocated = screen.queryByRole('list', { name: 'Ports rattachés sans position propre' });
    if (unlocated) expect(within(unlocated).queryByRole('button')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={channelRoute()} compact showPlaces showRouteLegs maxSpeedKnots={12} etd="2026-10-27T10:00" onPortSelect={select} />);
    expect(container.querySelector('.so-route-map-voyage-summary')).toBeNull();
    expect(container.querySelector('.so-route-map-leg-labels')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('draws a local north-up route with ordered markers, directions, coasts and attribution', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { container } = render(<SeaOperationRouteMap waypoints={channelRoute()} />);
    expect(screen.getByRole('heading', { name: 'Carte du parcours' })).toBeVisible();
    expect(screen.getByText('3 points géolocalisés')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Carte du parcours · 3 points géolocalisés' })).toBeInTheDocument();
    expect([...container.querySelectorAll('.so-route-map-point')].map((marker) => marker.getAttribute('data-point-indices'))).toEqual(['1', '2', '3']);
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(2);
    expect(container.querySelectorAll('.so-route-map-direction')).toHaveLength(2);
    expect(container.querySelectorAll('.so-route-map-land polygon').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.so-route-map-grid line').length).toBeGreaterThan(0);
    expect(container.querySelector('.so-route-map-point.is-start')).toHaveAttribute('data-point-indices', '1');
    expect(container.querySelector('.so-route-map-point.is-end')).toHaveAttribute('data-point-indices', '3');
    expect(screen.getByText('N', { selector: 'text' })).toBeInTheDocument();
    expect(screen.getByText('Départ')).toBeVisible();
    expect(screen.getByText('Arrivée')).toBeVisible();
    expect(screen.getByText('Numéros : ordre du tableau')).toBeVisible();
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeVisible();
    expect(container.querySelector('.so-sea-state')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('omits invalid positions explicitly and leaves a break instead of connecting across a missing point', () => {
    const points = channelRoute(); points[1].latitude = '';
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(screen.getByText('2 points géolocalisés')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 point sans coordonnées valides n’est pas représenté');
    expect([...container.querySelectorAll('.so-route-map-point')].map((marker) => marker.getAttribute('data-point-indices'))).toEqual(['1', '3']);
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(0);
  });

  it('keeps true table ordinals and does not invent a departure when the first position is missing', () => {
    const points = channelRoute(); points[0].longitude = 'invalide';
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(container.querySelector('.so-route-map-point.is-start')).toBeNull();
    expect(container.querySelector('.so-route-map-point.is-end')).toHaveAttribute('data-point-indices', '3');
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(1);
  });

  it('combines coincident departure and arrival ordinals without hiding either point', () => {
    const points = channelRoute(); points[2] = point(3, points[0].latitude, points[0].longitude, 'Retour au port');
    const { container } = render(<SeaOperationRouteMap waypoints={points} />);
    expect(screen.getByText('3 points géolocalisés')).toBeVisible();
    expect(container.querySelectorAll('.so-route-map-point')).toHaveLength(2);
    const shared = container.querySelector('.so-route-map-point[data-point-indices="1/3"]');
    expect(shared).toHaveClass('is-start', 'is-end');
    expect(shared).toHaveTextContent('1/3');
    expect(shared?.querySelector('title')).toHaveTextContent('WP1');
    expect(shared?.querySelector('title')).toHaveTextContent('Retour au port');
  });

  it('renders a coordinate prompt for an empty route and a single point without an arrival ring', () => {
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={[]} />);
    expect(screen.getByText('0 points géolocalisés')).toBeVisible();
    expect(screen.getByText(/Renseignez une latitude et une longitude valides/)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={[point(1, '49.65', '-1.62')]} />);
    expect(screen.getByText('1 point géolocalisé')).toBeVisible();
    expect(container.querySelector('.so-route-map-point.is-start')).toBeInTheDocument();
    expect(container.querySelector('.so-route-map-point.is-end')).toBeNull();
    expect(container.querySelectorAll('.so-route-map-track line')).toHaveLength(0);
  });

  it('refreshes recorded positions and labels without mutating the source route', () => {
    const points = channelRoute().map((value) => Object.freeze(value));
    Object.freeze(points);
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={points} />);
    const initial = container.querySelector('.so-route-map-point[data-point-indices="1"]')?.getAttribute('transform');
    rerender(<SeaOperationRouteMap waypoints={[{ ...points[0], latitude: '52.5', number: 'Nouveau point' }, points[1], points[2]]} />);
    expect(container.querySelector('.so-route-map-point[data-point-indices="1"]')?.getAttribute('transform')).not.toBe(initial);
    expect(container.querySelector('.so-route-map-point[data-point-indices="1"] title')).toHaveTextContent('Nouveau point');
    expect(points[0].latitude).toBe('49.65');
  });

  it('adapts the plotting coordinates to a narrow container and disconnects its observer', () => {
    let onResize!: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { onResize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const { unmount } = render(<SeaOperationRouteMap waypoints={channelRoute()} />);
    act(() => onResize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 330 280');
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('offers the same route and attribution in the compact print layout', () => {
    const { container } = render(<SeaOperationRouteMap waypoints={channelRoute()} compact />);
    expect(screen.getByRole('figure')).toHaveClass('is-compact');
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
    expect(container.querySelectorAll('.so-route-map-point')).toHaveLength(3);
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeInTheDocument();
  });

  it('accepts a locked empty viewport and an opt-in overlay without adding built-in controls', () => {
    const report = vi.fn();
    render(<SeaOperationRouteMap waypoints={[]} viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} onGeometry={report} renderOverlay={(geometry) => <text>Centre {geometry.viewport?.centerLongitude}</text>} />);
    expect(screen.getByRole('group', { name: 'Carte du parcours · 0 points géolocalisés' })).toBeInTheDocument();
    expect(screen.getByText('Centre -3')).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ width: 900, viewport: { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores placement overlays and locked viewports in compact print mode', () => {
    const overlay = vi.fn();
    render(<SeaOperationRouteMap waypoints={channelRoute()} compact viewport={{ centerLatitude: 0, centerLongitude: 0, longitudeSpan: 16 }} renderOverlay={overlay} />);
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(overlay).not.toHaveBeenCalled();
  });

  it('uses both exact measured dimensions when filling the available map frame', () => {
    let onResize!: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { onResize = callback; } observe() {} disconnect() {} });
    const report = vi.fn();
    render(<SeaOperationRouteMap waypoints={channelRoute()} fillAvailableSpace onGeometry={report} />);
    act(() => onResize([{ contentRect: { width: 1440.5, height: 681.25 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 1440.5 681.25');
    expect(screen.getByRole('figure')).toHaveClass('is-filling');
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1440.5, height: 681.25 }));
  });

  it('keeps compact print dimensions independent of a fullscreen frame request', () => {
    render(<SeaOperationRouteMap waypoints={channelRoute()} compact fillAvailableSpace />);
    expect(screen.getByRole('figure')).not.toHaveClass('is-filling');
    expect(screen.getByRole('img')).toHaveAttribute('viewBox', '0 0 900 220');
  });

  it('shows cities, port markers and the complete regional project-port list only when explicitly enabled', () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { container } = render(<SeaOperationRouteMap waypoints={[]} showPlaces viewport={{ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 }} />);
    expect(container.querySelector('.so-route-map-cities')).toHaveTextContent('Paris');
    expect(container.querySelectorAll('.so-route-map-port-dot').length).toBeGreaterThan(30);
    expect(container.querySelector('.so-route-map-port title')).toHaveTextContent(/point de référence indicatif/);
    const list = screen.getByRole('list', { name: 'Ports du catalogue dans le cadre affiché', hidden: true });
    expect(within(list).getAllByRole('listitem', { hidden: true }).length).toBeGreaterThan(30);
    expect(list).toHaveTextContent(/Cherbourg/);
    expect(screen.getByText(/Catalogue partagé avec Projets/)).toBeInTheDocument();
    expect(screen.getByText(/Couverture partielle et précision non garantie/)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('prints no new places or coordinate labels even when editor-only options are requested', () => {
    const { container, rerender } = render(<SeaOperationRouteMap waypoints={channelRoute()} showPlaces showWaypointCoordinates compact />);
    expect(container.querySelector('.so-route-map-cities')).not.toBeInTheDocument();
    expect(container.querySelector('.so-route-map-places')).not.toBeInTheDocument();
    expect(container.querySelector('.so-route-map-point-coordinates')).not.toBeInTheDocument();
    rerender(<SeaOperationRouteMap waypoints={channelRoute()} />);
    expect(container.querySelector('.so-route-map-cities')).not.toBeInTheDocument();
  });

  it('labels marker positions in degrees and minutes using original table indices after missing rows', () => {
    const points = channelRoute(); points[0].latitude = '';
    const { container } = render(<SeaOperationRouteMap waypoints={points} showWaypointCoordinates />);
    const labels = container.querySelectorAll('.so-route-map-point-coordinates'); expect(labels).toHaveLength(2);
    expect(container.querySelector('[data-point-indices="2"] .so-route-map-point-coordinates')).toHaveTextContent('48° 21.600′ N');
    expect(container.querySelector('[data-point-indices="2"] .so-route-map-point-coordinates')).toHaveTextContent('004° 31.800′ W');
    expect(container.querySelector('[data-point-indices="3"] .so-route-map-point-coordinates')).toHaveTextContent('50° 22.200′ N');
    expect(points[1].latitude).toBe('48.36');
  });
});
