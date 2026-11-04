import { describe, expect, it } from 'vitest';
import { emptySeaOperationWaypoint } from './seaOperationModel';
import { appendSeaOperationImportedLocation, appendSeaOperationImportedWaypoints, parseSeaOperationWaypointImport, SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES,
  SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS, seaOperationImportedZoneError } from './seaOperationWaypointImport';
import { PROJECT_LOCATION_LIMITS, type ProjectLocationOverlay } from '../projects/projectLocation';

const gpx = (content: string, namespace = 'http://www.topografix.com/GPX/1/1') => `<gpx version="1.1" xmlns="${namespace}">${content}</gpx>`;
const point = (tag: string, latitude = '49.65', longitude = '-1.62', content = '') => `<${tag} lat="${latitude}" lon="${longitude}">${content}</${tag}>`;

describe('GPX waypoint import', () => {
  it('keeps named routes in order with decoded plain text and normalized WGS84 coordinates', () => {
    const xml = gpx(`<rte><name>Transit &amp; mission</name>${point('rtept', '049.6500', '-001.6200', '<name>Cherbourg</name><desc><![CDATA[<b>Départ</b>]]></desc><time>2026-11-04T10:00:00Z</time>')}
      ${point('rtept', '49.49', '.1', '<name>Le Havre</name><cmt>Arrivée prévue</cmt>')}</rte><rte><name>Retour</name>${point('rtept', '49.49', '0.1')}</rte>`);
    expect(parseSeaOperationWaypointImport(xml)).toEqual({ sources: [
      { id: 'route-1', label: 'Route : Transit & mission', kind: 'route', points: [
        { latitude: '49.65', longitude: '-1.62', name: 'Cherbourg', description: '<b>Départ</b>' },
        { latitude: '49.49', longitude: '0.1', name: 'Le Havre', description: 'Arrivée prévue' },
      ] }, { id: 'route-2', label: 'Route : Retour', kind: 'route', points: [{ latitude: '49.49', longitude: '0.1', name: '', description: '' }] },
    ] });
  });

  it.each(['http://www.topografix.com/GPX/1/0', 'http://www.topografix.com/GPX/1/1', ''])('accepts GPX namespace %s and boundary coordinates', namespace => {
    const result = parseSeaOperationWaypointImport(gpx(point('wpt', '-90', '-180') + point('wpt', '90', '180') + point('wpt', '0', '0'), namespace));
    expect(result.sources).toHaveLength(1); expect(result.sources[0].kind).toBe('waypoints');
    expect(result.sources[0].points.map(item => [item.latitude, item.longitude])).toEqual([['-90', '-180'], ['90', '180'], ['0', '0']]);
  });

  it('supports namespace prefixes and separates disconnected track segments without importing extension points', () => {
    const xml = `<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1" xmlns:x="urn:extension" version="1.1">
      <g:wpt lat="49" lon="-1"><g:name>Repère</g:name></g:wpt>
      <g:trk><g:name>Trace</g:name><g:trkseg><g:trkpt lat="49" lon="-1" /></g:trkseg><g:trkseg><g:trkpt lat="50" lon="0" /></g:trkseg></g:trk>
      <g:extensions><g:wpt lat="80" lon="100" /></g:extensions><x:rte><x:rtept lat="20" lon="20" /></x:rte>
    </g:gpx>`;
    const { sources } = parseSeaOperationWaypointImport(xml);
    expect(sources.map(source => [source.id, source.kind, source.points.length])).toEqual([
      ['waypoints', 'waypoints', 1], ['track-1-segment-1', 'track', 1], ['track-1-segment-2', 'track', 1],
    ]);
    expect(sources[1].label).toBe('Tracé : Trace · segment 1'); expect(sources[2].points[0].latitude).toBe('50');
  });

  it.each(['', '<gpx>', '<kml/>', '<gpx xmlns="urn:other"><wpt lat="0" lon="0"/></gpx>', '<gpx version="2.0"><wpt lat="0" lon="0"/></gpx>'])('rejects non-GPX or malformed XML %s', xml => {
    expect(() => parseSeaOperationWaypointImport(xml)).toThrow(/GPX 1.0 ou 1.1 valide/);
  });

  it.each(['', '<metadata><name>Sans route</name></metadata>', '<rte/>', '<trk><trkseg/></trk>', '<extensions><wpt lat="0" lon="0"/></extensions>'])('rejects an empty source without inventing points', body => {
    expect(() => parseSeaOperationWaypointImport(gpx(body))).toThrow(/aucun waypoint/);
  });

  it.each([
    ['91', '0', 'latitude'], ['-90.1', '0', 'latitude'], ['49N', '0', 'latitude'], ['', '0', 'latitude'], ['NaN', '0', 'latitude'],
    ['0', '181', 'longitude'], ['0', 'Infinity', 'longitude'], ['0', '1,6', 'longitude'], ['0', '0x10', 'longitude'], ['0', '1e2', 'longitude'],
  ])('rejects the entire import when point two has invalid coordinates (%s, %s)', (latitude, longitude, axis) => {
    expect(() => parseSeaOperationWaypointImport(gpx(`<rte><name>Mission</name>${point('rtept')}${point('rtept', latitude, longitude)}</rte>`)))
      .toThrow(`Route : Mission : ${axis} invalide au point 2.`);
  });

  it('rejects DTD/entity declarations and oversized files without resolving resources', () => {
    expect(() => parseSeaOperationWaypointImport('<!DOCTYPE gpx [<!ENTITY secret SYSTEM "https://example.test/secret">]>' + gpx(point('wpt')))).toThrow(/déclaration XML/);
    expect(() => parseSeaOperationWaypointImport('<!ENTITY name "value">' + gpx(point('wpt')))).toThrow(/déclaration XML/);
    expect(() => parseSeaOperationWaypointImport(' '.repeat(SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES + 1))).toThrow(/5 Mo/);
  });

  it('refuses excessive track detail instead of silently skipping or simplifying waypoints', () => {
    expect(() => parseSeaOperationWaypointImport(gpx(`<trk><trkseg>${point('trkpt').repeat(SEA_OPERATION_WAYPOINT_IMPORT_MAX_POINTS + 1)}</trkseg></trk>`)))
      .toThrow(/plus de 200 points/);
  });

  it('appends independent waypoint identities and names without replacing current rows or copying recorded timestamps', () => {
    const existing = [{ ...emptySeaOperationWaypoint('original'), number: 'A', latitude: '49.65', longitude: '-1.62', eta: '2026-11-04T15:25', ukc: '3.4', denseTraffic: true },
      emptySeaOperationWaypoint('intentional-blank')];
    const original = structuredClone(existing);
    const { points } = parseSeaOperationWaypointImport(gpx(`<rte>${point('rtept', '49.49', '0.1', '<name>Arrivée</name><desc>Port du Havre</desc><time>2025-01-01T12:00:00Z</time>')}
      ${point('rtept', '50', '0', '<name>Nom unique</name><desc>Nom unique</desc>')}</rte>`)).sources[0];
    let nextId = 0;
    const result = appendSeaOperationImportedWaypoints(existing, points, () => `new-${++nextId}`);
    expect(result.map(item => item.id)).toEqual(['original', 'intentional-blank', 'new-1', 'new-2']);
    expect(result[0]).toBe(existing[0]); expect(result[1]).toBe(existing[1]);
    expect(result[2]).toEqual({ ...emptySeaOperationWaypoint('new-1'), number: '3', ukcMode: 'automatic', descriptionVhf: 'Arrivée\nPort du Havre', latitude: '49.49', longitude: '0.1' });
    expect(result[3].descriptionVhf).toBe('Nom unique'); expect(result[3].number).toBe('4');
    expect(result[2].eta).toBe(''); expect(result[2].ukc).toBe(''); expect(result[2].weather).toBeUndefined();
    expect(existing).toEqual(original); expect(points[0]).not.toHaveProperty('id');
  });

  it('keeps sub-microdegree coordinate precision in decimal notation and avoids existing custom numbers', () => {
    const { points } = parseSeaOperationWaypointImport(gpx(point('wpt', '+.000000012300', '-0.00000000004'))).sources[0];
    expect(points[0]).toMatchObject({ latitude: '0.0000000123', longitude: '-0.00000000004' });
    const existing = [{ ...emptySeaOperationWaypoint('existing'), number: ' 2 ' }];
    expect(appendSeaOperationImportedWaypoints(existing, [points[0], points[0]]).map(item => item.number)).toEqual([' 2 ', '3', '4']);
  });

  it('adds independent isolated points without turning them into route waypoints or replacing existing location data', () => {
    const points = parseSeaOperationWaypointImport(gpx(point('wpt', '49.65', '-1.62', '<name>Balise</name>'))).sources[0].points;
    const original: ProjectLocationOverlay = { version: 1, points: [{ ...emptySeaOperationWaypoint('existing'), number: '2', eta: '2026-11-04T12:00', ukc: '3' }],
      zones: [{ id: 'zone-original', name: 'Zone existante', vertices: [] }] };
    const saved = structuredClone(original);
    const added = appendSeaOperationImportedLocation(original, points, 'isolated', undefined, () => 'new-point');
    expect(added.points).toHaveLength(2); expect(added.points[0]).toBe(original.points[0]); expect(added.zones).toBe(original.zones);
    expect(added.points[1]).toEqual({ ...emptySeaOperationWaypoint('new-point'), number: '3', descriptionVhf: 'Balise', latitude: '49.65', longitude: '-1.62' });
    expect(original).toEqual(saved); expect(added).not.toHaveProperty('waypoints');
    expect(appendSeaOperationImportedLocation(undefined, points, 'isolated').points).toHaveLength(1);
  });

  it('imports a named zone with distinct vertices, drops the repeated closing position and leaves isolated points intact', () => {
    const points = parseSeaOperationWaypointImport(gpx(`<rte>${point('rtept', '49', '-1')}${point('rtept', '50', '-1')}${point('rtept', '50', '0')}${point('rtept', '49', '-1')}</rte>`)).sources[0].points;
    const original: ProjectLocationOverlay = { version: 1, points: [emptySeaOperationWaypoint('isolated')], zones: [] };
    const saved = structuredClone(original);
    expect(seaOperationImportedZoneError(points)).toBeNull();
    const result = appendSeaOperationImportedLocation(original, points, 'zone', ' Zone importée ', () => 'new-zone');
    expect(result.points).toBe(original.points); expect(result).not.toHaveProperty('waypoints');
    expect(result.zones).toEqual([{ id: 'new-zone', name: 'Zone importée', vertices: [{ latitude: '49', longitude: '-1' }, { latitude: '50', longitude: '-1' }, { latitude: '50', longitude: '0' }] }]);
    expect(original).toEqual(saved);
    expect(appendSeaOperationImportedLocation(undefined, points, 'zone').zones[0].name).toBe('Zone 1');
  });

  it('refuses zones with fewer than three distinct coordinates and enforces persisted overlay capacity', () => {
    const points = parseSeaOperationWaypointImport(gpx(point('wpt', '49', '-1') + point('wpt', '50', '-1') + point('wpt', '50', '0'))).sources[0].points;
    for (const tooFew of [[], [points[0]], [points[0], points[1]], [points[0], points[1], points[0]]]) {
      expect(seaOperationImportedZoneError(tooFew)).toMatch(/trois positions distinctes/);
      expect(() => appendSeaOperationImportedLocation(undefined, tooFew, 'zone', 'Zone')).toThrow(/trois positions distinctes/);
    }
    expect(seaOperationImportedZoneError([{ ...points[0], latitude: '91' }, points[1], points[2]])).toMatch(/coordonnées invalides/);
    const full: ProjectLocationOverlay = { version: 1, points: Array.from({ length: PROJECT_LOCATION_LIMITS.points }, (_, index) => emptySeaOperationWaypoint(`p-${index}`)), zones: [] };
    expect(() => appendSeaOperationImportedLocation(full, points, 'isolated')).toThrow(/200 points isolés/);
    const manyVertices = Array.from({ length: PROJECT_LOCATION_LIMITS.vertices + 1 }, (_, index) => ({ ...points[0], latitude: String(index / 10) }));
    expect(seaOperationImportedZoneError(manyVertices)).toMatch(/200 sommets/);
    expect(() => appendSeaOperationImportedLocation(undefined, points, 'zone', 'Z'.repeat(501))).toThrow(/500 caractères/);
    expect(() => appendSeaOperationImportedWaypoints(full.points, points)).toThrow(/200 waypoints/);
    expect(() => appendSeaOperationImportedWaypoints([], [{ ...points[0], longitude: 'Infinity' }])).toThrow(/coordonnées invalides/);
    expect(() => appendSeaOperationImportedWaypoints([], [{ ...points[0], description: 'X'.repeat(4001) }])).toThrow(/longueur autorisée/);
  });
});
