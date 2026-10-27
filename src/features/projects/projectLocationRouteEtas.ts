import { emptySeaOperation } from '../seaOperations/seaOperationModel';
import { seaOperationWaypointEtaIsAutomatic, updateSeaOperationRouteEtas } from '../seaOperations/seaOperationRouteEta';
import { seaOperationVoyageTiming } from '../seaOperations/seaOperationRouteLegs';
import { seaOperationEtaUtc } from '../seaOperations/seaOperationWeatherModel';
import type { ProjectLocationPlan } from './projectLocation';

function departureEta(etd: string): string {
  const utc = seaOperationVoyageTiming(etd, 0).etdUtc;
  if (!utc) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utc));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  const value = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  try { return Math.abs(Date.parse(seaOperationEtaUtc(value)) - Date.parse(utc)) < 60_000 ? value : ''; } catch { return ''; }
}

/** Project templates can anchor their first automatic point to an explicit ETD; manual slots remain untouched. */
export function projectLocationRouteEtas(plan: ProjectLocationPlan, maxSpeedKnots?: number | null): ProjectLocationPlan {
  const first = plan.waypoints[0];
  if (!first) return plan;
  const firstAutomatic = seaOperationWaypointEtaIsAutomatic(first);
  const eta = firstAutomatic ? departureEta(plan.etd) : first.eta;
  const anchor = firstAutomatic ? { ...first, eta, etaMode: 'manual' as const } : first;
  const payload = { ...emptySeaOperation(), waypoints: [anchor, ...plan.waypoints.slice(1)] };
  const result = updateSeaOperationRouteEtas(payload, maxSpeedKnots).waypoints;
  if (firstAutomatic) result[0] = { ...result[0], ...(eta || first.etaMode === 'automatic' ? { etaMode: 'automatic' as const } : { etaMode: first.etaMode }) };
  return JSON.stringify(result) === JSON.stringify(plan.waypoints) ? plan : { ...plan, waypoints: result };
}
