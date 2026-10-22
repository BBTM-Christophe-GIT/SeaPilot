// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findShomCharts } from './seaOperationShomCharts.js';

const point = { latitude: 48.36, longitude: -4.53 };
const box = (west = -4.55, south = 48.35, east = -4.50, north = 48.38) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
function chart(number = '7399', scale = 7500, title = 'INT 1833 Port de Brest') {
  return { type: 'Feature', id: `grille_cartespapier_30.${number}`, geometry: { type: 'MultiPolygon', coordinates: [[box()]] },
    properties: { name: `${number} - ${title}`, numero: Number(number), fid: number, scale, id_md: `CARTES_PAPIER/CARTO_CARTES_PAPIER_${number}.xml` } };
}
function collection(features: unknown[] = [chart()]) {
  return { type: 'FeatureCollection', features, totalFeatures: features.length, numberMatched: features.length, numberReturned: features.length,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:CRS::84' } } };
}
function fixture(first: unknown = collection()) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    return Response.json(url.searchParams.get('typeNames') === 'GRILLES_CARTES_PAPIER:grille_cartespapier_30' ? first : collection([]));
  });
}
afterEach(() => vi.useRealTimers());

describe('public Shom paper-chart catalogue', () => {
  it('queries four official layers with a true point intersection in explicit longitude/latitude CRS84', async () => {
    const fetcher = fixture();
    const result = await findShomCharts(point, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(4);
    const layers = [];
    for (const [input, options] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe('https://services.data.shom.fr/INSPIRE/wfs');
      expect(url.searchParams.get('version')).toBe('2.0.0');
      expect(url.searchParams.get('request')).toBe('GetFeature');
      expect(url.searchParams.get('outputFormat')).toBe('application/json');
      expect(url.searchParams.get('count')).toBe('64');
      expect(url.searchParams.has('bbox')).toBe(false);
      expect(url.searchParams.get('filter')).toContain('<fes:Intersects><fes:ValueReference>geometry</fes:ValueReference>');
      expect(url.searchParams.get('filter')).toContain('<gml:Point srsName="urn:ogc:def:crs:OGC:1.3:CRS84"><gml:pos>-4.53 48.36</gml:pos>');
      expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      layers.push(url.searchParams.get('typeNames'));
    }
    expect(layers).toEqual(['30', '30_300', '300_800', '800'].map((suffix) => `GRILLES_CARTES_PAPIER:grille_cartespapier_${suffix}`));
    expect(result).toMatchObject({ charts: [{ id: 'shom-paper:7399', number: '7399', title: 'INT 1833 Port de Brest', scale: 7500,
      catalogueUrl: 'https://diffusion.shom.fr/catalogsearch/result/?q=7399' }], sourceUrl: 'https://services.data.shom.fr/INSPIRE/wfs', truncated: false });
    expect(Number.isFinite(Date.parse(result.fetchedAt))).toBe(true);
  });

  it('preserves leading zeroes and generates official links instead of trusting returned URLs', async () => {
    const row = chart('0101', 40_000_000, 'Planisphère terrestre');
    row.properties.id_md = 'https://attacker.example/track';
    const result = await findShomCharts(point, { fetcher: fixture(collection([row])) });
    expect(result.charts[0]).toMatchObject({ number: '0101', catalogueUrl: 'https://diffusion.shom.fr/catalogsearch/result/?q=0101' });
  });

  it('sorts the most detailed scales first and deduplicates a chart appearing in several layers', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const layer = new URL(String(input)).searchParams.get('typeNames');
      return Response.json(collection(layer?.endsWith('_30') ? [chart('7399', 7500)] : [chart('0101', 40_000_000), chart('7399', 7500), chart('7148', 49300)]));
    });
    expect((await findShomCharts(point, { fetcher })).charts.map((row) => row.number)).toEqual(['7399', '7148', '0101']);
  });

  it('does not replace a concave footprint by its rectangular bounds', async () => {
    const row = chart();
    row.geometry.coordinates = [[[[-4.6, 48.3], [-4.5, 48.3], [-4.5, 48.35], [-4.55, 48.35], [-4.55, 48.4], [-4.6, 48.4], [-4.6, 48.3]]]];
    expect((await findShomCharts(point, { fetcher: fixture(collection([row])) })).charts).toEqual([]);
  });

  it('excludes holes and gaps between disconnected frames', async () => {
    const hole = chart('7399'); hole.geometry.coordinates = [[box(-4.6, 48.3, -4.4, 48.4), box(-4.54, 48.35, -4.52, 48.37)]];
    const gap = chart('7148'); gap.geometry.coordinates = [[box(-4.7, 48.3, -4.6, 48.4)], [box(-4.5, 48.3, -4.4, 48.4)]];
    expect((await findShomCharts(point, { fetcher: fixture(collection([hole, gap])) })).charts).toEqual([]);
  });

  it('includes a point on the footprint boundary', async () => {
    const row = chart(); row.geometry.coordinates = [[box(point.longitude, 48.35, -4.50, 48.38)]];
    expect((await findShomCharts(point, { fetcher: fixture(collection([row])) })).charts).toHaveLength(1);
  });

  it.each([
    { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: Infinity }, { latitude: '48.36', longitude: -4.53 },
  ])('rejects invalid coordinates before any request: %j', async (input) => {
    const fetcher = fixture();
    await expect(findShomCharts(input as typeof point, { fetcher })).rejects.toThrow('coordonnées');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('distinguishes an empty successful catalogue from a provider failure', async () => {
    const result = await findShomCharts(point, { fetcher: fixture(collection([])) });
    expect(result.charts).toEqual([]); expect(result.truncated).toBe(false);
    const fetcher = vi.fn<typeof fetch>(async (input) => new URL(String(input)).searchParams.get('typeNames')?.endsWith('_800')
      ? new Response('error', { status: 503 }) : Response.json(collection()));
    await expect(findShomCharts(point, { fetcher })).rejects.toThrow('indisponible');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    { features: [] },
    { ...collection(), features: {} },
    { ...collection(), numberReturned: 0 },
    { ...collection(), numberMatched: 2 },
    { ...collection(), numberMatched: 'not-a-count' },
    { ...collection(), crs: { type: 'name', properties: { name: 'EPSG:3857' } } },
  ])('rejects malformed/incomplete collections rather than claiming no charts', async (body) => {
    await expect(findShomCharts(point, { fetcher: fixture(body) })).rejects.toThrow();
  });

  it.each([
    { fid: '7399&url=attacker' }, { fid: '0101' }, { numero: '7399' }, { scale: 0 },
    { scale: Infinity }, { name: '\u0000invalid' }, { name: '7148 - Wrong number' },
  ])('rejects malformed chart attributes: %j', async (properties) => {
    const row = chart(); Object.assign(row.properties, properties);
    await expect(findShomCharts(point, { fetcher: fixture(collection([row])) })).rejects.toThrow();
  });

  it('rejects unclosed or wrongly projected geometries', async () => {
    const unclosed = chart(); unclosed.geometry.coordinates[0][0].pop();
    const projected = chart(); projected.geometry.coordinates[0][0][0] = [-504000, 6167000];
    for (const row of [unclosed, projected]) await expect(findShomCharts(point, { fetcher: fixture(collection([row])) })).rejects.toThrow();
  });

  it('rejects returned-count and vertex caps instead of silently truncating', async () => {
    const tooMany = collection(Array.from({ length: 64 }, () => chart()));
    const matchLimit = { ...collection(), numberMatched: 65 };
    const geometryLimit = chart(); geometryLimit.geometry.coordinates = [[Array.from({ length: 10_001 }, () => [-4.53, 48.36])]];
    for (const body of [tooMany, matchLimit, collection([geometryLimit])]) await expect(findShomCharts(point, { fetcher: fixture(body) })).rejects.toThrow('limites');
  });

  it('bounds content-length and stream bytes independently', async () => {
    for (const withHeader of [true, false]) {
      const fetcher = vi.fn<typeof fetch>(async () => withHeader
        ? new Response('{}', { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })
        : new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); controller.close(); } })));
      await expect(findShomCharts(point, { fetcher })).rejects.toThrow('limites');
    }
  });

  it('rejects XML service errors and malformed JSON received with HTTP 200', async () => {
    for (const body of ['<ServiceExceptionReport>timeout</ServiceExceptionReport>', '{not-json']) {
      await expect(findShomCharts(point, { fetcher: vi.fn<typeof fetch>(async () => new Response(body)) })).rejects.toThrow('indisponible');
    }
  });

  it('shares work and caches public results without allowing caller mutation to poison the cache', async () => {
    const fetcher = fixture();
    const [first, second] = await Promise.all([findShomCharts(point, { fetcher }), findShomCharts(point, { fetcher })]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    first.charts[0].title = 'Changed'; second.charts.length = 0;
    expect((await findShomCharts(point, { fetcher })).charts[0].title).toBe('INT 1833 Port de Brest');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('refreshes expired cache entries after one hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-22T12:00:00Z');
    const fetcher = fixture();
    const first = await findShomCharts(point, { fetcher });
    vi.setSystemTime('2026-10-22T12:59:59Z'); await findShomCharts(point, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(4);
    vi.setSystemTime('2026-10-22T13:00:01Z'); const next = await findShomCharts(point, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(8); expect(next.fetchedAt).not.toBe(first.fetchedAt);
  });

  it('bounds the cache at 128 distinct exact positions', async () => {
    const fetcher = fixture();
    await findShomCharts(point, { fetcher });
    for (let index = 1; index <= 128; index++) await findShomCharts({ ...point, latitude: point.latitude + index / 100_000 }, { fetcher });
    await findShomCharts(point, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(130 * 4);
  });

  it('does not cancel shared upstream requests when only one caller leaves', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = vi.fn<typeof fetch>(async () => { await gate; return Response.json(collection()); });
    const controller = new AbortController();
    const first = findShomCharts(point, { fetcher, signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = findShomCharts(point, { fetcher });
    controller.abort(); await rejected;
    expect(fetcher.mock.calls.every(([, options]) => !options?.signal?.aborted)).toBe(true);
    release(); expect((await second).charts).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('performs no work for an already aborted caller and retries failed lookups', async () => {
    const fetcher = fixture(); const controller = new AbortController(); controller.abort();
    await expect(findShomCharts(point, { fetcher, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
    let success = false;
    const retry = vi.fn<typeof fetch>(async () => success ? Response.json(collection()) : new Response('', { status: 503 }));
    await expect(findShomCharts(point, { fetcher: retry })).rejects.toThrow();
    success = true; expect((await findShomCharts(point, { fetcher: retry })).charts).toHaveLength(1);
    expect(retry).toHaveBeenCalledTimes(8);
  });
});
