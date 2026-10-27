import type { SeaOperationPayload } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { buildSeaOperationRouteLegs, formatSeaOperationVoyageDuration, seaOperationVoyageTiming,
  type SeaOperationRouteLegs, type SeaOperationVoyageTiming } from './seaOperationRouteLegs';

type VoyagePayload = Pick<SeaOperationPayload, 'waypoints' | 'vessel'>;

export interface SeaOperationVoyageSummary {
  route: SeaOperationRouteLegs;
  timing: SeaOperationVoyageTiming;
  durationLabel: string | null;
}

/** Only a completely positioned and dated route supplies a retained arrival. */
export function seaOperationRouteArrivalEta(payload: Pick<SeaOperationPayload, 'waypoints'>): string | undefined {
  if (payload.waypoints.length < 2) return;
  for (const point of payload.waypoints) {
    if (!seaWaypointPosition(point) || !seaOperationVoyageTiming(point.eta, 0).etdUtc) return;
  }
  return payload.waypoints.at(-1)?.eta;
}

/** Saved timestamps take precedence; exports need no live vessel speed to retain them. */
export function seaOperationVoyageSummary(payload: VoyagePayload, maxSpeedKnots?: number | null): SeaOperationVoyageSummary {
  const route = buildSeaOperationRouteLegs(payload.waypoints, maxSpeedKnots);
  const timing = seaOperationVoyageTiming(payload.waypoints[0]?.eta || payload.vessel.etd,
    route.totalDurationMinutes, seaOperationRouteArrivalEta(payload));
  return { route, timing, durationLabel: formatSeaOperationVoyageDuration(timing.durationMinutes ?? route.totalDurationMinutes) };
}
