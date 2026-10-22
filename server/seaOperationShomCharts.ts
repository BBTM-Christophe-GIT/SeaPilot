import type { ShomChart, ShomChartLookup } from '../src/features/seaOperations/seaOperationHydroModel.js';
export type { ShomChart, ShomChartLookup } from '../src/features/seaOperations/seaOperationHydroModel.js';

const ENDPOINT = 'https://services.data.shom.fr/INSPIRE/wfs';
const SOURCE = ENDPOINT;
const LAYERS = ['30', '30_300', '300_800', '800'] as const;
const COUNT = 64;
const MAX_BODY = 2 * 1024 * 1024;
const TTL = 60 * 60_000;
const CRS84 = new Set(['urn:ogc:def:crs:CRS::84', 'urn:ogc:def:crs:OGC:1.3:CRS84', 'urn:ogc:def:crs:OGC::CRS84', 'CRS:84', 'OGC:CRS84']);
interface Position { latitude: number; longitude: number }
interface State {
  cache: Map<string, { expires: number; result: ShomChartLookup }>;
  pending: Map<string, Promise<ShomChartLookup>>;
}
const states = new WeakMap<typeof fetch, State>();
function stateFor(fetcher: typeof fetch): State {
  let state = states.get(fetcher);
  if (!state) { state = { cache: new Map(), pending: new Map() }; states.set(fetcher, state); }
  return state;
}
function unavailable(): Error { return new Error('Le catalogue des cartes Shom est temporairement indisponible. Réessayez.'); }
function limited(): Error { return new Error('Le résultat du catalogue Shom dépasse les limites de consultation.'); }

function urlFor(position: Position, layer: typeof LAYERS[number]): URL {
  const filter = '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2">'
    + '<fes:Intersects><fes:ValueReference>geometry</fes:ValueReference>'
    + '<gml:Point srsName="urn:ogc:def:crs:OGC:1.3:CRS84">'
    + `<gml:pos>${position.longitude} ${position.latitude}</gml:pos>`
    + '</gml:Point></fes:Intersects></fes:Filter>';
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: `GRILLES_CARTES_PAPIER:grille_cartespapier_${layer}`, outputFormat: 'application/json',
    srsName: 'urn:ogc:def:crs:OGC:1.3:CRS84', count: String(COUNT), filter }).toString();
  return url;
}

async function jsonBody(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) { await response.body?.cancel(); throw unavailable(); }
  const length = response.headers.get('content-length');
  if (length !== null && (!Number.isSafeInteger(Number(length)) || Number(length) < 0 || Number(length) > MAX_BODY)) {
    await response.body.cancel(); throw limited();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw limited(); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw unavailable(); }
}

type XY = [number, number];
/** Boundary intersections count; holes and disconnected frames do not become their bounding box. */
function ringPosition(ring: XY[], point: Position): 'inside' | 'outside' | 'boundary' {
  const x = point.longitude, y = point.latitude;
  let inside = false;
  for (let index = 1; index < ring.length; index++) {
    const [ax, ay] = ring[index - 1], [bx, by] = ring[index];
    const epsilon = 1e-10;
    const cross = Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax));
    if (cross <= epsilon * Math.max(1, Math.abs(bx - ax) + Math.abs(by - ay))
      && x >= Math.min(ax, bx) - epsilon && x <= Math.max(ax, bx) + epsilon
      && y >= Math.min(ay, by) - epsilon && y <= Math.max(ay, by) + epsilon) return 'boundary';
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
function intersects(value: unknown, position: Position): boolean {
  if (!value || typeof value !== 'object') throw unavailable();
  const geometry = value as Record<string, unknown>;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') throw unavailable();
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0 || polygons.length > 64) throw unavailable();
  let vertices = 0;
  const validated = polygons.map((polygon): XY[][] => {
    if (!Array.isArray(polygon) || polygon.length === 0 || polygon.length > 64) throw unavailable();
    return polygon.map((ring): XY[] => {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 10_000 || (vertices += ring.length) > 20_000) throw limited();
      const points = ring.map((item): XY => {
        if (!Array.isArray(item) || item.length < 2 || typeof item[0] !== 'number' || !Number.isFinite(item[0]) || Math.abs(item[0]) > 180.0000001
          || typeof item[1] !== 'number' || !Number.isFinite(item[1]) || Math.abs(item[1]) > 90.0000001) throw unavailable();
        return [item[0], item[1]];
      });
      if (Math.abs(points[0][0] - points.at(-1)![0]) > 1e-9 || Math.abs(points[0][1] - points.at(-1)![1]) > 1e-9) throw unavailable();
      return points;
    });
  });
  return validated.some(([outer, ...holes]) => {
    const edge = ringPosition(outer, position);
    if (edge === 'outside') return false;
    if (edge === 'boundary') return true;
    const inner = holes.map((ring) => ringPosition(ring, position));
    return inner.includes('boundary') || !inner.includes('inside');
  });
}

