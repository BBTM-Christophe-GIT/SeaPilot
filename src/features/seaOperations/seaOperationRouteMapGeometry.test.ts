import { describe, expect, it } from 'vitest';
import { buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT, moveRouteMapViewport, routeMapPositionAt, routeMapViewportContainingPositions, zoomRouteMapViewport } from './seaOperationRouteMapGeometry';

const point = (latitude: string, longitude: string, number = '') => ({ latitude, longitude, number, descriptionVhf: '' });
const allCoordinates = (map: ReturnType<typeof buildSeaOperationRouteMap>) => [...map.land.flat(), ...map.points, ...map.segments.flatMap(({ from, to }) => [from, to])];

describe('Document containment of saved manual frames', () => {
  // The two six-vertex zones supplied in the report, converted from degrees/minutes.
  const vertices = [[50, 6.212, 1, 1.668], [50, 7.663, 1, 4.055], [50, 8.986, 1, 2.110], [50, 13.547, 1, 9.637], [50, 10.160, 1, 14.592], [50, 4.162, 1, 4.678],
    [50, 15.665, 1, 9.735], [50, 10.100, 1, 17.890], [50, 2.043, 1, 4.583], [50, 6.271, 0, 58.373], [50, 7.723, 1, 0.759], [50, 9.045, 0, 58.813]]
    .map(([lat, latMinutes, lon, lonMinutes]) => ({ latitude: lat + latMinutes / 60, longitude: lon + lonMinutes / 60 }));
  const route = [point('49.93', '1.08'), point('49.99', '1.02'), point('50.15', '1.13')];
  const manual = { centerLatitude: 50.05, centerLongitude: 1.2, longitudeSpan: 1.7 };

  it.each([[900, 220], [744, 190], [280, 220], [120, 100]])('keeps both reported zones inside a %sx%s document without changing the saved centre or route', (width, height) => {
    const original = structuredClone({ manual, route, vertices });
    const before = buildSeaOperationRouteMap(route, width, height, manual, vertices);
    if (width / height > 3.5) expect(vertices.some(position => position.latitude > before.projection!.centerLatitude + height / (2 * before.projection!.latitudePixelsPerDegree))).toBe(true);
    const expanded = routeMapViewportContainingPositions(manual, vertices, width, height)!;
    const after = buildSeaOperationRouteMap(route, width, height, expanded, vertices);
    expect(expanded).toMatchObject({ centerLatitude: manual.centerLatitude, centerLongitude: manual.centerLongitude });
    expect(expanded.longitudeSpan).toBeGreaterThanOrEqual(manual.longitudeSpan);
    expect(after.points.map(point => point.index)).toEqual([1, 2, 3]); expect(after.segments).toHaveLength(2);
    for (const vertex of vertices) {
      const x = width / 2 + (vertex.longitude - after.projection!.centerLongitude) * after.projection!.longitudePixelsPerDegree;
      const y = height / 2 - (vertex.latitude - after.projection!.centerLatitude) * after.projection!.latitudePixelsPerDegree;
      expect(x).toBeGreaterThanOrEqual(Math.min(40, width / 4) - .01); expect(x).toBeLessThanOrEqual(width - Math.min(40, width / 4) + .01);
      expect(y).toBeGreaterThanOrEqual(Math.min(32, height / 4) - .01); expect(y).toBeLessThanOrEqual(height - Math.min(32, height / 4) + .01);
    }
    expect({ manual, route, vertices }).toEqual(original);
    expect(buildSeaOperationRouteMap(route, width, height, manual, vertices)).toEqual(before);
  });

  it('leaves automatic or already sufficient manual frames unchanged and ignores invalid positions', () => {
    expect(routeMapViewportContainingPositions(undefined, vertices, 900, 220)).toBeUndefined();
    const automatic = buildSeaOperationRouteMap(route, 900, 220, undefined, vertices);
    expect(routeMapViewportContainingPositions(automatic.viewport!, vertices, 900, 220)).toBe(automatic.viewport);
    expect(routeMapViewportContainingPositions(manual, [])).toBe(manual);
    expect(routeMapViewportContainingPositions(manual, [{ latitude: NaN, longitude: 1 }, { latitude: 91, longitude: 1 }, { latitude: 50, longitude: 181 }, { latitude: 50, longitude: Infinity }])).toBe(manual);
  });

  it('uses the local longitude across the antimeridian and keeps finite bounds for poles and malformed dimensions', () => {
    const frame = { centerLatitude: 0, centerLongitude: 179.9, longitudeSpan: .02 };
    const expanded = routeMapViewportContainingPositions(frame, [{ latitude: .1, longitude: -179.9 }], 900, 220)!;
    expect(expanded.centerLongitude).toBe(179.9); expect(expanded.longitudeSpan).toBeLessThan(2);
    const map = buildSeaOperationRouteMap([point('0.1', '-179.9')], 900, 220, expanded);
    expect(map.points[0].x).toBeGreaterThan(40); expect(map.points[0].x).toBeLessThan(860); expect(map.points[0].y).toBeCloseTo(32, 2);
    expect(routeMapViewportContainingPositions(manual, vertices, NaN, Infinity)).toEqual(routeMapViewportContainingPositions(manual, vertices, 900, 320));
    const polar = routeMapViewportContainingPositions({ centerLatitude: 89.9, centerLongitude: 180, longitudeSpan: .02 }, [{ latitude: -89, longitude: -179 }], 4000, 100)!;
    expect(polar).toEqual({ centerLatitude: 89.9, centerLongitude: 180, longitudeSpan: 360 });
    expect(buildSeaOperationRouteMap([], 4000, 100, polar).projection!.latitudePixelsPerDegree).toBeGreaterThan(0);
  });
});

