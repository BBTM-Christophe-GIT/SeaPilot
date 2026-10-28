import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { emptySeaOperationWaypoint } from './seaOperationModel';

const viewport = { centerLatitude: 47, centerLongitude: -2, longitudeSpan: 30 };
const waypoints = [{ ...emptySeaOperationWaypoint('test-point'), number: '1', latitude: '49.7', longitude: '-1.6' }];
afterEach(() => vi.unstubAllGlobals());

describe('shared navigation category overlay', () => {
  it('replaces the SMDSM reference with an optional vector layer, preserving voyage data and fitting', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const input = structuredClone(waypoints), onGeometry = vi.fn();
    const { container } = render(<SeaOperationRouteMap allowNavigationCategories waypoints={input} viewport={viewport} onGeometry={onGeometry} />);
    const toggle = screen.getByRole('button', { name: 'Catégories de navigation' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Carte officielle des zones radio SMDSM')).not.toBeInTheDocument();
    expect(container.querySelector('.so-navigation-category-layer')).toBeNull();
    const frame = onGeometry.mock.calls.at(-1)![0];
    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(1));
    expect(screen.getByRole('checkbox', { name: /3e catégorie/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /2e catégorie/ })).not.toBeChecked();
    expect(container.querySelector('[data-navigation-category="2"]')).toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('.so-route-map-camera > .so-navigation-category-layer')).toHaveLength(1);
    for (const path of container.querySelectorAll('[data-navigation-category]')) {
      expect(path).toHaveAttribute('fill', 'none');
      expect(path).toHaveAttribute('vector-effect', 'non-scaling-stroke');
      expect(path.getAttribute('d')).not.toMatch(/Z|NaN|Infinity/);
    }
    expect(container.querySelector('.so-navigation-category-layer')).toHaveAttribute('pointer-events', 'none');
    expect(container.querySelectorAll('image, img')).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(input).toEqual(waypoints); expect(onGeometry.mock.calls.at(-1)![0]).toBe(frame);
  });

  it('can select either published limit without hiding route or named work zones', async () => {
    const zones = [{ id: 'z', name: 'Zone de Travaux', vertices: [{ latitude: '49.7', longitude: '-1.6' }, { latitude: '49.8', longitude: '-1.5' }, { latitude: '49.8', longitude: '-1.6' }] }];
    const { container } = render(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} zones={zones} viewport={viewport} />);
    const track = container.querySelector('.so-route-map-points')!.innerHTML;
    fireEvent.click(screen.getByRole('button', { name: 'Catégories de navigation' }));
    await waitFor(() => expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(1));
    fireEvent.click(screen.getByRole('checkbox', { name: /2e catégorie/ }));
    expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: /2e catégorie/ }));
    expect(container.querySelector('[data-navigation-category="2"]')).toBeNull();
    expect(container.querySelector('[data-navigation-category="3"]')).not.toBeNull();
    expect(container.querySelector('.so-route-map-points')!.innerHTML).toBe(track);
    expect(container.querySelector('[data-zone-name="Zone de Travaux"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /3e catégorie/ }));
    expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Sélectionnez une limite à afficher.');
    fireEvent.click(screen.getByRole('button', { name: 'Catégories de navigation' }));
    expect(screen.queryByRole('region', { name: 'Catégories de navigation professionnelles' })).not.toBeInTheDocument();
  });

  it('explains the first category and both second-category conditions without inventing a polygon or classifying waypoints', async () => {
    render(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} viewport={viewport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catégories de navigation' }));
    const legend = screen.getByRole('region', { name: 'Catégories de navigation professionnelles' });
    expect(legend).toHaveTextContent('1re catégorie · sans limite géographique propre');
    expect(within(legend).queryByRole('checkbox', { name: /1re/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Définitions et source du calque'));
    expect(legend).toHaveTextContent('200 NM au plus d’un port ou lieu de mise en sécurité');
    expect(legend).toHaveTextContent('dernier port d’escale du pays de départ');
    expect(legend).toHaveTextContent('600 NM');
    expect(legend).toHaveTextContent('Aucune catégorie n’est attribuée automatiquement');
    expect(within(legend).getByRole('link', { name: 'Article 110.11' })).toHaveAttribute('href', 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000054265707/');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Limites vectorielles SHOM'));
  });

  it('does not infer a navigation category when no published limit crosses the current frame', async () => {
    const { container, rerender } = render(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} viewport={{ centerLatitude: 0, centerLongitude: -140, longitudeSpan: 5 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Catégories de navigation' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Aucune limite SHOM sélectionnée dans ce cadre'));
    expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(0);
    rerender(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} viewport={viewport} />);
    expect(container.querySelectorAll('[data-navigation-category]')).toHaveLength(1);
  });

  it.each([{ compact: true }, { ensureZonesVisible: true }])('keeps document maps free of interactive layer controls (%o)', props => {
    const { container } = render(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} viewport={viewport} {...props} />);
    expect(screen.queryByRole('button', { name: 'Catégories de navigation' })).not.toBeInTheDocument();
    expect(container.querySelector('.so-navigation-category-layer')).toBeNull();
  });

  it('respects a disabled map-control state', () => {
    render(<SeaOperationRouteMap allowNavigationCategories waypoints={waypoints} basemapControlsDisabled />);
    expect(screen.getByRole('button', { name: 'Catégories de navigation' })).toBeDisabled();
  });

  it('does not expose layer controls to the default HTML document map', () => {
    render(<SeaOperationRouteMap waypoints={waypoints} showPlaces showRouteLegs />);
    expect(screen.queryByRole('button', { name: 'Catégories de navigation' })).not.toBeInTheDocument();
  });
});
