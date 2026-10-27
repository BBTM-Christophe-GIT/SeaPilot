import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';

/** Port names and edited descriptions take precedence over the waypoint's default label. */
export function seaOperationWaypointDescription(point: Pick<SeaOperationWaypoint, 'number' | 'descriptionVhf'>, index = 0): string {
  return point.descriptionVhf.trim() ? point.descriptionVhf : `Waypoint ${point.number.trim() || index + 1}`;
}

/** Fill missing draft labels without changing an existing description or a signed record. */
export function captureSeaOperationWaypointDescriptions(payload: SeaOperationPayload): SeaOperationPayload {
  let changed = false;
  const waypoints = payload.waypoints.map((point, index) => {
    if (point.descriptionVhf.trim()) return point;
    changed = true;
    return { ...point, descriptionVhf: seaOperationWaypointDescription(point, index) };
  });
  return changed ? { ...payload, waypoints } : payload;
}
