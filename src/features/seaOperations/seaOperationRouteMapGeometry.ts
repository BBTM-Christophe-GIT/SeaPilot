import worldLandJson from './mapData/world-land.json?raw';
import europeLandJson from './mapData/europe-land.json?raw';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition, type SeaPosition } from './seaOperationNavigation';

export interface RouteMapPosition { x: number; y: number }
export interface RouteMapSegment { from: RouteMapPosition; to: RouteMapPosition }
export interface RouteMapViewport { centerLatitude: number; centerLongitude: number; longitudeSpan: number }
export interface RouteMapProjection {
  centerLatitude: number;
  centerLongitude: number;
  latitudePixelsPerDegree: number;
  longitudePixelsPerDegree: number;
}
export const DEFAULT_ROUTE_MAP_VIEWPORT: Readonly<RouteMapViewport> = Object.freeze({ centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 });
export interface SeaOperationRouteMapGeometry {
  width: number;
  height: number;
  land: RouteMapPosition[][];
  grid: Array<RouteMapSegment & { label: string; labelAt: RouteMapPosition }>;
  segments: RouteMapSegment[];
  points: Array<RouteMapPosition & { index: number; label: string; description: string }>;
  invalidCount: number;
  scale: (RouteMapSegment & { label: string }) | null;
  viewport: RouteMapViewport | null;
  projection: RouteMapProjection | null;
}

// Owned, simplified Natural Earth data; see mapData/README.md for provenance.
const prepareLand = (json: string) => (JSON.parse(json) as number[][][]).map((ring) => ({
  ring,
  west: Math.min(...ring.map(([longitude]) => longitude)),
  east: Math.max(...ring.map(([longitude]) => longitude)),
  south: Math.min(...ring.map(([, latitude]) => latitude)),
  north: Math.max(...ring.map(([, latitude]) => latitude)),
}));
const worldLand = prepareLand(worldLandJson);
const europeLand = prepareLand(europeLandJson);
const wrapLongitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
const dimensions = (width: number, height: number) => ({
  width: Number.isFinite(width) ? Math.max(120, Math.min(4000, width)) : 900,
  height: Number.isFinite(height) ? Math.max(100, Math.min(2000, height)) : 320,
});
const latitudeFactorAt = (latitude: number) => Math.max(.05, Math.cos(latitude * Math.PI / 180));
const normalizeViewport = (viewport: RouteMapViewport): RouteMapViewport => ({
  centerLatitude: Number.isFinite(viewport?.centerLatitude) ? Math.max(-90, Math.min(90, viewport.centerLatitude)) : DEFAULT_ROUTE_MAP_VIEWPORT.centerLatitude,
  centerLongitude: Number.isFinite(viewport?.centerLongitude) ? wrapLongitude(viewport.centerLongitude) : DEFAULT_ROUTE_MAP_VIEWPORT.centerLongitude,
  longitudeSpan: Number.isFinite(viewport?.longitudeSpan) ? Math.max(.02, Math.min(360, viewport.longitudeSpan)) : DEFAULT_ROUTE_MAP_VIEWPORT.longitudeSpan,
});

/** Fractions of the visible width/height; positive values move east/north without changing waypoints. */
export function moveRouteMapViewport(viewport: RouteMapViewport, eastFraction: number, northFraction: number, width = 900, height = 320): RouteMapViewport {
  const normalized = normalizeViewport(viewport);
  const size = dimensions(width, height);
  const latitudeSpan = size.height / size.width * normalized.longitudeSpan * latitudeFactorAt(normalized.centerLatitude);
  const east = Number.isFinite(eastFraction) ? (eastFraction % (360 / normalized.longitudeSpan)) * normalized.longitudeSpan : 0;
  const north = Number.isFinite(northFraction) ? Math.sign(northFraction) * Math.min(Math.abs(northFraction), 180 / latitudeSpan) * latitudeSpan : 0;
  return normalizeViewport({ ...normalized, centerLongitude: normalized.centerLongitude + east, centerLatitude: normalized.centerLatitude + north });
}

/** A factor greater than one zooms in; longitude never spans more than one world. */
export function zoomRouteMapViewport(viewport: RouteMapViewport, factor: number): RouteMapViewport {
  const normalized = normalizeViewport(viewport);
  if (!Number.isFinite(factor) || factor <= 0) return normalized;
  return normalizeViewport({ ...normalized, longitudeSpan: Math.max(.02, Math.min(360, normalized.longitudeSpan / factor)) });
}

