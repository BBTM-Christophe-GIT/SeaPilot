import type { WorkingTimeAssignmentCoverage } from './workingTimeQueries';

export type WorkingTimeCoverageDayStatus = 'covered' | 'projected' | 'uncovered' | 'unknown';
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function localDate(instant: number, timezoneName: string) {
  let formatter = dateFormatters.get(timezoneName);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezoneName, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateFormatters.set(timezoneName, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function workingTimeRangeTouchesDate(range: { startsAt: string; endsAt: string }, day: string, timezoneName: string) {
  const start = Date.parse(range.startsAt);
  const end = Date.parse(range.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && localDate(start, timezoneName) <= day && localDate(end - 1, timezoneName) >= day;
}

/** Only actual uncovered gaps color a day red; a different part of an assignment may be covered. */
export function workingTimeCoverageDayStatuses(coverages: WorkingTimeAssignmentCoverage[], start: string, end: string, timezoneName: string) {
  const statuses: Record<string, WorkingTimeCoverageDayStatus> = {};
  for (const cursor = new Date(`${start}T12:00:00Z`); cursor.toISOString().slice(0, 10) <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10);
    const scopes = coverages.filter((coverage) => workingTimeRangeTouchesDate({ startsAt: coverage.scopeStartsAt, endsAt: coverage.scopeEndsAt }, day, timezoneName));
    statuses[day] = scopes.some((scope) => scope.status === 'uncovered' && scope.uncoveredRanges.some((gap) => workingTimeRangeTouchesDate(gap, day, timezoneName)))
      ? 'uncovered' : !scopes.length || scopes.some((scope) => scope.status === 'unknown' || (scope.status === 'uncovered' && !scope.uncoveredRanges.length))
        ? 'unknown' : scopes.some((scope) => scope.status === 'projected') ? 'projected' : 'covered';
  }
  return statuses;
}
