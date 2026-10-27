// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cloneProjectLocationPlan, emptyProjectLocationPlan, hasProjectLocationContent, parseProjectLocationOverlay, parseProjectLocationPlan, PROJECT_LOCATION_LIMITS } from './projectLocation';

const point = (id = 'route') => ({ id, number: '1', descriptionVhf: 'Point de passage', latitude: '49° 39′ N', longitude: '', ukc: '', eta: '', denseTraffic: false });
describe('optional project location plan', () => {
  it.each(['buoy', 'pin', 'platform', 'wind-farm', 'mooring', 'anchor'] as const)('clones only isolated-point icon %s and keeps legacy absence unchanged', isolatedPointIcon => {
    const source = { ...emptyProjectLocationPlan(), waypoints: [point('route')], points: [{ ...point('isolated'), isolatedPointIcon }] };
    const original = structuredClone(source), retained = cloneProjectLocationPlan(source);
    expect(retained).toEqual(source); expect(retained.points[0]).not.toBe(source.points[0]);
    expect(parseProjectLocationOverlay({ version: 1, points: source.points, zones: [] })?.points[0].isolatedPointIcon).toBe(isolatedPointIcon);
    expect(retained.waypoints[0]).not.toHaveProperty('isolatedPointIcon'); expect(source).toEqual(original);
  });
  it('rejects invalid isolated icons and any icon on route waypoints, zones or vertices', () => {
    for (const isolatedPointIcon of ['', 'square', 'vessel', 'Buoy', 'wind_farm', null, undefined, 1, {}]) {
      expect(() => parseProjectLocationPlan({ ...emptyProjectLocationPlan(), points: [{ ...point('isolated'), isolatedPointIcon }] })).toThrow('localisation');
    }
    for (const patch of [
      { waypoints: [{ ...point('route'), isolatedPointIcon: 'anchor' }] },
      { zones: [{ id: 'zone', name: '', vertices: [], isolatedPointIcon: 'anchor' }] },
      { zones: [{ id: 'zone', name: '', vertices: [{ latitude: '', longitude: '', isolatedPointIcon: 'anchor' }] }] },
    ]) expect(() => parseProjectLocationPlan({ ...emptyProjectLocationPlan(), ...patch })).toThrow('localisation');
  });
  it('retains a manual frame independently while legacy plans stay automatic and overlays stay geometry-only', () => {
    const legacy = emptyProjectLocationPlan(); expect(parseProjectLocationPlan(legacy)).not.toHaveProperty('mapViewport');
    const source = { ...legacy, mapViewport: { centerLatitude: 49.654321, centerLongitude: -1.789012, longitudeSpan: .023456789 } };
    expect(hasProjectLocationContent(source)).toBe(true);
    const retained = cloneProjectLocationPlan(source);
    expect(retained.mapViewport).toEqual(source.mapViewport); expect(retained.mapViewport).not.toBe(source.mapViewport);
    retained.mapViewport!.centerLatitude = 0; expect(source.mapViewport.centerLatitude).toBe(49.654321);
    expect(() => parseProjectLocationOverlay({ version: 1, points: [], zones: [], mapViewport: source.mapViewport })).toThrow('localisation');
    for (const mapViewport of [null, {}, { ...source.mapViewport, longitudeSpan: .01 }, { ...source.mapViewport, extra: true }]) {
      expect(() => parseProjectLocationPlan({ ...legacy, mapViewport })).toThrow('localisation');
    }
  });
  it('creates independent empty plans and distinguishes absence, PDF preference and content', () => {
    const first = emptyProjectLocationPlan(), second = emptyProjectLocationPlan();
    first.waypoints.push(point()); first.includeInPdf = true;
    expect(second.waypoints).toEqual([]); expect(second.includeInPdf).toBe(false);
    expect(parseProjectLocationPlan(null)).toBeNull(); expect(parseProjectLocationPlan(undefined)).toBeNull();
    expect(hasProjectLocationContent(second)).toBe(false); expect(hasProjectLocationContent({ ...second, includeInPdf: true })).toBe(false);
    expect(hasProjectLocationContent(first)).toBe(true); expect(hasProjectLocationContent({ ...second, etd: '2026-10-27T09:00' })).toBe(true);
  });
  it('keeps route, isolated points and incomplete zones together without changing manual times or coordinates', () => {
    const source = { ...emptyProjectLocationPlan(), etd: '2026-10-27T09:07', charts: '7120 - 7421', waypoints: [{ ...point(), etaMode: 'manual' as const, eta: '09:07' }],
      points: [point('isolated')], zones: [{ id: 'zone', name: 'Zone de travail', vertices: [{ latitude: '49°', longitude: '' }] }] };
    const result = parseProjectLocationPlan(source)!;
    expect(result).toEqual(source); expect(result.waypoints[0]).not.toBe(source.waypoints[0]);
    const clone = cloneProjectLocationPlan(source); clone.zones[0].vertices[0].latitude = '50';
    expect(source.zones[0].vertices[0].latitude).toBe('49°');
  });
  it('keeps only the waypoint core and never imports weather, radio or UKC captures', () => {
    const result = parseProjectLocationPlan({ ...emptyProjectLocationPlan(), waypoints: [{ ...point(), ukcMode: 'automatic', weather: { stale: true }, radio: { stale: true }, ukcForecast: { stale: true } }] })!;
    expect(result.waypoints[0]).toEqual({ ...point(), ukcMode: 'automatic' });
  });
  it.each([
    { version: 2 }, { includeInPdf: 'true' }, { waypoints: [{ ...point(), denseTraffic: 'false' }] }, { waypoints: [{ ...point(), etaMode: 'other' }] },
    { waypoints: [point(), point()] }, { waypoints: [point()], points: [point()] },
    { points: [point('zone')], zones: [{ id: 'zone', name: '', vertices: [] }] }, { zones: [{ id: '', name: '', vertices: [] }] },
    { zones: [{ id: 'zone', name: '', vertices: [{ latitude: 49, longitude: '' }] }] },
  ])('rejects malformed values and duplicate identities %j', patch => {
    expect(() => parseProjectLocationPlan({ ...emptyProjectLocationPlan(), ...patch })).toThrow('localisation');
  });
  it('enforces collection and UTF8 payload bounds, rather than just string length', () => {
    for (const patch of [
      { waypoints: Array.from({ length: 201 }, (_, index) => point(String(index))) },
      { points: Array.from({ length: 201 }, (_, index) => point(String(index))) },
      { zones: Array.from({ length: 51 }, (_, index) => ({ id: String(index), name: '', vertices: [] })) },
      { zones: [{ id: 'zone', name: '', vertices: Array.from({ length: 201 }, () => ({ latitude: '', longitude: '' })) }] },
      { ignored: 'é'.repeat(PROJECT_LOCATION_LIMITS.bytes / 2) },
    ]) expect(() => parseProjectLocationPlan({ ...emptyProjectLocationPlan(), ...patch })).toThrow('limites');
  });
  it('validates overlays independently without a runtime dependency on the operation model', () => {
    expect(parseProjectLocationOverlay({ version: 1, points: [point()], zones: [] })).toEqual({ version: 1, points: [point()], zones: [] });
    expect(parseProjectLocationOverlay(null)).toBeNull();
    expect(() => parseProjectLocationOverlay({ version: 1, points: [point(), point()], zones: [] })).toThrow('localisation');
  });
  it('requires canonical geometry in a retained operation overlay, independently of property order', () => {
    expect(parseProjectLocationOverlay({ zones: [], points: [{ ...point(), etaMode: 'manual' }], version: 1 })).not.toBeNull();
    for (const value of [
      { version: 1, points: [], zones: [], weather: {} },
      { version: 1, points: [{ ...point(), weather: {} }], zones: [] },
      { version: 1, points: [], zones: [{ id: 'zone', name: '', vertices: [], extra: true }] },
      { version: 1, points: [], zones: [{ id: 'zone', name: '', vertices: [{ latitude: '', longitude: '', extra: true }] }] },
    ]) expect(() => parseProjectLocationOverlay(value)).toThrow('localisation');
  });
  it('keeps a separate larger budget for retained operation overlay geometry', () => {
    const points = Array.from({ length: 70 }, (_, index) => ({ ...point(String(index)), descriptionVhf: 'x'.repeat(4000) }));
    const value = { version: 1, points, zones: [] };
    expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeGreaterThan(PROJECT_LOCATION_LIMITS.bytes);
    expect(parseProjectLocationOverlay(value)?.points).toHaveLength(70);
    expect(() => parseProjectLocationPlan({ ...emptyProjectLocationPlan(), points })).toThrow('limites');
  });
});
