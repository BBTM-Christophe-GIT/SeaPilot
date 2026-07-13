import { rangesOverlap } from './planningDates';
import { getAllPlanningCrewEvents, normalizePlanningText, type PlanningCrewEvent } from './planningModel';
import type { PlanningOverview } from './planningQueries';

export interface PlanningConflict {
  event: PlanningCrewEvent;
  date: string;
}

function planningPersonKey(event: Pick<PlanningCrewEvent, 'person' | 'personId'>): string {
  return event.personId === null ? `name:${normalizePlanningText(event.person)}` : `id:${event.personId}`;
}

export function getPlanningConflicts(
  overview: PlanningOverview,
  candidate: Pick<PlanningCrewEvent, 'id' | 'person' | 'personId' | 'vessel'> & { startsOn: string; endsOn: string },
): PlanningConflict[] {
  const candidatePersonKey = planningPersonKey(candidate);
  return getAllPlanningCrewEvents(overview)
    .filter((event) => (
      event.id !== candidate.id
      && planningPersonKey(event) === candidatePersonKey
      && normalizePlanningText(event.vessel) !== normalizePlanningText(candidate.vessel)
      && rangesOverlap(event.startsOn, event.endsOn, candidate.startsOn, candidate.endsOn)
    ))
    .map((event) => ({ event, date: event.startsOn > candidate.startsOn ? event.startsOn : candidate.startsOn }));
}

export function getPlanningConflictEventIds(overview: PlanningOverview): Set<string> {
  const eventsByPerson = new Map<string, PlanningCrewEvent[]>();
  getAllPlanningCrewEvents(overview).forEach((event) => {
    const key = planningPersonKey(event);
    eventsByPerson.set(key, [...(eventsByPerson.get(key) || []), event]);
  });

  const conflicted = new Set<string>();
  eventsByPerson.forEach((events) => {
    const sorted = [...events].sort((left, right) => left.startsOn.localeCompare(right.startsOn));
    sorted.forEach((event, index) => {
      for (let candidateIndex = index + 1; candidateIndex < sorted.length; candidateIndex += 1) {
        const candidate = sorted[candidateIndex];
        if (!candidate || candidate.startsOn > event.endsOn) break;
        if (
          normalizePlanningText(event.vessel) !== normalizePlanningText(candidate.vessel)
          && rangesOverlap(event.startsOn, event.endsOn, candidate.startsOn, candidate.endsOn)
        ) {
          conflicted.add(event.id);
          conflicted.add(candidate.id);
        }
      }
    });
  });
  return conflicted;
}
