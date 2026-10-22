import type { SeaOperationWaypoint } from './seaOperationModel';

export interface SeaPosition { latitude: number; longitude: number }

/** WGS84 decimal degrees, degrees/minutes or degrees/minutes/seconds; no guessed axis. */
export function parseSeaCoordinate(value: string, axis: 'latitude' | 'longitude'): number | null {
  const text = value.trim().toUpperCase().replaceAll(',', '.');
  if (!text || text.length > 80) return null;
  const hemispheres = text.match(/[NSEWO]/g) ?? [];
  if (hemispheres.length > 1) return null;
  const hemisphere = hemispheres[0];
  if (hemisphere && !(axis === 'latitude' ? ['N', 'S'] : ['E', 'W', 'O']).includes(hemisphere)) return null;
  if (hemisphere && !new RegExp(`^(?:${hemisphere}[^NSEWO]+|[^NSEWO]+${hemisphere})$`).test(text)) return null;
  const raw = text.replace(/[NSEWO]/g, '').trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:[\s°º'′"″:]+\d+(?:\.\d+)?){0,2}[\s°º'′"″:]*$/.test(raw)) return null;
  const units = raw.replaceAll('º', '°').replaceAll('′', "'").replaceAll('″', '"');
  for (const [symbol, position] of [['°', 1], ["'", 2], ['"', 3]] as const) {
    const marker = units.indexOf(symbol);
    if (marker >= 0 && (units.lastIndexOf(symbol) !== marker || (units.slice(0, marker).match(/[+-]?\d+(?:\.\d+)?/g) ?? []).length !== position)) return null;
  }
  const parts = raw.match(/[+-]?\d+(?:\.\d+)?/g)!.map(Number);
  if (parts.length > 1 && !Number.isInteger(parts[0]) || parts.length > 2 && !Number.isInteger(parts[1])) return null;
  if (parts.slice(1).some((number) => number < 0 || number >= 60)) return null;
  if (hemisphere && /^[+-]/.test(raw) && (raw.startsWith('-') !== ['S', 'W', 'O'].includes(hemisphere))) return null;
  const negative = hemisphere ? ['S', 'W', 'O'].includes(hemisphere) : raw.startsWith('-');
  const degrees = Math.abs(parts[0]) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  if (degrees > (axis === 'latitude' ? 90 : 180)) return null;
  return (negative ? -1 : 1) * degrees;
}

export function seaWaypointPosition(point: Pick<SeaOperationWaypoint, 'latitude' | 'longitude'>): SeaPosition | null {
  const latitude = parseSeaCoordinate(point.latitude, 'latitude');
  const longitude = parseSeaCoordinate(point.longitude, 'longitude');
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

const RAD = Math.PI / 180;
const EARTH_NM = 3440.065;
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
function angularDistance(a: SeaPosition, b: SeaPosition): number {
  const sinLat = Math.sin((b.latitude - a.latitude) * RAD / 2);
  const sinLon = Math.sin((b.longitude - a.longitude) * RAD / 2);
  return 2 * Math.asin(Math.sqrt(Math.min(1, sinLat ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * sinLon ** 2)));
}
function bearing(a: SeaPosition, b: SeaPosition): number {
  const lon = (b.longitude - a.longitude) * RAD;
  return Math.atan2(Math.sin(lon) * Math.cos(b.latitude * RAD), Math.cos(a.latitude * RAD) * Math.sin(b.latitude * RAD) - Math.sin(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.cos(lon));
}

/** Proximity to the minor great-circle leg, including endpoints. Not a navigable route. */
export function seaDistanceToLegNm(position: SeaPosition, start: SeaPosition, end: SeaPosition): number {
  const length = angularDistance(start, end);
  const fromStart = angularDistance(start, position);
  const endpoints = Math.min(fromStart, angularDistance(end, position));
  if (length < 1e-10 || length > Math.PI - 1e-6) return endpoints * EARTH_NM;
  const angle = bearing(start, position) - bearing(start, end);
  const along = Math.atan2(Math.sin(fromStart) * Math.cos(angle), Math.cos(fromStart));
  if (along < 0 || along > length) return endpoints * EARTH_NM;
  return Math.min(endpoints, Math.abs(Math.asin(clamp(Math.sin(fromStart) * Math.sin(angle))))) * EARTH_NM;
}

/** Invalid/missing points break the route; never silently bridge them. */
export function seaDistanceToRouteNm(position: SeaPosition, points: readonly (SeaPosition | null)[]): number {
  let distance = Infinity;
  points.forEach((point, index) => {
    if (!point) return;
    distance = Math.min(distance, angularDistance(position, point) * EARTH_NM);
    const previous = points[index - 1];
    if (previous) distance = Math.min(distance, seaDistanceToLegNm(position, previous, point));
  });
  return distance;
}
