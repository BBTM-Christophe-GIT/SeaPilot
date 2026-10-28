import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import { SeaOperationRegisterMap } from './SeaOperationRegisterMap';
import type { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import { captureSeaOperationRadios, waypointRadioSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import { calculateSeaOperationCopernicusEstimate, COPERNICUS_UKC_PRODUCTS } from './seaOperationCopernicusModel';

type MapProps = Parameters<typeof SeaOperationWaypointMapEditor>[0];
const capture = vi.hoisted(() => vi.fn<(props: MapProps) => void>());
vi.mock('./SeaOperationWaypointMapEditor', () => ({ SeaOperationWaypointMapEditor: (props: MapProps) => {
  capture(props); return <div data-testid="operation-map">{props.waypoints.map(point => <span key={point.id}>{point.descriptionVhf}</span>)}</div>;
} }));
const map = () => capture.mock.lastCall![0];
const move = () => act(() => map().onMoveWaypoint?.('route-1', { latitude: 49.700000125, longitude: -1.6 }));
function record(overrides: Partial<SeaOperationRecord> = {}): SeaOperationRecord {
  const draft = emptySeaOperation();
  draft.project = 'P144 · Essai'; draft.vessel = { ...draft.vessel, id: '12', name: 'GOURY', draftMeters: 2,
    departurePort: 'Cherbourg', arrivalPort: 'Dieppe', etd: '2026-10-28T08:00' };
  draft.planning = { projectId: '501', operationId: 'operation-1', date: '2026-10-28', captainPersonId: '101' };
  draft.waypoints = [{ ...emptySeaOperationWaypoint('route-1'), latitude: '49.65', longitude: '-1.62', number: '1', descriptionVhf: 'Départ', eta: '2026-10-28T08:00', etaMode: 'manual' },
    { ...emptySeaOperationWaypoint('route-2'), latitude: '49.8', longitude: '-1.5', number: '2', descriptionVhf: 'Arrivée', eta: '2026-10-28T10:00', etaMode: 'automatic' }];
  draft.locationOverlay = { version: 1, points: [{ ...emptySeaOperationWaypoint('isolated-1'), number: 'B04', latitude: '49.7', longitude: '-1.6', descriptionVhf: 'Bouée', isolatedPointIcon: 'buoy' }],
    zones: [{ id: 'zone-1', name: 'Zone de travaux', vertices: [{ latitude: '49.6', longitude: '-1.6' }, { latitude: '49.7', longitude: '-1.6' }, { latitude: '49.65', longitude: '-1.7' }] }] };
  draft.mapViewport = { centerLatitude: 0, centerLongitude: 0, longitudeSpan: 100 };
  return { id: 'record-1', companyId: 1, version: 2, status: 'draft', draft, createdBy: 'armement', createdByName: 'Armement',
    createdAt: '2026-10-28T07:00:00Z', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: '2026-10-28T07:00:00Z',
    signedBy: null, signedByName: null, signedAt: null, captainName: null, canEdit: true, canSign: true, ...overrides };
}
function edit() { fireEvent.click(screen.getByRole('button', { name: 'Modifier les points' })); }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les points' })); }
beforeEach(() => capture.mockClear());

describe('SeaOperationRegisterMap', () => {
  it('invites register selection without creating an empty operation', () => {
    const onSave = vi.fn(); render(<SeaOperationRegisterMap record={null} onSave={onSave} />);
    expect(screen.getByText('Sélectionnez une opération dans le registre.')).toBeVisible();
    expect(capture).not.toHaveBeenCalled(); expect(onSave).not.toHaveBeenCalled();
  });
  it('starts auto framed with all stored geometry and ports, ignoring the old manual print frame', () => {
    const source = record(), original = structuredClone(source), onSave = vi.fn(), onDirtyChange = vi.fn();
    render(<SeaOperationRegisterMap record={source} maxSpeedKnots={12} onSave={onSave} onDirtyChange={onDirtyChange} />);
    expect(map()).toMatchObject({ waypoints: source.draft.waypoints, isolatedPoints: source.draft.locationOverlay!.points,
      zones: source.draft.locationOverlay!.zones, departurePort: 'Cherbourg', arrivalPort: 'Dieppe', maxSpeedKnots: 12, readOnly: true });
    expect(map().mapViewport).toBeUndefined(); expect(map().onMapViewportChange).toBeUndefined();
    expect(onSave).not.toHaveBeenCalled(); expect(onDirtyChange).toHaveBeenLastCalledWith(false); expect(source).toEqual(original);
  });
  it.each([{ status: 'signed' as const, canEdit: true }, { status: 'draft' as const, canEdit: false }])('allows navigation but no changes for server state $status / canEdit=$canEdit', overrides => {
    const onSave = vi.fn(), source = record(overrides); render(<SeaOperationRegisterMap record={source} onSave={onSave} />);
    expect(map().readOnly).toBe(true); expect(map().disabled).not.toBe(true);
    expect(screen.queryByRole('button', { name: 'Modifier les points' })).not.toBeInTheDocument();
    const original = structuredClone(map().waypoints); move();
    act(() => { map().onDeleteWaypoint?.('route-1'); map().onAddWaypoint({ latitude: 49, longitude: 0 }); });
    expect(map().waypoints).toEqual(original); expect(onSave).not.toHaveBeenCalled();
  });
  it('moves and saves an independent copy with automatic route ETA recalculation and original version', async () => {
    const source = record(), original = structuredClone(source), onSave = vi.fn().mockResolvedValue(undefined), onDirtyChange = vi.fn();
    render(<SeaOperationRegisterMap record={source} maxSpeedKnots={12} onSave={onSave} onDirtyChange={onDirtyChange} />);
    edit(); move();
    expect(map().waypoints[0]).toMatchObject({ latitude: '49.7', longitude: '-1.6' });
    expect(map().waypoints[1].eta).not.toBe(source.draft.waypoints[1].eta); expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => save());
    expect(onSave).toHaveBeenCalledOnce(); expect(onSave.mock.calls[0][1]).toBe(source);
    expect(onSave.mock.calls[0][0].waypoints[0]).toMatchObject({ latitude: '49.7', longitude: '-1.6' });
    expect(source).toEqual(original); expect(map().readOnly).toBe(true); expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
  it('invalidates location-dependent weather, radio and automatic UKC after moving a waypoint', () => {
    const source = record(); source.draft = captureSeaOperationRadios(source.draft, '2026-10-28T06:00:00.000Z');
    const point = source.draft.waypoints[0];
    point.weather = { pointId: point.id, latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-28T07:00:00.000Z', fetchedAt: '2026-10-28T06:00:00.000Z', wind: null, waves: null,
      windMessage: 'Aucune donnée', wavesMessage: 'Aucune donnée', attribution: 'Météo-France', sourceUrl: 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg' };
    point.ukcMode = 'automatic';
    point.ukcForecast = calculateSeaOperationCopernicusEstimate({ projectId: '501', vesselId: '12', draftMeters: 2, pointId: point.id, latitude: 49.65, longitude: -1.62, eta: point.eta },
      { status: 'unavailable', message: 'Aucune donnée', cell: null, waterLevel: null, source: { model: 'NWS', ...COPERNICUS_UKC_PRODUCTS.NWS, datum: 'model-geoid', referenceTimeUtc: null, sourceUrl: 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description' } }, '2026-10-28T06:00:00.000Z');
    expect(waypointWeatherSnapshot(point)).toBeDefined(); expect(waypointRadioSnapshot(point)).toBeDefined();
    render(<SeaOperationRegisterMap record={source} onSave={vi.fn()} />); edit(); move();
    expect(map().waypoints[0].weather).toBeUndefined(); expect(map().waypoints[0].radio).toBeUndefined(); expect(map().waypoints[0].ukcForecast).toBeUndefined();
    expect(source.draft.waypoints[0].weather).toBeDefined();
  });
  it('moves and deletes isolated points and zone vertices while preserving point numbers and zone identity', () => {
    render(<SeaOperationRegisterMap record={record()} onSave={vi.fn()} />); edit();
    act(() => map().onMoveIsolatedPoint?.('isolated-1', { latitude: 49.75, longitude: -1.63 }));
    expect(map().isolatedPoints![0]).toMatchObject({ number: 'B04', latitude: '49.75', longitude: '-1.63', isolatedPointIcon: 'buoy' });
    act(() => map().onMoveZoneVertex?.('zone-1', 1, { latitude: 49.8, longitude: -1.6 }));
    expect(map().zones![0]).toMatchObject({ id: 'zone-1', name: 'Zone de travaux' }); expect(map().zones![0].vertices[1].latitude).toBe('49.8');
    act(() => { map().onDeleteIsolatedPoint?.('isolated-1'); map().onDeleteZoneVertex?.('zone-1', 1); map().onDeleteWaypoint?.('route-2'); });
    expect(map().isolatedPoints).toHaveLength(0); expect(map().zones![0].vertices).toHaveLength(2); expect(map().waypoints).toHaveLength(1);
  });
  it('adds a port as a newly numbered route point in explicit editing mode', () => {
    const source = record(); source.draft.waypoints[1].number = '3';
    render(<SeaOperationRegisterMap record={source} maxSpeedKnots={12} onSave={vi.fn()} />); edit();
    act(() => map().onAddWaypoint({ latitude: 49.6, longitude: -1.7 }, { name: 'Port sélectionné' }));
    expect(map().waypoints[2]).toMatchObject({ number: '4', descriptionVhf: 'Port sélectionné', latitude: '49.6', longitude: '-1.7', etaMode: 'automatic' });
  });
  it('cancels edits without saving or retaining modified captures or geometry', () => {
    const source = record(), onSave = vi.fn(), onDirtyChange = vi.fn();
    render(<SeaOperationRegisterMap record={source} onSave={onSave} onDirtyChange={onDirtyChange} />); edit(); move();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(map().waypoints).toEqual(source.draft.waypoints); expect(map().readOnly).toBe(true); expect(onSave).not.toHaveBeenCalled(); expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
  it('retains the draft and error when optimistic save is rejected', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Cette opération a été modifiée par un autre utilisateur.'));
    render(<SeaOperationRegisterMap record={record()} onSave={onSave} />); edit(); move();
    await act(async () => save());
    expect(screen.getByRole('alert')).toHaveTextContent('modifiée par un autre utilisateur'); expect(map().waypoints[0].latitude).toBe('49.7');
    expect(screen.getByRole('button', { name: 'Enregistrer les points' })).toBeEnabled();
  });
  it('blocks stale callbacks and save after edit permission or global availability changes', () => {
    const source = record(), onSave = vi.fn();
    const view = render(<SeaOperationRegisterMap record={source} onSave={onSave} />); edit(); const stale = map();
    view.rerender(<SeaOperationRegisterMap record={source} onSave={onSave} disabled />);
    act(() => stale.onMoveWaypoint?.('route-1', { latitude: 49.8, longitude: -1.6 }));
    expect(map().waypoints[0].latitude).toBe('49.65'); expect(map().readOnly).toBe(true); expect(map().disabled).not.toBe(true);
    view.rerender(<SeaOperationRegisterMap record={{ ...source, canEdit: false }} onSave={onSave} />);
    act(() => stale.onDeleteWaypoint?.('route-1'));
    expect(map().waypoints).toHaveLength(2); expect(screen.getByRole('button', { name: 'Enregistrer les points' })).toBeDisabled();
  });
  it('ignores invalid and unknown targets instead of marking a clean map dirty', () => {
    const onDirtyChange = vi.fn(); render(<SeaOperationRegisterMap record={record()} onSave={vi.fn()} onDirtyChange={onDirtyChange} />); edit();
    act(() => { map().onMoveWaypoint?.('route-1', { latitude: NaN, longitude: 0 }); map().onMoveIsolatedPoint?.('missing', { latitude: 49, longitude: 0 });
      map().onDeleteWaypoint?.('missing'); map().onMoveZoneVertex?.('zone-1', -1, { latitude: 49, longitude: 0 }); map().onDeleteZoneVertex?.('zone-1', 20); });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false); expect(screen.getByRole('button', { name: 'Enregistrer les points' })).toBeDisabled();
  });
  it('resets point edits and framing when the selected record or version changes', () => {
    const source = record(), onSave = vi.fn(); const view = render(<SeaOperationRegisterMap record={source} onSave={onSave} />); edit(); move();
    const next = record({ id: 'record-2' }); next.draft.waypoints[0].latitude = '48';
    view.rerender(<SeaOperationRegisterMap record={next} onSave={onSave} />);
    expect(map().readOnly).toBe(true); expect(map().waypoints[0].latitude).toBe('48'); expect(map().mapViewport).toBeUndefined();
    edit(); move(); view.rerender(<SeaOperationRegisterMap record={{ ...next, version: next.version + 1 }} onSave={onSave} />);
    expect(map().waypoints[0].latitude).toBe('48'); expect(map().readOnly).toBe(true);
  });
  it('does not let an old save completion reset another selected operation', async () => {
    let resolve!: () => void; const onSave = vi.fn(() => new Promise<void>(accept => { resolve = accept; }));
    const source = record(), view = render(<SeaOperationRegisterMap record={source} onSave={onSave} />); edit(); move(); save();
    expect(map().readOnly).toBe(true); expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    const next = record({ id: 'record-2' }); view.rerender(<SeaOperationRegisterMap record={next} onSave={onSave} />); edit(); move();
    await act(async () => resolve());
    expect(map().readOnly).toBe(false); expect(map().waypoints[0].latitude).toBe('49.7'); expect(screen.getByRole('button', { name: 'Enregistrer les points' })).toBeEnabled();
  });
});
