import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningSilaeData } from './planningSilaeQueries';

function mockClient(rows: Record<string, Record<string, unknown>[]>, failing = '') {
  const calls: { table: string; start: number; end: number; filters: unknown[]; columns: string }[] = [];
  const from = vi.fn((table: string) => {
    let columns = '';
    const filters: unknown[] = [];
    const query = {
      select: (value: string) => { columns = value; return query; },
      order: vi.fn(() => query),
      lte: (...args: unknown[]) => { filters.push(args); return query; },
      range: async (start: number, end: number) => {
        calls.push({ table, start, end, filters, columns });
        return { data: rows[table]?.slice(start, end + 1) || [], error: table === failing ? { code: '42501' } : null };
      },
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe('SILAE authenticated data reads', () => {
  it('paginates each relation and preserves HR text codes with leading zeroes', async () => {
    const { client, calls } = mockClient({
      people: [{ id: 1, first_name: 'Pierre', last_name: 'AUGUIN', employee_number: '00004', enim_function_code: 'AA01A', enim_category: '05', active: true }],
      planning_periods: Array.from({ length: 501 }, (_, i) => ({ id: i + 1, person_id: 1, starts_on: '2026-09-01', ends_on: '2026-09-02', sailor_status: 'Repos' })),
    });
    const data = await fetchPlanningSilaeData(client, '2026-09');
    expect(data.sources).toHaveLength(501);
    expect(data.people[0]).toMatchObject({ employeeNumber: '00004', enimCategory: '05' });
    expect(calls.filter((call) => call.table === 'planning_periods').map(({ start, end }) => [start, end])).toEqual([[0, 499], [500, 999]]);
    expect(calls.find((call) => call.table === 'planning_days')?.filters).toEqual([['work_date', '2026-09-30']]);
    expect(calls.find((call) => call.table === 'people')?.columns).not.toMatch(/birth|bank|address|salary/);
  });

  it('filters cancelled assignments and orphan notes, resolves legacy names and uses exclusive absence ends', async () => {
    const { client } = mockClient({
      people: [{ id: 1, first_name: 'Pierre', last_name: 'AUGUIN' }],
      planning_assignments: [{ id: 20, crew_person_id: 1, vessel_id: 10, starts_on: '2026-09-01', ends_on: '2026-09-30', status_label: 'En Mer', confirmation_status: 'cancelled' }],
      planning_periods: [{ id: 1, crew_name: 'Pierre AUGUIN', vessel_id: 10, starts_on: '2026-09-01', ends_on: '2026-09-30', sailor_status: 'En Mer' }],
      planning_days: [
        { id: 1, person_id: 1, work_date: '2026-09-02', sailor_status: 'Repos', source_label: 'seapilot-assignment-note', slot365: 'assignment:20' },
        { id: 2, person_id: 1, work_date: '2026-09-03', source_label: 'seapilot-vessel-location' },
        { id: 3, person_id: 1, vessel_id: 10, work_date: '2026-09-04', sailor_status: 'A Terre' },
      ],
      planning_absences: [
        { id: 1, person_id: 1, starts_at: '2026-09-10T22:00:00Z', ends_at: '2026-09-12T22:00:00Z', status: 'approved', absence_type: 'leave' },
        { id: 2, person_id: 1, status: 'requested' },
      ],
    });
    const data = await fetchPlanningSilaeData(client, '2026-09');
    expect(data.sources).toHaveLength(3);
    expect(data.sources[0]).toMatchObject({ personId: 1, priority: 1 });
    expect(data.sources[1]).toMatchObject({ startsOn: '2026-09-04', priority: 3, status: 'A Terre' });
    expect(data.sources[2]).toMatchObject({ startsOn: '2026-09-11', endsOn: '2026-09-12', priority: 4, status: 'Congés' });
  });

  it('fails closed when any data source is unreadable', async () => {
    const { client } = mockClient({}, 'people');
    await expect(fetchPlanningSilaeData(client, '2026-09')).rejects.toThrow('Impossible de charger les données SILAE (people)');
  });
});
