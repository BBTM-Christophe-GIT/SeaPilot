import { parseProjectLocationPlan, type ProjectLocationPlan } from '../projects/projectLocation';
import { projectLocationRouteEtas } from '../projects/projectLocationRouteEtas';
import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { updateSeaOperationRouteEtas } from './seaOperationRouteEta';

/** Explicit selection imports a fresh editable copy; saved declarations never follow the live project. */
export function copyProjectLocationToSeaOperation(payload: SeaOperationPayload, location: ProjectLocationPlan | null | undefined,
  maxSpeedKnots?: number | null, newId: () => string = () => crypto.randomUUID()): SeaOperationPayload {
  const parsed = parseProjectLocationPlan(location);
  if (!parsed) return payload;
  const plan = projectLocationRouteEtas(parsed, maxSpeedKnots);
  const copyPoint = (point: SeaOperationWaypoint): SeaOperationWaypoint => ({ ...point, id: newId() });
  const waypoints = plan.waypoints.map(copyPoint);
  if (waypoints[0]?.eta && waypoints[0].etaMode === 'automatic') waypoints[0] = { ...waypoints[0], etaMode: 'manual' };
  const result: SeaOperationPayload = { ...payload, charts: plan.charts, waypoints,
    vessel: plan.etd.trim() ? { ...payload.vessel, etd: plan.etd } : payload.vessel,
    locationOverlay: { version: 1, points: plan.points.map(copyPoint), zones: plan.zones.map(zone => ({ ...zone, id: newId() })) } };
  if (plan.mapViewport) result.mapViewport = { ...plan.mapViewport };
  else delete result.mapViewport;
  return updateSeaOperationRouteEtas(result, maxSpeedKnots);
}
