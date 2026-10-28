import { describe, expect, it } from 'vitest';
import { DetailedBasemapTileCache, DETAILED_BASEMAP_MAX_TILES, detailedBasemapTransform, detailedMapFrame, detailedMapFrameKey,
  detailedMapTiles, detailedMapTileTemplate, detailedMapTileUrl, detailedTileBounds, projectDetailedTilePoint, type DetailedMapFrame,
} from './seaOperationDetailedBasemapModel';

const frame = (longitudeSpan = .1, centerLongitude = -1.62, centerLatitude = 49.65, width = 900, height = 320): DetailedMapFrame => ({ width, height,
  projection: { centerLatitude, centerLongitude, longitudePixelsPerDegree: width / longitudeSpan,
    latitudePixelsPerDegree: width / longitudeSpan / Math.max(.05, Math.cos(centerLatitude * Math.PI / 180)) } });
const template = 'https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf';

describe('Detailed coastal basemap geometry', () => {
  it('requests only the visible viewport at a bounded native LOD', () => {
    const tiles = detailedMapTiles(frame(.02));
    expect(tiles.length).toBeGreaterThan(0); expect(tiles.length).toBeLessThanOrEqual(DETAILED_BASEMAP_MAX_TILES);
    expect(tiles.every(tile => tile.z === 14)).toBe(true);
    for (const tile of tiles) {
      const box = detailedTileBounds(frame(.02), tile);
      expect(box.x).toBeLessThan(900); expect(box.x + box.width).toBeGreaterThan(0);
      expect(box.y).toBeLessThan(320); expect(box.y + box.height).toBeGreaterThan(0);
    }
  });
  it.each([[360, 0, 0, 4000, 2000], [90, 2, 80, 4000, 2000], [.02, 179.999, 50, 120, 2000]])('lowers LOD to keep coverage bounded for span %s', (span, lon, lat, width, height) => {
    const tiles = detailedMapTiles(frame(span, lon, lat, width, height));
    expect(tiles.length).toBeGreaterThan(0); expect(tiles.length).toBeLessThanOrEqual(DETAILED_BASEMAP_MAX_TILES);
    expect(tiles.every(tile => tile.x >= 0 && tile.y >= 0 && tile.x < 2 ** tile.z && tile.y < 2 ** tile.z)).toBe(true);
  });
  it('keeps adjacent tile seams exact in both axes', () => {
    const f = frame(.03), tile = detailedMapTiles(f)[0], right = { ...tile, x: tile.x + 1, worldX: tile.worldX + 1 }, below = { ...tile, y: tile.y + 1 };
    expect(projectDetailedTilePoint(f, tile, { x: 4096, y: 1234 })).toEqual(projectDetailedTilePoint(f, right, { x: 0, y: 1234 }));
    expect(projectDetailedTilePoint(f, tile, { x: 1200, y: 4096 })).toEqual(projectDetailedTilePoint(f, below, { x: 1200, y: 0 }));
  });
  it('inverse projects each latitude vertex, rather than stretching a Mercator image', () => {
    const f = frame(60, 0, 60), tile = { z: 2, x: 2, y: 0, worldX: 2, key: '2/2/0' };
    const top = projectDetailedTilePoint(f, tile, { x: 0, y: 0 }), bottom = projectDetailedTilePoint(f, tile, { x: 0, y: 4096 });
    const middle = projectDetailedTilePoint(f, tile, { x: 0, y: 2048 });
    expect(middle.y).not.toBeCloseTo((top.y + bottom.y) / 2, 1);
    const latitude = f.projection.centerLatitude - (middle.y - f.height / 2) / f.projection.latitudePixelsPerDegree;
    expect(latitude).toBeCloseTo(Math.atan(Math.sinh(Math.PI * (1 - 2 * .5 / 4))) * 180 / Math.PI, 10);
  });
  it('wraps tile URLs at the antimeridian while keeping their displayed vertices adjacent', () => {
    const f = frame(.1, 179.99), tiles = detailedMapTiles(f), n = 2 ** tiles[0].z;
    expect(tiles.some(tile => tile.x === 0 && tile.worldX === n)).toBe(true);
    expect(tiles.some(tile => tile.x === n - 1)).toBe(true);
    const last = tiles.find(tile => tile.x === n - 1)!, next = tiles.find(tile => tile.x === 0 && tile.y === last.y)!;
    expect(projectDetailedTilePoint(f, last, { x: 4096, y: 0 })).toEqual(projectDetailedTilePoint(f, next, { x: 0, y: 0 }));
  });
  it('does not request beyond Mercator coverage or from invalid frames', () => {
    expect(detailedMapTiles(frame(.02, 0, 89))).toEqual([]);
    expect(detailedMapFrame({ ...frame(), width: Infinity })).toBeNull();
    expect(detailedMapFrame({ ...frame(), projection: null })).toBeNull();
    expect(detailedMapTiles({ ...frame(), projection: { ...frame().projection, longitudePixelsPerDegree: 0 } })).toEqual([]);
  });
  it('keeps retained paths aligned through pan, nonuniform zoom and resizing', () => {
    const a = frame(.1), b = frame(.2, -1.61, 49.66, 1300, 540), tile = detailedMapTiles(a)[0], point = { x: 2300, y: 1700 };
    const before = projectDetailedTilePoint(a, tile, point), after = projectDetailedTilePoint(b, tile, point);
    const [sx, , , sy, tx, ty] = detailedBasemapTransform(a, b).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
    expect(before.x * sx + tx).toBeCloseTo(after.x, 8); expect(before.y * sy + ty).toBeCloseTo(after.y, 8);
    expect(detailedMapFrameKey(a)).toBe(detailedMapFrameKey(detailedMapFrame(a)));
  });
  it('accepts only the provider’s HTTPS planet template and valid tile indices', () => {
    expect(detailedMapTileTemplate({ tiles: [template] })).toBe(template);
    const tile = detailedMapTiles(frame())[0];
    expect(detailedMapTileUrl(template, tile)).toContain(`/${tile.z}/${tile.x}/${tile.y}.pbf`);
    for (const bad of ['http://tiles.openfreemap.org/planet/a/{z}/{x}/{y}.pbf', 'https://example.test/planet/a/{z}/{x}/{y}.pbf', template + '?secret=1', 'https://tiles.openfreemap.org/../private/{z}/{x}/{y}.pbf']) {
      expect(() => detailedMapTileTemplate({ tiles: [bad] })).toThrow();
    }
    expect(() => detailedMapTileUrl(template, { ...tile, x: -1 })).toThrow();
  });
});

describe('Bounded detailed tile cache', () => {
  it('evicts by recency and byte size without replacing a valid cache with an oversized entry', () => {
    const cache = new DetailedBasemapTileCache(2, 6), a = new ArrayBuffer(3), b = new ArrayBuffer(3);
    cache.set('a', a); cache.set('b', b); expect(cache.get('a')).toBe(a);
    cache.set('c', new ArrayBuffer(3)); expect(cache.get('b')).toBeUndefined(); expect(cache.get('a')).toBe(a);
    cache.set('large', new ArrayBuffer(7)); expect(cache.size).toBe(2); expect(cache.byteLength).toBe(6);
    cache.set('a', new ArrayBuffer(1)); expect(cache.byteLength).toBe(4);
  });
});
