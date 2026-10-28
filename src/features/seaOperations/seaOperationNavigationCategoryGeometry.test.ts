import { describe, expect, it } from 'vitest';
import { NAVIGATION_CATEGORY_DATA_LIMITS, prepareNavigationCategoryLines, projectNavigationCategoryLines,
  type PreparedNavigationCategoryLines } from './seaOperationNavigationCategoryGeometry';
import { buildSeaOperationRouteMap, type SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

const frame = (centerLongitude = 0, longitudeSpan = 6, width = 360, height = 180): Pick<SeaOperationRouteMapGeometry, 'width' | 'height' | 'projection'> => ({
  width, height, projection: { centerLatitude: 0, centerLongitude, longitudePixelsPerDegree: width / longitudeSpan, latitudePixelsPerDegree: width / longitudeSpan },
});
const data = (lines: unknown[]) => ({ categories: [{ category: 2, lines }] });
const project = (lines: unknown[], geometry = frame()) => projectNavigationCategoryLines(prepareNavigationCategoryLines(data(lines)), geometry);
const vertices = (path: string) => [...path.matchAll(/[ML](-?[\d.e+-]+),(-?[\d.e+-]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
const commands = (path: string) => [...path.matchAll(/[ML]/g)].map(match => match[0]);

describe('Official navigation category line projection', () => {
  it('keeps the two supported categories and their open source lines separate', () => {
    const prepared = prepareNavigationCategoryLines({ categories: [
      { category: 3, lines: [[[-1, 1], [1, 1]]] },
      { category: 2, lines: [[[-2, 0], [2, 0]], [[-1, -1], [1, -1]]] },
      { category: 4, lines: [[[-2, 2], [2, 2]]] },
    ] });
    const result = projectNavigationCategoryLines(prepared, frame());
    expect(result.categories).toEqual([
      { category: 2, path: 'M60,90L300,90M120,150L240,150', visibleCount: 2, segmentCount: 2 },
      { category: 3, path: 'M120,30L240,30', visibleCount: 1, segmentCount: 1 },
    ]);
    expect(result).toMatchObject({ visibleCount: 3, segmentCount: 3 });
    expect(result.categories.every(category => !/[Zz]/.test(category.path))).toBe(true);
  });

  it('retains horizontal, vertical and diagonal crossings when both endpoints are outside', () => {
    const result = project([[[-10, 0], [10, 0]], [[0, -10], [0, 10]], [[-10, -10], [10, 10]]]);
    expect(result.categories[0]).toEqual({ category: 2, path: 'M0,90L360,90M180,180L180,0M90,180L270,0', visibleCount: 3, segmentCount: 3 });
  });

  it('breaks paths at invalid coordinates and never connects their valid neighbours', () => {
    const result = project([[[-2, 0], [-1, 0], [NaN, 0], [0, 0], [1, 0], [181, 0],
      [0, 91], [Infinity, 0], null, ['0', 0], [1, 1], [2, 1]]]);
    expect(result.categories[0]).toEqual({ category: 2, path: 'M60,90L120,90M180,90L240,90M240,30L300,30', visibleCount: 1, segmentCount: 3 });
    expect(project([[[0, 0]], [[NaN, 0], [1, 0]], [[0, 0], [0, 0]]]).visibleCount).toBe(0);
  });

  it.each([180, -180, 179.9, -179.9])('keeps a dateline crossing local around %s degrees', center => {
    const result = project([[[179, 0], [-179, 0]]], frame(center, 4));
    const points = vertices(result.categories[0].path);
    expect(result.visibleCount).toBe(1); expect(result.segmentCount).toBe(1);
    expect(points).toHaveLength(2);
    expect(points[1].x - points[0].x).toBeCloseTo(180, 8);
    expect(points.every(point => point.x >= 0 && point.x <= 360)).toBe(true);
  });

  it('clips a dateline line to both world edges without inventing a line through Greenwich', () => {
    const result = project([[[179, 0], [-179, 0]]], frame(0, 360));
    expect(result.categories[0]).toEqual({ category: 2, path: 'M0,90L1,90M359,90L360,90', visibleCount: 1, segmentCount: 2 });
    expect(project([[[179, 0], [-179, 0]]]).visibleCount).toBe(0);
    expect(project([[[180, 0], [-180, 0]]], frame(-180, 4)).segmentCount).toBe(0);
  });

  it('preserves disconnected pieces when a polyline leaves and re-enters the frame', () => {
    const result = project([[[-1, 0], [5, 0], [5, 1], [-1, 1]]]);
    expect(result.categories[0].path).toBe('M120,90L360,90M360,30L120,30');
    expect(result.categories[0]).toMatchObject({ visibleCount: 1, segmentCount: 2 });
  });

  it('uses precomputed boxes to avoid visiting offscreen coordinate arrays', () => {
    const unusedCoordinates = new Proxy([] as readonly (readonly [number, number])[], { get() { throw new Error('Offscreen coordinates were visited'); } });
    const prepared: PreparedNavigationCategoryLines = { coordinateCount: 4, lineCount: 2, categories: [{ category: 2,
      lines: [{ chunks: [{ coordinates: unusedCoordinates, west: 30, east: 40, south: 0, north: 1 }] },
        { chunks: [{ coordinates: unusedCoordinates, west: -1, east: 1, south: 30, north: 40 }] }] }] };
    expect(projectNavigationCategoryLines(prepared, frame())).toMatchObject({ visibleCount: 0, segmentCount: 0 });
  });

  it('copies the dataset once and leaves both the payload and the current geometry untouched', () => {
    const input = data([[[-2, 0], [0, .1], [2, 0]]]), before = structuredClone(input), geometry = frame();
    const geometryBefore = structuredClone(geometry), prepared = prepareNavigationCategoryLines(input);
    const initial = projectNavigationCategoryLines(prepared, geometry);
    expect(input).toEqual(before);
    expect(geometry).toEqual(geometryBefore);
    (input.categories[0].lines[0] as number[][])[0][0] = 100;
    expect(projectNavigationCategoryLines(prepared, geometry)).toEqual(initial);
    expect(Object.isFrozen(prepared.categories[0].lines[0].chunks[0].coordinates[0])).toBe(true);
  });

  it('simplifies screen-collinear points while retaining bends beyond the .4 pixel budget', () => {
    const width = 360, pixelsPerDegree = 60;
    const line = Array.from({ length: 41 }, (_, index) => [-2 + index / 10, index === 20 ? .5 / pixelsPerDegree : .1 / pixelsPerDegree]);
    const result = project([line]);
    const path = result.categories[0].path;
    expect(result.segmentCount).toBe(40);
    expect(commands(path)).toHaveLength(5);
    const retained = vertices(path);
    for (const [longitude, latitude] of line) {
      const source = { x: width / 2 + longitude * pixelsPerDegree, y: 90 - latitude * pixelsPerDegree };
      const distances = retained.slice(1).map((to, index) => {
        const from = retained[index], dx = to.x - from.x, dy = to.y - from.y;
        const t = Math.max(0, Math.min(1, ((source.x - from.x) * dx + (source.y - from.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(source.x - from.x - t * dx, source.y - from.y - t * dy);
      });
      expect(Math.min(...distances)).toBeLessThanOrEqual(.4);
    }
    expect(project([Array.from({ length: 200 }, (_, index) => [-2 + index / 50, 0])]).categories[0].path.length).toBeLessThan(120);
  });

  it('clips finite path coordinates inside fractional desktop, mobile and world viewboxes', () => {
    const lines = [[[179.5, -10], [-179.5, 10]], [[-170, -80], [0, 0], [170, 80]], [[-2, -10], [-2, 10]]];
    for (const geometry of [frame(0, 6, 743.925, 190.125), frame(180, 4, 390, 680), frame(0, 360, 4000, 2000)]) {
      const result = project(lines, geometry);
      for (const point of result.categories.flatMap(category => vertices(category.path))) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(geometry.width);
        expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(geometry.height);
      }
    }
  });

  it('uses the shared route map projection without moving its waypoints or frame', () => {
    const geometry = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 });
    const before = structuredClone(geometry), result = project([[[ -4, 49 ], [ -2, 49 ]]], geometry);
    expect(result.categories[0].path).toBe('M393.75,160L506.25,160');
    expect(geometry).toEqual(before);
  });

  it('returns empty paths for missing projections, invalid frames and absent or malformed datasets', () => {
    for (const input of [null, {}, { categories: {} }, { categories: [{ category: 2, lines: null }] }]) {
      expect(projectNavigationCategoryLines(prepareNavigationCategoryLines(input), frame())).toMatchObject({ visibleCount: 0, segmentCount: 0 });
    }
    const prepared = prepareNavigationCategoryLines(data([[[-1, 0], [1, 0]]]));
    for (const geometry of [{ ...frame(), projection: null }, { ...frame(), width: NaN }, { ...frame(), height: 0 },
      { ...frame(), width: 4001 }, { ...frame(), projection: { ...frame().projection!, longitudePixelsPerDegree: 0 } },
      { ...frame(), projection: { ...frame().projection!, latitudePixelsPerDegree: Infinity } },
      { ...frame(), projection: { ...frame().projection!, centerLatitude: 91 } },
      { ...frame(), projection: { ...frame().projection!, centerLongitude: NaN } }]) {
      expect(projectNavigationCategoryLines(prepared, geometry).visibleCount).toBe(0);
    }
  });

  it('rejects oversized data as a whole instead of silently dropping official source limits', () => {
    expect(() => prepareNavigationCategoryLines({ categories: Array(NAVIGATION_CATEGORY_DATA_LIMITS.categories + 1).fill({}) })).toThrow(RangeError);
    expect(() => prepareNavigationCategoryLines(data(Array(NAVIGATION_CATEGORY_DATA_LIMITS.lines + 1).fill([])))).toThrow(RangeError);
    expect(() => prepareNavigationCategoryLines(data([Array(NAVIGATION_CATEGORY_DATA_LIMITS.coordinates + 1).fill([0, 0])]))).toThrow(RangeError);
    const exactlyBounded = prepareNavigationCategoryLines(data([Array(NAVIGATION_CATEGORY_DATA_LIMITS.coordinates).fill([0, 0])]));
    expect(exactlyBounded.coordinateCount).toBe(NAVIGATION_CATEGORY_DATA_LIMITS.coordinates);
    expect(projectNavigationCategoryLines(exactlyBounded, frame()).visibleCount).toBe(0);
  });
});
