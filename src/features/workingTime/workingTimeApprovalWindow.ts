import { isPlanningDate, shiftPlanningMonths } from '../planning/planningDates';

export function workingTimeApprovalTodayDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function workingTimeCaptainApprovalStartDate(referenceDate = workingTimeApprovalTodayDate()): string {
  return isPlanningDate(referenceDate) ? shiftPlanningMonths(referenceDate, -2) : '';
}

export function workingTimeCaptainApprovalDateAllowed(localWorkDate: string, referenceDate = workingTimeApprovalTodayDate()): boolean {
  const earliestDate = workingTimeCaptainApprovalStartDate(referenceDate);
  return Boolean(earliestDate && isPlanningDate(localWorkDate)
    && localWorkDate >= earliestDate && localWorkDate <= referenceDate);
}
