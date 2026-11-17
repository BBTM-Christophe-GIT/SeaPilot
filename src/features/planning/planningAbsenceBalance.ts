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
export interface PlanningSedentaryLeavePeriodDraft {
  personId: number;
  startsOn: string;
  debitFrom: string;
  openingBalance: number;
  openingAccrued: number;
  daysPerWeek: number;
  normalDays: number;
  normalWeeks: number;
  normalMonths: number;
  illnessDays: number;
  illnessWeeks: number;
  illnessMonths: number;
  workingWeekdays: number[];
  workedHolidays: string[];
}
type SedentaryLeaveInputs = Pick<PlanningSedentaryLeavePeriodDraft, 'daysPerWeek'
  | 'normalDays' | 'normalWeeks' | 'normalMonths' | 'illnessDays' | 'illnessWeeks' | 'illnessMonths'>;
export interface PlanningSedentaryLeavePeriod extends Partial<SedentaryLeaveInputs>, Omit<PlanningSedentaryLeavePeriodDraft, keyof SedentaryLeaveInputs | 'personId'> {
  id: number;
  endsOn: string;
  acquiredDays: number;
}
export interface PlanningAbsenceBalanceContext {
  kind: 'leave_rtt' | 'crew';
  requestBalanceKind?: 'leave_rtt' | 'crew';
  sedentaryLeave?: PlanningSedentaryLeavePeriod[] | null;
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
  unit?: 'ouvrables';
  acquiredDays?: number;
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

export const DEFAULT_SEDENTARY_WORKING_WEEKDAYS = [1, 2, 3, 4, 5];

export function buildPlanningLeaveCounterSummaries(context: PlanningAbsenceBalanceContext, request: PlanningCounterRequest, today: string): PlanningLeaveCounterSummary[] {
  const legacyMode = context.requestBalanceKind ?? context.kind;
  if (context.sedentaryLeave) {
    const rtt = legacyMode === 'leave_rtt' ? buildLegacyPlanningLeaveCounterSummaries(context, request, today, ['rtt']) : [];
    return [...buildSedentaryLeaveSummaries(context, context.sedentaryLeave, request, today), ...rtt];
  }
  return buildLegacyPlanningLeaveCounterSummaries(context, request, today, ['leave', 'rtt']);
}

function buildLegacyPlanningLeaveCounterSummaries(context: PlanningAbsenceBalanceContext, request: PlanningCounterRequest, today: string, counterTypes: PlanningLeaveCounterType[]): PlanningLeaveCounterSummary[] {
  const instants = requestInstants(request);
  const anchor = instants ? request.startsAt.slice(0, 10) : today;
  const requestDates = instants ? planningWorkingAbsenceDates(instants.startsAt, instants.endsAt) : null;
  const summaries: PlanningLeaveCounterSummary[] = [];
  for (const counterType of counterTypes) {
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

function sedentaryLeaveCalendar(periods: PlanningSedentaryLeavePeriod[]) {
  const holidays = new Map<number, ReadonlySet<string>>();
  const workedHolidays = new Set(periods.flatMap((period) => period.workedHolidays));
  const weekday = (date: string) => parsePlanningDate(date).getUTCDay();
  const isChargeable = (date: string) => {
    if (weekday(date) === 0) return false;
    const year = Number(date.slice(0, 4));
    if (!holidays.has(year)) holidays.set(year, planningFrenchPublicHolidays(year));
    return !holidays.get(year)?.has(date) || workedHolidays.has(date);
  };
  return {
    isChargeable,
    isWorkday(date: string) {
      const period = periods.find(({ startsOn, endsOn }) => startsOn <= date && date <= endsOn);
      return isChargeable(date) && (period?.workingWeekdays ?? DEFAULT_SEDENTARY_WORKING_WEEKDAYS).includes(weekday(date));
    },
  };
}

function sedentaryLeaveDates(startsAt: string, endsAt: string, calendar: ReturnType<typeof sedentaryLeaveCalendar>): string[] {
  const start = planningDateFromTimestamp(startsAt);
  const end = planningDateFromTimestamp(new Date(Date.parse(endsAt) - 1).toISOString());
  let first = start;
  while (first <= end && !calendar.isWorkday(first)) first = addPlanningDays(first, 1);
  if (first > end) return [];
  let resumption = addPlanningDays(end, 1);
  while (resumption <= '2100-12-31' && !calendar.isWorkday(resumption)) resumption = addPlanningDays(resumption, 1);
  const dates: string[] = [];
  for (let date = first; date < resumption; date = addPlanningDays(date, 1)) {
    if (calendar.isChargeable(date)) dates.push(date);
  }
  return dates;
}

function buildSedentaryLeaveSummaries(context: PlanningAbsenceBalanceContext, periods: PlanningSedentaryLeavePeriod[], request: PlanningCounterRequest, today: string): PlanningLeaveCounterSummary[] {
  const instants = requestInstants(request);
  const anchor = instants ? request.startsAt.slice(0, 10) : today;
  const calendar = sedentaryLeaveCalendar(periods);
  // Extend to the next scheduled working day before splitting dates by cycle.
  const requested = request.absenceType === 'leave' && instants ? sedentaryLeaveDates(instants.startsAt, instants.endsAt, calendar) : null;
  const ranges = new Map<string, PlanningDateRange>();
  for (const date of requested?.length ? requested : [anchor]) {
    const range = getPlanningLeaveRightsRange(date);
    ranges.set(range.start, range);
  }
  const approved = new Set<string>();
  const pending = new Set<string>();
  for (const absence of context.absences) {
    if (absence.absenceType !== 'leave' || absence.id === request.absenceId || !['approved', 'requested'].includes(absence.status)) continue;
    const dates = sedentaryLeaveDates(absence.startsAt, absence.endsAt, calendar);
    const target = absence.status === 'approved' ? approved : pending;
    dates.forEach((date) => target.add(date));
  }
  const covered = (date: string) => periods.some(({ debitFrom, endsOn }) => debitFrom <= date && date <= endsOn);
  const uncoveredRequestDays = requested?.filter((date) => !covered(date)).length ?? 0;
  const roundBalance = (value: number) => Math.round(value * 100) / 100;
  return [...ranges.values()].map((range) => {
    const configured = periods.find(({ startsOn }) => startsOn === range.start);
    const inRange = (date: string) => range.start <= date && date <= range.end;
    const inBalance = (date: string) => inRange(date) && (!configured || date >= configured.debitFrom);
    const acquiredDays = configured ? Math.max(configured.openingAccrued, configured.acquiredDays) : undefined;
    const entitlement = configured && acquiredDays !== undefined
      ? roundBalance(configured.openingBalance + acquiredDays - configured.openingAccrued) : null;
    const approvedDays = [...approved].filter(inBalance).length;
    const pendingDays = [...pending].filter((date) => inBalance(date) && !approved.has(date)).length;
    const requestDays = requested ? requested.filter(inRange).length : null;
    const newDays = requested ? requested.filter((date) => inBalance(date) && !approved.has(date)).length : null;
    const remaining = entitlement === null ? null : roundBalance(entitlement - approvedDays);
    return {
      counterType: 'leave', unit: 'ouvrables', range, acquiredDays,
      period: configured && entitlement !== null ? {
        id: configured.id, counterType: 'leave', startsOn: range.start, endsOn: range.end, entitlement,
      } : null,
      approvedDays, pendingDays, remaining, requestDays, newRequestDays: newDays,
      projectedRemaining: remaining !== null && newDays !== null ? roundBalance(remaining - newDays) : null,
      uncoveredRequestDays,
    };
  });
}

export function calculatePlanningSedentaryLeaveAccrued(inputs: SedentaryLeaveInputs): number {
  const rights = (normalMonths: number, illnessMonths: number) => 2.5 * normalMonths + Math.min(24, 2 * illnessMonths);
  const workDaysPerMonth = 4 * inputs.daysPerWeek;
  const total = Math.max(
    rights(inputs.normalMonths, inputs.illnessMonths),
    rights(inputs.normalWeeks / 4, inputs.illnessWeeks / 4),
    rights(inputs.normalDays / workDaysPerMonth, inputs.illnessDays / workDaysPerMonth),
  );
  return Math.max(0, Math.ceil(Math.min(30, total) - 1e-9));
}

export function validatePlanningSedentaryLeavePeriod(draft: PlanningSedentaryLeavePeriodDraft): PlanningSedentaryLeavePeriodDraft {
  const range = getPlanningLeaveRightsRange(draft.startsOn);
  const between = (value: number, min: number, max: number) => Number.isFinite(value) && min <= value && value <= max;
  const withinPrecision = (value: number, multiplier: number) => Math.abs(value * multiplier - Math.round(value * multiplier)) < 1e-6;
  if (!Number.isSafeInteger(draft.personId) || draft.personId <= 0 || draft.startsOn !== range.start
    || range.start < '1900-06-01' || range.end > '2100-05-31' || !isPlanningDate(draft.debitFrom)
    || draft.debitFrom < range.start || draft.debitFrom > range.end
    || !between(draft.openingBalance, -99999.99, 99999.99) || !between(draft.openingAccrued, 0, 30)
    || !between(draft.daysPerWeek, 0.5, 6)
    || ![draft.openingBalance, draft.openingAccrued, draft.daysPerWeek].every((value) => withinPrecision(value, 100))
    || ![draft.normalDays, draft.illnessDays].every((value) => between(value, 0, 366))
    || ![draft.normalWeeks, draft.illnessWeeks].every((value) => between(value, 0, 53))
    || ![draft.normalMonths, draft.illnessMonths].every((value) => between(value, 0, 12))
    || ![draft.normalDays, draft.illnessDays, draft.normalWeeks, draft.illnessWeeks, draft.normalMonths, draft.illnessMonths]
      .every((value) => withinPrecision(value, 10_000))
    || draft.normalDays + draft.illnessDays > 366 || draft.normalWeeks + draft.illnessWeeks > 53
    || draft.normalMonths + draft.illnessMonths > 12
    || !draft.workingWeekdays.length || new Set(draft.workingWeekdays).size !== draft.workingWeekdays.length
    || !draft.workingWeekdays.every((value) => Number.isInteger(value) && between(value, 1, 6))
    || draft.workedHolidays.length > 366
    || !draft.workedHolidays.every((date) => isPlanningDate(date) && date >= range.start && date <= range.end
      && planningFrenchPublicHolidays(Number(date.slice(0, 4))).has(date))) {
    throw new Error('Vérifiez la période, le solde d’ouverture, les jours de travail et les équivalences issus de la paie.');
  }
  return draft;
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
