import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { buildSeaOperationRouteLegs, seaOperationVoyageTiming } from './seaOperationRouteLegs';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { updateSeaOperationWaypoint } from './seaOperationWaypointSnapshots';

const paris = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function seaOperationWaypointEtaIsAutomatic(point: Pick<SeaOperationWaypoint, 'eta' | 'etaMode'>): boolean {
  return point.etaMode === 'automatic' || point.etaMode === undefined && !point.eta.trim();
}

/** A local datetime must remain representable by the existing unambiguous Paris ETA contract. */
function calculatedEta(time: number): string {
  if (!Number.isFinite(time)) return '';
  const rounded = Math.round(time / 60_000) * 60_000;
  const date = new Date(rounded);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) return '';
  const parts = paris.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  const value = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  try { return Date.parse(seaOperationEtaUtc(value)) === rounded ? value : ''; } catch { return ''; }
}

/**
 * Prefill editable automatic slots from explicit manual waypoint anchors, never from ETD.
 * Distances accumulate without per-leg rounding until the next manual anchor. A missing
 * coordinate breaks the chain. Historical/manual values, including an explicitly cleared
 * manual slot, remain untouched. Callers must not run this against signed records.
 */
export function updateSeaOperationRouteEtas(payload: SeaOperationPayload, maxSpeedKnots?: number | null): SeaOperationPayload {
  const route = buildSeaOperationRouteLegs(payload.waypoints, maxSpeedKnots);
  const legs = new Map(route.legs.map(leg => [leg.toIndex, leg]));
  let anchor: number | null = null, distance = 0, changed = false;
  const waypoints = payload.waypoints.map((point, index) => {
    if (!seaOperationWaypointEtaIsAutomatic(point)) {
      const utc = seaOperationVoyageTiming(point.eta, 0).etdUtc;
      anchor = utc === null ? null : Date.parse(utc); distance = 0;
      return point;
    }
    let eta = '';
    const leg = legs.get(index + 1);
    if (index === 0 || anchor === null || route.cruiseSpeedKnots === null || !leg) {
      anchor = null; distance = 0;
    } else {
      distance += leg.distanceNm;
      eta = calculatedEta(anchor + distance / route.cruiseSpeedKnots * 3_600_000);
    }
    if (eta === point.eta && (eta === '' || point.etaMode === 'automatic')) return point;
    // A still-empty unmarked slot stays compatible; only populated or previously-auto slots acquire metadata.
    if (!eta && point.etaMode === undefined && !point.eta.trim()) return point;
    changed = true;
    return updateSeaOperationWaypoint(point, { eta, etaMode: 'automatic' });
  });
  return changed ? { ...payload, waypoints } : payload;
}
