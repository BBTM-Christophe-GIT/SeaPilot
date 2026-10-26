// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSeaOperationRouteLegs, formatSeaOperationDuration, seaOperationCruiseSpeedKnots, seaOperationVoyageTiming } from './seaOperationRouteLegs';

const point = (id: string, latitude: string, longitude: string, number = id) => ({ id, latitude, longitude, number });

describe('estimated route-leg distances and durations', () => {
  it('uses the shortest great-circle separation in nautical miles and the rounded-up 60% cruising speed', () => {
    const result = buildSeaOperationRouteLegs([point('a', '0', '0', 'Départ'), point('b', '0', '1', 'Arrivée')], 13);
    expect(result.cruiseSpeedKnots).toBe(8);
    expect(result.legs[0]).toMatchObject({ fromIndex: 1, toIndex: 2, fromId: 'a', toId: 'b', fromLabel: 'Départ', toLabel: 'Arrivée',
      distanceLabel: '60,0 NM', durationMinutes: 450, durationLabel: '07:30' });
    expect(result.legs[0].distanceNm).toBeCloseTo(60.04046, 5);
    expect(result.totalDistanceNm).toBe(result.legs[0].distanceNm); expect(result.totalDurationMinutes).toBe(450);
  });

  it('takes the short route across the antimeridian and is symmetric', () => {
    const route = [point('a', '0', '179'), point('b', '0', '-179')];
    const east = buildSeaOperationRouteLegs(route, 20), west = buildSeaOperationRouteLegs([...route].reverse(), 20);
    expect(east.legs[0].distanceNm).toBeCloseTo(120.08092, 5);
    expect(west.legs[0].distanceNm).toBeCloseTo(east.legs[0].distanceNm, 9);
    expect(east.legs[0].durationLabel).toBe('10:00');
  });

  it('uses the same coordinate parser for decimal degrees, OMI minutes and hemispheres', () => {
    const decimal = buildSeaOperationRouteLegs([point('a', '50.0710666667', '1.0306666667'), point('b', '49.65', '-1.62')], 12);
    const omi = buildSeaOperationRouteLegs([point('a', '50° 04.264′ N', '001° 01.840′ E'), point('b', '49° 39.000′ N', '001° 37.200′ W')], 12);
    expect(omi.totalDistanceNm).toBeCloseTo(decimal.totalDistanceNm!, 7);
  });

  it('never bridges missing rows and preserves original ordinals, even with duplicate waypoint names', () => {
    const route = [point('a', '0', '0', 'WP'), point('b', '0', '1', 'WP'), point('missing', '', '2'), point('d', '0', '3', ''), point('e', '0', '4', '')];
    const result = buildSeaOperationRouteLegs(route, 12);
    expect(result.legs.map(leg => [leg.fromIndex, leg.toIndex, leg.fromId, leg.toId])).toEqual([[1, 2, 'a', 'b'], [4, 5, 'd', 'e']]);
    expect(result.legs[1]).toMatchObject({ fromLabel: '4', toLabel: '5' });
    expect(result.invalidLegCount).toBe(2); expect(result.totalDistanceNm).toBeNull(); expect(result.totalDurationMinutes).toBeNull();
  });

  it.each([undefined, null, 0, -4, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('retains valid distance but does not invent a travel time for max speed %s', speed => {
    const result = buildSeaOperationRouteLegs([point('a', '0', '0'), point('b', '0', '1')], speed);
    expect(result.cruiseSpeedKnots).toBeNull(); expect(result.legs[0].distanceNm).toBeGreaterThan(60);
    expect(result.legs[0].durationMinutes).toBeNull(); expect(result.legs[0].durationLabel).toBeNull();
    expect(result.totalDistanceLabel).toBe('60,0 NM'); expect(result.totalDurationMinutes).toBeNull();
  });

  it('rounds the full duration once and does not accumulate short-leg rounding errors', () => {
    const result = buildSeaOperationRouteLegs([point('a', '0', '0'), point('b', '0', '0.002'), point('c', '0', '0.004')], 20);
    expect(result.legs.map(leg => leg.durationMinutes)).toEqual([1, 1]);
    expect(result.totalDurationMinutes).toBe(1); expect(result.totalDurationLabel).toBe('01 min');
  });

  it('handles a coincident pair without artificial distance, and leaves a one-point preparation without a voyage total', () => {
    const start = point('a', '49.65', '-1.62');
    expect(buildSeaOperationRouteLegs([start, { ...start, id: 'b' }], 20).legs[0]).toMatchObject({ distanceNm: 0, durationMinutes: 0, durationLabel: '00 min' });
    expect(buildSeaOperationRouteLegs([start], 20)).toMatchObject({ legs: [], invalidLegCount: 0, totalDistanceNm: null, totalDurationMinutes: null });
    expect(buildSeaOperationRouteLegs([], 20).totalDistanceNm).toBeNull();
  });

  it('does not mutate or autofill saved waypoint ETAs and captures', () => {
    const route = [Object.freeze({ ...point('a', '0', '0'), eta: '2026-10-27T12:07', ukc: '4.2', notes: { forecast: 'frozen' } }),
      Object.freeze({ ...point('b', '0', '1'), eta: '', ukc: '', notes: { forecast: 'unchanged' } })];
    const original = structuredClone(route); Object.freeze(route);
    buildSeaOperationRouteLegs(route, 12); expect(route).toEqual(original);
  });

  it.each([[12, 8], [13, 8], [15, 9], [20, 12], [1.1, 1]])('applies the requested speed rule to %s kn as %s kn', (maximum, expected) => {
    expect(seaOperationCruiseSpeedKnots(maximum)).toBe(expected);
  });

  it.each([[0, '00'], [7, '07'], [59, '59'], [59.6, '01:00'], [60, '01:00'], [75, '01:15'], [1505, '25:05'], [6000, '100:00']])('formats %s elapsed minutes as %s without 24-hour rollover', (minutes, expected) => {
    expect(formatSeaOperationDuration(minutes as number)).toBe(expected);
  });
});

describe('voyage ETD and indicative ETA in Paris time', () => {
  it('adds actual elapsed minutes across midnight, year and leap-day boundaries', () => {
    expect(seaOperationVoyageTiming('2026-12-31T23:30', 90)).toEqual({ etdUtc: '2026-12-31T22:30:00.000Z', etaUtc: '2027-01-01T00:00:00.000Z',
      etdLabel: '31/12/2026 – 23:30', etaLabel: '01/01/2027 – 01:00', durationMinutes: 90, durationLabel: '01:30', etaSource: 'estimated' });
    expect(seaOperationVoyageTiming('2028-02-28T23:30', 90).etaLabel).toBe('29/02/2028 – 01:00');
  });

  it('accounts for the spring skipped hour and autumn repeated hour using elapsed UTC time', () => {
    expect(seaOperationVoyageTiming('2026-03-29T01:30', 60)).toMatchObject({ etdLabel: '29/03/2026 – 01:30', etaLabel: '29/03/2026 – 03:30', etaUtc: '2026-03-29T01:30:00.000Z' });
    expect(seaOperationVoyageTiming('2026-10-25T01:30', 120)).toMatchObject({ etdLabel: '25/10/2026 – 01:30', etaLabel: '25/10/2026 – 02:30', etaUtc: '2026-10-25T01:30:00.000Z' });
  });

  it.each(['2026-03-29T02:30', '2026-10-25T02:30', '2026-02-30T12:00', '12:00', '2026-10-27', '', null, undefined])('does not guess a departure from invalid or incomplete ETD %s', etd => {
    expect(seaOperationVoyageTiming(etd, 60)).toEqual({ etdUtc: null, etaUtc: null, etdLabel: null, etaLabel: null, durationMinutes: null, durationLabel: null, etaSource: null });
  });

  it('retains a known ETD when duration is unavailable and preserves an explicit zero-minute voyage', () => {
    expect(seaOperationVoyageTiming('2026-10-27T12:00', null)).toEqual({ etdUtc: '2026-10-27T11:00:00.000Z', etdLabel: '27/10/2026 – 12:00', etaUtc: null, etaLabel: null, durationMinutes: null, durationLabel: null, etaSource: null });
    expect(seaOperationVoyageTiming('2026-10-27T12:00', 0).etaUtc).toBe('2026-10-27T11:00:00.000Z');
    expect(seaOperationVoyageTiming('2026-10-27T12:00', Number.NaN).etaLabel).toBeNull();
  });

  it('accepts explicit UTC or stored seconds without interpreting them in the machine’s timezone', () => {
    expect(seaOperationVoyageTiming('2026-07-12T23:30Z', 60)).toEqual({ etdUtc: '2026-07-12T23:30:00.000Z', etaUtc: '2026-07-13T00:30:00.000Z',
      etdLabel: '13/07/2026 – 01:30', etaLabel: '13/07/2026 – 02:30', durationMinutes: 60, durationLabel: '01:00', etaSource: 'estimated' });
    expect(seaOperationVoyageTiming('2026-10-27T12:07:19.123', 5)).toMatchObject({ etdUtc: '2026-10-27T11:07:19.123Z', etaUtc: '2026-10-27T11:12:19.123Z' });
    expect(seaOperationVoyageTiming('2026-02-30T12:00Z', 60).etdUtc).toBeNull();
  });

  it('uses the retained arrival and its actual elapsed duration instead of the speed-based estimate', () => {
    expect(seaOperationVoyageTiming('2026-10-27T10:00', 60, '2026-10-27T19:15')).toMatchObject({
      etdLabel: '27/10/2026 – 10:00', etaLabel: '27/10/2026 – 19:15', etaSource: 'waypoint', durationMinutes: 555, durationLabel: '09:15' });
    expect(seaOperationVoyageTiming('2026-10-27T10:00', null, '2026-10-27T10:00')).toMatchObject({ durationMinutes: 0, durationLabel: '00 min', etaSource: 'waypoint' });
  });

  it.each(['2026-10-27T09:59', '2026-02-30T19:15', '19:15'])('does not fall back to a guessed arrival when the retained arrival %s is invalid', eta => {
    expect(seaOperationVoyageTiming('2026-10-27T10:00', 60, eta)).toMatchObject({ etdLabel: '27/10/2026 – 10:00',
      etaLabel: null, etaUtc: null, durationMinutes: null, etaSource: null });
  });

  it('uses actual elapsed time for retained arrivals spanning DST changes', () => {
    expect(seaOperationVoyageTiming('2026-03-29T01:30', 120, '2026-03-29T03:30')).toMatchObject({ durationMinutes: 60, durationLabel: '01:00', etaSource: 'waypoint' });
    expect(seaOperationVoyageTiming('2026-10-25T01:30', 120, '2026-10-25T03:30')).toMatchObject({ durationMinutes: 180, durationLabel: '03:00', etaSource: 'waypoint' });
  });
});
