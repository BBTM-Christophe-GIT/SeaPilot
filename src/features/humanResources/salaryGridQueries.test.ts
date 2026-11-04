import { describe, expect, it, vi } from 'vitest';
import { loadHrSalaryGrid, saveHrSalaryGrid, type HrSalaryGridRow } from './salaryGridQueries';

const rows: HrSalaryGridRow[] = [{ id: 'fixture-poste', positionLabel: 'Poste fictif', ccn: 'Officier', enimCategory: '15',
  conventionalAnnualBase: 30000, indexationPercent: 10, annualGross: 33000, annualPremium: 3000, totalAnnualBase: 36000, active: true }];
const response = { company_id: 1, rows, revision: 3, updated_at: '2026-11-04T10:00:00Z' };

describe('private company salary grid queries', () => {
  it('loads the checked active-company grid without changing source annual values', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const grid = await loadHrSalaryGrid({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith('get_hr_salary_grid');
    expect(grid).toEqual({ companyId: 1, rows, revision: 3, updatedAt: response.updated_at });
    expect(grid.rows[0].totalAnnualBase).toBe(36000);
  });

  it('persists all editable source columns with the expected revision and returns the new revision', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, revision: 4 }, error: null });
    const grid = await saveHrSalaryGrid({ rpc } as never, rows, 3);
    expect(rpc).toHaveBeenCalledWith('save_hr_salary_grid', { p_rows: rows, p_expected_revision: 3 });
    expect(grid.revision).toBe(4);
    expect(grid.rows[0].totalAnnualBase).toBe(36000);
  });

  it('reports concurrent edits without overwriting or silently refreshing the reference grid', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '40001', message: 'Stale revision' } });
    await expect(saveHrSalaryGrid({ rpc } as never, rows, 3)).rejects.toThrow('La grille a changé');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('propagates role denials and refuses invalid revisions before issuing a save', async () => {
    const failure = new Error('Access denied');
    const rpc = vi.fn().mockResolvedValue({ data: null, error: failure });
    await expect(loadHrSalaryGrid({ rpc } as never)).rejects.toBe(failure);
    rpc.mockClear();
    await expect(saveHrSalaryGrid({ rpc } as never, rows, -1)).rejects.toThrow('Révision');
    expect(rpc).not.toHaveBeenCalled();
  });
});
