import { seaDistanceToRouteNm, type SeaPosition } from './seaOperationNavigation';

export const SEA_OPERATION_CONSUMPTION_TRACE_MAX_BYTES = 5 * 1024 * 1024;
export const SEA_OPERATION_CONSUMPTION_TRACE_MAX_PROFILE_POINTS = 240;

const MAX_POINTS = 50_000;
const MAX_DURATION_MINUTES = 525_600;
const MAX_SPEED_KNOTS = 100;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_INTERVAL = 5 * MINUTE;
const GPX_NAMESPACES = new Set(['', 'http://www.topografix.com/GPX/1/0', 'http://www.topografix.com/GPX/1/1']);

type SpeedSample = { elapsedMinutes: number; speedKnots: number | null };

export interface SeaOperationConsumptionTrace {
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  distanceNm: number;
  averageSpeedKnots: number;
  pointCount: number;
  segmentCount: number;
  gapCount: number;
  reorderedPointCount: number;
  excludedPointCount: number;
  profile: SpeedSample[];
}

export type SeaOperationConsumptionTraceSummary = Omit<SeaOperationConsumptionTrace, 'profile'>;

type TimedPoint = SeaPosition & { time: number };
type Interval = { start: number; end: number; distance: number | null };

const rounded = (value: number) => Number(value.toFixed(4));

function gpxChildren(element: Element, name: string): Element[] {
  const matching: Element[] = [];
  for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === name && child.namespaceURI === element.namespaceURI) matching.push(child);
  }
  return matching;
}

function gpxText(element: Element, name: string): string {
  return gpxChildren(element, name)[0]?.textContent?.trim() || '';
}

function coordinate(element: Element, attribute: 'lat' | 'lon', limit: number): number | null {
  const text = element.getAttribute(attribute)?.trim() || '';
  const value = Number(text);
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Math.abs(value) <= limit ? value : null;
}

function timedPoint(element: Element): TimedPoint | null {
  const latitude = coordinate(element, 'lat', 90);
  const longitude = coordinate(element, 'lon', 180);
  const time = gpxText(element, 'time').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  if (latitude === null || longitude === null || !time) return null;

  const [, date, fraction, zone] = time;
  const calendar = new Date(`${date}Z`);
  const instant = Date.parse(`${date}${zone}`);
  if (!Number.isFinite(instant) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== date) return null;
  // Keep the sub-millisecond part for ordering and speed, even though the saved timestamps use milliseconds.
  return { latitude, longitude, time: instant + Number(fraction || 0) * 1000 };
}

function pointDistance(from: TimedPoint, to: TimedPoint): number | null {
  const elapsed = to.time - from.time;
  if (elapsed > MAX_INTERVAL) return null;
  const distance = seaDistanceToRouteNm(from, [to]);
  return distance <= MAX_SPEED_KNOTS * elapsed / HOUR ? distance : null;
}

function speedProfile(intervals: Interval[], start: number, end: number): SpeedSample[] {
  const elapsed = end - start;
  const maxElapsedMinutes = rounded((Math.trunc(end) - Math.trunc(start)) / MINUTE);
  const width = Math.max(MINUTE, Math.ceil(elapsed / SEA_OPERATION_CONSUMPTION_TRACE_MAX_PROFILE_POINTS));
  const buckets = Array.from({ length: Math.ceil(elapsed / width) }, () => ({ elapsed: 0, distance: 0, gap: false }));

  for (const interval of intervals) {
    const from = interval.start - start, to = interval.end - start;
    const first = Math.min(buckets.length - 1, Math.floor(from / width));
    const last = Math.max(first, Math.min(buckets.length - 1, Math.ceil(to / width) - 1));
    for (let index = first; index <= last; index++) {
      const bucket = buckets[index];
      if (interval.distance === null) {
        bucket.gap = true;
      } else {
        const covered = Math.min(to, (index + 1) * width) - Math.max(from, index * width);
        bucket.elapsed += covered;
        bucket.distance += interval.distance * covered / (to - from);
      }
    }
  }

  return buckets.map((bucket, index) => ({
    elapsedMinutes: Math.min(maxElapsedMinutes, rounded((index * width + Math.min(elapsed, (index + 1) * width)) / (2 * MINUTE))),
    speedKnots: bucket.gap || !bucket.elapsed ? null : rounded(bucket.distance * HOUR / bucket.elapsed),
  }));
}

