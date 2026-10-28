import placesJson from './mapData/places.json?raw';
import { formatProjectPort, PROJECT_PORTS, type ProjectPort } from '../projects/projectPorts';
import type { SeaOperationRouteMapGeometry, RouteMapPosition } from './seaOperationRouteMapGeometry';

export interface SeaOperationMapLocation {
  source: 'sandre' | 'wpi'; sourceId: string; name: string; municipality: string;
  departmentCode: string; locode: string; longitude: number; latitude: number; precisionCode: string;
}
export interface SeaOperationMapPort { key: string; port: ProjectPort; location: SeaOperationMapLocation | null }
export type SeaOperationMapPortRole = 'departure' | 'arrival';
export interface SeaOperationResolvedMapPort extends SeaOperationMapPort {
  location: SeaOperationMapLocation;
  roles: SeaOperationMapPortRole[];
  roleLabel: 'Départ' | 'Arrivée' | 'Départ / Arrivée';
}
export interface SeaOperationMapPortIssue {
  role: SeaOperationMapPortRole;
  input: string;
  reason: 'not-found' | 'ambiguous' | 'unlocated';
  candidates: SeaOperationMapPort[];
}
interface City { id: string; name: string; longitude: number; latitude: number; rank: number; population: number }
interface Label extends RouteMapPosition { anchor: 'start' | 'end' }
interface Box { west: number; east: number; north: number; south: number }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const wrapped = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
const data = JSON.parse(placesJson) as { ports: Array<['sandre' | 'wpi', string, string, string, string, string, number, number, string]>;
  cities: Array<[string, string, number, number, number, number]> };
const locations: readonly SeaOperationMapLocation[] = data.ports.map(([source, sourceId, name, municipality, departmentCode, locode, longitude, latitude, precisionCode]) =>
  ({ source, sourceId, name, municipality, departmentCode, locode, longitude, latitude, precisionCode }));
const cities: readonly City[] = data.cities.map(([id, name, longitude, latitude, rank, population]) => ({ id, name, longitude, latitude, rank, population }));
const rankedCities = [...cities].sort((a, b) => a.rank - b.rank || b.population - a.population || a.id.localeCompare(b.id));
// Two-degree buckets avoid visiting all 7,342 city references after each camera gesture.
// Original rank order is restored before label placement, so the visible result is unchanged.
const cityBuckets = new Map<number, Array<{ city: City; order: number }>>();
for (const [order, city] of rankedCities.entries()) {
  const key = Math.min(89, Math.floor((city.latitude + 90) / 2)) * 180 + Math.floor((wrapped(city.longitude) + 180) / 2);
  const bucket = cityBuckets.get(key), item = { city, order };
  if (bucket) bucket.push(item); else cityBuckets.set(key, [item]);
}

function candidateCities(geometry: SeaOperationRouteMapGeometry): readonly City[] {
  const p = geometry.projection;
  if (!p) return [];
  const longitudeSpan = geometry.width / p.longitudePixelsPerDegree, latitudeSpan = geometry.height / p.latitudePixelsPerDegree;
  if (![longitudeSpan, latitudeSpan, p.centerLatitude, p.centerLongitude].every(Number.isFinite) || longitudeSpan <= 0 || latitudeSpan <= 0) return [];
  // Almost-global arcs can start and finish inside the same wrapped two-degree bucket.
  // Scan ranked cities in that rare case; exact projection still excludes the small gap.
  if (longitudeSpan >= 358) return rankedCities;
  const south = Math.max(-90, p.centerLatitude - latitudeSpan / 2), north = Math.min(90, p.centerLatitude + latitudeSpan / 2);
  if (south > north) return [];
  const firstRow = Math.min(89, Math.floor((south + 90) / 2)), lastRow = Math.min(89, Math.floor((north + 90) / 2));
  const firstColumn = Math.floor((wrapped(p.centerLongitude - longitudeSpan / 2) + 180) / 2), lastColumn = Math.floor((wrapped(p.centerLongitude + longitudeSpan / 2) + 180) / 2);
  const columns = longitudeSpan >= 360 ? [[0, 179]] : firstColumn <= lastColumn ? [[firstColumn, lastColumn]] : [[firstColumn, 179], [0, lastColumn]];
  const count = columns.reduce((sum, [from, to]) => sum + to - from + 1, 0) * (lastRow - firstRow + 1);
  if (count > 2000) return rankedCities;
  const candidates: Array<{ city: City; order: number }> = [];
  for (let row = firstRow; row <= lastRow; row += 1) for (const [from, to] of columns) {
    for (let column = from; column <= to; column += 1) {
      const bucket = cityBuckets.get(row * 180 + column); if (bucket) candidates.push(...bucket);
    }
  }
  return candidates.sort((a, b) => a.order - b.order).map(item => item.city);
}
const exactOne = <T,>(values: readonly T[]) => values.length === 1 ? values[0] : null;
function locationIndex(key: (location: SeaOperationMapLocation) => string) {
  const index = new Map<string, SeaOperationMapLocation[]>();
  for (const location of locations) {
    const identity = key(location); if (!identity) continue;
    const bucket = index.get(identity); if (bucket) bucket.push(location); else index.set(identity, [location]);
  }
  return index;
}
const frenchByName = locationIndex(location => location.source === 'sandre' ? normalize(location.name) : '');
const wpiByName = locationIndex(location => location.source === 'wpi' ? normalize(location.name) : '');
const wpiByCode = locationIndex(location => location.source === 'wpi' ? location.locode : '');
const wpiNames: Readonly<Record<string, string>> = {
  portsmouth: 'Portsmouth Harbour', portland: 'Portland Harbour', 'hughtown st mary s': "St. Mary's (Scilly Isl.)",
};
const catalogKey = (port: ProjectPort) => JSON.stringify([port.country, port.departmentCode || port.department, port.port,
  port.municipality || '', port.locode, port.referenceCode || '', port.parentLocode || '']);

