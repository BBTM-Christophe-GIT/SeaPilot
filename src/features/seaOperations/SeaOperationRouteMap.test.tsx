import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';

function point(index: number, latitude: string, longitude: string, number = `WP${index}`): SeaOperationWaypoint {
  return { id: `point-${index}`, number, descriptionVhf: `Description du point ${index}`, latitude, longitude, eta: '', ukc: '', denseTraffic: false };
}
const channelRoute = () => [point(1, '49.65', '-1.62'), point(2, '48.36', '-4.53'), point(3, '50.37', '-4.14')];

afterEach(() => { vi.unstubAllGlobals(); });

describe('SeaOperationRouteMap', () => {
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
});
