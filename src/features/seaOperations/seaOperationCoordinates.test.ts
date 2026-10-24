// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatSeaLatitude, formatSeaLongitude, formatSeaPosition } from './seaOperationCoordinates';
import { parseSeaCoordinate } from './seaOperationNavigation';

describe('SMCP degree / decimal-minute presentation', () => {
  it('formats the requested example with explicit hemispheres, leading zeros and minute decimals', () => {
    expect(formatSeaPosition({ latitude: 50 + 4.264 / 60, longitude: 1 + 1.84 / 60 }))
      .toBe('50° 04.264′ N — 001° 01.840′ E');
  });

  it.each([
    ['49.65 N', '49° 39.000′ N'], ['49,65 S', '49° 39.000′ S'],
    ['50° 04.264′ N', '50° 04.264′ N'], ['N 50 4 15.84', '50° 04.264′ N'],
    [90, '90° 00.000′ N'], [-90, '90° 00.000′ S'], [0, '00° 00.000′ N'], [-0, '00° 00.000′ S'],
    [1e-7, '00° 00.000′ N'], [-1e-7, '00° 00.000′ S'],
  ])('normalizes latitude %s for display', (value, expected) => expect(formatSeaLatitude(value)).toBe(expected));

  it.each([
    ['1.62 W', '001° 37.200′ W'], ['1,62 O', '001° 37.200′ W'],
    ['001° 01.840′ E', '001° 01.840′ E'], [-180, '180° 00.000′ W'], [180, '180° 00.000′ E'],
    [0, '000° 00.000′ E'], [-0, '000° 00.000′ W'],
  ])('normalizes longitude %s for display', (value, expected) => expect(formatSeaLongitude(value)).toBe(expected));

  it('carries rounded minutes into the degrees without producing 60 minutes or an out-of-range pole', () => {
    expect(formatSeaLatitude(49 + 59.9996 / 60)).toBe('50° 00.000′ N');
    expect(formatSeaLongitude(-(179 + 59.9996 / 60))).toBe('180° 00.000′ W');
    expect(formatSeaLatitude(-(89 + 59.9996 / 60))).toBe('90° 00.000′ S');
  });

  it('preserves missing and invalid text instead of turning it into a different position', () => {
    expect(formatSeaLatitude('')).toBe('');
    expect(formatSeaLongitude('  à préciser  ')).toBe('à préciser');
    expect(formatSeaLatitude('50 E')).toBe('50 E');
    expect(formatSeaLatitude(90.01)).toBe('');
    expect(formatSeaLongitude(Infinity)).toBe('');
    expect(formatSeaLongitude(NaN)).toBe('');
    expect(formatSeaPosition({ latitude: '', longitude: '' })).toBe('Latitude à renseigner — Longitude à renseigner');
  });

  it('rounds only the display, leaving the original coordinate unchanged and parseable within half a displayed minute unit', () => {
    const position = { latitude: '49.994327', longitude: '0.95218' };
    const original = structuredClone(position);
    const formatted = [formatSeaLatitude(position.latitude), formatSeaLongitude(position.longitude)];
    expect(position).toEqual(original);
    expect(Math.abs(parseSeaCoordinate(formatted[0], 'latitude')! - Number(position.latitude))).toBeLessThanOrEqual(.0005 / 60);
    expect(Math.abs(parseSeaCoordinate(formatted[1], 'longitude')! - Number(position.longitude))).toBeLessThanOrEqual(.0005 / 60);
  });
});
