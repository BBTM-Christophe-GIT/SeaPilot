import { addPlanningDays, daysBetween } from './planningDates';
import type { PlanningCrewEvent, PlanningDateRange } from './planningModel';

interface CrewPeriod { vessel: string; start: string; end: string }

// A single personnel line can cover several rotations. Anchor it to the
// longest visible posting, then the earliest one, without duplicating people.
export function planningCrewPeriod(events: PlanningCrewEvent[], range: PlanningDateRange): CrewPeriod | null {
  const periods = events.filter((event) => event.kind !== 'annualReview' && event.confirmationStatus !== 'cancelled'
    && event.vessel && event.startsOn <= range.end && event.endsOn >= range.start)
    .map((event) => ({ vessel: event.vessel, start: event.startsOn < range.start ? range.start : event.startsOn,
      end: event.endsOn > range.end ? range.end : event.endsOn }))
    .sort(comparePlanningCrewPeriods);
  const merged: CrewPeriod[] = [];
  periods.forEach((period) => {
    const previous = merged.at(-1);
    if (previous?.vessel === period.vessel && period.start <= addPlanningDays(previous.end, 1)) {
      if (period.end > previous.end) previous.end = period.end;
    } else merged.push({ ...period });
  });
  return merged.sort((left, right) => daysBetween(right.start, right.end) - daysBetween(left.start, left.end)
    || left.start.localeCompare(right.start) || comparePlanningCrewPeriods(left, right))[0] || null;
}

export function comparePlanningCrewPeriods(left: CrewPeriod | null, right: CrewPeriod | null): number {
  if (!left || !right) return Number(!left) - Number(!right);
  return left.vessel.localeCompare(right.vessel, 'fr', { numeric: true })
    || left.start.localeCompare(right.start) || left.end.localeCompare(right.end);
}
