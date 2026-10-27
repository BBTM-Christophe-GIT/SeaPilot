import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaDistanceToRouteNm, seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

type RouteWaypoint = Pick<SeaOperationWaypoint, 'id' | 'number' | 'latitude' | 'longitude'>;
export interface SeaOperationRouteLeg {
  /** Original one-based table ordinals; missing coordinates never renumber a leg. */
  fromIndex: number;
  toIndex: number;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  distanceNm: number;
  distanceLabel: string;
  durationMinutes: number | null;
  durationLabel: string | null;
}
export interface SeaOperationRouteLegs {
  cruiseSpeedKnots: number | null;
  legs: SeaOperationRouteLeg[];
  /** Number of adjacent pairs that cannot be calculated, rather than number of invalid points. */
  invalidLegCount: number;
  totalDistanceNm: number | null;
  totalDistanceLabel: string | null;
  totalDurationMinutes: number | null;
  totalDurationLabel: string | null;
}
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const parisDateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** User-selected planning assumption: maximum speed less 40%, rounded up to whole knots. */
export function seaOperationCruiseSpeedKnots(maxSpeedKnots?: number | null): number | null {
  if (typeof maxSpeedKnots !== 'number' || !Number.isFinite(maxSpeedKnots) || maxSpeedKnots <= 0) return null;
  const speed = Math.ceil(maxSpeedKnots * .6);
  return Number.isSafeInteger(speed) && speed > 0 ? speed : null;
}

/** Minutes below one hour, otherwise elapsed HH:mm; no date or 24-hour wrapping. */
export function formatSeaOperationDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;
  const rounded = Math.round(minutes);
  if (!Number.isSafeInteger(rounded)) return null;
  return rounded < 60 ? String(rounded).padStart(2, '0')
    : `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

/** French elapsed voyage duration, rounded once to minutes and omitting zero components. */
export function formatSeaOperationVoyageDuration(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;
  const rounded = Math.round(minutes);
  if (!Number.isSafeInteger(rounded)) return null;
  const parts: string[] = [];
  for (const [value, unit] of [[Math.floor(rounded / 1440), 'jour'], [Math.floor(rounded % 1440 / 60), 'heure'], [rounded % 60, 'minute']] as const) {
    if (value > 0) parts.push(`${value} ${unit}${value === 1 ? '' : 's'}`);
  }
  return parts.join(' ') || '0 minute';
}
const durationLabel = (minutes: number | null) => {
  const formatted = formatSeaOperationDuration(minutes);
  return formatted === null ? null : minutes! < 60 ? `${formatted} min` : formatted;
};
const distanceLabel = (distanceNm: number) => `${decimal.format(distanceNm)} NM`;
const durationAt = (distanceNm: number, speed: number | null) => speed === null ? null : Math.round(distanceNm / speed * 60);

export interface SeaOperationVoyageTiming {
  etdUtc: string | null;
  etaUtc: string | null;
  etdLabel: string | null;
  etaLabel: string | null;
  durationMinutes: number | null;
  durationLabel: string | null;
  etaSource: 'waypoint' | 'estimated' | null;
}
function departureUtc(value: string): string {
  // Explicit UTC timestamps are never interpreted in the browser's own timezone.
  if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?Z$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || Number(value.slice(0, 4)) < 1000 || parsed.toISOString().slice(0, 16) !== value.slice(0, 16)) throw new Error('Invalid UTC departure');
    return parsed.toISOString();
  }
  const local = /^(\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!local) throw new Error('Missing complete Paris departure');
  const base = Date.parse(seaOperationEtaUtc(local[1]));
  return new Date(base + Number(local[2] || 0) * 1000 + Number((local[3] || '').padEnd(3, '0'))).toISOString();
}
function parisLabel(utc: string): string {
  const parts = parisDateTime.formatToParts(new Date(utc));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part('day')}/${part('month')}/${part('year')} – ${part('hour')}:${part('minute')}`;
}

