import type { WorkingTimeInterval } from '../workingTimeModel';
import type { WorkingTimePhaseInput } from '../workingTimeQueries';

export const PREVIEW_DATE = '2026-10-13';
export const PREVIEW_LEAVE_REST_RATE = 1.05;
export const PREVIEW_PEOPLE = [
  { id: 9301, name: 'Arthur DEMO', function: 'Matelot', active: true },
  { id: 9302, name: 'Camille DEMO', function: 'Capitaine', active: true },
  { id: 9303, name: 'Alex DEMO', function: 'Chef mécanicien', active: false },
] as const;

export function previewAddDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function previewInterval(personId: number, id: number, phase: WorkingTimePhaseInput, comment = ''): WorkingTimeInterval {
  return {
    id, personId, registerId: personId, companyId: 1,
    localWorkDate: phase.startsAt.slice(0, 10), startsAt: phase.startsAt, endsAt: phase.endsAt,
    timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    utcOffsetMinutes: -new Date(phase.startsAt).getTimezoneOffset(), vesselId: 1, watchGroup: 'Bordée 1',
    comment, authorUserId: 'demo', authorPersonId: personId, sourceType: 'manual', sourceReference: null, sourceRecordKey: null,
  };
}

export function createPreviewIntervals(): WorkingTimeInterval[] {
  let id = 1;
  return PREVIEW_PEOPLE.flatMap((person) => [
    ...Array.from({ length: 6 }, (_, index) => {
      const day = previewAddDays(PREVIEW_DATE, index - 6);
      return previewInterval(person.id, id++, { startsAt: `${day}T09:00`, endsAt: `${day}T17:00` });
    }),
    previewInterval(person.id, id++, { startsAt: `${PREVIEW_DATE}T06:00`, endsAt: `${PREVIEW_DATE}T12:00` }),
  ]);
}

export function previewDuration(hours: number): string {
  const minutes = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function previewDateTime(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function previewMonthDays(day: string): string[] {
  const start = `${day.slice(0, 7)}-01`;
  const dates: string[] = [];
  for (let current = start; current.slice(0, 7) === start.slice(0, 7); current = previewAddDays(current, 1)) dates.push(current);
  return dates;
}
