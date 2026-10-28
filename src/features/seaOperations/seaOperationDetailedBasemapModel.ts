import type { RouteMapProjection, SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';

export const DETAILED_BASEMAP_METADATA_URL = 'https://tiles.openfreemap.org/planet';
export const DETAILED_BASEMAP_ATTRIBUTION = {
  provider: 'OpenFreeMap', providerUrl: 'https://openfreemap.org/',
  schema: 'OpenMapTiles', schemaUrl: 'https://www.openmaptiles.org/',
  data: 'OpenStreetMap contributors', dataUrl: 'https://www.openstreetmap.org/copyright',
} as const;
export const DETAILED_BASEMAP_MAX_TILES = 32;
export const DETAILED_BASEMAP_MAX_ZOOM = 14;
export const DETAILED_BASEMAP_TILE_BYTE_LIMIT = 2 * 1024 * 1024;
const MERCATOR_LIMIT = 85.0511287798066;
export type DetailedBasemapStatus = 'loading' | 'ready' | 'partial' | 'unavailable';
export interface DetailedMapFrame { width: number; height: number; projection: RouteMapProjection }
export interface DetailedMapTile { key: string; z: number; x: number; y: number; worldX: number }
export interface DetailedTilePaths {
  key: string; x: number; y: number; width: number; height: number;
  water: string; piers: string; pierLines: string; buildings: string; roads: string;
}
export interface DetailedBasemapRequest { id: number; frame: DetailedMapFrame }
export interface DetailedBasemapReply extends DetailedBasemapRequest { tiles: DetailedTilePaths[]; failed: number; error?: boolean }

export function detailedMapFrame(geometry: Pick<SeaOperationRouteMapGeometry, 'width' | 'height' | 'projection'>): DetailedMapFrame | null {
  const projection = geometry.projection;
  if (!projection || ![geometry.width, geometry.height, projection.latitudePixelsPerDegree, projection.longitudePixelsPerDegree]
    .every(value => Number.isFinite(value) && value > 0)
    || geometry.width > 4000 || geometry.height > 4000
    || !Number.isFinite(projection.centerLatitude) || Math.abs(projection.centerLatitude) > 90
    || !Number.isFinite(projection.centerLongitude) || Math.abs(projection.centerLongitude) > 180) return null;
  return { width: geometry.width, height: geometry.height, projection: { ...projection } };
}
export const detailedMapFrameKey = (frame: DetailedMapFrame | null): string => frame
  ? [frame.width, frame.height, frame.projection.centerLatitude, frame.projection.centerLongitude,
    frame.projection.latitudePixelsPerDegree, frame.projection.longitudePixelsPerDegree].join(':') : '';
const tileY = (latitude: number, n: number) => (1 - Math.asinh(Math.tan(Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, latitude)) * Math.PI / 180)) / Math.PI) / 2 * n;
const latitudeAt = (value: number, n: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * value / n))) * 180 / Math.PI;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Only the visible rectangle is requested. Lower the LOD instead of dropping edge tiles. */
export function detailedMapTiles(frame: DetailedMapFrame): DetailedMapTile[] {
  if (!detailedMapFrame(frame)) return [];
  const p = frame.projection, span = Math.min(360, frame.width / p.longitudePixelsPerDegree);
  const west = p.centerLongitude - span / 2, east = p.centerLongitude + span / 2;
  const north = p.centerLatitude + frame.height / (2 * p.latitudePixelsPerDegree);
  const south = p.centerLatitude - frame.height / (2 * p.latitudePixelsPerDegree);
  if (south >= MERCATOR_LIMIT || north <= -MERCATOR_LIMIT) return [];
  for (let z = clamp(Math.floor(Math.log2(360 * p.longitudePixelsPerDegree / 256)), 0, DETAILED_BASEMAP_MAX_ZOOM); z >= 0; z -= 1) {
    const n = 2 ** z, x0 = Math.floor((west + 180) / 360 * n), x1 = Math.max(x0, Math.ceil((east + 180) / 360 * n - 1e-10) - 1);
    const y0 = clamp(Math.floor(tileY(north, n)), 0, n - 1), y1 = clamp(Math.ceil(tileY(south, n) - 1e-10) - 1, 0, n - 1);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > DETAILED_BASEMAP_MAX_TILES) continue;
    const tiles: DetailedMapTile[] = [];
    for (let y = y0; y <= y1; y += 1) for (let worldX = x0; worldX <= x1; worldX += 1) {
      const x = ((worldX % n) + n) % n;
      tiles.push({ z, x, y, worldX, key: `${z}/${x}/${y}` });
    }
    return tiles;
  }
  return [];
}

