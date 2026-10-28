import { classifyRings, VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { DETAILED_BASEMAP_METADATA_URL, DETAILED_BASEMAP_TILE_BYTE_LIMIT, DetailedBasemapTileCache, detailedMapTileTemplate,
  detailedMapTileUrl, detailedMapTiles, detailedTileBounds, projectDetailedTilePoint,
  type DetailedBasemapReply, type DetailedBasemapRequest, type DetailedMapFrame, type DetailedMapTile, type DetailedTilePaths,
} from './seaOperationDetailedBasemapModel';

const aborted = () => new DOMException('Aborted', 'AbortError');
const ensureActive = (signal: AbortSignal) => { if (signal.aborted) throw aborted(); };
const number = (value: number) => String(Math.round(value * 100) / 100);
const roadClasses = new Set(['primary', 'secondary', 'tertiary', 'minor', 'service']);

/** Decoding and projection are deliberately imported only by the worker, never by React. */
export function decodeDetailedMapTile(buffer: ArrayBuffer, frame: DetailedMapFrame, tile: DetailedMapTile): DetailedTilePaths {
  const source = new VectorTile(new PbfReader(buffer)), paths = { water: '', piers: '', pierLines: '', buildings: '', roads: '' };
  if (!Object.keys(source.layers).length) throw new Error('Tuile vide.');
  let totalVertices = 0;
  const append = (layerName: string, featureLimit: number, vertexLimit: number) => {
    const layer = source.layers[layerName];
    if (!layer) return;
    if (layer.length > 100_000 || layerName === 'water' && layer.length > featureLimit
      || !Number.isFinite(layer.extent) || layer.extent <= 0 || layer.extent > 65_536) {
      if (layerName === 'water') throw new Error('Géométrie côtière invalide.');
      return;
    }
    let used = 0;
    for (let index = 0; index < Math.min(layer.length, featureLimit); index += 1) {
      const feature = layer.feature(index), properties = feature.properties;
      const category = layerName === 'water' && feature.type === 3 && properties.brunnel !== 'tunnel' ? 'water'
        : layerName === 'building' && feature.type === 3 ? 'buildings'
          : layerName === 'transportation' && properties.class === 'pier' && feature.type === 3 ? 'piers'
            : layerName === 'transportation' && properties.class === 'pier' && feature.type === 2 ? 'pierLines'
              : layerName === 'transportation' && roadClasses.has(String(properties.class)) && feature.type === 2 ? 'roads' : null;
      if (!category) continue;
      const rings = feature.loadGeometry(), groups = feature.type === 3 ? classifyRings(rings) : rings.map(ring => [ring]);
      for (const group of groups) {
        const vertices = group.reduce((sum, ring) => sum + ring.length, 0);
        const invalid = group.some(ring => ring.length < (feature.type === 3 ? 3 : 2) || ring.length > 24_000
          || ring.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > layer.extent * 8 || Math.abs(point.y) > layer.extent * 8));
        // Water and pier geometry take priority over decorative buildings and roads.
        if (invalid || used + vertices > vertexLimit || totalVertices + vertices > 40_000) {
          if (category === 'water') throw new Error('Géométrie côtière trop complexe.');
          continue;
        }
        for (const ring of group) {
          const points = ring.map(point => projectDetailedTilePoint(frame, tile, point, layer.extent));
          paths[category] += `M${points.map(point => `${number(point.x)} ${number(point.y)}`).join('L')}${feature.type === 3 ? 'Z' : ''}`;
        }
        used += vertices; totalVertices += vertices;
      }
    }
  };
  append('water', 8000, 30_000);
  if (tile.z >= 13) append('transportation', 12_000, 6000);
  if (tile.z >= 14) append('building', 2000, 4000);
  return { key: `${tile.key}:${tile.worldX}`, ...detailedTileBounds(frame, tile), ...paths };
}

export async function boundedDetailedMapResponse(response: Response, limit = DETAILED_BASEMAP_TILE_BYTE_LIMIT): Promise<ArrayBuffer> {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > limit) throw new Error('Fond détaillé indisponible.');
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limit) throw new Error('Tuile trop volumineuse.');
    return buffer;
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Tuile trop volumineuse.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

/** No prefetching, proxy or all-world download; only the current viewport enters this queue. */
export class DetailedBasemapEngine {
  private template: string | null = null;
  private readonly cache = new DetailedBasemapTileCache();
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = (input, init) => fetcher(input, init); }
  async render(request: DetailedBasemapRequest, sourceSignal: AbortSignal): Promise<DetailedBasemapReply> {
    const signal = AbortSignal.any([sourceSignal, AbortSignal.timeout(45_000)]);
    ensureActive(signal);
    const selected = detailedMapTiles(request.frame);
    if (!selected.length) return { ...request, tiles: [], failed: 0 };
    if (!this.template) {
      const metadataSignal = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
      const response = await this.fetcher(DETAILED_BASEMAP_METADATA_URL, { signal: metadataSignal, credentials: 'omit', mode: 'cors', referrerPolicy: 'strict-origin-when-cross-origin' });
      const buffer = await boundedDetailedMapResponse(response, 128 * 1024);
      this.template = detailedMapTileTemplate(JSON.parse(new TextDecoder().decode(buffer)));
    }
    ensureActive(signal);
    const template = this.template, result: Array<DetailedTilePaths | undefined> = Array(selected.length);
    let next = 0, failed = 0;
    const run = async () => {
      while (next < selected.length && !signal.aborted) {
        ensureActive(sourceSignal);
        const index = next++, tile = selected[index], url = detailedMapTileUrl(template, tile);
        try {
          let buffer = this.cache.get(url);
          if (!buffer) {
            const tileSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
            const response = await this.fetcher(url, { signal: tileSignal, credentials: 'omit', mode: 'cors', referrerPolicy: 'strict-origin-when-cross-origin' });
            buffer = await boundedDetailedMapResponse(response);
            ensureActive(tileSignal); this.cache.set(url, buffer);
          }
          ensureActive(signal); result[index] = decodeDetailedMapTile(buffer, request.frame, tile);
        } catch (error) {
          if (sourceSignal.aborted) throw error;
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, run));
    ensureActive(sourceSignal); failed += selected.length - next;
    return { ...request, tiles: result.filter((tile): tile is DetailedTilePaths => Boolean(tile)), failed };
  }
}
