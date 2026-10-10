import { describe, expect, it, vi } from 'vitest';
import { fetchQhseReportProjectOptions, fetchQhseReportSnapshot } from './qhseReportData';

function createClient() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    projects: [
      { id: 1, project_code: 'P144', title: 'Projet clôturé', archived_at: '2026-10-10T10:00:00Z' },
      { id: 2, project_code: 'P145', title: 'Projet actif', archived_at: null },
    ],
    vessels: [{ id: 3, name: 'GOURY' }],
    dpr_reports: [{ id: 42, report_date: '2026-09-01', project_id: 1, vessel_id: 3, status: 'validated' }],
    dpr_daily_metrics: [{ dpr_id: 42, fuel_consumed_liters: 125 }],
  };
  const queries: Array<{ table: string; is: ReturnType<typeof vi.fn> }> = [];
  const from = vi.fn((table: string) => {
    let rows = tables[table] || [];
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    ['select', 'order', 'in', 'eq', 'gte', 'lte', 'limit'].forEach((method) => {
      query[method] = vi.fn(() => query);
    });
    const is = vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => value === null ? row[column] == null : row[column] === value);
      return query;
    });
    query.is = is;
    query.range = vi.fn((start: number, end: number) => Promise.resolve({ data: rows.slice(start, end + 1), error: null }));
    queries.push({ table, is });
    return query;
  });
  return { client: { from, rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never, queries };
}

describe('QHSE project lifecycle', () => {
  it('offers only active projects in the scope selector', async () => {
    const { client, queries } = createClient();
    expect(await fetchQhseReportProjectOptions(client)).toEqual([{ id: 2, label: 'P145 · Projet actif' }]);
    expect(queries.find((query) => query.table === 'projects')?.is).toHaveBeenCalledWith('archived_at', null);
  });

  it('retains closed project labels and consumption in historical reports', async () => {
    const { client, queries } = createClient();
    const snapshot = await fetchQhseReportSnapshot(client, { year: 2026, vesselId: null, vesselName: '' }, {
      actions: [], actionTypes: [], hseDashboard: null,
    });
    expect(snapshot.reports).toEqual([expect.objectContaining({ id: 42, projectId: 1, projectLabel: 'P144 · Projet clôturé' })]);
    expect(snapshot.metrics).toEqual([expect.objectContaining({ dprId: 42, fuelConsumedLiters: 125 })]);
    expect(queries.find((query) => query.table === 'projects')?.is).not.toHaveBeenCalledWith('archived_at', null);
  });
});
