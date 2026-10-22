import { describe, expect, it } from 'vitest';
import { parseSeaCoordinate, seaDistanceToLegNm, seaDistanceToRouteNm, seaWaypointPosition } from './seaOperationNavigation';

describe('WGS84 sea coordinates', () => {
  it.each([
    ['49.65', 'latitude', 49.65], ['49,65 N', 'latitude', 49.65], ['49°39.00 N', 'latitude', 49.65],
    ['N 49 39 00', 'latitude', 49.65], ['001°37′12″ O', 'longitude', -1.62], ['-1.62', 'longitude', -1.62],
    ['0°30 S', 'latitude', -0.5], ['180 W', 'longitude', -180], ['90 N', 'latitude', 90],
  ] as const)('parses %s', (value, axis, expected) => expect(parseSeaCoordinate(value, axis)).toBeCloseTo(expected, 8));
  it.each(['', 'NaN', '49.2foo', '49N S', 'N49N', '49 60 N', '90°01 N', '91', '-49N', '+49S', '49.5 20 N', '49 2.5 3 N', '49E', '49°30″ N', '49″ N', '49′30° N', '49°°30 N'])('rejects ambiguous latitude %s', (value) => expect(parseSeaCoordinate(value, 'latitude')).toBeNull());
  it('rejects invalid longitude and retains zero coordinates', () => {
    expect(parseSeaCoordinate('181', 'longitude')).toBeNull();
    expect(parseSeaCoordinate('1 N', 'longitude')).toBeNull();
    expect(seaWaypointPosition({ latitude: '0', longitude: '0' })).toEqual({ latitude: 0, longitude: 0 });
  });
});

describe('route proximity', () => {
  it('detects a port along a leg although both waypoints are far away', () => {
    expect(seaDistanceToLegNm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: -10 }, { latitude: 0, longitude: 10 })).toBeLessThan(0.001);
    expect(seaDistanceToLegNm({ latitude: 1, longitude: 0 }, { latitude: 0, longitude: -10 }, { latitude: 0, longitude: 10 })).toBeCloseTo(60, 0);
  });
  it('does not extend the leg past its endpoints or bridge invalid waypoints', () => {
    const start = { latitude: 0, longitude: -10 }, end = { latitude: 0, longitude: 10 }, site = { latitude: 0, longitude: 0 };
    expect(seaDistanceToRouteNm(site, [start, null, end])).toBeGreaterThan(590);
    expect(seaDistanceToRouteNm(site, [start, end])).toBeLessThan(0.001);
    expect(seaDistanceToLegNm({ latitude: 0, longitude: 20 }, start, end)).toBeGreaterThan(590);
  });
  it('handles identical and antimeridian points without NaN', () => {
    const site = { latitude: 0, longitude: 180 };
    expect(seaDistanceToLegNm(site, site, site)).toBe(0);
    expect(seaDistanceToLegNm(site, { latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 })).toBeLessThan(0.001);
    expect(seaDistanceToRouteNm(site, [])).toBe(Infinity);
  });
});