/** Pixels must already be transformed into the SVG viewBox; no clamped or guessed maritime position. */
export function routeMapPositionAt(geometry: SeaOperationRouteMapGeometry, x: number, y: number): SeaPosition | null {
  const projection = geometry.projection;
  if (!projection || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > geometry.width || y > geometry.height
    || !Number.isFinite(projection.centerLatitude) || !Number.isFinite(projection.centerLongitude)
    || !Number.isFinite(projection.latitudePixelsPerDegree) || projection.latitudePixelsPerDegree <= 0
    || !Number.isFinite(projection.longitudePixelsPerDegree) || projection.longitudePixelsPerDegree <= 0) return null;
  const latitude = projection.centerLatitude + (geometry.height / 2 - y) / projection.latitudePixelsPerDegree;
  const longitude = wrapLongitude(projection.centerLongitude + (x - geometry.width / 2) / projection.longitudePixelsPerDegree);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}
const rounded = (value: number) => Math.round(value * 100) / 100;
const niceStep = (value: number) => {
  const unit = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].find((step) => step * unit >= value)! * unit;
};

/** Sutherland-Hodgman clipping keeps both SVG and PDF paths inside the map. */
function clipLand(ring: RouteMapPosition[], width: number, height: number): RouteMapPosition[] {
  let output = ring;
  for (const [axis, boundary, minimum] of [['x', 0, true], ['x', width, false], ['y', 0, true], ['y', height, false]] as const) {
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    let previousInside = minimum ? previous[axis] >= boundary : previous[axis] <= boundary;
    for (const current of input) {
      const currentInside = minimum ? current[axis] >= boundary : current[axis] <= boundary;
      if (currentInside !== previousInside) {
        const fraction = (boundary - previous[axis]) / (current[axis] - previous[axis]);
        output.push({ x: previous.x + fraction * (current.x - previous.x), y: previous.y + fraction * (current.y - previous.y) });
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
  }
  return output.map(({ x, y }) => ({ x: rounded(x), y: rounded(y) }));
}

function clipSegment(from: RouteMapPosition, to: RouteMapPosition, width: number, height: number): RouteMapSegment | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  let start = 0, end = 1;
  for (const [p, q] of [[-dx, from.x], [dx, width - from.x], [-dy, from.y], [dy, height - from.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const fraction = q / p;
    if (p < 0) start = Math.max(start, fraction);
    else end = Math.min(end, fraction);
    if (start > end) return null;
  }
  return { from: { x: rounded(from.x + start * dx), y: rounded(from.y + start * dy) }, to: { x: rounded(from.x + end * dx), y: rounded(from.y + end * dy) } };
}

/**
 * North-up local equirectangular situation map, not a chart or route planner.
 * Uses only recorded WGS84 coordinates; an invalid row breaks its adjacent legs.
 * The shortest longitude envelope keeps antimeridian routes local.
 */
export function buildSeaOperationRouteMap(
  waypoints: readonly Pick<SeaOperationWaypoint, 'latitude' | 'longitude' | 'number' | 'descriptionVhf'>[],
  width = 900,
  height = 320,
  viewport?: RouteMapViewport,
): SeaOperationRouteMapGeometry {
  ({ width, height } = dimensions(width, height));
  const positions = waypoints.map(seaWaypointPosition);
  const validPositions = positions.filter((point) => point !== null);
  const result: SeaOperationRouteMapGeometry = { width, height, land: [], grid: [], segments: [], points: [], invalidCount: waypoints.length - validPositions.length, scale: null, viewport: null, projection: null };
  if (!validPositions.length && viewport === undefined) return result;

  let centerLon: number, centerLat: number, unitScale: number, longitudeFor: (longitude: number) => number;
  const locked = viewport === undefined ? null : normalizeViewport(viewport);
  if (locked) {
    centerLon = locked.centerLongitude; centerLat = locked.centerLatitude;
    unitScale = width / (locked.longitudeSpan * latitudeFactorAt(centerLat));
    longitudeFor = (longitude) => centerLon + wrapLongitude(longitude - centerLon);
  } else {
    // Preserve the historical automatic framing used by signed print/PDF exports.
    const longitudes = validPositions.map(({ longitude }) => (longitude + 360) % 360).sort((a, b) => a - b);
    let cut = 0, largestGap = -1;
    longitudes.forEach((longitude, index) => {
      const gap = (longitudes[index + 1] ?? longitudes[0] + 360) - longitude;
      if (gap > largestGap) { largestGap = gap; cut = longitudes[(index + 1) % longitudes.length]; }
    });
    longitudeFor = (longitude) => ((longitude - cut) % 360 + 360) % 360 + cut;
    const unwrapped = validPositions.map(({ longitude }) => longitudeFor(longitude));
    const minLon = Math.min(...unwrapped), maxLon = Math.max(...unwrapped);
    const latitudes = validPositions.map(({ latitude }) => latitude);
    const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    centerLon = (minLon + maxLon) / 2; centerLat = (minLat + maxLat) / 2;
    unitScale = Math.min((width - 80) / Math.max(.8, (maxLon - minLon) * latitudeFactorAt(centerLat) * 1.35), (height - 64) / Math.max(.45, (maxLat - minLat) * 1.5));
  }
  const latitudeFactor = latitudeFactorAt(centerLat);
  result.viewport = locked ?? { centerLatitude: centerLat, centerLongitude: wrapLongitude(centerLon), longitudeSpan: width / (latitudeFactor * unitScale) };
  result.projection = { centerLatitude: centerLat, centerLongitude: wrapLongitude(centerLon), latitudePixelsPerDegree: unitScale, longitudePixelsPerDegree: latitudeFactor * unitScale };
  const project = (longitude: number, latitude: number): RouteMapPosition => ({ x: rounded(width / 2 + (longitude - centerLon) * latitudeFactor * unitScale), y: rounded(height / 2 - (latitude - centerLat) * unitScale) });
  const west = centerLon - width / (2 * latitudeFactor * unitScale), east = centerLon + width / (2 * latitudeFactor * unitScale);
  const south = centerLat - height / (2 * unitScale), north = centerLat + height / (2 * unitScale);
  const longitudeShift = 360 * Math.round(centerLon / 360);
  const detailed = west - longitudeShift >= -15 && east - longitudeShift <= 12 && south >= 40 && north <= 58;

  for (const { ring, west: ringWest, east: ringEast, north: ringNorth, south: ringSouth } of detailed ? europeLand : worldLand) {
    if (ringSouth > north || ringNorth < south) continue;
    const centralShift = 360 * Math.round((centerLon - (ringWest + ringEast) / 2) / 360);
    for (const shift of [centralShift - 360, centralShift, centralShift + 360]) {
      if (ringEast + shift < west || ringWest + shift > east) continue;
      const clipped = clipLand(ring.map(([longitude, latitude]) => project(longitude + shift, latitude)), width, height);
      if (clipped.length >= 3) result.land.push(clipped);
    }
  }

  const formatCoordinate = (value: number, latitude: boolean) => {
    const number = latitude ? value : wrapLongitude(value);
    return `${Number(Math.abs(number).toFixed(2))}°${Math.abs(number) < .00001 ? '' : latitude ? number < 0 ? 'S' : 'N' : number < 0 ? 'O' : 'E'}`;
  };
  const lonStep = niceStep((east - west) / 5), latStep = niceStep((north - south) / 3);
  for (let lon = Math.ceil(west / lonStep) * lonStep; lon <= east; lon += lonStep) {
    const from = project(lon, north), to = project(lon, south);
    result.grid.push({ from, to, label: formatCoordinate(lon, false), labelAt: { x: Math.max(24, Math.min(width - 30, to.x)), y: height - 7 } });
  }
  for (let lat = Math.ceil(Math.max(-90, south) / latStep) * latStep; lat <= Math.min(90, north); lat += latStep) {
    const from = project(west, lat), to = project(east, lat);
    result.grid.push({ from, to, label: formatCoordinate(lat, true), labelAt: { x: 7, y: Math.max(12, Math.min(height - 25, from.y - 4)) } });
  }

  positions.forEach((position, index) => {
    if (!position) return;
    const longitude = longitudeFor(position.longitude);
    result.points.push({ ...project(longitude, position.latitude), index: index + 1, label: waypoints[index].number.trim() || String(index + 1), description: waypoints[index].descriptionVhf });
    const previous = positions[index - 1];
    if (!previous) return;
    const previousLongitude = longitudeFor(previous.longitude);
    const shortDelta = wrapLongitude(longitude - previousLongitude);
    for (const shift of [-360, 0, 360]) {
      const segment = clipSegment(project(previousLongitude + shift, previous.latitude), project(previousLongitude + shortDelta + shift, position.latitude), width, height);
      if (segment && (segment.from.x !== segment.to.x || segment.from.y !== segment.to.y)) result.segments.push(segment);
    }
  });

  const targetNm = (Math.min(100, width / 5) / unitScale) * 60;
  const scaleNm = niceStep(targetNm / 2);
  const scaleWidth = scaleNm / 60 * unitScale;
  result.scale = { from: { x: width - 24 - scaleWidth, y: height - 27 }, to: { x: width - 24, y: height - 27 }, label: `${Number(scaleNm.toFixed(2))} NM` };
  return result;
}
