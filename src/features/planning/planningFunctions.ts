import { addPlanningDays, daysBetween } from './planningDates';
import type { PlanningCrewEvent } from './planningModel';

export function planningEventFunctionOnDate(event: PlanningCrewEvent, date: string): string {
  return event.dailyFunctionLabels?.[date]?.trim() || event.functionLabel;
}

export function planningTemporaryFunctionSegments(event: PlanningCrewEvent, hrFunction: string): PlanningCrewEvent[] {
  const sameFunction = (left: string, right: string) => left.trim().localeCompare(right.trim(), 'fr', { sensitivity: 'base' }) === 0;
  // Legacy assignments sometimes contain a department instead of a function.
  const hasAssignmentFunction = !['', 'Pont', 'Machine', 'Équipage'].some((label) => sameFunction(event.functionLabel, label));
  return splitPlanningEventByFunction(event).filter((segment) => !sameFunction(segment.functionLabel, event.functionLabel)
    || Boolean(hasAssignmentFunction && hrFunction && !sameFunction(segment.functionLabel, hrFunction)));
}

export function planningShortFunctionLabel(label: string): string {
  return ({ Capitaine: 'Capt.', '2nd Capitaine': '2nd C.', 'Chef Mécanicien': 'Ch. M.', '2nd Mécanicien': '2nd M.',
    "Maître d'Equipage": 'M. éq.', 'Matelot polyvalent': 'Mat. P.', 'Matelot Qualifié': 'Mat. Q.', Stagiaire: 'Stag.' } as Record<string, string>)[label] || label;
}

export function planningEventFunctionForScope(event: PlanningCrewEvent, date: string | null): string {
  if (date) return planningEventFunctionOnDate(event, date);
  const functions = new Set(splitPlanningEventByFunction(event).map((segment) => segment.functionLabel));
  return functions.size === 1 ? [...functions][0] : '';
}

// Export periods must end when the function actually exercised changes.
// Keep the original event identity and assignment untouched in the planning.
export function splitPlanningEventByFunction(event: PlanningCrewEvent): PlanningCrewEvent[] {
  const boundaries = new Set([event.startsOn, addPlanningDays(event.endsOn, 1)]);
  Object.keys(event.dailyFunctionLabels || {}).forEach((date) => {
    if (date < event.startsOn || date > event.endsOn) return;
    boundaries.add(date);
    boundaries.add(addPlanningDays(date, 1));
  });
  const dates = [...boundaries].sort();
  const segments: PlanningCrewEvent[] = [];
  const shiftedTimestamp = (value: string, previousDate: string, date: string) => value
    ? `${addPlanningDays(value.slice(0, 10), daysBetween(previousDate, date))}${value.slice(10)}` : '';
  for (let index = 0; index < dates.length - 1; index += 1) {
    const startsOn = dates[index];
    const endsOn = addPlanningDays(dates[index + 1], -1);
    const functionLabel = planningEventFunctionOnDate(event, startsOn);
    const previous = segments.at(-1);
    if (previous?.functionLabel === functionLabel) {
      previous.endsOn = endsOn;
      previous.endsAt = shiftedTimestamp(event.endsAt, event.endsOn, endsOn);
    } else {
      segments.push({ ...event, startsOn, endsOn, functionLabel,
        startsAt: shiftedTimestamp(event.startsAt, event.startsOn, startsOn),
        endsAt: shiftedTimestamp(event.endsAt, event.endsOn, endsOn) });
    }
  }
  return segments;
}
