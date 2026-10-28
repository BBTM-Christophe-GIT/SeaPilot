import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { SeaOperationWaypointMapEditor } from '../seaOperations/SeaOperationWaypointMapEditor';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { ProjectDetailMap } from './ProjectDetailMap';
import { emptyProjectLocationPlan, type ProjectLocationPlan } from './projectLocation';
import type { ProjectRecord } from './projectQueries';

const map = vi.hoisted(() => vi.fn());
vi.mock('../seaOperations/SeaOperationWaypointMapEditor', () => ({
  SeaOperationWaypointMapEditor: (props: Record<string, unknown>) => { map(props); return <div data-testid="project-map" />; },
}));
beforeEach(() => map.mockClear());
const project = (patch: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 144, primaryVesselId: 12, deliveryPort: 'Dieppe', redeliveryPort: 'Cherbourg', updatedAt: '2026-10-28T08:00:00Z', ...patch,
} as ProjectRecord);
const currentMap = () => map.mock.calls.at(-1)![0] as ComponentProps<typeof SeaOperationWaypointMapEditor>;
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Modifier la carte' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la carte' }));
function planFixture(): ProjectLocationPlan {
  return { ...emptyProjectLocationPlan(), etd: '2026-10-29T08:00', charts: '7000 - 7001', includeInPdf: true,
    waypoints: [{ ...emptySeaOperationWaypoint('route-1'), number: '1', latitude: '49.65', longitude: '-1.62', eta: '2026-10-29T08:00', etaMode: 'manual' },
      { ...emptySeaOperationWaypoint('route-2'), number: '2', latitude: '49.7', longitude: '-1.5', eta: '2026-10-29T09:00', etaMode: 'manual' }],
    points: [{ ...emptySeaOperationWaypoint('isolated-1'), number: 'OSS', latitude: '49.72', longitude: '-1.4', isolatedPointIcon: 'platform' }],
    zones: [{ id: 'works', name: 'Travaux', vertices: [{ latitude: '49.7', longitude: '-1.4' }, { latitude: '49.8', longitude: '-1.4' }, { latitude: '49.7', longitude: '-1.3' }] }] };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(accept => { resolve = accept; }); return { promise, resolve }; }

