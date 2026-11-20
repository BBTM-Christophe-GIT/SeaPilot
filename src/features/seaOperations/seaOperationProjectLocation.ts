import { parseProjectLocationPlan, type ProjectLocationPlan } from '../projects/projectLocation';
import { projectLocationRouteEtas } from '../projects/projectLocationRouteEtas';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import type { SeaOperationIsolatedPointIconName } from './seaOperationIsolatedPointIcons';
import type { SeaOperationRecord } from './seaOperationQueries';
import { seaWaypointPosition } from './seaOperationNavigation';
import { initialSeaOperationDepartureEta, seaOperationWaypointEtaIsAutomatic, updateSeaOperationRouteEtas } from './seaOperationRouteEta';

/** Explicit selection imports a fresh editable copy of the project's route and geometry. */
export function copyProjectLocationToSeaOperation(payload: SeaOperationPayload, location: ProjectLocationPlan | null | undefined,
  maxSpeedKnots?: number | null, { newId = () => crypto.randomUUID(), now = new Date(), navigationSpeedKnots, preserveAutomaticEtas }: {
    newId?: () => string; now?: Date; navigationSpeedKnots?: number | null; preserveAutomaticEtas?: boolean;
  } = {}): SeaOperationPayload {
  const parsed = parseProjectLocationPlan(location);
  if (!parsed) return payload;
  // An existing template departure remains an anchor even without a separate ETD.
  const plan = !parsed.etd.trim() && parsed.waypoints[0]?.eta.trim() ? parsed
    : projectLocationRouteEtas(parsed, maxSpeedKnots, navigationSpeedKnots);
  const copyPoint = (point: SeaOperationWaypoint): SeaOperationWaypoint => ({ ...point, id: newId() });
  const waypoints = plan.waypoints.map((point, index) => {
    const copied = copyPoint(preserveAutomaticEtas && index > 0 ? parsed.waypoints[index] : point);
    return { ...copied, ukcMode: copied.ukcMode ?? 'automatic' };
  });
  if (waypoints[0] && !waypoints[0].eta.trim() && seaOperationWaypointEtaIsAutomatic(waypoints[0]) && !plan.etd.trim()) {
    const eta = initialSeaOperationDepartureEta(now);
    if (eta) waypoints[0] = { ...waypoints[0], eta, etaMode: 'manual' };
  }
  if (waypoints[0]?.eta && waypoints[0].etaMode === 'automatic') waypoints[0] = { ...waypoints[0], etaMode: 'manual' };
  const result: SeaOperationPayload = { ...payload, charts: plan.charts, waypoints,
    vessel: plan.etd.trim() ? { ...payload.vessel, etd: plan.etd } : payload.vessel,
    locationOverlay: { version: 1, points: plan.points.map(copyPoint), zones: plan.zones.map(zone => ({ ...zone, id: newId() })) } };
  delete result.mapViewport;
  return preserveAutomaticEtas ? result : updateSeaOperationRouteEtas(result, maxSpeedKnots, navigationSpeedKnots);
}

function samePointPosition(point: SeaOperationWaypoint, savedPoint: SeaOperationWaypoint): boolean {
  if (point.latitude === savedPoint.latitude && point.longitude === savedPoint.longitude) return true;
  const position = seaWaypointPosition(point), savedPosition = seaWaypointPosition(savedPoint);
  const rounded = (degrees: number) => Math.sign(degrees) * Math.round(Math.abs(degrees) * 1e6);
  return position != null && savedPosition != null
    && rounded(position.latitude) === rounded(savedPosition.latitude)
    && rounded(position.longitude) === rounded(savedPosition.longitude);
}

/** A point moved away from its project location keeps its operation-specific symbol. */
export function seaOperationPointPresentation(draft: SeaOperationPayload, record: SeaOperationRecord | null) {
  const points = draft.locationOverlay?.points;
  const icons = record?.projectPointIcons;
  if (!record || !points?.length || !icons?.size || draft.planning?.projectId !== record.draft.planning?.projectId) {
    return { points, projectIcons: undefined };
  }
  const savedPoints = new Map(record.draft.locationOverlay?.points.map(point => [point.id, point]));
  const projectIcons = new Map<string, SeaOperationIsolatedPointIconName | null>();
  const mapPoints = points.map(point => {
    const icon = icons.get(point.id), saved = savedPoints.get(point.id);
    if (icon === undefined || !saved || !samePointPosition(point, saved)) return point;
    projectIcons.set(point.id, icon);
    return { ...point, isolatedPointIcon: icon ?? undefined };
  });
  return { points: mapPoints, projectIcons };
}
