import { addPlanningDays, isPlanningDate, isPlanningLocalDateTime, parsePlanningDate, planningLocalDateTimeToUtc, shiftPlanningMonths, todayPlanningDate } from './planningDates';

export interface PlanningAbsencePeriodSelection {
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Calendar dates are inclusive; an existing midnight end excludes that date. */
export function readPlanningAbsencePeriod(startsAt: string, endsAt: string, today = todayPlanningDate()): PlanningAbsencePeriodSelection {
  const validStart = isPlanningLocalDateTime(startsAt);
  const validEnd = isPlanningLocalDateTime(endsAt);
  const startsOn = validStart ? startsAt.slice(0, 10) : today;
  const endTime = validEnd ? endsAt.slice(11, 16) : '18:00';
  let endsOn = validEnd ? endsAt.slice(0, 10) : startsOn;
  if (validEnd && endTime === '00:00') endsOn = addPlanningDays(endsOn, -1);
  if (endsOn < startsOn) endsOn = startsOn;
  return { startsOn, endsOn, startTime: validStart ? startsAt.slice(11, 16) : '08:00', endTime };
}

export function buildPlanningAbsencePeriod(selection: PlanningAbsencePeriodSelection): { startsAt: string; endsAt: string } {
  if (!isPlanningDate(selection.startsOn) || !isPlanningDate(selection.endsOn) || selection.endsOn < selection.startsOn) throw new Error('Choisissez un jour ou une période valide.');
  if (!timePattern.test(selection.startTime) || !timePattern.test(selection.endTime)) throw new Error('Renseignez des heures de début et de fin valides.');
  const startsAt = `${selection.startsOn}T${selection.startTime}`;
  const endsAt = `${selection.endTime === '00:00' ? addPlanningDays(selection.endsOn, 1) : selection.endsOn}T${selection.endTime}`;
  let startsUtc: string;
  let endsUtc: string;
  try { startsUtc = planningLocalDateTimeToUtc(startsAt); endsUtc = planningLocalDateTimeToUtc(endsAt); }
  catch { throw new Error('Une heure choisie n’existe pas lors du changement d’heure. Choisissez une autre heure.'); }
  if (Date.parse(endsUtc) <= Date.parse(startsUtc)) throw new Error('L’heure de fin doit être postérieure à l’heure de début.');
  return { startsAt, endsAt };
}

export function planningAbsencePeriodLabel(selection: Pick<PlanningAbsencePeriodSelection, 'startsOn' | 'endsOn'>): string {
  const start = dateFormatter.format(parsePlanningDate(selection.startsOn));
  if (selection.startsOn === selection.endsOn) return start;
  if (selection.startsOn.slice(0, 7) === selection.endsOn.slice(0, 7)) {
    return `Du ${parsePlanningDate(selection.startsOn).getUTCDate()} au ${dateFormatter.format(parsePlanningDate(selection.endsOn))}`;
  }
  return `Du ${start} au ${dateFormatter.format(parsePlanningDate(selection.endsOn))}`;
}

export function planningAbsenceCalendarWeeks(month: string): Array<Array<string | null>> {
  const first = `${month.slice(0, 7)}-01`;
  const offset = (parsePlanningDate(first).getUTCDay() + 6) % 7;
  const last = addPlanningDays(shiftPlanningMonths(first, 1), -1);
  const dayCount = parsePlanningDate(last).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, index) => index >= offset && index < offset + dayCount ? addPlanningDays(first, index - offset) : null);
  return Array.from({ length: 6 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}
