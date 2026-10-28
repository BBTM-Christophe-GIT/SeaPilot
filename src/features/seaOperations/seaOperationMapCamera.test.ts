import { describe, expect, it } from 'vitest';
import { routeMapCameraTransform } from './seaOperationMapCamera';
import { projectSeaOperationMapPlace } from './seaOperationMapPlaces';
import { buildSeaOperationRouteMap, routeMapPositionAt, type RouteMapViewport, type SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

const frame = (viewport: RouteMapViewport, width = 900, height = 320) => buildSeaOperationRouteMap([], width, height, viewport);
const viewport = { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 8 };
const values = (transform: string | null) => {
  expect(transform).toMatch(/^matrix\([^()]+\)$/);
  const numbers = transform!.slice(7, -1).split(',').map(Number);
  expect(numbers).toHaveLength(6);
  expect(numbers.every(Number.isFinite)).toBe(true);
  return numbers;
};
const apply = (transform: string | null, point: { x: number; y: number }) => {
  const [a, b, c, d, e, f] = values(transform);
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
};

describe('Transient map camera transform', () => {
  it('keeps the recorded camera in place without changing its geometry or viewport', () => {
    const geometry = frame(viewport), original = structuredClone({ geometry, viewport });
    const transformed = apply(routeMapCameraTransform(geometry, viewport), { x: 123.456789, y: 234.567891 });
    expect(transformed.x).toBeCloseTo(123.456789, 10);
    expect(transformed.y).toBeCloseTo(234.567891, 10);
    expect({ geometry, viewport }).toEqual(original);
  });

  it.each([[900, 320], [390, 680], [1920, 1080]])('matches exact geographic projections after pan and zoom at %sx%s', (width, height) => {
    const before = frame(viewport, width, height);
    const next = { centerLatitude: 49.1, centerLongitude: -2.6, longitudeSpan: 6 };
    const after = frame(next, width, height);
    const transform = routeMapCameraTransform(before, next);
    for (const position of [{ latitude: 49.05, longitude: -2.8 }, { latitude: 49.2, longitude: -3.1 }]) {
      const point = projectSeaOperationMapPlace(before, position)!;
      const expected = projectSeaOperationMapPlace(after, position)!;
      expect(point).not.toBeNull(); expect(expected).not.toBeNull();
      const result = apply(transform, point);
      expect(result.x).toBeCloseTo(expected.x, 8);
      expect(result.y).toBeCloseTo(expected.y, 8);
    }
    const [sx, , , sy] = values(transform);
    expect(sx).not.toBe(sy);
  });

  it('preserves an off-centre geographic zoom anchor with fractional pixels', () => {
    const before = frame(viewport);
    const anchorPixel = { x: 687.123456789, y: before.height / 2 };
    const position = routeMapPositionAt(before, anchorPixel.x, anchorPixel.y)!;
    const next = { ...viewport, longitudeSpan: 3,
      centerLongitude: position.longitude - (anchorPixel.x - before.width / 2) / (before.width / 3) };
    const exact = projectSeaOperationMapPlace(frame(next), position)!;
    const result = apply(routeMapCameraTransform(before, next), anchorPixel);
    expect(result.x).toBeCloseTo(anchorPixel.x, 8);
    expect(result.y).toBeCloseTo(anchorPixel.y, 8);
    expect(result.x).toBeCloseTo(exact.x, 8);
    expect(result.y).toBeCloseTo(exact.y, 8);
  });

  it('uses the local wrapped longitude when the camera crosses the antimeridian', () => {
    const previous = { centerLatitude: 10, centerLongitude: 179.8, longitudeSpan: 4 };
    const next = { centerLatitude: 10.1, centerLongitude: -179.9, longitudeSpan: 3 };
    const before = frame(previous), after = frame(next);
    for (const position of [{ latitude: 10.05, longitude: -179.95 }, { latitude: 10.1, longitude: 179.7 }]) {
      const result = apply(routeMapCameraTransform(before, next), projectSeaOperationMapPlace(before, position)!);
      const expected = projectSeaOperationMapPlace(after, position)!;
      expect(result.x).toBeCloseTo(expected.x, 8);
      expect(result.y).toBeCloseTo(expected.y, 8);
    }
  });

  it('retains the native cosine floor near the pole and full precision at the minimum span', () => {
    const previous = { centerLatitude: 89.9, centerLongitude: 12, longitudeSpan: .04 };
    const next = { centerLatitude: 89.9001, centerLongitude: 12.0001, longitudeSpan: .02 };
    const position = { latitude: 89.90005, longitude: 12.0002 };
    const before = frame(previous), after = frame(next);
    const result = apply(routeMapCameraTransform(before, next), projectSeaOperationMapPlace(before, position)!);
    const expected = projectSeaOperationMapPlace(after, position)!;
    expect(result.x).toBeCloseTo(expected.x, 8);
    expect(result.y).toBeCloseTo(expected.y, 8);
  });

  it('does not invent a projection for an empty map', () => {
    expect(routeMapCameraTransform(buildSeaOperationRouteMap([]), viewport)).toBeNull();
  });

  it.each([
    { width: NaN }, { width: 0 }, { height: Infinity }, { height: -1 },
    { projection: { centerLatitude: NaN } }, { projection: { centerLongitude: Infinity } },
    { projection: { latitudePixelsPerDegree: 0 } }, { projection: { longitudePixelsPerDegree: -1 } },
    { projection: { latitudePixelsPerDegree: Infinity } }, { projection: { centerLatitude: 91 } },
  ])('rejects invalid base dimensions or projection %j', patch => {
    const before = frame(viewport);
    const invalid = { ...before, ...patch,
      projection: patch.projection ? { ...before.projection!, ...patch.projection } : before.projection } as SeaOperationRouteMapGeometry;
    expect(routeMapCameraTransform(invalid, viewport)).toBeNull();
  });

  it.each([
    { centerLatitude: NaN }, { centerLatitude: 91 }, { centerLongitude: Infinity },
    { longitudeSpan: 0 }, { longitudeSpan: -1 }, { longitudeSpan: Infinity }, { longitudeSpan: Number.MIN_VALUE },
  ])('rejects an invalid target camera or overflowing transform %j', patch => {
    expect(routeMapCameraTransform(frame(viewport), { ...viewport, ...patch })).toBeNull();
  });
});
