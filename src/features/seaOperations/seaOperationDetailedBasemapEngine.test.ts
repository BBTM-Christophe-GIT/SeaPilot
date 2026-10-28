import { PbfWriter } from 'pbf';
import { describe, expect, it, vi } from 'vitest';
import { boundedDetailedMapResponse, decodeDetailedMapTile, DetailedBasemapEngine } from './seaOperationDetailedBasemapEngine';
import { DETAILED_BASEMAP_METADATA_URL, detailedMapTiles, type DetailedMapFrame } from './seaOperationDetailedBasemapModel';

interface Feature { type: 2 | 3; class: string; rings: number[][][] }
function fixture(layers: Array<{ name: string; features: Feature[]; extent?: number }>): ArrayBuffer {
  const writer = new PbfWriter();
  for (const layer of layers) writer.writeMessage(3, (value, p) => {
    p.writeStringField(1, value.name); p.writeVarintField(15, 2); p.writeVarintField(5, value.extent ?? 4096); p.writeStringField(3, 'class');
    const classes = [...new Set(value.features.map(feature => feature.class))];
    for (const name of classes) p.writeMessage(4, (text, v) => v.writeStringField(1, text), name);
    for (const feature of value.features) p.writeMessage(2, (f, q) => {
      q.writeVarintField(3, f.type); q.writePackedVarint(2, [0, classes.indexOf(f.class)]);
      const commands: number[] = []; let x = 0, y = 0;
      for (const ring of f.rings) {
        ring.forEach(([nextX, nextY], index) => {
          if (index === 0) commands.push(9); else if (index === 1) commands.push(((ring.length - 1) << 3) | 2);
          const dx = nextX - x, dy = nextY - y; commands.push(dx < 0 ? -dx * 2 - 1 : dx * 2, dy < 0 ? -dy * 2 - 1 : dy * 2); x = nextX; y = nextY;
        });
        if (f.type === 3) commands.push(15);
      }
      q.writePackedVarint(4, commands);
    }, feature);
  }, layer);
  return Uint8Array.from(writer.finish()).buffer;
}
const square = [[0, 0], [4096, 0], [4096, 4096], [0, 4096]], hole = [[1000, 1000], [1000, 2000], [2000, 2000], [2000, 1000]];
const tileBuffer = fixture([{ name: 'water', features: [{ type: 3, class: 'ocean', rings: [square, hole] }] },
  { name: 'transportation', features: [{ type: 2, class: 'pier', rings: [[[1, 2], [3, 4]]] }, { type: 2, class: 'service', rings: [[[10, 20], [30, 40]]] }] }]);
const frame: DetailedMapFrame = { width: 900, height: 320, projection: { centerLatitude: 49.65, centerLongitude: -1.62, longitudePixelsPerDegree: 45000, latitudePixelsPerDegree: 69400 } };
const template = 'https://tiles.openfreemap.org/planet/fixture/{z}/{x}/{y}.pbf';
const response = (buffer: ArrayBuffer) => new Response(buffer, { status: 200 });

