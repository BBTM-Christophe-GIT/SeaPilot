import type { RouteMapPosition, SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

export type NavigationCategory = 2 | 3;
type Coordinate = readonly [longitude: number, latitude: number];
interface PreparedChunk {
  readonly coordinates: readonly Coordinate[];
  readonly west: number; readonly east: number; readonly south: number; readonly north: number;
}
interface PreparedLine { readonly chunks: readonly PreparedChunk[] }
export interface PreparedNavigationCategoryLines {
  readonly categories: readonly { readonly category: NavigationCategory; readonly lines: readonly PreparedLine[] }[];
  readonly coordinateCount: number;
  readonly lineCount: number;
}
export interface ProjectedNavigationCategory {
  category: NavigationCategory;
  path: string;
  /** Source polylines with at least one nonzero, visible segment. */
  visibleCount: number;
  /** Visible source segments before screen-space simplification. */
  segmentCount: number;
}
export interface ProjectedNavigationCategoryLines {
  categories: ProjectedNavigationCategory[];
  visibleCount: number;
  segmentCount: number;
}

export const NAVIGATION_CATEGORY_DATA_LIMITS = Object.freeze({ categories: 8, lines: 100, coordinates: 20_000 });
const CHUNK_SEGMENTS = 64;
// Rounding adds less than .008 px, keeping the total displacement below .4 px.
const SIMPLIFICATION_TOLERANCE = .35;
const wrapLongitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const coordinate = (value: unknown): Coordinate | null => Array.isArray(value)
  && typeof value[0] === 'number' && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180
  && typeof value[1] === 'number' && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
  ? [value[0], value[1]] : null;

/**
 * Prepare a pinned WGS84 { categories: [{ category: 2 | 3, lines: [ [[lon, lat], ...], ...] }] } dataset once.
 * Copies coordinates and precomputes small bounding boxes; no source geometry is closed or filled.
 * Invalid coordinates break a line. Oversized inputs fail as a whole instead of displaying truncated limits.
 */
export function prepareNavigationCategoryLines(input: unknown): PreparedNavigationCategoryLines {
  const groups = isRecord(input) && Array.isArray(input.categories) ? input.categories : [];
  if (groups.length > NAVIGATION_CATEGORY_DATA_LIMITS.categories) throw new RangeError('Trop de catégories de navigation.');
  const linesByCategory: Record<NavigationCategory, PreparedLine[]> = { 2: [], 3: [] };
  let coordinateCount = 0, lineCount = 0;
  for (const group of groups) {
    if (!isRecord(group) || (group.category !== 2 && group.category !== 3) || !Array.isArray(group.lines)) continue;
    lineCount += group.lines.length;
    if (lineCount > NAVIGATION_CATEGORY_DATA_LIMITS.lines) throw new RangeError('Trop de limites de navigation.');
    for (const line of group.lines) {
      if (!Array.isArray(line)) continue;
      coordinateCount += line.length;
      if (coordinateCount > NAVIGATION_CATEGORY_DATA_LIMITS.coordinates) throw new RangeError('Trop de coordonnées de navigation.');
      const chunks: PreparedChunk[] = [];
      let points: Coordinate[] = [], west = 0, east = 0, south = 0, north = 0;
      const flush = () => {
        if (points.length >= 2) chunks.push(Object.freeze({ coordinates: Object.freeze(points), west, east, south, north }));
        points = [];
      };
      const begin = (point: Coordinate) => {
        points = [point]; west = east = point[0]; south = north = point[1];
      };
      for (const value of line) {
        const valid = coordinate(value);
        if (!valid) { flush(); continue; }
        const previous = points.at(-1);
        const unwrapped: Coordinate = previous ? [previous[0] + wrapLongitude(valid[0] - previous[0]), valid[1]] : valid;
        const point = Object.freeze(unwrapped);
        if (!previous) { begin(point); continue; }
        if (point[0] === previous[0] && point[1] === previous[1]) continue;
        // A chunk spans at most half a world, so three nearby world copies are always sufficient.
        if (points.length > CHUNK_SEGMENTS || Math.max(east, point[0]) - Math.min(west, point[0]) > 180) {
          flush(); begin(previous);
        }
        points.push(point);
        west = Math.min(west, point[0]); east = Math.max(east, point[0]);
        south = Math.min(south, point[1]); north = Math.max(north, point[1]);
      }
      flush();
      if (chunks.length) linesByCategory[group.category].push(Object.freeze({ chunks: Object.freeze(chunks) }));
    }
  }
  return Object.freeze({ categories: Object.freeze(([2, 3] as const).map(category => Object.freeze({ category,
    lines: Object.freeze(linesByCategory[category]) }))), coordinateCount, lineCount });
}

/** Liang-Barsky clipping retains segments whose two endpoints are outside opposite sides. */
function clipSegment(from: RouteMapPosition, to: RouteMapPosition, left: number, right: number, height: number): [RouteMapPosition, RouteMapPosition] | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  let start = 0, end = 1;
  for (const [p, q] of [[-dx, from.x - left], [dx, right - from.x], [-dy, from.y], [dy, height - from.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const fraction = q / p;
    if (p < 0) start = Math.max(start, fraction);
    else end = Math.min(end, fraction);
    if (start >= end) return null;
  }
  const pointAt = (fraction: number) => ({ x: Math.max(left, Math.min(right, from.x + fraction * dx)),
    y: Math.max(0, Math.min(height, from.y + fraction * dy)) });
  const a = pointAt(start), b = pointAt(end);
  return a.x === b.x && a.y === b.y ? null : [a, b];
}
const samePoint = (a: RouteMapPosition, b: RouteMapPosition) => Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
function squaredDistanceToSegment(point: RouteMapPosition, from: RouteMapPosition, to: RouteMapPosition) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const fraction = length ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length)) : 0;
  return (point.x - from.x - fraction * dx) ** 2 + (point.y - from.y - fraction * dy) ** 2;
}
/** Iterative Douglas-Peucker on at most 65 points bounds work even for an adversarial long polyline. */
function simplify(points: RouteMapPosition[]): RouteMapPosition[] {
  if (points.length <= 2) return points;
  const retained = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    let maximum = SIMPLIFICATION_TOLERANCE ** 2, furthest = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = squaredDistanceToSegment(points[index], points[start], points[end]);
      if (distance > maximum) { maximum = distance; furthest = index; }
    }
    if (furthest < 0) continue;
    retained.add(furthest); pending.push([start, furthest], [furthest, end]);
  }
  return points.filter((_, index) => retained.has(index));
}
const pathFor = (points: RouteMapPosition[], width: number, height: number) => simplify(points).map(({ x, y }, index) =>
  `${index ? 'L' : 'M'}${Math.max(0, Math.min(width, Math.round(x * 100) / 100))},${Math.max(0, Math.min(height, Math.round(y * 100) / 100))}`).join('');

