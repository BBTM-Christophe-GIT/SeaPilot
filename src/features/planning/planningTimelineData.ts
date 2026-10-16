import type { PlanningCrewEvent, PlanningTimelineDay } from './planningModel';
import type { PlanningHrDocumentRecord } from './planningQueries';
import { formatPlanningDate } from './planningDates';

const dayLabelsCache = new WeakMap<readonly PlanningTimelineDay[], ReadonlyMap<string, string>>();

export function planningTimelineDateLabels(days: readonly PlanningTimelineDay[]): ReadonlyMap<string, string> {
  const cached = dayLabelsCache.get(days);
  if (cached) return cached;
  const labels = new Map(days.map((day) => [day.date, formatPlanningDate(day.date)]));
  dayLabelsCache.set(days, labels);
  return labels;
}

// A day's empty-cell vessel follows the most recent preceding assignment,
// otherwise the next one. Keep input order for equal dates, as the old stable
// per-cell sort did, while sorting only once per lane.
export function planningCrewContextsByDate(
  events: readonly PlanningCrewEvent[],
  days: readonly PlanningTimelineDay[],
): ReadonlyMap<string, PlanningCrewEvent> {
  const candidates = events.filter((event) => event.kind !== 'annualReview' && event.vesselId !== null);
  const previous = candidates.slice().sort((left, right) => left.endsOn.localeCompare(right.endsOn));
  const next = candidates.slice().sort((left, right) => left.startsOn.localeCompare(right.startsOn));
  const contexts = new Map<string, PlanningCrewEvent>();
  let previousIndex = 0;
  let nextIndex = 0;
  let previousEvent: PlanningCrewEvent | undefined;
  for (const day of days) {
    while (previousIndex < previous.length && previous[previousIndex].endsOn < day.date) {
      const event = previous[previousIndex++];
      if (!previousEvent || event.endsOn > previousEvent.endsOn) previousEvent = event;
    }
    while (nextIndex < next.length && next[nextIndex].startsOn <= day.date) nextIndex += 1;
    const context = previousEvent || next[nextIndex];
    if (context) contexts.set(day.date, context);
  }
  return contexts;
}

const documentsByPersonCache = new WeakMap<readonly PlanningHrDocumentRecord[], ReadonlyMap<number, readonly PlanningHrDocumentRecord[]>>();

// Every visible row receives the same document list. Index it once per data
// snapshot instead of rescanning every person's documents on every daily cell.
export function planningTimelineDocumentsByPerson(
  documents: readonly PlanningHrDocumentRecord[],
): ReadonlyMap<number, readonly PlanningHrDocumentRecord[]> {
  const cached = documentsByPersonCache.get(documents);
  if (cached) return cached;
  const indexed = new Map<number, PlanningHrDocumentRecord[]>();
  for (const document of documents) {
    if (document.personId === null) continue;
    const group = indexed.get(document.personId);
    if (group) group.push(document);
    else indexed.set(document.personId, [document]);
  }
  documentsByPersonCache.set(documents, indexed);
  return indexed;
}