function summarize(segments: Element[][]): SeaOperationConsumptionTrace | null {
  let excludedPointCount = 0;
  let reorderedPointCount = 0;
  const runs: TimedPoint[][] = [];

  for (const segment of segments) {
    let run: TimedPoint[] = [];
    for (const element of segment) {
      const point = timedPoint(element);
      if (!point) {
        excludedPointCount++;
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      if (run.length && point.time < run[run.length - 1].time) reorderedPointCount++;
      run.push(point);
    }
    if (run.length) runs.push(run);
  }
  if (!runs.length) return null;

  const orderedRuns = runs.map(run => run.sort((a, b) => a.time - b.time).filter((point, index, points) => {
    if (!index || point.time !== points[index - 1].time) return true;
    excludedPointCount++;
    return false;
  })).sort((a, b) => a[0].time - b[0].time);

  const start = orderedRuns[0][0].time;
  const end = orderedRuns.reduce((last, run) => Math.max(last, run[run.length - 1].time), start);
  const durationMinutes = Math.round((Math.trunc(end) - Math.trunc(start)) / MINUTE);
  if (durationMinutes < 1 || durationMinutes > MAX_DURATION_MINUTES) return null;

  const intervals: Interval[] = [];
  let previousEnd: number | null = null;
  let distance = 0;
  let linked = false;
  function addInterval(interval: Interval) {
    const previous = intervals[intervals.length - 1];
    if (interval.distance === null && previous?.distance === null && previous.end === interval.start) {
      previous.end = interval.end;
    } else {
      intervals.push(interval);
    }
  }

  for (const run of orderedRuns) {
    // Overlapping recordings cannot be added together without counting the same time twice.
    if (previousEnd !== null && run[0].time < previousEnd) return null;
    if (previousEnd !== null) addInterval({ start: previousEnd, end: run[0].time, distance: null });
    previousEnd = run[run.length - 1].time;
    const legs = run.slice(1).map((to, index) => ({ start: run[index].time, end: to.time, distance: pointDistance(run[index], to) }));
    for (const [index, leg] of legs.entries()) {
      if (leg.distance !== null) {
        distance += leg.distance;
        linked = true;
      } else if (legs[index + 1]?.distance === null && pointDistance(run[index], run[index + 2]) !== null) {
        // An isolated jump breaks the profile on both sides. Do not reconstruct that part of the route.
        excludedPointCount++;
      }
      addInterval(leg);
    }
  }
  if (!linked) return null;

  const trace = {
    startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString(), durationMinutes,
    distanceNm: rounded(distance), averageSpeedKnots: rounded(distance * HOUR / (end - start)),
    pointCount: segments.reduce((count, segment) => count + segment.length, 0), segmentCount: segments.length,
    gapCount: intervals.filter(interval => interval.distance === null).length, reorderedPointCount, excludedPointCount,
    profile: speedProfile(intervals, start, end),
  };
  return isSeaOperationConsumptionTrace(trace) ? trace : null;
}

/** Read recorded tracks from inert GPX XML. Each source track has its own elapsed time and distance. */
export function parseSeaOperationConsumptionTrace(xml: string): Array<{ label: string; trace: SeaOperationConsumptionTrace }> {
  if (xml.length > SEA_OPERATION_CONSUMPTION_TRACE_MAX_BYTES) throw new Error('Le fichier GPX dépasse la limite de 5 Mo.');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('Le fichier GPX contient une déclaration XML non prise en charge.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const root = document.documentElement;
  const version = root.getAttribute('version');
  if (document.getElementsByTagNameNS('*', 'parsererror').length || root.localName !== 'gpx'
    || !GPX_NAMESPACES.has(root.namespaceURI || '') || version !== null && !['1.0', '1.1'].includes(version)) {
    throw new Error('Le fichier doit être un document GPX 1.0 ou 1.1 valide.');
  }

  let pointCount = 0;
  const tracks = gpxChildren(root, 'trk').map((element, index) => {
    const label = gpxText(element, 'name').slice(0, 200) || `Trace ${index + 1}`;
    const segments = gpxChildren(element, 'trkseg').map(segment => {
      const points = gpxChildren(segment, 'trkpt');
      pointCount += points.length;
      if (pointCount > MAX_POINTS) throw new Error('Le fichier GPX dépasse la limite de 50 000 points de trace.');
      return points;
    }).filter(segment => segment.length > 0);
    const trace = summarize(segments);
    return trace ? { label, trace } : null;
  }).filter(track => track !== null);

  if (!tracks.length) throw new Error('Le fichier GPX ne contient aucune trace horodatée exploitable.');
  return tracks;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function decimal(value: unknown, max: number): value is number {
  return typeof value === 'number' && value >= 0 && value <= max && rounded(value) === value;
}

function canonicalTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}

export function isSeaOperationConsumptionTraceSummary(value: unknown): value is SeaOperationConsumptionTraceSummary {
  const trace = object(value);
  if (!trace) return false;
  const { pointCount, durationMinutes } = trace;
  const start = canonicalTimestamp(trace.startedAt), end = canonicalTimestamp(trace.endedAt);
  const elapsedHours = (end - start) / HOUR;
  return integer(pointCount, 2, MAX_POINTS) && integer(durationMinutes, 1, MAX_DURATION_MINUTES)
    && end > start && Math.round((end - start) / MINUTE) === durationMinutes
    && decimal(trace.distanceNm, MAX_SPEED_KNOTS * MAX_DURATION_MINUTES / 60)
    && decimal(trace.averageSpeedKnots, MAX_SPEED_KNOTS)
    // Compare independently rounded measurements, allowing the saved timestamps to omit sub-milliseconds.
    && Math.abs(trace.averageSpeedKnots * elapsedHours - trace.distanceNm) <= 0.000051 * (1 + elapsedHours) + trace.averageSpeedKnots / HOUR
    && integer(trace.segmentCount, 1, pointCount) && integer(trace.gapCount, 0, pointCount - 1)
    && integer(trace.reorderedPointCount, 0, pointCount - 1) && integer(trace.excludedPointCount, 0, pointCount - 2);
}

export function isSeaOperationConsumptionTrace(value: unknown): value is SeaOperationConsumptionTrace {
  if (!isSeaOperationConsumptionTraceSummary(value) || !('profile' in value)) return false;
  const { profile } = value;
  if (!Array.isArray(profile) || !integer(profile.length, 1, SEA_OPERATION_CONSUMPTION_TRACE_MAX_PROFILE_POINTS)) return false;

  const maxElapsedMinutes = rounded((Date.parse(value.endedAt) - Date.parse(value.startedAt)) / MINUTE);
  let previous = -1;
  for (const entry of profile) {
    const sample = object(entry);
    if (!sample || !decimal(sample.elapsedMinutes, maxElapsedMinutes) || sample.elapsedMinutes <= previous
      || sample.speedKnots !== null && !decimal(sample.speedKnots, MAX_SPEED_KNOTS)) return false;
    previous = sample.elapsedMinutes;
  }
  return true;
}