/** Pure viewport projection: no network, buffers, area inference, classification or source mutation. */
export function projectNavigationCategoryLines(prepared: PreparedNavigationCategoryLines,
  geometry: Pick<SeaOperationRouteMapGeometry, 'width' | 'height' | 'projection'>): ProjectedNavigationCategoryLines {
  const categories: ProjectedNavigationCategory[] = ([2, 3] as const).map(category => ({ category, path: '', visibleCount: 0, segmentCount: 0 }));
  const result = { categories, visibleCount: 0, segmentCount: 0 };
  const { width, height, projection } = geometry;
  if (!projection || ![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 4000)
    || ![projection.latitudePixelsPerDegree, projection.longitudePixelsPerDegree].every(value => Number.isFinite(value) && value > 0 && value <= 1e9)
    || !Number.isFinite(projection.centerLatitude) || Math.abs(projection.centerLatitude) > 90
    || !Number.isFinite(projection.centerLongitude) || Math.abs(projection.centerLongitude) > 180) return result;
  const p = projection, halfLongitude = Math.min(180, width / (2 * p.longitudePixelsPerDegree));
  const west = p.centerLongitude - halfLongitude, east = p.centerLongitude + halfLongitude;
  const south = p.centerLatitude - height / (2 * p.latitudePixelsPerDegree), north = p.centerLatitude + height / (2 * p.latitudePixelsPerDegree);
  const left = Math.max(0, width / 2 - 180 * p.longitudePixelsPerDegree), right = Math.min(width, width / 2 + 180 * p.longitudePixelsPerDegree);
  for (const source of prepared.categories) {
    const category = categories.find(item => item.category === source.category)!;
    const paths: string[] = [];
    for (const line of source.lines) {
      let visible = false;
      for (const chunk of line.chunks) {
        if (chunk.south > north || chunk.north < south) continue;
        const centralShift = 360 * Math.round((p.centerLongitude - (chunk.west + chunk.east) / 2) / 360);
        for (const shift of [centralShift - 360, centralShift, centralShift + 360]) {
          if (chunk.east + shift < west || chunk.west + shift > east) continue;
          let fragment: RouteMapPosition[] = [];
          const flush = () => { if (fragment.length > 1) paths.push(pathFor(fragment, width, height)); fragment = []; };
          const project = ([longitude, latitude]: Coordinate) => ({ x: width / 2 + (longitude + shift - p.centerLongitude) * p.longitudePixelsPerDegree,
            y: height / 2 - (latitude - p.centerLatitude) * p.latitudePixelsPerDegree });
          let previous = project(chunk.coordinates[0]);
          for (let index = 1; index < chunk.coordinates.length; index += 1) {
            const current = project(chunk.coordinates[index]), segment = clipSegment(previous, current, left, right, height);
            previous = current;
            if (!segment) { flush(); continue; }
            category.segmentCount += 1; visible = true;
            if (fragment.length && !samePoint(fragment.at(-1)!, segment[0])) flush();
            if (!fragment.length) fragment.push(segment[0]);
            fragment.push(segment[1]);
          }
          flush();
        }
      }
      if (visible) category.visibleCount += 1;
    }
    category.path = paths.join('');
    result.visibleCount += category.visibleCount; result.segmentCount += category.segmentCount;
  }
  return result;
}