/** Match a named port, never assign its municipal or statistical-parent LOCODE's position. */
export function findSeaOperationMapPortLocation(port: ProjectPort): SeaOperationMapLocation | null {
  if (port.country === 'France') {
    const matches = (frenchByName.get(normalize(port.port)) || []).filter(location => (!port.municipality || normalize(location.municipality) === normalize(port.municipality))
      && (!port.departmentCode || location.departmentCode === port.departmentCode));
    return exactOne(matches);
  }
  const ownCode = port.locodeAssociation === 'municipality' ? null : exactOne(wpiByCode.get(port.locode) || []);
  if (ownCode) return ownCode;
  const name = wpiNames[normalize(port.port)] || port.port;
  return exactOne(wpiByName.get(normalize(name)) || []);
}

// Same objects as Projects, with only identical identities deduplicated. No separate shortlist.
export const SEA_OPERATION_MAP_PORT_CATALOG: readonly SeaOperationMapPort[] = [...new Map(PROJECT_PORTS.map(port => {
  const key = catalogKey(port); return [key, { key, port, location: findSeaOperationMapPortLocation(port) }] as const;
})).values()];

function portNames(port: ProjectPort): string[] {
  const name = normalize(port.port);
  return [...new Set([name, name.replace(/^port (?:de |du |des |d )?/, ''),
    name.replace(/^port du /, 'le '), name.replace(/^port des /, 'les ')])];
}

const sortedPortCatalog = [...SEA_OPERATION_MAP_PORT_CATALOG].sort((a, b) => a.port.port.localeCompare(b.port.port, 'fr'));
function catalogNameIndex(names: (port: ProjectPort) => readonly string[]) {
  const result = new Map<string, SeaOperationMapPort[]>();
  for (const item of SEA_OPERATION_MAP_PORT_CATALOG) for (const name of names(item.port)) {
    const bucket = result.get(name); if (bucket) bucket.push(item); else result.set(name, [item]);
  }
  return result;
}
const catalogByFullName = catalogNameIndex(port => [normalize(formatProjectPort(port))]);
const catalogByName = catalogNameIndex(portNames);
const locatedByCode = new Map(SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.location && item.port.locode).map(item => [item.port.locode, item.location!]));
const relatedPortCatalog = sortedPortCatalog.flatMap(item => {
  if (item.location || !item.port.parentLocode) return [];
  const parent = locatedByCode.get(item.port.parentLocode) || exactOne(wpiByCode.get(item.port.parentLocode) || []);
  return parent ? [{ ...item, parent }] : [];
});

