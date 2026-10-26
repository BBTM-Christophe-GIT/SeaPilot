import placesJson from './mapData/places.json?raw';
import { PROJECT_PORTS, type ProjectPort } from '../projects/projectPorts';
import type { SeaOperationRouteMapGeometry, RouteMapPosition } from './seaOperationRouteMapGeometry';

export interface SeaOperationMapLocation {
  source: 'sandre' | 'wpi'; sourceId: string; name: string; municipality: string;
  departmentCode: string; locode: string; longitude: number; latitude: number; precisionCode: string;
}
export interface SeaOperationMapPort { key: string; port: ProjectPort; location: SeaOperationMapLocation | null }
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

export function seaOperationMapPlaces(geometry: SeaOperationRouteMapGeometry) {
  const ports = SEA_OPERATION_MAP_PORT_CATALOG.flatMap(item => {
    const position = item.location && projectSeaOperationMapPlace(geometry, item.location);
    return position ? [{ ...item, ...position, location: item.location! }] : [];
  }).sort((a, b) => a.port.port.localeCompare(b.port.port, 'fr'));
  const occupied: Box[] = geometry.points.map(point => ({ west: point.x - 24, east: point.x + 24, north: point.y - 24, south: point.y + 40 }));
  const cityLabels: Array<City & RouteMapPosition & { label: Label }> = [];
  const maxCities = Math.max(8, Math.min(48, Math.floor(geometry.width * geometry.height / 9000)));
  for (const city of rankedCities) {
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
  const locatedByCode = new Map(SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.location && item.port.locode).map(item => [item.port.locode, item.location!]));
  const relatedPorts = SEA_OPERATION_MAP_PORT_CATALOG.flatMap(item => {
    if (item.location || !item.port.parentLocode) return [];
    const parent = locatedByCode.get(item.port.parentLocode)
      || exactOne(wpiByCode.get(item.port.parentLocode) || []);
    return parent && projectSeaOperationMapPlace(geometry, parent) ? [{ ...item, parent }] : [];
  }).sort((a, b) => a.port.port.localeCompare(b.port.port, 'fr'));
  return { cities: cityLabels, ports, markers, relatedPorts, coverage: SEA_OPERATION_MAP_PORT_COVERAGE };
}
