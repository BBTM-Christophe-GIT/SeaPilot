import { describe, expect, it } from 'vitest';
import {
  isSeaOperationConsumptionTrace,
  parseSeaOperationConsumptionTrace,
  SEA_OPERATION_CONSUMPTION_TRACE_MAX_PROFILE_POINTS,
} from './seaOperationConsumptionTrace';

const epoch = Date.parse('2026-09-23T08:00:00Z');
const gpx = (content: string) => `<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">${content}</gpx>`;
const track = (name: string, ...segments: string[]) => `<trk><name>${name}</name>${segments.map(segment => `<trkseg>${segment}</trkseg>`).join('')}</trk>`;
const point = (minutes: number, longitude: number, latitude = 0) => `<trkpt lat="${latitude}" lon="${longitude}"><time>${new Date(epoch + minutes * 60_000).toISOString()}</time></trkpt>`;
const candidate = (...segments: string[]) => parseSeaOperationConsumptionTrace(gpx(track('Navire', ...segments)))[0].trace;

describe('parseSeaOperationConsumptionTrace', () => {
  it('offers each timed track independently and ignores passage-plan points and extensions', () => {
    const outward = point(0, 0) + point(3, 0.005) + point(5, 0.01);
    const returnTrip = point(10, 0.01) + point(15, 0);
    const traces = parseSeaOperationConsumptionTrace(gpx(`<wpt lat="0" lon="0"/><rte><rtept lat="1" lon="1"/></rte>
      ${track('Aller', outward)}${track('Retour', returnTrip)}<extensions>${track('Intrus', outward)}</extensions>`));

    expect(traces.map(({ label }) => label)).toEqual(['Aller', 'Retour']);
    expect(traces[0].trace).toMatchObject({ startedAt: '2026-09-23T08:00:00.000Z', endedAt: '2026-09-23T08:05:00.000Z', durationMinutes: 5,
      distanceNm: 0.6004, averageSpeedKnots: 7.2049, pointCount: 3, segmentCount: 1, gapCount: 0, reorderedPointCount: 0, excludedPointCount: 0 });
    expect(traces[0].trace.profile.some(sample => sample.speedKnots !== null && sample.speedKnots > 0)).toBe(true);
  });

  it('sorts reversed samples within a segment and discards a duplicate timestamp', () => {
    const trace = candidate(point(0, 0) + point(3, 0.005) + point(2, 0.004) + point(3, 55) + point(5, 0.01));

    expect(trace).toMatchObject({ distanceNm: 0.6004, reorderedPointCount: 1, excludedPointCount: 1, gapCount: 0 });
  });

  it('keeps stopped periods and recording gaps in elapsed time without joining discontinuities', () => {
    const trace = candidate(
      point(0, 0) + point(3, 0) + point(4, 0.01) + point(15, 0.1) + point(17, 0.105),
      point(19, 0.2) + point(22, 0.205),
    );

    expect(trace).toMatchObject({ durationMinutes: 22, distanceNm: 1.2008, segmentCount: 2, gapCount: 2 });
    expect(trace.profile).toContainEqual({ elapsedMinutes: 0.5, speedKnots: 0 });
    expect(trace.profile).toContainEqual({ elapsedMinutes: 12.5, speedKnots: null });
    expect(trace.profile).toContainEqual({ elapsedMinutes: 18.5, speedKnots: null });
  });

  it('excludes invalid points and isolated GPS jumps without joining the adjacent valid positions', () => {
    const trace = candidate(point(0, 0) + point(1, 0.005) + point(2, 40) + point(3, 0.015)
      + point(4, 0.02) + point(5, 0.025, 100) + point(6, 0.03) + point(7, 0.035));

    expect(trace).toMatchObject({ distanceNm: 0.9006, excludedPointCount: 2, gapCount: 2 });
    expect(trace.profile).toContainEqual({ elapsedMinutes: 2.5, speedKnots: null });
    expect(trace.profile).toContainEqual({ elapsedMinutes: 5.5, speedKnots: null });
  });

  it('accepts prefixed GPX with precise zoned timestamps and bounds the profile of a dense recording', () => {
    const points = Array.from({ length: 6275 }, (_, index) => point(index / 10, index / 100_000)).join('');
    const prefixed = gpx(track('Navire', points)).replace('xmlns=', 'xmlns:g=').replace(/<(\/?)([a-z]+)/gi, '<$1g:$2');
    const [{ trace }] = parseSeaOperationConsumptionTrace(prefixed);

    expect(trace.pointCount).toBe(6275);
    expect(trace.profile.length).toBeLessThanOrEqual(SEA_OPERATION_CONSUMPTION_TRACE_MAX_PROFILE_POINTS);
    expect(isSeaOperationConsumptionTrace(trace)).toBe(true);

    const offsetPoint = `<trkpt lat="0" lon="0"><time>2026-09-23T10:00:00.3539204+02:00</time></trkpt>`;
    expect(candidate(offsetPoint + point(2, 0.01)).startedAt).toBe('2026-09-23T08:00:00.353Z');
  });

  it.each([
    '<!DOCTYPE gpx [<!ENTITY secret SYSTEM "file:///secret">]><gpx/>',
    '<gpx><trk>',
    gpx(`<rte><rtept lat="0" lon="0"><time>2026-09-23T08:00:00Z</time></rtept></rte>`),
    gpx(track('Incomplet', point(0, 0) + '<trkpt lat="0" lon="0"/>')),
    gpx(track('Invalide', point(0, 0) + '<trkpt lat="0" lon="0"><time>2026-09-31T08:01:00Z</time></trkpt>')),
  ])('rejects invalid or unusable files', xml => expect(() => parseSeaOperationConsumptionTrace(xml)).toThrow(/GPX/));
});

describe('isSeaOperationConsumptionTrace', () => {
  it('validates persisted summaries and rejects malformed payloads and profiles', () => {
    const trace = candidate(point(0, 0) + point(2, 0.01));
    expect(isSeaOperationConsumptionTrace(trace)).toBe(true);
    expect(isSeaOperationConsumptionTrace({ ...trace, endedAt: trace.startedAt })).toBe(false);
    expect(isSeaOperationConsumptionTrace({ ...trace, excludedPointCount: 2 })).toBe(false);
    expect(isSeaOperationConsumptionTrace({ ...trace, distanceNm: 0.00001 })).toBe(false);
    expect(isSeaOperationConsumptionTrace({ ...trace, profile: [{ elapsedMinutes: 0, speedKnots: Infinity }] })).toBe(false);
    expect(isSeaOperationConsumptionTrace({ ...trace, profile: [...trace.profile].reverse() })).toBe(false);
  });
});
