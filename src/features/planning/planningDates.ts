const PLANNING_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_IN_MILLISECONDS = 86_400_000;

export const PLANNING_DATE_STORAGE_FORMAT = 'YYYY-MM-DD';

export class PlanningDateError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(`Date Planning invalide : ${value || 'valeur vide'}. Format attendu : ${PLANNING_DATE_STORAGE_FORMAT}.`);
    this.name = 'PlanningDateError';
    this.value = value;
  }
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function isPlanningDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = PLANNING_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parsePlanningDate(value: string): Date {
  if (!isPlanningDate(value)) throw new PlanningDateError(value);
  const [year, month, day] = value.split('-').map(Number);
  return utcDate(year, month, day);
}

export function isoDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new PlanningDateError('Date JavaScript invalide');
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function todayPlanningDate(now = new Date()): string {
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function addPlanningDays(value: string, amount: number): string {
  const date = parsePlanningDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

export function shiftPlanningMonths(value: string, amount: number): string {
  const date = parsePlanningDate(value);
  const requestedDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(requestedDay, lastDay));
  return isoDate(date);
}

export function shiftPlanningYears(value: string, amount: number): string {
  const date = parsePlanningDate(value);
  const requestedMonth = date.getUTCMonth();
  const requestedDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + amount);
  date.setUTCMonth(requestedMonth);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), requestedMonth + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(requestedDay, lastDay));
  return isoDate(date);
}

export function startOfPlanningWeek(value: string): string {
  const date = parsePlanningDate(value);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return isoDate(date);
}

export function planningWeekNumber(value: string): number {
  const source = parsePlanningDate(value);
  const cursor = utcDate(source.getUTCFullYear(), source.getUTCMonth() + 1, source.getUTCDate());
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const yearStart = utcDate(cursor.getUTCFullYear(), 1, 1);
  return Math.ceil(((cursor.getTime() - yearStart.getTime()) / DAY_IN_MILLISECONDS + 1) / 7);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parsePlanningDate(end).getTime() - parsePlanningDate(start).getTime()) / DAY_IN_MILLISECONDS);
}

export function inclusivePlanningDayCount(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

export function rangesOverlap(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  if (![start, end, rangeStart, rangeEnd].every(isPlanningDate)) return false;
  if (end < start || rangeEnd < rangeStart) return false;
  return start <= rangeEnd && end >= rangeStart;
}

export function formatPlanningDate(value: string): string {
  if (!isPlanningDate(value)) return 'Date non renseignée';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsePlanningDate(value));
}