export function detailedMapTileTemplate(value: unknown): string {
  if (!value || typeof value !== 'object' || !('tiles' in value) || !Array.isArray(value.tiles)) throw new Error('Fond détaillé indisponible.');
  const template = value.tiles.find(item => typeof item === 'string'
    && /^https:\/\/tiles\.openfreemap\.org\/planet\/[A-Za-z0-9_-]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/.test(item));
  if (typeof template !== 'string') throw new Error('Fond détaillé indisponible.');
  return template;
}
export function detailedMapTileUrl(template: string, tile: DetailedMapTile): string {
  detailedMapTileTemplate({ tiles: [template] });
  if (![tile.z, tile.x, tile.y].every(Number.isInteger) || tile.z < 0 || tile.z > DETAILED_BASEMAP_MAX_ZOOM
    || tile.x < 0 || tile.y < 0 || tile.x >= 2 ** tile.z || tile.y >= 2 ** tile.z) throw new Error('Tuile invalide.');
  return template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));
}

/** Each MVT vertex is inverse-projected before applying the existing map projection. */
export function projectDetailedTilePoint(frame: DetailedMapFrame, tile: DetailedMapTile, point: { x: number; y: number }, extent = 4096) {
  const n = 2 ** tile.z, p = frame.projection;
  const longitude = (tile.worldX + point.x / extent) / n * 360 - 180;
  const latitude = latitudeAt(tile.y + point.y / extent, n);
  return { x: frame.width / 2 + (longitude - p.centerLongitude) * p.longitudePixelsPerDegree,
    y: frame.height / 2 - (latitude - p.centerLatitude) * p.latitudePixelsPerDegree };
}
export function detailedTileBounds(frame: DetailedMapFrame, tile: DetailedMapTile) {
  const top = projectDetailedTilePoint(frame, tile, { x: 0, y: 0 }, 1), bottom = projectDetailedTilePoint(frame, tile, { x: 1, y: 1 }, 1);
  return { x: top.x, y: top.y, width: bottom.x - top.x, height: bottom.y - top.y };
}

/** Reuse loaded paths while a new frame is being decoded, including viewport resizing. */
export function detailedBasemapTransform(base: DetailedMapFrame, next: DetailedMapFrame): string {
  const a = base.projection, b = next.projection, sx = b.longitudePixelsPerDegree / a.longitudePixelsPerDegree, sy = b.latitudePixelsPerDegree / a.latitudePixelsPerDegree;
  const longitudeDifference = ((a.centerLongitude - b.centerLongitude + 540) % 360) - 180;
  const tx = next.width / 2 - base.width / 2 * sx + longitudeDifference * b.longitudePixelsPerDegree;
  const ty = next.height / 2 - base.height / 2 * sy + (b.centerLatitude - a.centerLatitude) * b.latitudePixelsPerDegree;
  return `matrix(${sx}, 0, 0, ${sy}, ${tx}, ${ty})`;
}

/** Binary cache stays bounded independently of the number of views visited. */
export class DetailedBasemapTileCache {
  private readonly values = new Map<string, ArrayBuffer>();
  private bytes = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  constructor(maxEntries = 64, maxBytes = 12 * 1024 * 1024) { this.maxEntries = maxEntries; this.maxBytes = maxBytes; }
  get(key: string) {
    const value = this.values.get(key);
    if (value) { this.values.delete(key); this.values.set(key, value); }
    return value;
  }
  set(key: string, value: ArrayBuffer) {
    if (value.byteLength > this.maxBytes || this.maxEntries < 1) return;
    const previous = this.values.get(key);
    if (previous) { this.bytes -= previous.byteLength; this.values.delete(key); }
    this.values.set(key, value); this.bytes += value.byteLength;
    while (this.values.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.values.get(oldest)!.byteLength; this.values.delete(oldest);
    }
  }
  get size() { return this.values.size; }
  get byteLength() { return this.bytes; }
}