function chartsFrom(value: unknown, position: Position): ShomChart[] {
  if (!value || typeof value !== 'object') throw unavailable();
  const body = value as Record<string, unknown>;
  if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) throw unavailable();
  const matched = body.numberMatched ?? body.totalFeatures;
  const matchedCount = matched === undefined || matched === 'unknown' ? null
    : typeof matched === 'number' ? matched : typeof matched === 'string' && /^\d+$/.test(matched) ? Number(matched) : NaN;
  if (matchedCount !== null && (!Number.isSafeInteger(matchedCount) || matchedCount < 0)) throw unavailable();
  if (body.features.length >= COUNT || matchedCount !== null && matchedCount > COUNT) throw limited();
  if (matchedCount !== null && matchedCount !== body.features.length) throw unavailable();
  if (body.numberReturned !== undefined && body.numberReturned !== body.features.length) throw unavailable();
  if (body.crs !== undefined && body.crs !== null) {
    const crs = body.crs as { type?: unknown; properties?: { name?: unknown } };
    if (!crs || crs.type !== 'name' || !CRS84.has(String(crs.properties?.name))) throw unavailable();
  }
  return body.features.flatMap((value): ShomChart[] => {
    if (!value || typeof value !== 'object') throw unavailable();
    const feature = value as Record<string, unknown>;
    if (feature.type !== 'Feature' || !feature.properties || typeof feature.properties !== 'object') throw unavailable();
    const properties = feature.properties as Record<string, unknown>;
    if (typeof properties.fid !== 'string' || !/^\d{4,5}$/.test(properties.fid)
      || !Number.isSafeInteger(properties.numero) || Number(properties.fid) !== properties.numero
      || typeof properties.scale !== 'number' || !Number.isSafeInteger(properties.scale) || properties.scale < 1 || properties.scale > 100_000_000
      || typeof properties.name !== 'string' || properties.name.trim().length === 0 || properties.name.length > 500
      || [...properties.name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw unavailable();
    if (!intersects(feature.geometry, position)) return [];
    const number = properties.fid;
    const fullName = properties.name.trim();
    const prefix = /^(\d{4,5})\s*[-–]\s*/.exec(fullName);
    if (prefix && Number(prefix[1]) !== properties.numero) throw unavailable();
    const title = (prefix ? fullName.slice(prefix[0].length) : fullName).trim();
    if (!title) throw unavailable();
    return [{ id: `shom-paper:${number}`, number, title, scale: properties.scale,
      catalogueUrl: `https://diffusion.shom.fr/catalogsearch/result/?q=${encodeURIComponent(number)}` }];
  });
}

function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
function copy(result: ShomChartLookup): ShomChartLookup { return { ...result, charts: result.charts.map((chart) => ({ ...chart })) }; }

/** Catalogue footprints identify paper charts; they do not expose chart pixels or soundings. */
export async function findShomCharts(position: Position, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<ShomChartLookup> {
  if (!position || typeof position.latitude !== 'number' || !Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90
    || typeof position.longitude !== 'number' || !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180) {
    throw new Error('Les coordonnées du point sont invalides.');
  }
  options.signal?.throwIfAborted();
  const fetcher = options.fetcher ?? fetch;
  const state = stateFor(fetcher);
  const key = `${position.latitude},${position.longitude}`;
  const now = Date.now();
  for (const [id, entry] of state.cache) if (entry.expires <= now) state.cache.delete(id);
  const cached = state.cache.get(key);
  if (cached) {
    state.cache.delete(key); state.cache.set(key, cached);
    return copy(cached.result);
  }
  let pending = state.pending.get(key);
  if (!pending) {
    if (state.pending.size >= 16) throw new Error('Le catalogue Shom est occupé. Réessayez.');
    const controller = new AbortController();
    pending = (async () => {
      try {
        const layers = await Promise.all(LAYERS.map(async (layer) => {
          const response = await fetcher(urlFor(position, layer), { credentials: 'omit', cache: 'no-store', redirect: 'error',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
          return chartsFrom(await jsonBody(response), position);
        }));
        const charts = new Map<string, ShomChart>();
        for (const chart of layers.flat().sort((a, b) => a.scale - b.scale || a.number.localeCompare(b.number))) if (!charts.has(chart.id)) charts.set(chart.id, chart);
        const result: ShomChartLookup = { charts: [...charts.values()], fetchedAt: new Date().toISOString(), sourceUrl: SOURCE, truncated: false };
        state.cache.set(key, { expires: Date.now() + TTL, result });
        while (state.cache.size > 128) state.cache.delete(state.cache.keys().next().value!);
        return result;
      } catch (error) { controller.abort(); throw error; }
    })().finally(() => { state.pending.delete(key); });
    state.pending.set(key, pending);
  }
  return copy(await waitFor(pending, options.signal));
}
