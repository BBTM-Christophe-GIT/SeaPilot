import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { ProjectDetailMap } from './ProjectDetailMap';
import { emptyProjectLocationPlan } from './projectLocation';
import type { ProjectRecord } from './projectQueries';

const map = vi.hoisted(() => vi.fn());
vi.mock('../seaOperations/SeaOperationWaypointMapEditor', () => ({
  SeaOperationWaypointMapEditor: (props: Record<string, unknown>) => { map(props); return <div data-testid="project-map" />; },
}));
beforeEach(() => map.mockClear());
const project = (patch: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: 144, deliveryPort: 'Dieppe', redeliveryPort: 'Cherbourg', ...patch,
} as ProjectRecord);

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
});
