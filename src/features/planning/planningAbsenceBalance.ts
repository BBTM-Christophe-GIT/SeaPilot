import { addPlanningDays, isPlanningDate, isPlanningLocalDateTime, parsePlanningDate, planningDateFromTimestamp, planningLocalDateTimeToUtc } from './planningDates';
import { buildPlanningCrewBalanceDays, type PlanningCrewBalanceCheckpoint, type PlanningCrewBalanceDay } from './planningCrewBalance';
import type { PlanningAbsenceRecord, PlanningAbsenceType, PlanningDateRange } from './planningP12';
import type { PlanningOverview, PlanningPerson } from './planningQueries';

export type PlanningLeaveCounterType = 'leave' | 'rtt';
export interface PlanningLeaveCounterPeriod {
  id: number;
  counterType: PlanningLeaveCounterType;
  startsOn: string;
  endsOn: string;
  entitlement: number;
}
export interface PlanningLeaveCounterPeriodDraft extends Omit<PlanningLeaveCounterPeriod, 'id'> { personId: number }
export interface PlanningLeaveRightsPeriodDraft {
  personId: number;
  startsOn: string;
  endsOn: string;
  leaveEntitlement: number;
  rttEntitlement: number;
}
export interface PlanningAbsenceBalanceContext {
  kind: 'leave_rtt' | 'crew';
  person: PlanningPerson;
  counterPeriods: PlanningLeaveCounterPeriod[];
  absences: PlanningAbsenceRecord[];
  crewCheckpoints: PlanningCrewBalanceCheckpoint[];
  crewSources: Pick<PlanningOverview, 'assignments' | 'periods' | 'days'>;
}
export interface PlanningCounterRequest {
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  absenceId?: number;
}
export interface PlanningLeaveCounterSummary {
  counterType: PlanningLeaveCounterType;
  period: PlanningLeaveCounterPeriod | null;
  range: PlanningDateRange;
  approvedDays: number;
  pendingDays: number;
  remaining: number | null;
  requestDays: number | null;
  newRequestDays: number | null;
  projectedRemaining: number | null;
  uncoveredRequestDays: number;
}

