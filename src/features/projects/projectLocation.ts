import type { SeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { parseSeaOperationMapViewport, type SeaOperationMapViewport } from '../seaOperations/seaOperationMapViewport';
import { isSeaOperationIsolatedPointIconName } from '../seaOperations/seaOperationIsolatedPointIcons';

export interface ProjectLocationZone {
  id: string;
  name: string;
  vertices: { latitude: string; longitude: string }[];
}
export interface ProjectLocationOverlay {
  version: 1;
  points: SeaOperationWaypoint[];
  zones: ProjectLocationZone[];
}
export interface ProjectLocationPlan extends ProjectLocationOverlay {
  mapViewport?: SeaOperationMapViewport;
  etd: string;
  charts: string;
  waypoints: SeaOperationWaypoint[];
  includeInPdf: boolean;
}
export const PROJECT_LOCATION_LIMITS = { bytes: 256 * 1024, overlayBytes: 512 * 1024, waypoints: 200, points: 200, zones: 50, vertices: 200 } as const;
const invalid = () => new Error('La localisation du projet est invalide ou dépasse les limites autorisées.');
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function string(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) throw invalid();
  return value;
}
function identity(value: unknown, ids: Set<string>): string {
  const id = string(value, 200);
  if (!id.trim() || ids.has(id)) throw invalid();
  ids.add(id); return id;
}
function boundedArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw invalid();
  return value;
}
function checkSize(value: unknown, maximum: number = PROJECT_LOCATION_LIMITS.bytes) {
  try { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximum) throw invalid(); }
  catch { throw invalid(); }
}
function sameJsonValue(value: unknown, canonical: unknown): boolean {
  if (value === canonical) return true;
  if (Array.isArray(value) && Array.isArray(canonical)) return value.length === canonical.length && value.every((item, index) => sameJsonValue(item, canonical[index]));
  if (!object(value) || !object(canonical)) return false;
  const keys = Object.keys(canonical);
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key) && sameJsonValue(value[key], canonical[key]));
}
function waypoint(value: unknown, ids: Set<string>, isolated = false): SeaOperationWaypoint {
  if (!object(value) || typeof value.denseTraffic !== 'boolean') throw invalid();
  if (Object.hasOwn(value, 'isolatedPointIcon') && (!isolated || !isSeaOperationIsolatedPointIconName(value.isolatedPointIcon))) throw invalid();
  if (value.ukcMode !== undefined && value.ukcMode !== 'manual' && value.ukcMode !== 'automatic'
    || value.etaMode !== undefined && value.etaMode !== 'manual' && value.etaMode !== 'automatic') throw invalid();
  return { id: identity(value.id, ids), number: string(value.number, 80), descriptionVhf: string(value.descriptionVhf, 4000),
    latitude: string(value.latitude, 80), longitude: string(value.longitude, 80), ukc: string(value.ukc, 200), eta: string(value.eta, 80), denseTraffic: value.denseTraffic,
    ...(value.ukcMode === undefined ? {} : { ukcMode: value.ukcMode }), ...(value.etaMode === undefined ? {} : { etaMode: value.etaMode }),
    ...(isSeaOperationIsolatedPointIconName(value.isolatedPointIcon) ? { isolatedPointIcon: value.isolatedPointIcon } : {}) };
}
function overlay(value: Record<string, unknown>, ids: Set<string>): ProjectLocationOverlay {
  if (value.version !== 1) throw invalid();
  const points = boundedArray(value.points, PROJECT_LOCATION_LIMITS.points).map(point => waypoint(point, ids, true));
  const zones = boundedArray(value.zones, PROJECT_LOCATION_LIMITS.zones).map(value => {
    if (!object(value) || Object.hasOwn(value, 'isolatedPointIcon')) throw invalid();
    return { id: identity(value.id, ids), name: string(value.name, 500), vertices: boundedArray(value.vertices, PROJECT_LOCATION_LIMITS.vertices).map(vertex => {
      if (!object(vertex) || Object.hasOwn(vertex, 'isolatedPointIcon')) throw invalid();
      return { latitude: string(vertex.latitude, 80), longitude: string(vertex.longitude, 80) };
    }) };
  });
  return { version: 1, points, zones };
}

/** Incomplete coordinates and times remain editable drafts; no data capture is accepted here. */
export function parseProjectLocationPlan(value: unknown): ProjectLocationPlan | null {
  if (value === null || value === undefined) return null;
  if (!object(value) || typeof value.includeInPdf !== 'boolean') throw invalid();
  checkSize(value);
  const ids = new Set<string>();
  const waypoints = boundedArray(value.waypoints, PROJECT_LOCATION_LIMITS.waypoints).map(point => waypoint(point, ids));
  let mapViewport: SeaOperationMapViewport | undefined;
  try { mapViewport = parseSeaOperationMapViewport(value.mapViewport); } catch { throw invalid(); }
  return { ...overlay(value, ids), etd: string(value.etd, 80), charts: string(value.charts, 20000), waypoints, includeInPdf: value.includeInPdf,
    ...(mapViewport ? { mapViewport } : {}) };
}
export function parseProjectLocationOverlay(value: unknown): ProjectLocationOverlay | null {
  if (value === null || value === undefined) return null;
  if (!object(value)) throw invalid();
  checkSize(value, PROJECT_LOCATION_LIMITS.overlayBytes);
  const canonical = overlay(value, new Set());
  if (!sameJsonValue(value, canonical)) throw invalid();
  return canonical;
}
export function emptyProjectLocationPlan(): ProjectLocationPlan {
  return { version: 1, etd: '', charts: '', waypoints: [], points: [], zones: [], includeInPdf: false };
}
export function cloneProjectLocationPlan(value: ProjectLocationPlan): ProjectLocationPlan;
export function cloneProjectLocationPlan(value: ProjectLocationPlan | null | undefined): ProjectLocationPlan | null;
export function cloneProjectLocationPlan(value: ProjectLocationPlan | null | undefined): ProjectLocationPlan | null { return parseProjectLocationPlan(value); }
export function hasProjectLocationContent(value: ProjectLocationPlan | null | undefined): boolean {
  return Boolean(value && (value.mapViewport || value.etd.trim() || value.charts.trim() || value.waypoints.length || value.points.length || value.zones.length));
}