/** Resolve named catalogue ports only; municipalities and associated LOCODEs never supply a guessed position. */
export function resolveSeaOperationMapPorts(departurePort?: string, arrivalPort?: string): { ports: SeaOperationResolvedMapPort[]; issues: SeaOperationMapPortIssue[] } {
  const ports: SeaOperationResolvedMapPort[] = [], issues: SeaOperationMapPortIssue[] = [];
  for (const [role, input] of [['departure', departurePort], ['arrival', arrivalPort]] as const) {
    if (!input?.trim()) continue;
    const name = normalize(input);
    const full = catalogByFullName.get(name);
    const candidates = [...(full?.length ? full : catalogByName.get(name) || [])];
    const identities = new Map(candidates.map(item => [item.location ? `${item.location.source}:${item.location.sourceId}` : item.key, item]));
    if (identities.size !== 1) { issues.push({ role, input, reason: identities.size ? 'ambiguous' : 'not-found', candidates }); continue; }
    const candidate = identities.values().next().value!;
    if (!candidate.location || !Number.isFinite(candidate.location.latitude) || !Number.isFinite(candidate.location.longitude)
      || Math.abs(candidate.location.latitude) > 90 || Math.abs(candidate.location.longitude) > 180) {
      issues.push({ role, input, reason: 'unlocated', candidates }); continue;
    }
    const identity = `${candidate.location.source}:${candidate.location.sourceId}`;
    const existing = ports.find(item => item.key === identity);
    if (existing) { existing.roles.push(role); existing.roleLabel = 'Départ / Arrivée'; }
    else ports.push({ ...candidate, key: identity, location: candidate.location, roles: [role], roleLabel: role === 'departure' ? 'Départ' : 'Arrivée' });
  }
  return { ports, issues };
}
export const SEA_OPERATION_MAP_PORT_COVERAGE = {
  france: { total: SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.country === 'France').length,
    located: SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.country === 'France' && item.location).length },
  england: { total: SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.country === 'Angleterre').length,
    located: SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.country === 'Angleterre' && item.location).length },
};

/** Project WGS84 into the existing SVG projection; reject off-screen and invalid coordinates. */
export function projectSeaOperationMapPlace(geometry: SeaOperationRouteMapGeometry, place: { latitude: number; longitude: number }): RouteMapPosition | null {
  const p = geometry.projection;
  if (!p || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || Math.abs(place.latitude) > 90 || Math.abs(place.longitude) > 180) return null;
  const x = geometry.width / 2 + wrapped(place.longitude - p.centerLongitude) * p.longitudePixelsPerDegree;
  const y = geometry.height / 2 - (place.latitude - p.centerLatitude) * p.latitudePixelsPerDegree;
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= geometry.width && y >= 0 && y <= geometry.height ? { x, y } : null;
}

function labelAt(position: RouteMapPosition, name: string, geometry: SeaOperationRouteMapGeometry, occupied: Box[]): Label | null {
  const width = Math.min(190, name.length * 5.8), { x, y } = position;
  for (const [dx, dy, anchor] of [[8, -8, 'start'], [8, 15, 'start'], [-8, -8, 'end'], [-8, 15, 'end']] as const) {
    const box = { west: x + dx - (anchor === 'end' ? width : 0), east: x + dx + (anchor === 'start' ? width : 0), north: y + dy - 10, south: y + dy + 3 };
    if (box.west < 4 || box.east > geometry.width - 4 || box.north < 4 || box.south > geometry.height - 4
      || occupied.some(other => box.west < other.east + 3 && box.east > other.west - 3 && box.north < other.south + 3 && box.south > other.north - 3)) continue;
    occupied.push(box); return { x: x + dx, y: y + dy, anchor };
  }
  return null;
}

export function seaOperationMapPlaces(geometry: SeaOperationRouteMapGeometry, definedPortPositions: readonly RouteMapPosition[] = []) {
  const ports = sortedPortCatalog.flatMap(item => {
    const position = item.location && projectSeaOperationMapPlace(geometry, item.location);
    return position ? [{ ...item, ...position, location: item.location! }] : [];
  });
  const occupied: Box[] = geometry.points.map(point => ({ west: point.x - 24, east: point.x + 24, north: point.y - 24, south: point.y + 40 }));
  for (const point of definedPortPositions) occupied.push({ west: point.x - 95, east: point.x + 95, north: point.y - 55, south: point.y + 65 });
  const cityLabels: Array<City & RouteMapPosition & { label: Label }> = [];
  const maxCities = Math.max(8, Math.min(48, Math.floor(geometry.width * geometry.height / 9000)));
  for (const city of candidateCities(geometry)) {
    const position = projectSeaOperationMapPlace(geometry, city); if (!position) continue;
    const label = labelAt(position, city.name, geometry, occupied);
    if (label) cityLabels.push({ ...city, ...position, label });
    if (cityLabels.length >= maxCities) break;
  }
  const grouped = new Map<string, { location: SeaOperationMapLocation; x: number; y: number; ports: SeaOperationMapPort[] }>();
  for (const port of ports) {
    const key = `${port.location.source}:${port.location.sourceId}`, existing = grouped.get(key);
    if (existing) existing.ports.push(port); else grouped.set(key, { ...port, ports: [port] });
  }
  const markers = [...grouped.values()].map(marker => ({ ...marker, label: labelAt(marker, marker.ports[0].port.port, geometry, occupied) }));
  const relatedPorts = relatedPortCatalog.flatMap(item => projectSeaOperationMapPlace(geometry, item.parent) ? [{ ...item }] : []);
  return { cities: cityLabels, ports, markers, relatedPorts, coverage: SEA_OPERATION_MAP_PORT_COVERAGE };
}
