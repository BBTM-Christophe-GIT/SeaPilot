import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import type { SeaOperationDetailedBasemap } from './SeaOperationDetailedBasemap';
import type { ComponentProps } from 'react';

const basemap = vi.hoisted(() => vi.fn());
vi.mock('./SeaOperationDetailedBasemap', async original => ({
  ...await original<typeof import('./SeaOperationDetailedBasemap')>(),
  SeaOperationDetailedBasemap: (props: ComponentProps<typeof SeaOperationDetailedBasemap>) => { basemap(props); return <g data-testid="detailed-coast-layer" />; },
}));
const points = [{ ...emptySeaOperationWaypoint('port'), number: '1', latitude: '49.65', longitude: '-1.62', descriptionVhf: 'Cherbourg' }];
beforeEach(() => { basemap.mockClear(); });

describe('Detailed coast map integration', () => {
  it('keeps autonomous document maps unchanged and does not instantiate a remote basemap', () => {
    render(<SeaOperationRouteMap waypoints={points} ensureZonesVisible />);
    expect(basemap).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Fond côtier détaillé' })).not.toBeInTheDocument();
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeInTheDocument();
  });
  it('uses the detailed vector coast by default on interactive maps and keeps the background in the transformed camera', () => {
    const { container } = render(<SeaOperationWaypointMapEditor readOnly waypoints={points} onAddWaypoint={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Fond côtier détaillé' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.so-route-map-camera [data-testid="detailed-coast-layer"]')).not.toBeNull();
    const camera = container.querySelector('.so-route-map-camera')!;
    expect([...camera.children].indexOf(container.querySelector('.so-route-map-land')!)).toBeLessThan([...camera.children].indexOf(screen.getByTestId('detailed-coast-layer')));
    expect(screen.getByRole('button', { name: 'Zone de navigation de la carte' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(screen.getByRole('link', { name: 'OpenFreeMap' })).toHaveAttribute('href', 'https://openfreemap.org/');
    expect(screen.getByRole('link', { name: 'OpenMapTiles' })).toBeInTheDocument();
  });
  it('lets the user switch to a simplified offline map without changing the recorded points', () => {
    const source = structuredClone(points), onAdd = vi.fn();
    render(<SeaOperationWaypointMapEditor readOnly waypoints={points} onAddWaypoint={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fond côtier détaillé' }));
    expect(screen.queryByTestId('detailed-coast-layer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fond côtier détaillé' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Fond Natural Earth · Tracé indicatif')).toBeInTheDocument();
    expect(points).toEqual(source); expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fond côtier détaillé' }));
    expect(screen.getByTestId('detailed-coast-layer')).toBeInTheDocument();
  });
  it('retains geometry and editing controls when the detailed provider is unavailable', () => {
    render(<SeaOperationWaypointMapEditor waypoints={points} onAddWaypoint={vi.fn()} />);
    act(() => (basemap.mock.lastCall![0] as ComponentProps<typeof SeaOperationDetailedBasemap>).onStatusChange!('unavailable'));
    expect(screen.getByText(/Fond détaillé indisponible, fond simplifié affiché/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Placer les waypoints' }));
    expect(screen.getByRole('button', { name: 'Afficher la carte en plein écran' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sélectionner le waypoint 1' })).toBeInTheDocument();
  });
  it('does not enable network backgrounds in compact exports even when the interactive option is set', () => {
    render(<SeaOperationRouteMap waypoints={points} compact allowDetailedBasemap />);
    expect(basemap).not.toHaveBeenCalled(); expect(screen.queryByTestId('detailed-coast-layer')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'OpenFreeMap' })).not.toBeInTheDocument();
  });
});
