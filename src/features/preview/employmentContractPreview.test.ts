import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewSupabaseClient } from './previewSupabaseClient';
import { createEmploymentContractPreview, EMPLOYMENT_PREVIEW_SALARY_ROWS } from './employmentContractPreview';
import { loadHrSalaryGrid, saveHrSalaryGrid } from '../humanResources/salaryGridQueries';
import { downloadEmploymentContract, downloadEmploymentContractSigner, loadEmploymentContractDetails,
  loadEmploymentContracts, saveEmploymentContract, saveEmploymentContractDetails } from '../humanResources/employmentContractQueries';

afterEach(() => vi.restoreAllMocks());

describe('isolated contract and salary preview', () => {
  it('ships ten explicitly fictitious salary rows without source company payroll amounts or position labels', async () => {
    expect(EMPLOYMENT_PREVIEW_SALARY_ROWS.map(row => row.positionLabel))
      .toEqual(Array.from({ length: 10 }, (_, index) => `Poste de démonstration ${index + 1}`));
    expect(EMPLOYMENT_PREVIEW_SALARY_ROWS.map(row => row.totalAnnualBase))
      .toEqual(Array.from({ length: 10 }, (_, index) => 36000 + 1200 * index));
    expect(EMPLOYMENT_PREVIEW_SALARY_ROWS.every(row => /^demo-poste-\d+$/.test(row.id))).toBe(true);
    expect((await loadHrSalaryGrid(previewSupabaseClient)).rows).toHaveLength(10);
  });

  it('provides synthetic details per demo employee and patches salary without losing SSN', async () => {
    const details = await loadEmploymentContractDetails(previewSupabaseClient, 9301);
    expect(details).toMatchObject({ socialSecurityNumber: 'DEMONSTRATION-9301', vesselNames: 'Navire de démonstration', grossMonthlySalary: '3000.00' });
    await saveEmploymentContractDetails(previewSupabaseClient, 9301, { grossMonthlySalary: '4500' });
    expect(await loadEmploymentContractDetails(previewSupabaseClient, 9301))
      .toMatchObject({ socialSecurityNumber: 'DEMONSTRATION-9301', grossMonthlySalary: '4500' });
    expect(await loadEmploymentContractDetails(previewSupabaseClient, 9303))
      .toMatchObject({ socialSecurityNumber: 'DEMONSTRATION-9303', grossMonthlySalary: '3000.00' });
    await expect(saveEmploymentContractDetails(previewSupabaseClient, 7, { grossMonthlySalary: '1' })).rejects.toMatchObject({ code: '22023' });
  });

  it('reuses only a synthetic signature image and never fetches a real signature or external service', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    const signer = await downloadEmploymentContractSigner(previewSupabaseClient);
    expect(signer.signature).toMatchObject({ id: 991401, personId: 991400, storagePath: 'preview-contracts/synthetic-signer.png', signerName: 'Benjamin BON' });
    expect(signer.blob.type).toBe('image/png');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('files and downloads an actual generated PDF blob in session memory for the correct demo employee', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    const file = new Blob(['%PDF synthetic preview'], { type: 'application/pdf' });
    const contract = await saveEmploymentContract(previewSupabaseClient, { personId: 9301, contractType: 'CDI',
      fileName: 'Contrat-CDI-ARTHUR-DEMO.pdf', file, inputData: { firstName: 'Arthur', socialSecurityNumber: 'DEMONSTRATION-9301' } });
    expect(contract.storagePath).toMatch(/^1\/people\/9301\/.+\.pdf$/);
    expect(await loadEmploymentContracts(previewSupabaseClient, 9301)).toContainEqual(contract);
    expect(await loadEmploymentContracts(previewSupabaseClient, 9303)).toEqual([]);
    expect(await downloadEmploymentContract(previewSupabaseClient, contract)).toBe(file);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains salary-grid revisions and rejects a stale demonstration save', async () => {
    const grid = await loadHrSalaryGrid(previewSupabaseClient);
    const rows = grid.rows.map((row, index) => index ? row : { ...row, totalAnnualBase: 51600 });
    const updated = await saveHrSalaryGrid(previewSupabaseClient, rows, grid.revision);
    expect(updated.revision).toBe(grid.revision + 1);
    expect(updated.rows[0].totalAnnualBase).toBe(51600);
    await expect(saveHrSalaryGrid(previewSupabaseClient, rows, grid.revision)).rejects.toThrow('La grille a changé');
  });

  it('discards private changes when a new preview session is created', () => {
    const options = { people: () => [{ id: 9301 }], signaturePng: () => new Blob(['synthetic'], { type: 'image/png' }) };
    const first = createEmploymentContractPreview(options);
    const second = createEmploymentContractPreview(options);
    first.rpc('patch_hr_employment_contract_details', { p_person_id: 9301, p_patch: { grossMonthlySalary: '9999' } });
    expect(second.rpc('patch_hr_employment_contract_details', { p_person_id: 9301, p_patch: {} })?.data)
      .toMatchObject({ grossMonthlySalary: '3000.00' });
  });

  it('updates one demo RH profile and returns its truthful single row while preserving ordinary reads', async () => {
    const before = await previewSupabaseClient.from('people').select('*');
    const changed = await previewSupabaseClient.from('people').update({ phone: 'DEMONSTRATION-UPDATED' }).eq('id', 9301).select('*').single();
    expect(changed.data).toMatchObject({ id: 9301, first_name: 'Arthur', phone: 'DEMONSTRATION-UPDATED' });
    const after = await previewSupabaseClient.from('people').select('*');
    expect(after.data).toHaveLength(before.data!.length);
    expect(after.data!.find(person => person.id === 9303)).toEqual(before.data!.find(person => person.id === 9303));
  });
});
