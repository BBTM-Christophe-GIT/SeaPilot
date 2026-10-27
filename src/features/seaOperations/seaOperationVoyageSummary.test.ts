// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptySeaOperation, type SeaOperationPayload, type SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationRouteArrivalEta, seaOperationVoyageSummary } from './seaOperationVoyageSummary';

function point(id: string, eta: string, latitude = '0', longitude = id === 'a' ? '0' : '1'): SeaOperationWaypoint {
  return { id, number: id, latitude, longitude, descriptionVhf: id, ukc: '', eta, denseTraffic: false };
}
function payload(waypoints: SeaOperationWaypoint[], etd = '2026-10-27T08:00'): Pick<SeaOperationPayload, 'waypoints' | 'vessel'> {
  return { waypoints, vessel: { ...emptySeaOperation().vessel, etd } };
}

describe('retained route arrival', () => {
  it('requires at least two positioned and fully dated points, preserving the exact retained value', () => {
    const route = payload([point('a', '2026-10-27T10:07:19.123'), point('b', '2026-10-27T19:15:29.123')]);
    expect(seaOperationRouteArrivalEta(route)).toBe('2026-10-27T19:15:29.123');
    expect(seaOperationRouteArrivalEta(payload([]))).toBeUndefined();
    expect(seaOperationRouteArrivalEta(payload([route.waypoints[0]]))).toBeUndefined();
  });

  it.each(['', '12:00', '2026-10-27', '2026-02-30T12:00', '2026-03-29T02:30', '2026-10-25T02:30'])('rejects incomplete, invalid or ambiguous ETA %s anywhere in the route', eta => {
    const route = payload([point('a', '2026-10-27T10:00'), point('middle', eta, '0', '0.5'), point('b', '2026-10-27T19:15')]);
    expect(seaOperationRouteArrivalEta(route)).toBeUndefined();
  });

  it.each([['', '0.5'], ['91', '0.5'], ['0', '181'], ['Nord', 'Est']])('never bridges invalid coordinates %s, %s to use the final ETA', (latitude, longitude) => {
    const route = payload([point('a', '2026-10-27T10:00'), point('middle', '2026-10-27T12:00', latitude, longitude), point('b', '2026-10-27T19:15')]);
    expect(seaOperationRouteArrivalEta(route)).toBeUndefined();
    const summary = seaOperationVoyageSummary(route, 20);
    expect(summary.route.totalDistanceNm).toBeNull();
    expect(summary.timing.etaLabel).toBeNull();
    expect(summary.durationLabel).toBeNull();
  });
});

describe('shared voyage summary', () => {
  it('retains the waypoint departure and manual arrival, even when no live speed is available for an export', () => {
    const route = payload([point('a', '2026-10-27T10:00'), { ...point('b', '2026-10-29T13:50'), etaMode: 'manual' }]);
    const summary = seaOperationVoyageSummary(route);
    expect(summary.route.totalDistanceLabel).toBe('60,0 NM');
    expect(summary.route.totalDurationMinutes).toBeNull();
    expect(summary.timing).toMatchObject({ etdLabel: '27/10/2026 – 10:00', etaLabel: '29/10/2026 – 13:50',
      durationMinutes: 3110, etaSource: 'waypoint' });
    expect(summary.durationLabel).toBe('2 jours 3 heures 50 minutes');
    expect(seaOperationVoyageSummary(route, 20).durationLabel).toBe(summary.durationLabel);
  });

  it('uses the planned departure for a speed estimate only when the first waypoint ETA is blank', () => {
    const route = payload([point('a', ''), point('b', '')], '2026-10-27T23:30');
    expect(seaOperationVoyageSummary(route, 20)).toMatchObject({ route: { cruiseSpeedKnots: 12, totalDurationMinutes: 300 },
      timing: { etdLabel: '27/10/2026 – 23:30', etaLabel: '28/10/2026 – 04:30', etaSource: 'estimated' }, durationLabel: '5 heures' });
    expect(seaOperationVoyageSummary(route)).toMatchObject({ timing: { etdLabel: '27/10/2026 – 23:30', etaLabel: null }, durationLabel: null });
  });

  it('does not invent a duration from the planning arrival or incomplete waypoint timestamps without a live speed', () => {
    const route = payload([point('a', '2026-10-27T10:00'), point('b', '')]);
    route.vessel.eta = '2026-10-27T19:15';
    expect(seaOperationVoyageSummary(route)).toMatchObject({ route: { totalDistanceLabel: '60,0 NM' },
      timing: { etdLabel: '27/10/2026 – 10:00', etaLabel: null, durationMinutes: null }, durationLabel: null });
    route.waypoints[1].eta = '19:15';
    expect(seaOperationVoyageSummary(route).durationLabel).toBeNull();
  });

  it('keeps a complete retained arrival from silently falling back to an earlier speed estimate when its chronology is invalid', () => {
    const route = payload([point('a', '2026-10-27T10:00'), point('b', '2026-10-27T09:59')]);
    expect(seaOperationVoyageSummary(route)).toMatchObject({ timing: { etdLabel: '27/10/2026 – 10:00', etaLabel: null, etaSource: null }, durationLabel: null });
  });

  it.each([
    ['2026-03-29T01:30', '2026-03-29T03:30', 60, '1 heure'],
    ['2026-10-25T01:30', '2026-10-25T03:30', 180, '3 heures'],
    ['2026-10-25T00:30Z', '2026-10-25T01:30Z', 60, '1 heure'],
  ] as const)('uses real elapsed minutes between retained timestamps %s and %s across Paris DST', (departure, arrival, durationMinutes, durationLabel) => {
    const summary = seaOperationVoyageSummary(payload([point('a', departure), point('b', arrival)]));
    expect(summary.timing).toMatchObject({ durationMinutes, etaSource: 'waypoint' });
    expect(summary.durationLabel).toBe(durationLabel);
  });

  it('preserves a zero-minute voyage and leaves empty and single-point preparations without invented totals', () => {
    const route = payload([point('a', '2026-10-27T10:00'), point('b', '2026-10-27T10:00', '0', '0')]);
    expect(seaOperationVoyageSummary(route)).toMatchObject({ route: { totalDistanceNm: 0 }, timing: { durationMinutes: 0 }, durationLabel: '0 minute' });
    for (const waypoints of [[], [point('a', '2026-10-27T10:00')]]) {
      expect(seaOperationVoyageSummary(payload(waypoints), 20)).toMatchObject({ route: { totalDistanceNm: null }, timing: { etaLabel: null }, durationLabel: null });
    }
  });

  it('reads saved values without rewriting timestamps, modes or captures', () => {
    const route = payload([point('a', '2026-10-27T10:07:19.123'), { ...point('b', '2026-10-27T19:15'), etaMode: 'manual' }]);
    const original = structuredClone(route);
    route.waypoints.forEach(Object.freeze); Object.freeze(route.waypoints); Object.freeze(route.vessel); Object.freeze(route);
    seaOperationVoyageSummary(route, 20);
    expect(route).toEqual(original);
  });
});