describe('ProjectDetailMap', () => {
  it('shows every saved layer even without a PDF appendix, and starts with automatic framing', () => {
    const first = { ...emptySeaOperationWaypoint('first'), number: '1', latitude: '50', longitude: '1', eta: '2026-10-28T08:00' };
    const last = { ...emptySeaOperationWaypoint('last'), number: '2', latitude: '49', longitude: '-1', eta: '2026-10-28T18:00' };
    const plan = { ...emptyProjectLocationPlan(), waypoints: [first, last], points: [{ ...emptySeaOperationWaypoint('isolated'), number: 'OSS' }],
      zones: [{ id: 'works', name: 'Zone de travaux', vertices: [{ latitude: '50', longitude: '1' }] }],
      mapViewport: { centerLatitude: 0, centerLongitude: 0, longitudeSpan: 180 } };
    const original = structuredClone(plan);
    render(<ProjectDetailMap project={project({ locationPlan: plan })} maxSpeedKnots={12} />);
    const props = map.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ readOnly: true, waypoints: plan.waypoints, isolatedPoints: plan.points, zones: plan.zones,
      departurePort: 'Dieppe', arrivalPort: 'Cherbourg', etd: first.eta, eta: last.eta, maxSpeedKnots: 12 });
    expect(props).not.toHaveProperty('mapViewport');
    expect(props).not.toHaveProperty('onMapViewportChange');
    expect(props).not.toHaveProperty('onMoveWaypoint');
    expect(props).not.toHaveProperty('onDeleteWaypoint');
    expect(props).not.toHaveProperty('onMoveIsolatedPoint');
    expect(props).not.toHaveProperty('onMoveZoneVertex');
    props.onAddWaypoint({ latitude: 10, longitude: 20 });
    expect(plan).toEqual(original);
  });

  it('shows an empty state without introducing a location or departure time', () => {
    const record = project();
    render(<ProjectDetailMap project={record} />);
    expect(screen.getByText('Aucun waypoint, point isolé ou zone enregistré pour ce projet.')).toBeVisible();
    expect(map.mock.calls.at(-1)![0]).toMatchObject({ readOnly: true, waypoints: [], isolatedPoints: [], zones: [], etd: '' });
    expect(record).not.toHaveProperty('locationPlan');
  });

  it('uses only the newly selected project layers and its ports', () => {
    const plan = { ...emptyProjectLocationPlan(), points: [{ ...emptySeaOperationWaypoint('offshore'), number: 'OSS' }] };
    const view = render(<ProjectDetailMap project={project({ locationPlan: plan })} />);
    view.rerender(<ProjectDetailMap project={project({ id: 287, deliveryPort: 'Brest', redeliveryPort: 'Lorient' })} />);
    expect(map.mock.calls.at(-1)![0]).toMatchObject({ waypoints: [], isolatedPoints: [], zones: [], departurePort: 'Brest', arrivalPort: 'Lorient' });
    expect(screen.getByText('Aucun waypoint, point isolé ou zone enregistré pour ce projet.')).toBeVisible();
  });

  it.each([{}, { canManage: false }, { canManage: true }])('keeps browsing read-only without both permission and save capability (%j)', props => {
    render(<ProjectDetailMap project={project()} {...props} />);
    expect(screen.queryByRole('button', { name: 'Modifier la carte' })).not.toBeInTheDocument();
    expect(currentMap().readOnly).toBe(true);
  });

  it('starts editing explicitly without saving or changing the original plan', () => {
    const plan = planFixture(), original = structuredClone(plan), onSave = vi.fn(), dirty = vi.fn();
    render(<ProjectDetailMap project={project({ locationPlan: plan })} canManage onSave={onSave} onDirtyChange={dirty} />);
    expect(onSave).not.toHaveBeenCalled(); expect(dirty).toHaveBeenLastCalledWith(false);
    edit();
    expect(screen.getByRole('group', { name: 'Mode de dessin' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enregistrer la carte' })).toBeDisabled();
    expect(plan).toEqual(original); expect(onSave).not.toHaveBeenCalled();
  });

  it('adds a route, isolated points and a zone through the shared map modes then saves all three types', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined), source = project();
    render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit();
    act(() => currentMap().onAddWaypoint({ latitude: 49.6, longitude: -1.5 }, { name: 'Port choisi' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode de dessin' })).getByRole('button', { name: 'Point isolé' }));
    act(() => currentMap().onAddWaypoint({ latitude: 49.7, longitude: -1.6 }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Mode de dessin' })).getByRole('button', { name: 'Zone' }));
    act(() => currentMap().onAddWaypoint({ latitude: 49.7, longitude: -1.6 }));
    act(() => currentMap().onAddWaypoint({ latitude: 49.8, longitude: -1.6 }));
    act(() => currentMap().onAddWaypoint({ latitude: 49.7, longitude: -1.5 }));
    await act(async () => save());
    const [saved, record] = onSave.mock.lastCall! as [ProjectLocationPlan, ProjectRecord];
    expect(saved.waypoints).toHaveLength(1); expect(saved.waypoints[0]).toMatchObject({ descriptionVhf: 'Port choisi', latitude: '49.6', longitude: '-1.5' });
    expect(saved.points).toHaveLength(1); expect(saved.zones[0].vertices).toHaveLength(3); expect(record).toBe(source);
  });

  it('moves and deletes route points, isolated points and vertices without mutating their source', async () => {
    const plan = planFixture(), original = structuredClone(plan), onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectDetailMap project={project({ locationPlan: plan })} canManage onSave={onSave} />); edit();
    act(() => currentMap().onMoveWaypoint!('route-1', { latitude: 50, longitude: 1 }));
    act(() => currentMap().onMoveIsolatedPoint!('isolated-1', { latitude: 50.1, longitude: 1.1 }));
    act(() => currentMap().onMoveZoneVertex!('works', 1, { latitude: 50.2, longitude: 1.2 }));
    expect(currentMap().waypoints[0].latitude).toBe('50'); expect(currentMap().isolatedPoints![0].latitude).toBe('50.1'); expect(currentMap().zones![0].vertices[1].latitude).toBe('50.2');
    act(() => currentMap().onDeleteWaypoint!('route-2'));
    act(() => currentMap().onDeleteIsolatedPoint!('isolated-1'));
    act(() => currentMap().onDeleteZoneVertex!('works', 2));
    await act(async () => save());
    const saved = onSave.mock.lastCall![0] as ProjectLocationPlan;
    expect(saved.waypoints).toHaveLength(1); expect(saved.points).toHaveLength(0); expect(saved.zones[0].vertices).toHaveLength(2); expect(plan).toEqual(original);
  });

  it('deletes a whole zone and retains the unchanged ETD, charts and PDF setting', async () => {
    const source = project({ locationPlan: planFixture() }), onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la zone 1' }));
    await act(async () => save());
    expect(onSave.mock.lastCall![0]).toMatchObject({ etd: source.locationPlan!.etd, charts: '7000 - 7001', includeInPdf: true, zones: [] });
  });

  it('cancels edits and returns to the saved map without writing', () => {
    const source = project({ locationPlan: planFixture() }), onSave = vi.fn(), dirty = vi.fn();
    render(<ProjectDetailMap project={source} canManage onSave={onSave} onDirtyChange={dirty} />); edit();
    act(() => currentMap().onDeleteWaypoint!('route-2')); expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(currentMap()).toMatchObject({ readOnly: true, waypoints: source.locationPlan!.waypoints }); expect(dirty).toHaveBeenLastCalledWith(false); expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps edits after a rejected save and can retry without changing the source version', async () => {
    const source = project({ locationPlan: planFixture() }), onSave = vi.fn().mockRejectedValueOnce(new Error('Rechargez le projet avant de continuer.')).mockResolvedValue(undefined);
    render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit();
    fireEvent.change(screen.getByLabelText('Description · Waypoint 1'), { target: { value: 'Nouvelle position' } });
    await act(async () => save()); expect(screen.getByRole('alert')).toHaveTextContent('Rechargez le projet');
    expect(screen.getByLabelText('Description · Waypoint 1')).toHaveValue('Nouvelle position');
    await act(async () => save()); expect(onSave).toHaveBeenCalledTimes(2); expect(onSave.mock.calls[0][1]).toBe(source); expect(onSave.mock.calls[1][1]).toBe(source);
  });

  it('locks duplicate saves, cancel and retained map callbacks while persistence is pending', async () => {
    const pending = deferred(), onSave = vi.fn().mockReturnValue(pending.promise), source = project({ locationPlan: planFixture() });
    render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit();
    act(() => currentMap().onDeleteWaypoint!('route-2')); const staleMap = currentMap();
    save(); fireEvent.click(screen.getByRole('button', { name: 'Enregistrement…' }));
    act(() => staleMap.onDeleteWaypoint!('route-1'));
    expect(onSave).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled(); expect(currentMap().waypoints).toHaveLength(1);
    await act(async () => pending.resolve()); expect(screen.getByRole('button', { name: 'Modifier la carte' })).toBeVisible();
  });

  it.each(['permission', 'disabled'] as const)('blocks retained callbacks when %s changes', mode => {
    const onSave = vi.fn(), source = project({ locationPlan: planFixture() });
    const view = render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit(); const staleMap = currentMap();
    view.rerender(<ProjectDetailMap project={source} canManage={mode !== 'permission'} disabled={mode === 'disabled'} onSave={onSave} />);
    act(() => staleMap.onDeleteWaypoint!('route-2'));
    expect(currentMap().waypoints).toHaveLength(2); expect(screen.getByRole('button', { name: 'Enregistrer la carte' })).toBeDisabled(); expect(onSave).not.toHaveBeenCalled();
  });

  it.each(['project', 'version'] as const)('ignores retained changes and save completions after a %s switch', async mode => {
    const pending = deferred(), source = project({ locationPlan: planFixture() }), onSave = vi.fn().mockReturnValue(pending.promise);
    const view = render(<ProjectDetailMap project={source} canManage onSave={onSave} />); edit();
    act(() => currentMap().onDeleteWaypoint!('route-2')); const staleMap = currentMap(); save();
    const next = project({ ...(mode === 'project' ? { id: 287 } : { updatedAt: '2026-10-28T10:00:00Z' }), locationPlan: null });
    view.rerender(<ProjectDetailMap project={next} canManage onSave={onSave} />);
    act(() => staleMap.onAddWaypoint({ latitude: 0, longitude: 0 })); await act(async () => pending.resolve());
    expect(currentMap()).toMatchObject({ readOnly: true, waypoints: [], isolatedPoints: [], zones: [] }); expect(onSave).toHaveBeenCalledOnce();
  });
});
