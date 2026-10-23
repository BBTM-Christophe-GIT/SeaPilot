import { describe, expect, it } from 'vitest';
import { buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT, moveRouteMapViewport, routeMapPositionAt, zoomRouteMapViewport } from './seaOperationRouteMapGeometry';

const point = (latitude: string, longitude: string, number = '') => ({ latitude, longitude, number, descriptionVhf: '' });
const allCoordinates = (map: ReturnType<typeof buildSeaOperationRouteMap>) => [...map.land.flat(), ...map.points, ...map.segments.flatMap(({ from, to }) => [from, to])];

describe('Passage Plan situation map', () => {
  it('fits the Channel route north-up, keeps input order and includes a local coastline', () => {
    const map = buildSeaOperationRouteMap([point('48.38', '-4.49', 'Brest'), point('50.35', '-4.15', 'Plymouth'), point('49°39 N', '001°37.2 O', 'Cherbourg')]);
    expect(map.points.map(({ label, index }) => [label, index])).toEqual([['Brest', 1], ['Plymouth', 2], ['Cherbourg', 3]]);
    expect(map.points[1].y).toBeLessThan(map.points[0].y);
    expect(map.points[2].x).toBeGreaterThan(map.points[1].x);
    expect(map.segments).toHaveLength(2);
    expect(map.land.length).toBeGreaterThan(0);
    expect(map.grid.length).toBeGreaterThan(2);
    expect(map.scale?.label).toMatch(/ NM$/);
    expect(allCoordinates(map).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= map.width && y >= 0 && y <= map.height)).toBe(true);
  });

  it('never connects across missing or invalid positions and retains original ordinals', () => {
    const map = buildSeaOperationRouteMap([point('49', '-2'), point('', '-1'), point('49.5', '0'), point('91', '1'), point('50', '2')]);
    expect(map.points.map(({ index }) => index)).toEqual([1, 3, 5]);
    expect(map.invalidCount).toBe(2);
    expect(map.segments).toEqual([]);
  });

  it('handles empty, identical and zero coordinates without inventing a route', () => {
    expect(buildSeaOperationRouteMap([])).toMatchObject({ points: [], segments: [], land: [], scale: null });
    expect(buildSeaOperationRouteMap([point('NaN', '0')])).toMatchObject({ invalidCount: 1, points: [], scale: null });
    const map = buildSeaOperationRouteMap([point('0', '0'), point('0', '0')]);
    expect(map.points).toHaveLength(2);
    expect(map.segments).toEqual([]);
    expect(map.points[0]).toMatchObject({ x: 450, y: 160 });
    expect(allCoordinates(map).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it('keeps an antimeridian crossing local rather than drawing a world-spanning leg', () => {
    const map = buildSeaOperationRouteMap([point('-17', '179.5'), point('-17', '-179.5')]);
    expect(map.segments).toHaveLength(1);
    expect(map.points[1].x).toBeGreaterThan(map.points[0].x);
    expect(map.grid.some(({ label }) => label.includes('180'))).toBe(true);
    expect(Number.parseFloat(map.scale!.label)).toBeLessThan(60);
  });

  it('supports polar coordinates, custom PDF dimensions and a world view with finite clipped paths', () => {
    for (const points of [[point('90', '0')], [point('-90', '180')], [point('52', '-170'), point('-40', '0'), point('40', '170')]]) {
      const map = buildSeaOperationRouteMap(points, 743.92, 190);
      expect(map.width).toBe(743.92);
      expect(map.height).toBe(190);
      expect(allCoordinates(map).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= map.width && y >= 0 && y <= map.height)).toBe(true);
    }
  });

  it('does not mutate the recorded waypoint payload', () => {
    const points = [point('49.65', '-1.62', ' A-1 '), point('50.35', '-4.15')];
    const before = structuredClone(points);
    expect(buildSeaOperationRouteMap(points).points.map(({ label }) => label)).toEqual(['A-1', '2']);
    expect(points).toEqual(before);
  });

  it('renders an empty locked view without fabricating a waypoint, while preserving empty automatic exports', () => {
    const automatic = buildSeaOperationRouteMap([]);
    expect(automatic).toMatchObject({ viewport: null, projection: null, land: [], grid: [] });
    expect(routeMapPositionAt(automatic, 450, 160)).toBeNull();
    const locked = buildSeaOperationRouteMap([], 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(locked.viewport).toEqual(DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(locked.points).toEqual([]);
    expect(locked.land.length).toBeGreaterThan(0);
    expect(locked.grid.length).toBeGreaterThan(2);
    expect(locked.scale?.label).toMatch(/ NM$/);
    expect(routeMapPositionAt(locked, 450, 160)).toEqual({ latitude: 49, longitude: -3 });
    expect(routeMapPositionAt(locked, 675, 80)?.longitude).toBe(1);
    expect(routeMapPositionAt(locked, 675, 80)!.latitude).toBeGreaterThan(49);
  });

  it('round trips recorded positions through the original automatic projection and the locked view', () => {
    const positions = [point('48.36', '-4.53'), point('50.35', '-4.15'), point('49.65', '-1.62')];
    for (const viewport of [undefined, DEFAULT_ROUTE_MAP_VIEWPORT]) {
      const map = buildSeaOperationRouteMap(positions, 900, 320, viewport);
      map.points.forEach((projected, index) => {
        const recovered = routeMapPositionAt(map, projected.x, projected.y)!;
        expect(recovered.latitude).toBeCloseTo(Number(positions[index].latitude), 3);
        expect(recovered.longitude).toBeCloseTo(Number(positions[index].longitude), 3);
      });
    }
  });

  it('keeps the locked background and frame fixed when clicked points are added or edited outside the view', () => {
    const before = buildSeaOperationRouteMap([], 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    const clicked = routeMapPositionAt(before, 620, 110)!;
    const points = [point(String(clicked.latitude), String(clicked.longitude))];
    const after = buildSeaOperationRouteMap(points, 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(after.points[0]).toMatchObject({ x: 620, y: 110 });
    points.push(point('-40', '160'));
    const edited = buildSeaOperationRouteMap(points, 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(edited.viewport).toEqual(before.viewport);
    expect(edited.projection).toEqual(before.projection);
    expect(edited.land).toEqual(before.land);
    expect(edited.grid).toEqual(before.grid);
    expect(edited.points[0]).toMatchObject({ x: 620, y: 110 });
  });

  it('preserves longitude coverage and centre through a responsive resize', () => {
    const desktop = buildSeaOperationRouteMap([], 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    const mobile = buildSeaOperationRouteMap([], 390, 280, DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(mobile.viewport).toEqual(desktop.viewport);
    for (const fraction of [0, .25, .5, 1]) {
      expect(routeMapPositionAt(mobile, 390 * fraction, 140)?.longitude).toBeCloseTo(routeMapPositionAt(desktop, 900 * fraction, 160)!.longitude, 9);
    }
    expect(routeMapPositionAt(mobile, 195, 0)!.latitude).toBeGreaterThan(routeMapPositionAt(desktop, 450, 0)!.latitude);
    expect(routeMapPositionAt(mobile, 195, 140)).toEqual({ latitude: 49, longitude: -3 });
  });

  it('handles locked antimeridian positions and both ±180 aliases without a world-spanning leg', () => {
    const map = buildSeaOperationRouteMap([point('0', '179'), point('0', '-179')], 900, 320, { centerLatitude: 0, centerLongitude: 180, longitudeSpan: 4 });
    expect(map.viewport).toEqual({ centerLatitude: 0, centerLongitude: -180, longitudeSpan: 4 });
    expect(map.segments).toHaveLength(1);
    expect(map.points.map(({ x }) => x)).toEqual([225, 675]);
    expect(routeMapPositionAt(map, 225, 160)).toEqual({ latitude: 0, longitude: 179 });
    expect(routeMapPositionAt(map, 675, 160)).toEqual({ latitude: 0, longitude: -179 });
    const seam = buildSeaOperationRouteMap([point('0', '180'), point('0', '-180')], 900, 320, map.viewport!);
    expect(seam.points.map(({ x, y }) => [x, y])).toEqual([[450, 160], [450, 160]]);
    expect(seam.segments).toEqual([]);
    expect(routeMapPositionAt(seam, 450, 160)?.longitude).toBe(-180);
  });

  it('rejects clicks outside the viewBox, nonfinite inputs and projected positions beyond a pole', () => {
    const map = buildSeaOperationRouteMap([], 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT);
    for (const [x, y] of [[-1, 0], [901, 0], [0, -1], [0, 321], [NaN, 0], [0, Infinity]]) expect(routeMapPositionAt(map, x, y)).toBeNull();
    for (const latitude of [-89.9, 89.9]) {
      const polar = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: latitude, centerLongitude: 0, longitudeSpan: 360 });
      expect(routeMapPositionAt(polar, 450, latitude > 0 ? 0 : 320)).toBeNull();
      expect(routeMapPositionAt(polar, 450, 160)?.latitude).toBe(latitude);
    }
    expect(routeMapPositionAt({ ...map, projection: { ...map.projection!, latitudePixelsPerDegree: 0 } }, 450, 160)).toBeNull();
  });

  it('normalizes locked extents and prevents repeated worlds or nonfinite pan/zoom results', () => {
    const normalized = buildSeaOperationRouteMap([], NaN, Infinity, { centerLatitude: 120, centerLongitude: 540, longitudeSpan: 1000 });
    expect(normalized).toMatchObject({ width: 900, height: 320, viewport: { centerLatitude: 90, centerLongitude: -180, longitudeSpan: 360 } });
    expect(normalized.land.flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 900 && y >= 0 && y <= 320)).toBe(true);
    expect(buildSeaOperationRouteMap([], 900, 320, { centerLatitude: NaN, centerLongitude: Infinity, longitudeSpan: NaN }).viewport).toEqual(DEFAULT_ROUTE_MAP_VIEWPORT);
    expect(zoomRouteMapViewport(DEFAULT_ROUTE_MAP_VIEWPORT, 1e-308).longitudeSpan).toBe(360);
    expect(zoomRouteMapViewport(DEFAULT_ROUTE_MAP_VIEWPORT, 1e308).longitudeSpan).toBe(.02);
    expect(moveRouteMapViewport(DEFAULT_ROUTE_MAP_VIEWPORT, 1e308, 1e308)).toMatchObject({ centerLatitude: 90, longitudeSpan: 16 });
    expect(Number.isFinite(moveRouteMapViewport(DEFAULT_ROUTE_MAP_VIEWPORT, 1e308, 1e308).centerLongitude)).toBe(true);
  });

  it('moves by visible fractions and zooms without mutating the supplied view or waypoint payload', () => {
    const original = { ...DEFAULT_ROUTE_MAP_VIEWPORT };
    const moved = moveRouteMapViewport(original, .25, .5, 900, 320);
    expect(moved.centerLongitude).toBe(1);
    expect(moved.centerLatitude).toBeCloseTo(49 + 320 / 900 * 16 * Math.cos(49 * Math.PI / 180) / 2, 9);
    expect(zoomRouteMapViewport(original, 2)).toEqual({ ...original, longitudeSpan: 8 });
    expect(zoomRouteMapViewport(original, .5)).toEqual({ ...original, longitudeSpan: 32 });
    for (const factor of [0, -1, NaN, Infinity]) expect(zoomRouteMapViewport(original, factor)).toEqual(original);
    expect(moveRouteMapViewport(original, NaN, Infinity)).toEqual(original);
    expect(original).toEqual(DEFAULT_ROUTE_MAP_VIEWPORT);
  });
});
