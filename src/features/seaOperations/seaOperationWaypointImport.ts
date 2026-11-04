import { emptySeaOperationWaypoint, type SeaOperationWaypoint } from './seaOperationModel';
import { parseProjectLocationOverlay, PROJECT_LOCATION_LIMITS, type ProjectLocationOverlay } from '../projects/projectLocation';

export const SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS = PROJECT_LOCATION_LIMITS.waypoints;
export type SeaOperationWaypointImportTarget = 'route' | 'isolated' | 'zone';

export interface SeaOperationImportedWaypoint {
  latitude: string;
  longitude: string;
  name: string;
  description: string;
}

export interface SeaOperationWaypointImportSource {
  id: string;
  label: string;
  kind: 'route' | 'track' | 'waypoints';
  points: SeaOperationImportedWaypoint[];
}

export interface SeaOperationWaypointImport {
  sources: SeaOperationWaypointImportSource[];
}

const waypointDescription = (point: SeaOperationImportedWaypoint) => [point.name, point.description !== point.name ? point.description : ''].filter(Boolean).join('\n');
const validCoordinate = (value: string, limit: number) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
  && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

function assertImportedPointFields(points: readonly SeaOperationImportedWaypoint[]) {
  if (points.some(point => !validCoordinate(point.latitude, 90) || !validCoordinate(point.longitude, 180))) {
    throw new Error('Un point importé contient des coordonnées invalides.');
  }
  if (points.some(point => point.latitude.length > 80 || point.longitude.length > 80 || waypointDescription(point).length > 4000)) {
    throw new Error('Un point importé dépasse la longueur autorisée pour ses coordonnées ou sa description.');
  }
}

function positionKey(point: SeaOperationImportedWaypoint) {
  return `${Number(point.latitude)}:${((Number(point.longitude) + 540) % 360) - 180}`;
}

function zoneVertices(points: readonly SeaOperationImportedWaypoint[]) {
  return points.length > 1 && positionKey(points[0]) === positionKey(points[points.length - 1]) ? points.slice(0, -1) : points;
}

/** A closed GPX ring needs no repeated closing vertex in the editable polygon. */
export function seaOperationImportedZoneError(points: readonly SeaOperationImportedWaypoint[]): string | null {
  if (points.some(point => !validCoordinate(point.latitude, 90) || !validCoordinate(point.longitude, 180))) return 'La zone contient des coordonnées invalides.';
  if (new Set(points.map(positionKey)).size < 3) return 'Une zone nécessite au moins trois positions distinctes.';
  if (zoneVertices(points).length > PROJECT_LOCATION_LIMITS.vertices) return `Une zone peut contenir au maximum ${PROJECT_LOCATION_LIMITS.vertices} sommets.`;
  return null;
}

const GPX_NAMESPACES = new Set(['', 'http://www.topografix.com/GPX/1/0', 'http://www.topografix.com/GPX/1/1']);

/** Read GPX as inert XML; neither extensions nor recorded track times become passage-plan data. */
export function parseSeaOperationWaypointImport(xml: string): SeaOperationWaypointImport {
  if (xml.length > SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES) throw new Error('Le fichier GPX dépasse la limite de 5 Mo.');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('Le fichier GPX contient une déclaration XML non prise en charge.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  if (document.getElementsByTagNameNS('*', 'parsererror').length || root.localName !== 'gpx'
    || !GPX_NAMESPACES.has(root.namespaceURI || '') || root.hasAttribute('version') && !['1.0', '1.1'].includes(root.getAttribute('version')!)) {
    throw new Error('Le fichier doit être un document GPX 1.0 ou 1.1 valide.');
  }
  const namespace = root.namespaceURI;
  const children = (element: Element, name: string) => [...element.children].filter(child => child.localName === name && child.namespaceURI === namespace);
  const text = (element: Element, name: string) => children(element, name)[0]?.textContent?.trim() || '';
  const coordinate = (element: Element, attribute: 'lat' | 'lon', limit: number, index: number, label: string) => {
    const raw = element.getAttribute(attribute)?.trim() || '';
    const value = Number(raw);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(value) || Math.abs(value) > limit) {
      throw new Error(`${label} : ${attribute === 'lat' ? 'latitude' : 'longitude'} invalide au point ${index + 1}.`);
    }
    // Keep decimal notation, including very small values, without rounding recorded coordinates.
    const [integer, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
    const whole = (integer || '0').replace(/^0+(?=\d)/, ''), decimal = fraction.replace(/0+$/, '');
    return `${value < 0 ? '-' : ''}${whole}${decimal ? `.${decimal}` : ''}`;
  };
  const sourcePoints = (elements: Element[], label: string) => {
    if (elements.length > SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS) {
      throw new Error(`${label} contient plus de ${SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS} points. Exportez une route moins détaillée.`);
    }
    return elements.map((element, index): SeaOperationImportedWaypoint => ({
      latitude: coordinate(element, 'lat', 90, index, label), longitude: coordinate(element, 'lon', 180, index, label),
      name: text(element, 'name'), description: text(element, 'desc') || text(element, 'cmt'),
    }));
  };
  const sources: SeaOperationWaypointImportSource[] = [];
  const standalone = children(root, 'wpt');
  let routeIndex = 0, trackIndex = 0, standaloneAdded = false;
  for (const element of root.children) {
    if (element.namespaceURI !== namespace) continue;
    if (element.localName === 'wpt' && !standaloneAdded) {
      standaloneAdded = true;
      sources.push({ id: 'waypoints', label: 'Waypoints du fichier', kind: 'waypoints', points: sourcePoints(standalone, 'Waypoints du fichier') });
    } else if (element.localName === 'rte') {
      routeIndex++;
      const label = text(element, 'name') ? `Route : ${text(element, 'name')}` : `Route ${routeIndex}`;
      const points = sourcePoints(children(element, 'rtept'), label);
      if (points.length) sources.push({ id: `route-${routeIndex}`, label, kind: 'route', points });
    } else if (element.localName === 'trk') {
      trackIndex++;
      const trackLabel = text(element, 'name') ? `Tracé : ${text(element, 'name')}` : `Tracé ${trackIndex}`;
      const segments = children(element, 'trkseg');
      segments.forEach((segment, index) => {
        const label = segments.length > 1 ? `${trackLabel} · segment ${index + 1}` : trackLabel;
        const points = sourcePoints(children(segment, 'trkpt'), label);
        if (points.length) sources.push({ id: `track-${trackIndex}-segment-${index + 1}`, label, kind: 'track', points });
      });
    }
  }
  if (!sources.length) throw new Error('Le fichier GPX ne contient aucun waypoint, point de route ou point de tracé à importer.');
  return { sources };
}

