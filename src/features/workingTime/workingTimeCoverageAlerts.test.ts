import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeCoverageAlerts, workingTimeCoverageAlertDates, type WorkingTimeCoverageAlert } from './workingTimeCoverageAlerts';

const alert: WorkingTimeCoverageAlert = {
  id: 1, person_id: 10, vessel_id: 7, assignment_id: 1, local_window_end_date: '2026-10-15', timezone_name: 'Europe/Paris',
  violation_codes: ['assignment_coverage'], assignment_coverage: { status: 'uncovered', uncovered_ranges: [
    { starts_at: '2026-10-12T22:00:00Z', ends_at: '2026-10-14T22:00:00Z' },
    { starts_at: '2026-10-15T22:00:00Z', ends_at: '2026-10-16T22:00:00Z' },
  ] },
};

describe('authoritative working-time alert queries', () => {
  it('bounds an annual report to six-week batches and deduplicates assignments crossing their boundaries', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [alert], error: null });
    expect(await fetchWorkingTimeCoverageAlerts({ rpc } as unknown as SupabaseClient, '2026-01-01', '2026-12-31', [10])).toEqual([alert]);
    expect(rpc).toHaveBeenCalledTimes(9);
    expect(rpc).toHaveBeenNthCalledWith(1, 'working_time_coverage_alerts', { p_starts_on: '2026-01-01', p_ends_on: '2026-02-11', p_person_ids: [10] });
    expect(rpc).toHaveBeenLastCalledWith('working_time_coverage_alerts', expect.objectContaining({ p_ends_on: '2026-12-31' }));
    rpc.mock.calls.forEach(([, parameters]) => expect((Date.parse(parameters.p_ends_on) - Date.parse(parameters.p_starts_on)) / 86400000).toBeLessThan(42));
  });

  it('splits a capped response instead of presenting a truncated report', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => alert), error: null })
      .mockResolvedValue({ data: [alert], error: null });
    expect(await fetchWorkingTimeCoverageAlerts({ rpc } as unknown as SupabaseClient, '2026-10-13', '2026-10-14', [10])).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(2, 'working_time_coverage_alerts', { p_starts_on: '2026-10-13', p_ends_on: '2026-10-13', p_person_ids: [10] });
    expect(rpc).toHaveBeenNthCalledWith(3, 'working_time_coverage_alerts', { p_starts_on: '2026-10-14', p_ends_on: '2026-10-14', p_person_ids: [10] });
  });

  it('bounds each population batch to 20 people', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchWorkingTimeCoverageAlerts({ rpc } as unknown as SupabaseClient, '2026-10-01', '2026-10-31', Array.from({ length: 45 }, (_, index) => index + 1));
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.map(([, parameters]) => parameters.p_person_ids.length)).toEqual([20, 20, 5]);
  });

  it('uses the actual assignment vessel and watch instead of an unrelated source calculation', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...alert, vessel_id: 99, coverage_vessel_id: 7,
      coverage_watch_group: 'Bordée 2', coverage_timezone: 'Europe/Paris' }], error: null });
    const rows = await fetchWorkingTimeCoverageAlerts({ rpc } as unknown as SupabaseClient, '2026-10-01', '2026-10-31');
    expect(rows[0]).toMatchObject({ vessel_id: 7, watch_group: 'Bordée 2', timezone_name: 'Europe/Paris' });
  });

  it('counts every uncovered local date from the complete assignment proof, with exclusive midnight bounds', () => {
    expect(workingTimeCoverageAlertDates(alert, '2026-10-01', '2026-10-31')).toEqual(['2026-10-13', '2026-10-14', '2026-10-16']);
    expect(workingTimeCoverageAlertDates(alert, '2026-10-14', '2026-10-15')).toEqual(['2026-10-14']);
  });

  it('retains a manual alert supplied by the authority outside assignments and fails explicitly when authority is unavailable', async () => {
    expect(workingTimeCoverageAlertDates({ ...alert, violation_codes: ['rest_24h'] }, '2026-10-01', '2026-10-31')).toEqual(['2026-10-15']);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await expect(fetchWorkingTimeCoverageAlerts({ rpc } as unknown as SupabaseClient, '2026-10-13', '2026-10-14')).rejects.toThrow('Impossible de vérifier');
  });
});