describe('Detailed coastal vector decoding and fetching', () => {
  it('decodes actual MVT commands into coastal polygons with holes and pier/road paths', () => {
    const tile = detailedMapTiles(frame)[0], paths = decodeDetailedMapTile(tileBuffer, frame, tile);
    expect(paths.water.match(/M/g)).toHaveLength(2); expect(paths.water.match(/Z/g)).toHaveLength(2);
    expect(paths.pierLines).toMatch(/^M[-\d.]+ [-\d.]+L/); expect(paths.roads).not.toBe('');
    expect(paths.water).not.toMatch(/NaN|Infinity/); expect(paths.width).toBeGreaterThan(0); expect(paths.height).toBeGreaterThan(0);
  });
  it('omits decorative port details at low zoom and rejects empty/corrupt vector data', () => {
    const tile = { z: 8, x: 126, y: 86, worldX: 126, key: '8/126/86' }, paths = decodeDetailedMapTile(tileBuffer, frame, tile);
    expect(paths.water).not.toBe(''); expect(paths.roads).toBe(''); expect(paths.pierLines).toBe('');
    expect(() => decodeDetailedMapTile(new ArrayBuffer(0), frame, tile)).toThrow();
    expect(() => decodeDetailedMapTile(Uint8Array.from([255, 255, 255]).buffer, frame, tile)).toThrow();
  });
  it('rejects incomplete coastal geometry instead of painting missing water as land', () => {
    const tile = detailedMapTiles(frame)[0], water: Feature = { type: 3, class: 'ocean', rings: [square] };
    const tooMany = fixture([{ name: 'water', features: Array.from({ length: 8001 }, () => water) }]);
    expect(() => decodeDetailedMapTile(tooMany, frame, tile)).toThrow('côtière');
    const badExtent = fixture([{ name: 'water', features: [water], extent: 100_000 }]);
    expect(() => decodeDetailedMapTile(badExtent, frame, tile)).toThrow('côtière');
  });
  it('loads a whitelisted metadata URL once and reuses cached binaries on later camera views', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url) === DETAILED_BASEMAP_METADATA_URL ? new Response(JSON.stringify({ tiles: [template] })) : response(tileBuffer));
    const engine = new DetailedBasemapEngine(fetcher), signal = new AbortController().signal;
    const first = await engine.render({ id: 1, frame }, signal), before = fetcher.mock.calls.length;
    const next = { ...frame, projection: { ...frame.projection, centerLongitude: frame.projection.centerLongitude + .000001 } };
    const second = await engine.render({ id: 2, frame: next }, signal);
    expect(first.tiles.length).toBeGreaterThan(0); expect(first.failed).toBe(0); expect(second.tiles.length).toBe(first.tiles.length);
    expect(fetcher).toHaveBeenCalledTimes(before); expect(second.tiles[0].water).not.toBe(first.tiles[0].water);
  });
  it('calls the fetch function without binding the engine as its browser receiver', async () => {
    const fetcher = vi.fn(async function (this: unknown, url: string | URL | Request) {
      expect(this).toBeUndefined();
      return String(url) === DETAILED_BASEMAP_METADATA_URL ? new Response(JSON.stringify({ tiles: [template] })) : response(tileBuffer);
    });
    const result = await new DetailedBasemapEngine(fetcher).render({ id: 1, frame }, new AbortController().signal);
    expect(result.failed).toBe(0); expect(result.tiles.length).toBeGreaterThan(0);
  });
  it('never exceeds four simultaneous visible tile requests and returns partial failures', async () => {
    let concurrent = 0, maximum = 0, counter = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === DETAILED_BASEMAP_METADATA_URL) return new Response(JSON.stringify({ tiles: [template] }));
      concurrent += 1; maximum = Math.max(maximum, concurrent); const index = counter++;
      await new Promise(resolve => setTimeout(resolve, 1)); concurrent -= 1;
      return index === 0 ? new Response('', { status: 503 }) : response(tileBuffer);
    });
    const result = await new DetailedBasemapEngine(fetcher).render({ id: 1, frame }, new AbortController().signal);
    expect(maximum).toBeLessThanOrEqual(4); expect(result.failed).toBe(1); expect(result.tiles.length).toBe(detailedMapTiles(frame).length - 1);
  });
  it('does not fetch tiles after a rejected metadata origin or aborted generation', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ tiles: ['https://untrusted.test/{z}/{x}/{y}.pbf'] })));
    await expect(new DetailedBasemapEngine(fetcher).render({ id: 1, frame }, new AbortController().signal)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort();
    await expect(new DetailedBasemapEngine(fetcher).render({ id: 2, frame }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds response bodies both from content length and streamed bytes', async () => {
    await expect(boundedDetailedMapResponse(new Response(new Uint8Array(10), { headers: { 'content-length': '10' } }), 5)).rejects.toThrow();
    await expect(boundedDetailedMapResponse(new Response(new Uint8Array(10)), 5)).rejects.toThrow();
    expect((await boundedDetailedMapResponse(new Response(new Uint8Array(5)), 5)).byteLength).toBe(5);
  });
  it('aborts tile requests before producing a stale render', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === DETAILED_BASEMAP_METADATA_URL) return new Response(JSON.stringify({ tiles: [template] }));
      controller.abort(); return response(tileBuffer);
    });
    await expect(new DetailedBasemapEngine(fetcher).render({ id: 1, frame }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps successful coast tiles when an individual network request times out', async () => {
    let count = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === DETAILED_BASEMAP_METADATA_URL) return new Response(JSON.stringify({ tiles: [template] }));
      if (count++ === 0) throw new DOMException('Request deadline', 'AbortError');
      return response(tileBuffer);
    });
    const result = await new DetailedBasemapEngine(fetcher).render({ id: 1, frame }, new AbortController().signal);
    expect(result.failed).toBe(1); expect(result.tiles).toHaveLength(detailedMapTiles(frame).length - 1);
  });
  it('retains already decoded tiles when the overall background deadline expires', async () => {
    const overall = new AbortController(), source = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => milliseconds === 45_000 ? overall.signal : new AbortController().signal);
    const broadFrame = { ...frame, projection: { ...frame.projection, longitudePixelsPerDegree: 9000, latitudePixelsPerDegree: 13900 } };
    expect(detailedMapTiles(broadFrame).length).toBeGreaterThan(4);
    let count = 0;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === DETAILED_BASEMAP_METADATA_URL) return new Response(JSON.stringify({ tiles: [template] }));
      const index = count++;
      if (index === 0) return response(tileBuffer);
      if (index >= 4) { overall.abort(); return response(tileBuffer); }
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Deadline', 'AbortError')), { once: true }));
    });
    try {
      const result = await new DetailedBasemapEngine(fetcher).render({ id: 1, frame: broadFrame }, source.signal);
      expect(source.signal.aborted).toBe(false); expect(result.tiles).toHaveLength(1);
      expect(result.failed).toBe(detailedMapTiles(broadFrame).length - 1);
    } finally { timeout.mockRestore(); }
  });
});