/** Append a new editable copy; existing ETA, UKC and captured navigation data remain intact. */
export function appendSeaOperationImportedWaypoints(existing: readonly SeaOperationWaypoint[], points: readonly SeaOperationImportedWaypoint[],
  newId: () => string = () => crypto.randomUUID()): SeaOperationWaypoint[] {
  if (existing.length + points.length > SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS) throw new Error(`La route peut contenir au maximum ${SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS} waypoints.`);
  assertImportedPointFields(points);
  const numbers = new Set(existing.map(point => point.number.trim()));
  let number = existing.length + 1;
  return [...existing, ...points.map(point => {
    while (numbers.has(String(number))) number++;
    const label = String(number++); numbers.add(label);
    return { ...emptySeaOperationWaypoint(newId()), number: label, ukcMode: 'automatic' as const,
      descriptionVhf: waypointDescription(point),
      latitude: point.latitude, longitude: point.longitude };
  })];
}

/** Import location geometry independently of the ordered route and its navigation captures. */
export function appendSeaOperationImportedLocation(overlay: ProjectLocationOverlay | undefined, points: readonly SeaOperationImportedWaypoint[],
  target: 'isolated' | 'zone', zoneName?: string, newId: () => string = () => crypto.randomUUID()): ProjectLocationOverlay {
  const current: ProjectLocationOverlay = overlay || { version: 1, points: [], zones: [] };
  assertImportedPointFields(points);
  let result: ProjectLocationOverlay;
  if (target === 'isolated') {
    if (current.points.length + points.length > PROJECT_LOCATION_LIMITS.points) throw new Error(`La fiche peut contenir au maximum ${PROJECT_LOCATION_LIMITS.points} points isolés.`);
    const numbers = new Set(current.points.map(point => point.number.trim()));
    let number = current.points.length + 1;
    const imported = points.map(point => {
      while (numbers.has(String(number))) number++;
      const label = String(number++); numbers.add(label);
      return { ...emptySeaOperationWaypoint(newId()), number: label, descriptionVhf: waypointDescription(point), latitude: point.latitude, longitude: point.longitude };
    });
    result = { ...current, points: [...current.points, ...imported] };
  } else {
    const error = seaOperationImportedZoneError(points);
    if (error) throw new Error(error);
    if (current.zones.length >= PROJECT_LOCATION_LIMITS.zones) throw new Error(`La fiche peut contenir au maximum ${PROJECT_LOCATION_LIMITS.zones} zones.`);
    const name = zoneName?.trim() || `Zone ${current.zones.length + 1}`;
    if (name.length > 500) throw new Error('Le nom de la zone ne peut pas dépasser 500 caractères.');
    result = { ...current, zones: [...current.zones, { id: newId(), name, vertices: zoneVertices(points).map(point => ({ latitude: point.latitude, longitude: point.longitude })) }] };
  }
  parseProjectLocationOverlay(result);
  return result;
}
