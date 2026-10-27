// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatProjectPort, PROJECT_PORTS } from '../projects/projectPorts';
import { buildSeaOperationRouteMap } from './seaOperationRouteMapGeometry';
import { findSeaOperationMapPortLocation, projectSeaOperationMapPlace, resolveSeaOperationMapPorts, SEA_OPERATION_MAP_PORT_CATALOG, SEA_OPERATION_MAP_PORT_COVERAGE, seaOperationMapPlaces } from './seaOperationMapPlaces';

describe('offline city and project-port reference points', () => {
  it('resolves named departure and arrival ports from the same catalogue, including historical short names', () => {
    const result = resolveSeaOperationMapPorts('  CHERBOURG ', 'Brest');
    expect(result.issues).toEqual([]); expect(result.ports).toHaveLength(2);
    expect(result.ports.map(port => port.roleLabel)).toEqual(['Départ', 'Arrivée']);
    expect(result.ports.every(port => PROJECT_PORTS.includes(port.port) && Number.isFinite(port.location.latitude))).toBe(true);
    expect(resolveSeaOperationMapPorts(formatProjectPort(result.ports[0].port)).ports[0].location).toBe(result.ports[0].location);
  });
  it('groups the same published reference into one departure/arrival marker without modifying the catalogue', () => {
    const source = structuredClone(SEA_OPERATION_MAP_PORT_CATALOG);
    const located = resolveSeaOperationMapPorts('Cherbourg').ports[0];
    const result = resolveSeaOperationMapPorts('Cherbourg', formatProjectPort(located.port));
    expect(result.ports).toHaveLength(1); expect(result.ports[0]).toMatchObject({ roles: ['departure', 'arrival'], roleLabel: 'Départ / Arrivée' });
    expect(SEA_OPERATION_MAP_PORT_CATALOG).toEqual(source);
    expect(resolveSeaOperationMapPorts()).toEqual({ ports: [], issues: [] });
  });
  it('keeps homonyms ambiguous, permits their full catalogue label, and never substitutes a parent or municipal LOCODE', () => {
    const homonyms = resolveSeaOperationMapPorts('Port de Saint-Pierre');
    expect(homonyms.ports).toEqual([]); expect(homonyms.issues[0]).toMatchObject({ role: 'departure', reason: 'ambiguous' });
    expect(homonyms.issues[0].candidates.length).toBeGreaterThan(1);
    const located = homonyms.issues[0].candidates.find(port => port.location)!;
    expect(resolveSeaOperationMapPorts(formatProjectPort(located.port)).ports).toHaveLength(1);
    expect(resolveSeaOperationMapPorts('Millbay Docks').issues[0]).toMatchObject({ reason: 'unlocated' });
    for (const input of ['FRCER', 'GBSOU', 'Port sans référence']) expect(resolveSeaOperationMapPorts(input)).toMatchObject({ ports: [], issues: [{ reason: 'not-found' }] });
  });
  it('joins the shared project catalogue without creating a major-port shortlist or losing small French ports', () => {
    expect(SEA_OPERATION_MAP_PORT_CATALOG.every(item => PROJECT_PORTS.includes(item.port))).toBe(true);
    expect(new Set(SEA_OPERATION_MAP_PORT_CATALOG.map(item => item.key)).size).toBe(SEA_OPERATION_MAP_PORT_CATALOG.length);
    expect(SEA_OPERATION_MAP_PORT_COVERAGE.france).toEqual({ total: PROJECT_PORTS.filter(port => port.country === 'France').length, located: 669 });
    expect(SEA_OPERATION_MAP_PORT_COVERAGE.england.located).toBeGreaterThan(70);
    expect(SEA_OPERATION_MAP_PORT_COVERAGE.england.located).toBeLessThan(SEA_OPERATION_MAP_PORT_COVERAGE.england.total);
    const smallPorts = SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.country === 'France' && !item.port.locode);
    expect(smallPorts.length).toBeGreaterThan(30); expect(smallPorts.every(item => item.location?.source === 'sandre')).toBe(true);
  });

  it('disambiguates homonymous French ports by municipality and department instead of assigning a shared municipal LOCODE point', () => {
    const homonyms = SEA_OPERATION_MAP_PORT_CATALOG.filter(item => item.port.port === 'Port de Saint-Pierre');
    expect(homonyms.length).toBeGreaterThan(1);
    expect(new Set(homonyms.map(item => item.location?.sourceId)).size).toBe(homonyms.length);
    expect(findSeaOperationMapPortLocation({ country: 'France', department: 'Manche', port: 'Port fictif', locode: 'FRCER', locodeAssociation: 'municipality' })).toBeNull();
    expect(findSeaOperationMapPortLocation({ country: 'Angleterre', department: 'Hampshire', port: 'Quai inconnu', locode: 'GBSOU', locodeAssociation: 'municipality' })).toBeNull();
  });

  it('uses a child port’s own published WPI location and keeps an unmatched statistical child unlocated', () => {
    const fawley = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Fawley')!;
    expect(fawley.port.parentLocode).toBe('GBSOU'); expect(fawley.location?.locode).toBe('GBFAW');
    expect(fawley.location?.latitude).toBeCloseTo(50.816667, 6);
    const millbay = SEA_OPERATION_MAP_PORT_CATALOG.find(item => item.port.port === 'Millbay Docks')!;
    expect(millbay.location).toBeNull();
    const view = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: 50.37, centerLongitude: -4.14, longitudeSpan: 2 });
    const related = seaOperationMapPlaces(view).relatedPorts.find(item => item.port.port === 'Millbay Docks');
    expect(related?.parent.name).toBe('Plymouth');
    expect(seaOperationMapPlaces(view).ports.some(item => item.port.port === 'Millbay Docks')).toBe(false);
  });

  it('filters by the actual visible rectangle and projects across the antimeridian without clamping off-screen places', () => {
    const view = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: 49.65, centerLongitude: -1.62, longitudeSpan: 2 });
    const local = seaOperationMapPlaces(view);
    expect(local.ports.some(item => /Cherbourg/i.test(item.port.port))).toBe(true);
    expect(local.ports.some(item => /Brest/i.test(item.port.port))).toBe(false);
    expect(local.ports.every(item => item.x >= 0 && item.x <= view.width && item.y >= 0 && item.y <= view.height)).toBe(true);
    const dateline = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: 0, centerLongitude: 179, longitudeSpan: 8 });
    expect(projectSeaOperationMapPlace(dateline, { latitude: 0, longitude: -179 })?.x).toBeCloseTo(675);
    expect(projectSeaOperationMapPlace(dateline, { latitude: 0, longitude: 160 })).toBeNull();
    expect(projectSeaOperationMapPlace(dateline, { latitude: Number.NaN, longitude: 179 })).toBeNull();
  });

  it('keeps city labels bounded and separated while retaining every located port in the regional list', () => {
    const view = buildSeaOperationRouteMap([], 900, 320, { centerLatitude: 49, centerLongitude: -3, longitudeSpan: 16 });
    const result = seaOperationMapPlaces(view);
    expect(result.cities.some(city => city.name === 'Paris')).toBe(true);
    expect(result.cities.every(city => city.label.x >= 0 && city.label.x <= view.width && city.label.y >= 0 && city.label.y <= view.height)).toBe(true);
    expect(result.markers.reduce((count, marker) => count + marker.ports.length, 0)).toBe(result.ports.length);
    expect(result.ports.length).toBeGreaterThan(result.cities.length);
    expect(seaOperationMapPlaces(buildSeaOperationRouteMap([])).ports).toEqual([]);
  });
});
