import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectLocationEditor } from './ProjectLocationEditor';
import { ProjectLocationOverlayFields } from './ProjectLocationOverlayFields';
import { emptyProjectLocationPlan, parseProjectLocationPlan, type ProjectLocationPlan } from './projectLocation';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import type { SeaOperationMapViewport } from '../seaOperations/seaOperationMapViewport';

const mapMock = vi.hoisted(() => vi.fn());
vi.mock('../seaOperations/SeaOperationWaypointMapEditor', () => ({ SeaOperationWaypointMapEditor: (props: Record<string, unknown>) => { mapMock(props); return <span data-testid="location-map" />; } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
beforeEach(() => mapMock.mockClear());
function Harness({ initial = emptyProjectLocationPlan(), disabled = false }: { initial?: ProjectLocationPlan; disabled?: boolean }) {
  const [plan, setPlan] = useState(initial);
  return <><ProjectLocationEditor value={plan} onChange={setPlan} disabled={disabled} vessel={{ id: 12, maxSpeedKnots: 10, draftMeters: 2 }} /><output data-testid="plan">{JSON.stringify(plan)}</output></>;
}
const current = () => JSON.parse(screen.getByTestId('plan').textContent!) as ProjectLocationPlan;
const map = () => mapMock.mock.calls.at(-1)![0] as { onAddWaypoint: (position: { latitude: number; longitude: number }, port?: { name: string }) => void; drawingMode: string; waypoints: unknown[]; isolatedPoints: unknown[]; zones: unknown[]; etd?: string; eta?: string; maxSpeedKnots?: number | null;
  mapViewport?: SeaOperationMapViewport; onMapViewportChange: (viewport?: SeaOperationMapViewport) => void; departurePort?: string; arrivalPort?: string; disabled: boolean };

describe('ProjectLocationEditor', () => {
  it.each(['map', 'table'])('prefills only a new route departure with the current Paris date and editable time (%s)', source => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T13:27:00Z'));
    render(<Harness />);
    if (source === 'map') act(() => map().onAddWaypoint({ latitude: 0, longitude: 0 }));
    else fireEvent.click(screen.getByRole('button', { name: 'Ajouter un waypoint' }));
    expect(current().etd).toBe('2026-10-27T14:25');
    expect(current().waypoints[0]).toMatchObject({ eta: '2026-10-27T14:25', etaMode: 'automatic' });
    const first = screen.getByRole('row', { name: 'Waypoint 1' });
    expect(within(first).getAllByRole('gridcell', { selected: true })).toHaveLength(1);
    expect(within(first).getByRole('gridcell', { selected: true })).toHaveTextContent('27');
    fireEvent.change(screen.getByLabelText('ETD de la localisation'), { target: { value: '2026-10-28T10:35' } });
    expect(current().waypoints[0].eta).toBe('2026-10-28T10:35');
    fireEvent.change(within(first).getByLabelText('Heures de l’ETA (Paris)'), { target: { value: '11' } });
    expect(current().waypoints[0]).toMatchObject({ eta: '2026-10-28T11:35', etaMode: 'manual' });
    fireEvent.change(screen.getByLabelText('ETD de la localisation'), { target: { value: '2026-10-29T08:00' } });
    expect(current().waypoints[0].eta).toBe('2026-10-28T11:35');
  });

  it('retains an independent manual viewport through state updates and removes the field when automatic framing resumes', () => {
    const initial = { ...emptyProjectLocationPlan(), charts: '7120', points: [{ ...emptySeaOperationWaypoint('point'), latitude: '49.65', longitude: '-1.62' }] };
    const original = structuredClone(initial);
    render(<Harness initial={initial} />);
    const viewport = { centerLatitude: 50.123456789, centerLongitude: -2.123456789, longitudeSpan: .345678901 };
    act(() => map().onMapViewportChange(viewport));
    expect(current()).toEqual({ ...initial, mapViewport: viewport }); expect(map().mapViewport).toEqual(viewport);
    viewport.centerLatitude = 0;
    expect(current().mapViewport!.centerLatitude).toBe(50.123456789);
    act(() => map().onMapViewportChange(undefined));
    expect(current()).not.toHaveProperty('mapViewport'); expect(current()).toEqual(initial); expect(initial).toEqual(original);
  });
  it('ignores callbacks from another project and callbacks retained before entering read-only mode', () => {
    const first = { ...emptyProjectLocationPlan(), charts: 'Projet initial' }, second = { ...emptyProjectLocationPlan(), charts: 'Autre projet' };
    const changed = vi.fn(), viewport = { centerLatitude: 49, centerLongitude: -1, longitudeSpan: 2 };
    const view = render(<ProjectLocationEditor value={first} projectId="1" onChange={changed} />);
    const staleProject = map().onMapViewportChange;
    view.rerender(<ProjectLocationEditor value={second} projectId="2" onChange={changed} departurePort="Brest" arrivalPort="Cherbourg" />);
    act(() => staleProject(viewport)); expect(changed).not.toHaveBeenCalled();
    expect(map()).toMatchObject({ departurePort: 'Brest', arrivalPort: 'Cherbourg', disabled: false });
    const active = map().onMapViewportChange;
    act(() => active(viewport)); expect(changed).toHaveBeenCalledWith({ ...second, mapViewport: viewport });
    changed.mockClear();
    view.rerender(<ProjectLocationEditor value={{ ...second, mapViewport: viewport }} projectId="2" onChange={changed} disabled />);
    act(() => active(undefined)); act(() => map().onMapViewportChange({ ...viewport, longitudeSpan: 10 }));
    expect(changed).not.toHaveBeenCalled(); expect(map().disabled).toBe(true);
  });
  it('keeps an untouched location optional with no inferred departure, PDF annex or network request', () => {
    const changed = vi.fn(), fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<ProjectLocationEditor onChange={changed} />);
    expect(screen.getByLabelText('ETD de la localisation')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Joindre la localisation au PDF' })).not.toBeChecked();
    expect(document.querySelector('[required]')).toBeNull(); expect(changed).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('prepares a route, isolated points and a draft zone simultaneously while retaining exact port names and ETA propagation', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('ETD de la localisation'), { target: { value: '2026-11-03T10:00' } });
    act(() => map().onAddWaypoint({ latitude: 0, longitude: 0 }, { name: 'Port de recette' }));
    act(() => map().onAddWaypoint({ latitude: 0, longitude: .1 }));
    expect(current().waypoints.map(point => point.eta)).toEqual(['2026-11-03T10:00', '2026-11-03T11:00']);
    expect(current().waypoints[0].descriptionVhf).toBe('Port de recette');
    fireEvent.click(screen.getByRole('button', { name: 'Point isolé' }));
    act(() => map().onAddWaypoint({ latitude: 1, longitude: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    act(() => map().onAddWaypoint({ latitude: 2, longitude: 3 }));
    act(() => map().onAddWaypoint({ latitude: 3, longitude: 4 }));
    expect(current().waypoints).toHaveLength(2); expect(current().points).toHaveLength(1); expect(current().zones[0].vertices).toHaveLength(2);
    expect(parseProjectLocationPlan(current())!.zones[0].vertices).toHaveLength(2);
    expect(map().waypoints).toHaveLength(2); expect(map().isolatedPoints).toHaveLength(1); expect(map().zones).toHaveLength(1);
    expect(screen.getByText(/Zone en cours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Joindre la localisation au PDF' })); expect(current().includeInPdf).toBe(true);
  });
  it('seeds the manually added first waypoint, then preserves a manual ETA when ETD changes', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('ETD de la localisation'), { target: { value: '2026-11-03T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un waypoint' }));
    expect(current().waypoints[0]).toMatchObject({ eta: '2026-11-03T10:00', etaMode: 'automatic' });
    const row = within(screen.getByRole('row', { name: 'Waypoint 1' }));
    fireEvent.change(row.getByLabelText('Heures de l’ETA (Paris)'), { target: { value: '14' } });
    expect(current().waypoints[0]).toMatchObject({ eta: '2026-11-03T14:00', etaMode: 'manual' });
    fireEvent.change(screen.getByLabelText('ETD de la localisation'), { target: { value: '2026-11-03T12:00' } });
    expect(current().waypoints[0].eta).toBe('2026-11-03T14:00');
    fireEvent.click(row.getByRole('button', { name: 'Rétablir l’ETA automatique' }));
    expect(current().waypoints[0]).toMatchObject({ eta: '2026-11-03T12:00', etaMode: 'automatic' });
  });
  it('never offers automatic ETA propagation for an isolated point and guards disabled overlay edits', () => {
    const point = { ...emptySeaOperationWaypoint('isolated'), number: '1', eta: '2026-11-03T10:00', etaMode: 'manual' as const };
    const value = { version: 1 as const, points: [point], zones: [{ id: 'zone', name: 'Zone', vertices: [{ latitude: '', longitude: '' }] }] };
    const changed = vi.fn(), original = structuredClone(value);
    const { rerender } = render(<ProjectLocationOverlayFields value={value} onChange={changed} />);
    expect(screen.queryByRole('button', { name: 'Rétablir l’ETA automatique' })).not.toBeInTheDocument();
    rerender(<ProjectLocationOverlayFields value={value} onChange={changed} disabled />);
    expect(screen.getByRole('button', { name: 'Supprimer Point isolé 1' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nom · zone 1'), { target: { value: 'Interdit' } });
    expect(changed).not.toHaveBeenCalled(); expect(value).toEqual(original);
  });
  it('passes retained waypoint departure and arrival to the map even without vessel speed, excluding invalid arrival dates', () => {
    const plan = emptyProjectLocationPlan(); plan.etd = '2026-11-03T08:00';
    plan.waypoints = [{ ...emptySeaOperationWaypoint('start'), latitude: '0', longitude: '0', eta: '2026-11-03T10:00', etaMode: 'manual' },
      { ...emptySeaOperationWaypoint('end'), latitude: '0', longitude: '1', eta: '2026-11-05T13:50', etaMode: 'manual' }];
    const changed = vi.fn(), original = structuredClone(plan);
    const { rerender } = render(<ProjectLocationEditor value={plan} onChange={changed} vessel={{ maxSpeedKnots: null }} />);
    expect(map()).toMatchObject({ etd: '2026-11-03T10:00', eta: '2026-11-05T13:50', maxSpeedKnots: null });
    rerender(<ProjectLocationEditor value={{ ...plan, waypoints: [plan.waypoints[0], { ...plan.waypoints[1], eta: 'date inconnue' }] }} onChange={changed} vessel={{ maxSpeedKnots: null }} />);
    expect(map().eta).toBeUndefined(); expect(plan).toEqual(original); expect(changed).not.toHaveBeenCalled();
  });
});
