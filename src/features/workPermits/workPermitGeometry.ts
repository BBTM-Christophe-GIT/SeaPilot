import type { PlanPoint } from './workPermitQueries';

export const MAX_POLYGON_VERTICES = 40;
const epsilon = 1e-12;
const minimumArea = 1e-8;

function clamp(value: number, lower: number, upper: number) {
  return Math.min(upper, Math.max(lower, value));
}

function onPlan({ x, y }: PlanPoint) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

function cross(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function orientation(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  const value = cross(a, b, c);
  return Math.abs(value) <= epsilon ? 0 : Math.sign(value);
}

function doubledArea(points: readonly PlanPoint[]) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - point.y * next.x;
  }, 0);
}

function withinSegmentBounds(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  return point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function edgesIntersect(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return (abc * abd < 0 && cda * cdb < 0)
    || (abc === 0 && withinSegmentBounds(c, a, b))
    || (abd === 0 && withinSegmentBounds(d, a, b))
    || (cda === 0 && withinSegmentBounds(a, c, d))
    || (cdb === 0 && withinSegmentBounds(b, c, d));
}

export function isValidPolygon(points: readonly PlanPoint[]): boolean {
  const size = points.length;
  if (size < 3 || size > MAX_POLYGON_VERTICES || !points.every(onPlan) || Math.abs(doubledArea(points)) < minimumArea) return false;

  for (let index = 0; index < size; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % size];
    const next = points[(index + 2) % size];
    if (Math.abs(start.x - end.x) <= epsilon && Math.abs(start.y - end.y) <= epsilon) return false;

    // Consecutive collinear edges may continue in the same direction, but may not fold back.
    if (orientation(start, end, next) === 0
      && (start.x - end.x) * (next.x - end.x) + (start.y - end.y) * (next.y - end.y) > 0) return false;

    for (let other = index + 2; other < size; other += 1) {
      if (index === 0 && other === size - 1) continue;
      if (edgesIntersect(start, end, points[other], points[(other + 1) % size])) return false;
    }
  }
  return true;
}

export function translatePolygon(points: readonly PlanPoint[], dx: number, dy: number): PlanPoint[] {
  if (!points.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return [...points];
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const shiftX = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
  const shiftY = clamp(dy, -Math.min(...ys), 1 - Math.max(...ys));

  // Clamp the common offset first so every vertex moves together.
  return points.map(({ x, y }) => ({ x: clamp(x + shiftX, 0, 1), y: clamp(y + shiftY, 0, 1) }));
}

function distanceToEdge(point: PlanPoint, start: PlanPoint, end: PlanPoint, aspectRatio: number) {
  const edgeX = (end.x - start.x) * aspectRatio;
  const edgeY = end.y - start.y;
  const pointX = (point.x - start.x) * aspectRatio;
  const pointY = point.y - start.y;
  const fraction = clamp((pointX * edgeX + pointY * edgeY) / (edgeX ** 2 + edgeY ** 2), 0, 1);
  return (pointX - fraction * edgeX) ** 2 + (pointY - fraction * edgeY) ** 2;
}

export function insertPolygonVertex(points: readonly PlanPoint[], point: PlanPoint, aspectRatio = 1): PlanPoint[] | null {
  if (points.length >= MAX_POLYGON_VERTICES || !onPlan(point) || !isValidPolygon(points)) return null;

  const winding = Math.sign(doubledArea(points));
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const edges = points.map((start, index) => {
    const end = points[(index + 1) % points.length];
    return {
      index,
      expansion: cross(start, point, end) * winding,
      distance: distanceToEdge(point, start, end, ratio),
    };
  }).filter(({ expansion }) => expansion >= -epsilon)
    .sort((left, right) => Number(right.expansion > epsilon) - Number(left.expansion > epsilon) || left.distance - right.distance);

  for (const { index } of edges) {
    const candidate = [...points.slice(0, index + 1), point, ...points.slice(index + 1)];
    if (isValidPolygon(candidate) && Math.sign(doubledArea(candidate)) === winding) return candidate;
  }
  return null;
}
