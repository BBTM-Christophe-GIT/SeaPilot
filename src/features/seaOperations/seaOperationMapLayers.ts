import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition, type SeaPosition } from './seaOperationNavigation';
import type { SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';
import { projectSeaOperationMapPlace } from './seaOperationMapPlaces';

export interface SeaOperationMapZone {
  id: string;
  name: string;
  vertices: readonly { latitude: string; longitude: string }[];
}

export function seaOperationMapExtraPositions(points: readonly SeaOperationWaypoint[], zones: readonly SeaOperationMapZone[]): SeaPosition[] {
  return [...points, ...zones.flatMap(zone => zone.vertices)].flatMap(point => {
    const position = seaWaypointPosition(point); return position ? [position] : [];
  });
}

export function seaOperationZonePositions(zone: SeaOperationMapZone): SeaPosition[] | null {
  const positions = zone.vertices.map(seaWaypointPosition);
  if (positions.some(position => position === null)) return null;
  const valid = positions.filter(position => position !== null);
  const distinct = new Set(valid.map(position => `${position.latitude}:${((position.longitude + 540) % 360) - 180}`));
  return distinct.size >= 3 ? valid : null;
}

/** Polygon vertices may be outside the frame; the SVG clip retains their visible area during pan/zoom. */
function projectZoneVertex(geometry: SeaOperationRouteMapGeometry, position: SeaPosition) {
  const visible = projectSeaOperationMapPlace(geometry, position);
  if (visible) return visible;
  const projection = geometry.projection;
  if (!projection) return null;
  return { x: geometry.width / 2 + (((position.longitude - projection.centerLongitude + 540) % 360) - 180) * projection.longitudePixelsPerDegree,
    y: geometry.height / 2 - (position.latitude - projection.centerLatitude) * projection.latitudePixelsPerDegree };
}

export function seaOperationMapLayers(geometry: SeaOperationRouteMapGeometry, points: readonly SeaOperationWaypoint[], zones: readonly SeaOperationMapZone[]) {
  const isolated = points.flatMap((point, index) => {
    const position = seaWaypointPosition(point), pixel = position && projectSeaOperationMapPlace(geometry, position);
    return pixel && position ? [{ ...pixel, point, index: index + 1, position }] : [];
  });
  const polygons = zones.flatMap(zone => {
    const positions = seaOperationZonePositions(zone);
    if (!positions) return [];
    const vertices = positions.map(position => projectZoneVertex(geometry, position));
    if (vertices.some(vertex => vertex === null)) return [];
    const valid = vertices.filter(vertex => vertex !== null);
    // A local polygon must not jump across the wrapped map's far meridian.
    if (valid.some((vertex, index) => Math.abs(vertex.x - valid[(index + 1) % valid.length].x) > geometry.projection!.longitudePixelsPerDegree * 180)) return [];
    return [{ zone, vertices: valid }];
  });
  return { isolated, polygons };
}
