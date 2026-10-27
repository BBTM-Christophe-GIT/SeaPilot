// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isSeaOperationMapViewport, parseSeaOperationMapViewport } from './seaOperationMapViewport';

describe('retained manual map frame', () => {
  it('keeps automatic absence and clones valid values without rounding', () => {
    expect(parseSeaOperationMapViewport(undefined)).toBeUndefined();
    const viewport = { centerLatitude: 49.654321987, centerLongitude: -1.987654321, longitudeSpan: .020000001 };
    const parsed = parseSeaOperationMapViewport(viewport)!;
    expect(parsed).toEqual(viewport); expect(parsed).not.toBe(viewport);
    parsed.centerLatitude = 0; expect(viewport.centerLatitude).toBe(49.654321987);
  });
  it.each([
    { centerLatitude: -90, centerLongitude: -180, longitudeSpan: .02 },
    { centerLatitude: 90, centerLongitude: 180, longitudeSpan: 360 },
  ])('accepts inclusive geographic and scale boundaries %j', viewport => expect(isSeaOperationMapViewport(viewport)).toBe(true));
  it.each([null, [], false, 'manual', {},
    { centerLatitude: 0, centerLongitude: 0 },
    { centerLatitude: 0, centerLongitude: 0, longitudeSpan: 1, zoom: 2 },
    ...['centerLatitude', 'centerLongitude', 'longitudeSpan'].flatMap(key => [NaN, Infinity, -Infinity, '1', null, undefined].map(value =>
      ({ centerLatitude: 0, centerLongitude: 0, longitudeSpan: 1, [key]: value }))),
    { centerLatitude: -90.00001, centerLongitude: 0, longitudeSpan: 1 },
    { centerLatitude: 90.00001, centerLongitude: 0, longitudeSpan: 1 },
    { centerLatitude: 0, centerLongitude: -180.00001, longitudeSpan: 1 },
    { centerLatitude: 0, centerLongitude: 180.00001, longitudeSpan: 1 },
    { centerLatitude: 0, centerLongitude: 0, longitudeSpan: .019999999 },
    { centerLatitude: 0, centerLongitude: 0, longitudeSpan: 360.000001 },
  ])('rejects malformed or out-of-bounds retained frames %j', viewport => {
    expect(isSeaOperationMapViewport(viewport)).toBe(false);
    expect(() => parseSeaOperationMapViewport(viewport)).toThrow('cadrage');
  });
});
