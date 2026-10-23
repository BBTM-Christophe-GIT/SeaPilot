import { describe, expect, it } from 'vitest';
import { buildSeaOperationRouteMap } from './seaOperationRouteMapGeometry';

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
});
