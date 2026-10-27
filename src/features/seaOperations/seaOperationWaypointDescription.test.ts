import { describe, expect, it } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint } from './seaOperationModel';
import { captureSeaOperationWaypointDescriptions, seaOperationWaypointDescription } from './seaOperationWaypointDescription';

describe('waypoint descriptions', () => {
  it('retains port names and edited text exactly', () => {
    expect(seaOperationWaypointDescription({ number: '2', descriptionVhf: 'Port du Havre' })).toBe('Port du Havre');
    expect(seaOperationWaypointDescription({ number: '2', descriptionVhf: '  Attente pilote  ' })).toBe('  Attente pilote  ');
  });
  it('uses the waypoint number, falling back to its table order', () => {
    expect(seaOperationWaypointDescription({ number: '2', descriptionVhf: ' ' })).toBe('Waypoint 2');
    expect(seaOperationWaypointDescription({ number: '', descriptionVhf: '' }, 3)).toBe('Waypoint 4');
  });
  it('fills only missing draft labels without mutating the source', () => {
    const payload = emptySeaOperation();
    payload.waypoints = [{ ...emptySeaOperationWaypoint('a'), number: '2' }, { ...emptySeaOperationWaypoint('b'), number: '3', descriptionVhf: 'Port du Havre' }];
    const captured = captureSeaOperationWaypointDescriptions(payload);
    expect(captured.waypoints[0].descriptionVhf).toBe('Waypoint 2');
    expect(payload.waypoints[0].descriptionVhf).toBe('');
    expect(captured.waypoints[1]).toBe(payload.waypoints[1]);
    expect(captureSeaOperationWaypointDescriptions(captured)).toBe(captured);
  });
});