// National holidays (France, general case). Dates checked against Service Public
// F2405 for 2026/2027. Moving holidays use the Gregorian Easter calculation.
export function planningFrenchPublicHolidays(year: number): ReadonlySet<string> {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error('Année de compteur invalide.');
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  const easter = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return new Set([
    ...['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((suffix) => `${year}-${suffix}`),
    addPlanningDays(easter, 1), addPlanningDays(easter, 39), addPlanningDays(easter, 50),
  ]);
}

export function planningWorkingAbsenceDates(startsAt: string, endsAt: string, range?: PlanningDateRange): Set<string> {
  const startInstant = Date.parse(startsAt);
  const endInstant = Date.parse(endsAt);
  if (!Number.isFinite(startInstant) || !Number.isFinite(endInstant) || endInstant <= startInstant) return new Set();
  let start = planningDateFromTimestamp(startsAt);
  // planning_absences.ends_at is exclusive, including at local midnight / DST.
  let end = planningDateFromTimestamp(new Date(endInstant - 1).toISOString());
  if (range) { start = start < range.start ? range.start : start; end = end > range.end ? range.end : end; }
  if (end < start) return new Set();
  const holidays = new Map<number, ReadonlySet<string>>();
  const result = new Set<string>();
  for (let date = start; date <= end; date = addPlanningDays(date, 1)) {
    const weekday = parsePlanningDate(date).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const year = Number(date.slice(0, 4));
    if (!holidays.has(year)) holidays.set(year, planningFrenchPublicHolidays(year));
    if (!holidays.get(year)!.has(date)) result.add(date);
  }
  return result;
}

function requestInstants(request: PlanningCounterRequest): { startsAt: string; endsAt: string } | null {
  if (!isPlanningLocalDateTime(request.startsAt) || !isPlanningLocalDateTime(request.endsAt)) return null;
  if (request.startsAt < '1900-01-01T00:00' || request.endsAt > '2100-12-31T23:59') return null;
  try {
    const startsAt = planningLocalDateTimeToUtc(request.startsAt);
    const endsAt = planningLocalDateTimeToUtc(request.endsAt);
    return endsAt > startsAt ? { startsAt, endsAt } : null;
  } catch { return null; }
}

export function getPlanningLeaveRightsRange(anchor: string): PlanningDateRange {
  if (!isPlanningDate(anchor)) throw new Error('Choisissez une date valide pour la période de droits.');
  const year = Number(anchor.slice(0, 4)) - (anchor.slice(5) < '06-01' ? 1 : 0);
  return { start: `${year}-06-01`, end: `${year + 1}-05-31` };
}

export function buildPlanningLeaveCounterSummaries(context: PlanningAbsenceBalanceContext, request: PlanningCounterRequest, today: string): PlanningLeaveCounterSummary[] {
  const instants = requestInstants(request);
  const anchor = instants ? request.startsAt.slice(0, 10) : today;
  const requestDates = instants ? planningWorkingAbsenceDates(instants.startsAt, instants.endsAt) : null;
  const summaries: PlanningLeaveCounterSummary[] = [];
  for (const counterType of ['leave', 'rtt'] as const) {
    const periods = context.counterPeriods.filter((period) => period.counterType === counterType);
    const requestEnd = instants ? planningDateFromTimestamp(new Date(Date.parse(instants.endsAt) - 1).toISOString()) : anchor;
    const relevant = periods.filter((period) => request.absenceType === counterType && instants
      ? period.startsOn <= requestEnd && period.endsOn >= anchor
      : period.startsOn <= anchor && period.endsOn >= anchor);
    const covered = new Set<string>();
    if (request.absenceType === counterType && requestDates) relevant.forEach((period) => requestDates.forEach((date) => {
      if (date >= period.startsOn && date <= period.endsOn) covered.add(date);
    }));
    const uncoveredRequestDays = request.absenceType === counterType && requestDates ? requestDates.size - covered.size : 0;
    for (const period of relevant.length ? relevant : [null]) {
      const range = period ? { start: period.startsOn, end: period.endsOn } : getPlanningLeaveRightsRange(anchor);
      const approved = new Set<string>();
      const pending = new Set<string>();
      context.absences.filter((absence) => absence.absenceType === counterType && absence.id !== request.absenceId && ['approved', 'requested'].includes(absence.status))
        .forEach((absence) => planningWorkingAbsenceDates(absence.startsAt, absence.endsAt, range).forEach((date) => {
          (absence.status === 'approved' ? approved : pending).add(date);
        }));
      approved.forEach((date) => pending.delete(date));
      const dates = instants && request.absenceType === counterType ? planningWorkingAbsenceDates(instants.startsAt, instants.endsAt, range) : null;
      const newDays = dates ? [...dates].filter((date) => !approved.has(date)).length : null;
      const remaining = period ? Math.round((period.entitlement - approved.size) * 100) / 100 : null;
      summaries.push({ counterType, period, range, approvedDays: approved.size, pendingDays: pending.size, remaining,
        requestDays: dates?.size ?? null, newRequestDays: newDays,
        projectedRemaining: remaining !== null && newDays !== null ? Math.round((remaining - newDays) * 100) / 100 : null,
        uncoveredRequestDays });
    }
  }
  return summaries;
}

export function getPlanningRequestCrewBalance(context: PlanningAbsenceBalanceContext, today: string): PlanningCrewBalanceDay {
  return buildPlanningCrewBalanceDays(context.person, context.crewSources as PlanningOverview, context.absences, context.crewCheckpoints, { start: today, end: today }).get(today)
    || { value: null, explanation: 'Solde à initialiser' };
}

export function validatePlanningLeaveCounterPeriod(draft: PlanningLeaveCounterPeriodDraft): PlanningLeaveCounterPeriodDraft {
  if (!Number.isSafeInteger(draft.personId) || draft.personId <= 0 || !['leave', 'rtt'].includes(draft.counterType)
    || !isPlanningDate(draft.startsOn) || !isPlanningDate(draft.endsOn) || draft.endsOn < draft.startsOn
    || draft.startsOn < '1900-01-01' || draft.endsOn > '2100-12-31'
    || (parsePlanningDate(draft.endsOn).getTime() - parsePlanningDate(draft.startsOn).getTime()) / 86_400_000 >= 3660
    || !Number.isFinite(draft.entitlement) || draft.entitlement < 0 || draft.entitlement >= 100000
    || Math.abs(draft.entitlement * 100 - Math.round(draft.entitlement * 100)) > 1e-6) {
    throw new Error('Renseignez une période valide et un total de droits positif ou nul, avec deux décimales au maximum.');
  }
  return draft;
}

export function validatePlanningLeaveRightsPeriod(draft: PlanningLeaveRightsPeriodDraft): PlanningLeaveRightsPeriodDraft {
  validatePlanningLeaveCounterPeriod({ personId: draft.personId, counterType: 'leave', startsOn: draft.startsOn, endsOn: draft.endsOn, entitlement: draft.leaveEntitlement });
  validatePlanningLeaveCounterPeriod({ personId: draft.personId, counterType: 'rtt', startsOn: draft.startsOn, endsOn: draft.endsOn, entitlement: draft.rttEntitlement });
  const range = getPlanningLeaveRightsRange(draft.startsOn);
  if (draft.startsOn !== range.start || draft.endsOn !== range.end) {
    throw new Error('La période de droits doit aller du 1er juin au 31 mai de l’année suivante.');
  }
  return draft;
}