describe('Passage Plan situation map', () => {
  it.each([[900, 320, 264], [744, 190, 250]])('reserves the right panel while fitting all short-route points at %sx%s', (width, height, inset) => {
    const points = [point('49.65', '-1.64'), point('49.655', '-1.62'), point('49.65', '-1.60')];
    const map = buildSeaOperationRouteMap(points, width, height, undefined, [], inset);
    expect(map.segments).toHaveLength(2);
    expect(map.points.every(point => point.x > 30 && point.x < width - inset - 30 && point.y > 25 && point.y < height - 25)).toBe(true);
    const xs = map.points.map(point => point.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo((width - inset) / 2, 2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan((width - inset) * .45);
    const locked = buildSeaOperationRouteMap(points, width, height, map.viewport!, [], inset);
    expect(locked.points).toEqual(map.points);
    expect(locked.projection!.latitudePixelsPerDegree).toBeCloseTo(map.projection!.latitudePixelsPerDegree, 8);
  });
  it('fits isolated points and all zone vertices outside the reserved panel, including when there is no route', () => {
    const positions = [{ latitude: 49.65, longitude: -1.64 }, { latitude: 49.65, longitude: -1.62 }, { latitude: 49.655, longitude: -1.62 }, { latitude: 49.655, longitude: -1.625 }];
    const map = buildSeaOperationRouteMap([], 900, 320, undefined, positions, 264);
    expect(map.points).toEqual([]); expect(map.segments).toEqual([]);
    for (const position of positions) {
      const projection = map.projection!;
      const x = map.width / 2 + (position.longitude - projection.centerLongitude) * projection.longitudePixelsPerDegree;
      const y = map.height / 2 - (position.latitude - projection.centerLatitude) * projection.latitudePixelsPerDegree;
      expect(x).toBeGreaterThan(30); expect(x).toBeLessThan(900 - 264 - 30);
      expect(y).toBeGreaterThan(25); expect(y).toBeLessThan(320 - 25);
    }
  });
  it('ignores reserved space for an explicit viewport and normalizes invalid insets after dimensions', () => {
    const points = [point('49.65', '-1.64'), point('49.65', '-1.6')];
    const normal = buildSeaOperationRouteMap(points);
    for (const inset of [NaN, Infinity, -Infinity, -1, 0]) expect(buildSeaOperationRouteMap(points, 900, 320, undefined, [], inset)).toEqual(normal);
    expect(buildSeaOperationRouteMap(points, NaN, Infinity, undefined, [], 10000)).toEqual(buildSeaOperationRouteMap(points, 900, 320, undefined, [], 780));
    expect(buildSeaOperationRouteMap(points, 120, 100, undefined, [], 10000)).toEqual(buildSeaOperationRouteMap(points, 120, 100));
    expect(buildSeaOperationRouteMap(points, 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT, [], 264)).toEqual(buildSeaOperationRouteMap(points, 900, 320, DEFAULT_ROUTE_MAP_VIEWPORT));
  });
  it('keeps reserved-space antimeridian and coincident framing stable through a locked viewport', () => {
    for (const points of [[point('0', '179.99'), point('0', '-179.99')], [point('49.65', '-1.62'), point('49.65', '-1.62')], [point('90', '180')]]) {
      const map = buildSeaOperationRouteMap(points, 900, 320, undefined, [], 264);
      expect(map.viewport!.longitudeSpan).toBeGreaterThanOrEqual(.02);
      expect(map.points.every(point => point.x >= 30 && point.x <= 900 - 264 - 30 && point.y >= 25 && point.y <= 320 - 25)).toBe(true);
      const locked = buildSeaOperationRouteMap(points, 900, 320, map.viewport!);
      expect(locked.points).toEqual(map.points);
      expect(locked.projection!.longitudePixelsPerDegree).toBeCloseTo(map.projection!.longitudePixelsPerDegree, 8);
    }
  });
  it.each([[900, 320], [744, 190]])('fits a roughly 1.6 NM Cherbourg route with distinct segments and margins at %sx%s', (width, height) => {
    const map = buildSeaOperationRouteMap([point('49.65', '-1.64'), point('49.655', '-1.62'), point('49.65', '-1.60')], width, height);
    expect(map.segments).toHaveLength(2);
    expect(Math.max(...map.points.map(point => point.x)) - Math.min(...map.points.map(point => point.x))).toBeGreaterThan(width * .5);
    expect(map.points.every(point => point.x > 35 && point.x < width - 35 && point.y > 25 && point.y < height - 25)).toBe(true);
    expect(map.segments.every(segment => Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) > width * .2)).toBe(true);
    expect(map.viewport!.longitudeSpan).toBeLessThan(.1);
  });
  it.each([[900, 320], [744, 190]])('fits horizontal and vertical short routes without losing either zero-extent axis at %sx%s', (width, height) => {
    const horizontal = buildSeaOperationRouteMap([point('49.65', '-1.64'), point('49.65', '-1.6')], width, height);
    expect(horizontal.points[0].y).toBe(height / 2); expect(horizontal.points[1].y).toBe(height / 2);
    expect(horizontal.points[1].x - horizontal.points[0].x).toBeGreaterThan(width * .5);
    const vertical = buildSeaOperationRouteMap([point('49.65', '-1.62'), point('49.675', '-1.62')], width, height);
    expect(vertical.points[0].x).toBe(width / 2); expect(vertical.points[1].x).toBe(width / 2);
    expect(vertical.points[0].y - vertical.points[1].y).toBeGreaterThan(height * .4);
    for (const map of [horizontal, vertical]) expect(map.points.every(point => point.x >= 32 && point.x <= width - 32 && point.y >= 25 && point.y <= height - 25)).toBe(true);
  });
  it.each([[900, 320], [744, 190], [390, 680], [120, 100]])('keeps single/coincident and very close positions finite, local and stable on entering a locked view at %sx%s', (width, height) => {
    for (const waypoints of [[point('49.65', '-1.62')], [point('49.65', '-1.62'), point('49.65', '-1.62')],
      [point('49.65', '-1.62'), point('49.650000001', '-1.620000001')], [point('49.65', '-1.62'), point('49.6509', '-1.62')], [point('90', '180')]]) {
      const map = buildSeaOperationRouteMap(waypoints, width, height);
      expect(map.viewport!.longitudeSpan).toBeGreaterThanOrEqual(.02);
      expect(map.viewport!.longitudeSpan).toBeLessThan(1);
      expect(allCoordinates(map).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= width && y >= 0 && y <= height)).toBe(true);
      const locked = buildSeaOperationRouteMap(waypoints, width, height, map.viewport!);
      expect(locked.viewport).toEqual(map.viewport);
      expect(locked.projection!.latitudePixelsPerDegree).toBeCloseTo(map.projection!.latitudePixelsPerDegree, 8);
      expect(locked.projection!.longitudePixelsPerDegree).toBeCloseTo(map.projection!.longitudePixelsPerDegree, 8);
      locked.points.forEach((projected, index) => {
        expect(projected.x).toBeCloseTo(map.points[index].x, 2); expect(projected.y).toBeCloseTo(map.points[index].y, 2);
      });
    }
  });
  it.each([[900, 320], [390, 680], [120, 100]])('keeps the fitted coverage of a roughly 100m route through the first pan and zoom at %sx%s', (width, height) => {
    const map = buildSeaOperationRouteMap([point('49.65', '-1.62'), point('49.6509', '-1.62')], width, height);
    const viewport = map.viewport!;
    expect(viewport.longitudeSpan).toBeGreaterThanOrEqual(.02);
    expect(moveRouteMapViewport(viewport, .1, .1, width, height).longitudeSpan).toBe(viewport.longitudeSpan);
    expect(zoomRouteMapViewport(viewport, .8).longitudeSpan).toBeCloseTo(viewport.longitudeSpan / .8, 12);
    expect(zoomRouteMapViewport(viewport, 2).longitudeSpan).toBeCloseTo(Math.max(.02, viewport.longitudeSpan / 2), 12);
  });
  it('frames an isolated point and a short zone together without inventing navigation legs', () => {
    const positions = [{ latitude: 49.65, longitude: -1.64 }, { latitude: 49.65, longitude: -1.62 }, { latitude: 49.655, longitude: -1.62 }, { latitude: 49.655, longitude: -1.625 }];
    const map = buildSeaOperationRouteMap([], 744, 190, undefined, positions);
    expect(map.points).toEqual([]); expect(map.segments).toEqual([]); expect(map.invalidCount).toBe(0);
    expect(map.viewport!.longitudeSpan).toBeLessThan(.1);
    for (const position of positions) {
      const projection = map.projection!;
      const x = 744 / 2 + (position.longitude - projection.centerLongitude) * projection.longitudePixelsPerDegree;
      const y = 190 / 2 - (position.latitude - projection.centerLatitude) * projection.latitudePixelsPerDegree;
      expect(x).toBeGreaterThan(30); expect(x).toBeLessThan(744 - 30);
      expect(y).toBeGreaterThan(25); expect(y).toBeLessThan(190 - 25);
    }
  });
  it('fits a short antimeridian route while preserving finite broad envelopes and original ordinals', () => {
    const short = buildSeaOperationRouteMap([point('0', '179.99'), point('', ''), point('0', '-179.99')], 744, 190);
    expect(short.viewport!.longitudeSpan).toBeLessThan(.1); expect(short.points.map(point => point.index)).toEqual([1, 3]);
    expect(short.segments).toEqual([]);
    const broad = buildSeaOperationRouteMap([point('52', '-170'), point('-40', '0'), point('40', '170')], 744, 190);
    expect(allCoordinates(broad).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 744 && y >= 0 && y <= 190)).toBe(true);
  });
  it('frames additional locations without connecting them or changing the route ordinals', () => {
    const route = [point('49', '-2'), point('49.2', '-1')];
    const map = buildSeaOperationRouteMap(route, 900, 320, undefined, [{ latitude: 48, longitude: -4 }, { latitude: 50.5, longitude: 2 }]);
    expect(map.points).toHaveLength(2); expect(map.segments).toHaveLength(1); expect(map.points.map(item => item.index)).toEqual([1, 2]);
    const extrasOnly = buildSeaOperationRouteMap([], 900, 320, undefined, [{ latitude: 48, longitude: -4 }]);
    expect(extrasOnly.projection).not.toBeNull(); expect(extrasOnly.points).toEqual([]); expect(extrasOnly.segments).toEqual([]); expect(extrasOnly.invalidCount).toBe(0);
  });
  it('fits the Channel route north-up, keeps input order and includes a local coastline', () => {
    const map = buildSeaOperationRouteMap([point('48.38', '-4.49', 'Brest'), point('50.35', '-4.15', 'Plymouth'), point('49°39 N', '001°37.2 O', 'Cherbourg')]);
    expect(map.points.map(({ label, index }) => [label, index])).toEqual([['Brest', 1], ['Plymouth', 2], ['Cherbourg', 3]]);
    expect(map.points[1].y).toBeLessThan(map.points[0].y);
    expect(map.points[2].x).toBeGreaterThan(map.points[1].x);
    expect(map.segments).toHaveLength(2);
    expect(map.land.length).toBeGreaterThan(0);
    expect(map.grid.length).toBeGreaterThan(2);
    expect(map.grid.every(({ label }) => /^\d{1,3}°\d{2}(?:\.\d{1,3})?′ [NSEW]$/.test(label))).toBe(true);
    expect(map.scale?.label).toMatch(/ NM$/);
    expect(allCoordinates(map).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= map.width && y >= 0 && y <= map.height)).toBe(true);
  });

  it('keeps compact DMM graticule labels inside the view without changing the route positions', () => {
    const points = [point('49', '-3'), point('49.5', '-1')];
    const original = structuredClone(points);
    const map = buildSeaOperationRouteMap(points, 360, 280);
    expect(map.grid.every(({ label, labelAt }) => labelAt.x >= 0 && labelAt.x + Math.ceil(label.length * 5.5) <= map.width)).toBe(true);
    expect(map.grid.some(({ label }) => label.endsWith(' W'))).toBe(true);
    expect(map.grid.every(({ label }) => !label.includes('.000'))).toBe(true);
    expect(points).toEqual(original);
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
