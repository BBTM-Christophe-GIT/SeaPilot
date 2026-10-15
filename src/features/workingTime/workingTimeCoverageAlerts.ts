import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkingTimeCoverageAlert {
  id: number | string;
  person_id: number | string;
  vessel_id: number | string | null;
  watch_group?: string | null;
  local_window_end_date: string;
  timezone_name?: string;
  violation_codes?: string[] | null;
  coverage_starts_at?: string | null;
  coverage_ends_at?: string | null;
  coverage_vessel_id?: number | string | null;
  coverage_watch_group?: string | null;
  coverage_timezone?: string;
  assignment_id?: number | string | null;
  assignment_coverage?: { status?: string; uncovered_ranges?: { starts_at: string; ends_at: string }[] };
}

const dayAfter = (day: string, amount: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

/** Bound each batched solve to six weeks and 20 people, never one call per row. */
export async function fetchWorkingTimeCoverageAlerts(client: SupabaseClient, start: string, end: string, personIds: number[] | null = null): Promise<WorkingTimeCoverageAlert[]> {
  const fetchRange = async (from: string, to: string, people: number[] | null): Promise<WorkingTimeCoverageAlert[]> => {
    const { data, error } = await client.rpc('working_time_coverage_alerts', { p_starts_on: from, p_ends_on: to, p_person_ids: people });
    if (error || !Array.isArray(data)) throw new Error('Impossible de vérifier les alertes actuelles de temps de travail.');
    const rows = data as WorkingTimeCoverageAlert[];
    if (rows.length < 500) return rows;
    const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
    if (days > 0) {
      const middle = dayAfter(from, Math.floor(days / 2));
      return [...await fetchRange(from, middle, people), ...await fetchRange(dayAfter(middle, 1), to, people)];
    }
    if (people && people.length > 1) {
      const middle = Math.floor(people.length / 2);
      return [...await fetchRange(from, to, people.slice(0, middle)), ...await fetchRange(from, to, people.slice(middle))];
    }
    throw new Error('Le nombre d’alertes dépasse le périmètre du rapport. Réduisez la population sélectionnée.');
  };
  const rows: WorkingTimeCoverageAlert[] = [];
  const populations = personIds && personIds.length > 20
    ? Array.from({ length: Math.ceil(personIds.length / 20) }, (_, index) => personIds.slice(index * 20, (index + 1) * 20))
    : [personIds];
  for (let cursor = start; cursor <= end;) {
    const chunkEnd = [end, dayAfter(cursor, 41)].sort()[0];
    for (const population of populations) rows.push(...await fetchRange(cursor, chunkEnd, population));
    cursor = dayAfter(chunkEnd, 1);
  }
  const unique = new Map<string, WorkingTimeCoverageAlert>();
  rows.forEach((row) => {
    const key = row.violation_codes?.includes('assignment_coverage')
      ? `coverage:${row.person_id}:${row.assignment_id ?? ''}:${JSON.stringify(row.assignment_coverage?.uncovered_ranges ?? [row.coverage_starts_at, row.coverage_ends_at])}`
      : `manual:${row.id}`;
    unique.set(key, row);
  });
  return [...unique.values()].map((row) => row.violation_codes?.includes('assignment_coverage') ? { ...row,
    vessel_id: row.coverage_vessel_id === undefined ? row.vessel_id : row.coverage_vessel_id,
    watch_group: row.coverage_watch_group === undefined ? row.watch_group : row.coverage_watch_group,
    timezone_name: row.coverage_timezone || row.timezone_name,
  } : row);
}

function localDate(value: string, timezoneName: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezoneName,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Every actual uncovered date counts, including gaps with no raw bad row. */
export function workingTimeCoverageAlertDates(alert: WorkingTimeCoverageAlert, start: string, end: string): string[] {
  if (!alert.violation_codes?.includes('assignment_coverage')) {
    return alert.local_window_end_date >= start && alert.local_window_end_date <= end ? [alert.local_window_end_date] : [];
  }
  const ranges = alert.assignment_coverage?.uncovered_ranges
    ?? (alert.coverage_starts_at && alert.coverage_ends_at ? [{ starts_at: alert.coverage_starts_at, ends_at: alert.coverage_ends_at }] : []);
  const dates = new Set<string>();
  for (const range of ranges) {
    const begin = Date.parse(range.starts_at); const finish = Date.parse(range.ends_at);
    if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin) continue;
    const timezone = alert.timezone_name || 'Europe/Paris';
    const first = [start, localDate(range.starts_at, timezone)].sort().at(-1)!;
    const last = [end, localDate(new Date(finish - 1).toISOString(), timezone)].sort()[0];
    for (let day = first; day <= last; day = dayAfter(day, 1)) dates.add(day);
  }
  return [...dates].sort();
}
