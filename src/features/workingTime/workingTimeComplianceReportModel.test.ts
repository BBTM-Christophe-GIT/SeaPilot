import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeComplianceReport, workingTimeReportDateChunks } from './workingTimeComplianceReportModel';

describe('workingTimeReportDateChunks', () => {
  it('conserve une courte période dans une seule requête', () => {
    expect(workingTimeReportDateChunks('2026-08-03', '2026-08-09')).toEqual([
      { start: '2026-08-03', end: '2026-08-09' },
    ]);
  });

  it('découpe une année par mois sans trou ni chevauchement', () => {
    const chunks = workingTimeReportDateChunks('2026-01-01', '2026-12-31');

    expect(chunks).toHaveLength(12);
    expect(chunks[0]).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(chunks[1]).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(chunks.at(-1)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('gère correctement une période à cheval sur une année bissextile', () => {
    expect(workingTimeReportDateChunks('2024-02-27', '2024-03-02')).toEqual([
      { start: '2024-02-27', end: '2024-02-29' },
      { start: '2024-03-01', end: '2024-03-02' },
    ]);
  });
});

describe('current coverage in the compliance report and its PDF data', () => {
  it('counts all actual gap dates from one authority call even when the old calculation source was compliant', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'working_time_calculation_windows') throw new Error('Raw diagnostic flags are not the report authority');
      const data = table === 'vessels' ? [{ id: 7, name: 'Navire de test' }] : [];
      const result = { data, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order', 'lte', 'or', 'limit', 'gte', 'is', 'in']) builder[method] = vi.fn(() => builder);
      builder.range = vi.fn().mockResolvedValue(result);
      builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      return builder;
    });
    const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'working_time_entry_context'
      ? { readable_people: [{ person_id: 10, first_name: 'Alex', last_name: 'MARIN', function_label: 'Matelot' }] }
      : [{ id: 1, person_id: 10, vessel_id: 7, local_window_end_date: '2026-10-15', timezone_name: 'Europe/Paris',
        is_compliant: true, violation_codes: ['assignment_coverage'], assignment_coverage: { status: 'uncovered', uncovered_ranges: [
          { starts_at: '2026-10-12T22:00:00Z', ends_at: '2026-10-14T22:00:00Z' },
          { starts_at: '2026-10-15T22:00:00Z', ends_at: '2026-10-16T22:00:00Z' },
        ] } }] }));
    const report = await fetchWorkingTimeComplianceReport({ from, rpc } as unknown as SupabaseClient, {
      start: '2026-10-01', end: '2026-10-31', personIds: [], vesselIds: [], watchGroups: [], metricKeys: ['non_compliance'],
    });
    expect(report.nonCompliantDays).toBe(3);
    expect(report.peopleAffected).toBe(1);
    expect(report.breakdownByVessel).toEqual([{ id: '7', label: 'Navire de test', value: 3 }]);
    expect(report.trend.find((point) => point.key === '2026-10-14')?.nonCompliantDays).toBe(1);
    expect(report.trend.find((point) => point.key === '2026-10-15')?.nonCompliantDays).toBe(0);
    expect(rpc.mock.calls.filter(([name]) => name === 'working_time_coverage_alerts')).toHaveLength(1);
    expect(from).not.toHaveBeenCalledWith('working_time_calculation_windows');
    expect(report.formulas.at(-1)).toContain('couverture compatible');
  });
});