/** Retained arrival wins when provided; no waypoint value is written or silently repaired. */
export function seaOperationVoyageTiming(etd: string | null | undefined, totalDurationMinutes: number | null | undefined,
  retainedEta?: string | null): SeaOperationVoyageTiming {
  const unavailable = { etaUtc: null, etaLabel: null, durationMinutes: null, durationLabel: null, etaSource: null };
  let etdUtc: string;
  try { etdUtc = departureUtc(typeof etd === 'string' ? etd.trim() : ''); }
  catch { return { etdUtc: null, etdLabel: null, ...unavailable }; }
  const departure = { etdUtc, etdLabel: parisLabel(etdUtc) };
  if (typeof retainedEta === 'string' && retainedEta.trim()) {
    let etaUtc: string;
    try { etaUtc = departureUtc(retainedEta.trim()); } catch { return { ...departure, ...unavailable }; }
    const elapsed = Date.parse(etaUtc) - Date.parse(etdUtc);
    if (elapsed < 0) return { ...departure, ...unavailable };
    const durationMinutes = Math.round(elapsed / 60_000);
    return { ...departure, etaUtc, etaLabel: parisLabel(etaUtc), durationMinutes,
      durationLabel: durationLabel(durationMinutes), etaSource: 'waypoint' };
  }
  if (typeof totalDurationMinutes !== 'number' || !Number.isSafeInteger(totalDurationMinutes) || totalDurationMinutes < 0) return { ...departure, ...unavailable };
  const arrival = new Date(Date.parse(etdUtc) + totalDurationMinutes * 60_000);
  if (!Number.isFinite(arrival.getTime()) || arrival.getUTCFullYear() > 9999) return { ...departure, ...unavailable };
  const etaUtc = arrival.toISOString();
  return { ...departure, etaUtc, etaLabel: parisLabel(etaUtc), durationMinutes: totalDurationMinutes,
    durationLabel: durationLabel(totalDurationMinutes), etaSource: 'estimated' };
}

/**
 * Short spherical great-circle distances, using SeaPilot's existing navigation model.
 * Its radius is expressed in international nautical miles (1 NM = 1,852 m).
 * Legs join only adjacent valid rows; these estimates do not find a navigable route,
 * account for currents/manoeuvres, alter ETA, or mutate any saved waypoint capture.
 */
export function buildSeaOperationRouteLegs(waypoints: readonly RouteWaypoint[], maxSpeedKnots?: number | null): SeaOperationRouteLegs {
  const cruiseSpeedKnots = seaOperationCruiseSpeedKnots(maxSpeedKnots);
  const positions = waypoints.map(seaWaypointPosition);
  const legs: SeaOperationRouteLeg[] = [];
  let invalidLegCount = 0;
  for (let index = 1; index < waypoints.length; index++) {
    const start = positions[index - 1], end = positions[index];
    if (!start || !end) { invalidLegCount++; continue; }
    // A single-point route gives precisely the existing endpoint-to-endpoint haversine.
    const distanceNm = seaDistanceToRouteNm(start, [end]);
    if (!Number.isFinite(distanceNm)) { invalidLegCount++; continue; }
    const durationMinutes = durationAt(distanceNm, cruiseSpeedKnots);
    const from = waypoints[index - 1], to = waypoints[index];
    legs.push({ fromIndex: index, toIndex: index + 1, fromId: from.id, toId: to.id,
      fromLabel: from.number.trim() || String(index), toLabel: to.number.trim() || String(index + 1),
      distanceNm, distanceLabel: distanceLabel(distanceNm), durationMinutes, durationLabel: durationLabel(durationMinutes) });
  }
  const totalDistanceNm = legs.length > 0 && invalidLegCount === 0 ? legs.reduce((total, leg) => total + leg.distanceNm, 0) : null;
  // Round the entire journey only once, rather than accumulating per-leg rounding error.
  const totalDurationMinutes = totalDistanceNm === null ? null : durationAt(totalDistanceNm, cruiseSpeedKnots);
  return { cruiseSpeedKnots, legs, invalidLegCount, totalDistanceNm,
    totalDistanceLabel: totalDistanceNm === null ? null : distanceLabel(totalDistanceNm), totalDurationMinutes,
    totalDurationLabel: durationLabel(totalDurationMinutes) };
}
