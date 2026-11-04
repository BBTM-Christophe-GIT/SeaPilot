import { describe, expect, it, vi } from 'vitest';
import { canManageEmploymentContracts, createEmploymentContractSignedUrl, downloadEmploymentContract,
  loadEmploymentContracts, saveEmploymentContract, loadEmploymentContractDetails, saveEmploymentContractDetails, patchEmploymentContractDetails,
  downloadEmploymentContractSigner, loadEmploymentContractSigner, EMPLOYMENT_CONTRACT_BUCKET } from './employmentContractQueries';

const row = { id: 7, company_id: 1, person_id: 32, contract_type: 'CDD', title: 'Contrat CDD',
  file_name: 'Contrat CDD.pdf', storage_path: '1/people/32/00000000-0000-4000-8000-000000000001.pdf',
  file_size_bytes: 4, input_data: { firstName: 'Louise', salary: '2500' }, created_at: '2026-11-04T10:00:00Z' };

function clientFixture(insertError: Error | null = null) {
  const single = vi.fn().mockResolvedValue({ data: insertError ? null : row, error: insertError });
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const reconcile = vi.fn().mockResolvedValue({ data: null, error: null });
  const reconcileEq = vi.fn(() => ({ maybeSingle: reconcile }));
  const select = vi.fn(() => ({ eq: reconcileEq }));
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storageFrom = vi.fn(() => ({ upload, remove }));
  const client = { rpc: vi.fn().mockResolvedValue({ data: 1, error: null }), from: vi.fn(() => ({ insert, select })), storage: { from: storageFrom } };
  return { client, insert, upload, remove, storageFrom, single, reconcile, reconcileEq };
}

describe('confidential employment contracts', () => {
  it('loads sensitive contract details from their isolated RH record', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { input_data: { salary: '2500', socialSecurityNumber: '123456789' } }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
    expect(await loadEmploymentContractDetails({ from } as never, 32)).toEqual({ salary: '2500', socialSecurityNumber: '123456789' });
    expect(from).toHaveBeenCalledWith('hr_employment_contract_details');
    expect(eq).toHaveBeenCalledWith('person_id', 32);
    maybeSingle.mockResolvedValueOnce({ data: null, error: null } as never);
    expect(await loadEmploymentContractDetails({ from } as never, 32)).toBeNull();
  });

  it('saves contract-specific fields against the active company without modifying the public people catalogue', async () => {
    const from = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: { grossMonthlySalary: '2500', socialSecurityNumber: 'preserved' }, error: null });
    await saveEmploymentContractDetails({ from, rpc } as never, 32, { grossMonthlySalary: '2500' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('patch_hr_employment_contract_details', { p_person_id: 32, p_patch: { grossMonthlySalary: '2500' } });
    rpc.mockResolvedValueOnce({ error: new Error('RLS denied') } as never);
    await expect(saveEmploymentContractDetails({ from, rpc } as never, 32, {})).rejects.toThrow('RLS denied');
  });

  it('returns the server-merged details after patching a single independent field', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { grossMonthlySalary: '3000', socialSecurityNumber: 'preserved' }, error: null });
    expect(await patchEmploymentContractDetails({ rpc } as never, 32, { grossMonthlySalary: '3000' }))
      .toEqual({ grossMonthlySalary: '3000', socialSecurityNumber: 'preserved' });
    expect(rpc).toHaveBeenCalledWith('patch_hr_employment_contract_details', { p_person_id: 32, p_patch: { grossMonthlySalary: '3000' } });
  });

  it('permits only Admin and Direction regardless of ordinary HR management roles', () => {
    expect(canManageEmploymentContracts(['admin'])).toBe(true);
    expect(canManageEmploymentContracts(['direction'])).toBe(true);
    expect(canManageEmploymentContracts(['armement'])).toBe(false);
    expect(canManageEmploymentContracts(['capitaine'])).toBe(false);
    expect(canManageEmploymentContracts(['marin'])).toBe(false);
    expect(canManageEmploymentContracts([])).toBe(false);
  });

  it('uploads to the private company/person folder before registering the generated PDF document', async () => {
    const fixture = clientFixture();
    const file = new Blob(['%PDF'], { type: 'application/pdf' });
    const contract = await saveEmploymentContract(fixture.client as never, {
      personId: 32, contractType: 'CDD', fileName: 'Contrat CDD.pdf', file, inputData: row.input_data,
    });
    expect(fixture.storageFrom).toHaveBeenCalledWith(EMPLOYMENT_CONTRACT_BUCKET);
    expect(fixture.upload).toHaveBeenCalledWith(expect.stringMatching(/^1\/people\/32\/[a-f0-9-]{36}\.pdf$/), file,
      { contentType: 'application/pdf', upsert: false });
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: 1, person_id: 32,
      contract_type: 'CDD', input_data: row.input_data, file_name: 'Contrat CDD.pdf' }));
    expect(fixture.upload.mock.invocationCallOrder[0]).toBeLessThan(fixture.insert.mock.invocationCallOrder[0]);
    expect(contract).toMatchObject({ id: 7, personId: 32, inputData: row.input_data, storagePath: row.storage_path });
  });

  it('removes the uploaded object if metadata registration fails', async () => {
    const failure = new Error('RLS denied');
    const fixture = clientFixture(failure);
    await expect(saveEmploymentContract(fixture.client as never, { personId: 32, contractType: 'CDI',
      fileName: 'Contrat.pdf', file: new Blob(['%PDF'], { type: 'application/pdf' }), inputData: {} })).rejects.toBe(failure);
    expect(fixture.remove).toHaveBeenCalledWith([fixture.upload.mock.calls[0][0]]);
  });

  it('preserves and returns the committed contract when the insert response is lost', async () => {
    const fixture = clientFixture();
    fixture.single.mockRejectedValueOnce(new TypeError('Network response lost'));
    fixture.reconcile.mockResolvedValueOnce({ data: row, error: null } as never);
    const contract = await saveEmploymentContract(fixture.client as never, { personId: 32, contractType: 'CDD',
      fileName: 'Contrat.pdf', file: new Blob(['%PDF'], { type: 'application/pdf' }), inputData: {} });
    expect(contract.id).toBe(row.id);
    expect(fixture.reconcileEq).toHaveBeenCalledWith('storage_path', fixture.upload.mock.calls[0][0]);
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('retains the private PDF and directs the user to Documents when commitment cannot be confirmed', async () => {
    const fixture = clientFixture(new TypeError('Network response lost'));
    fixture.reconcile.mockResolvedValueOnce({ data: null, error: new TypeError('Lookup unavailable') } as never);
    await expect(saveEmploymentContract(fixture.client as never, { personId: 32, contractType: 'CDD',
      fileName: 'Contrat.pdf', file: new Blob(['%PDF'], { type: 'application/pdf' }), inputData: {} }))
      .rejects.toThrow('Le fichier a été conservé ; consultez Documents');
    expect(fixture.remove).not.toHaveBeenCalled();
  });

  it('stops before registration when Storage rejects an upload', async () => {
    const fixture = clientFixture();
    fixture.upload.mockResolvedValueOnce({ error: new Error('Storage denied') } as never);
    await expect(saveEmploymentContract(fixture.client as never, { personId: 32, contractType: 'CDI',
      fileName: 'Contrat.pdf', file: new Blob(['%PDF'], { type: 'application/pdf' }), inputData: {} })).rejects.toThrow('Storage denied');
    expect(fixture.insert).not.toHaveBeenCalled();
  });

  it('rejects empty and non-PDF documents before making a request', async () => {
    const fixture = clientFixture();
    for (const input of [{ fileName: 'Contrat.pdf', file: new Blob() },
      { fileName: 'Contrat.docx', file: new Blob(['word'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) },
      { fileName: 'Contrat.pdf', file: new Blob(['word'], { type: 'application/octet-stream' }) }]) {
      await expect(saveEmploymentContract(fixture.client as never, { personId: 32, contractType: 'CDI', inputData: {}, ...input })).rejects.toThrow('document PDF');
    }
    expect(fixture.client.rpc).not.toHaveBeenCalled();
  });

  it('loads only the requested profile and propagates access errors', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [row], error: null });
    const order = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ order })) })) };
    expect(await loadEmploymentContracts(client as never, 32)).toMatchObject([{ personId: 32, contractType: 'CDD' }]);
    expect(eq).toHaveBeenCalledWith('person_id', 32);
    eq.mockResolvedValueOnce({ data: null, error: new Error('Load failed') } as never);
    await expect(loadEmploymentContracts(client as never, 32)).rejects.toThrow('Load failed');
  });

  it('uses private authenticated download and short-lived signed URLs', async () => {
    const file = new Blob(['contract']);
    const download = vi.fn().mockResolvedValue({ data: file, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.test/signed' }, error: null });
    const from = vi.fn(() => ({ download, createSignedUrl }));
    const client = { storage: { from } };
    const contract = { storagePath: row.storage_path } as never;
    expect(await downloadEmploymentContract(client as never, contract)).toBe(file);
    expect(await createEmploymentContractSignedUrl(client as never, contract)).toBe('https://private.test/signed');
    expect(createSignedUrl).toHaveBeenCalledWith(row.storage_path, 60);
    expect(from).toHaveBeenCalledWith(EMPLOYMENT_CONTRACT_BUCKET);
  });

  it('loads Benjamin BON from the checked company RPC and downloads his existing private signature', async () => {
    const signatureRow = { id: 12, person_id: 33, signer_name: 'Benjamin BON', storage_bucket: 'working-time-signatures',
      storage_path: '1/33/existing-signature.png', mime_type: 'image/png', file_size_bytes: 5, sha256: 'a'.repeat(64) };
    const image = new Blob(['image'], { type: 'image/png' });
    const download = vi.fn().mockResolvedValue({ data: image, error: null });
    const from = vi.fn(() => ({ download }));
    const rpc = vi.fn().mockResolvedValue({ data: signatureRow, error: null });
    const result = await downloadEmploymentContractSigner({ rpc, storage: { from } } as never);
    expect(rpc).toHaveBeenCalledWith('hr_employment_contract_signer');
    expect(from).toHaveBeenCalledWith('working-time-signatures');
    expect(download).toHaveBeenCalledWith(signatureRow.storage_path);
    expect(result).toMatchObject({ blob: image, signature: { id: 12, personId: 33, signerName: 'Benjamin BON', sha256: 'a'.repeat(64) } });
  });

  it('fails closed on a missing, unauthorized or unexpected signer without any static image fallback', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('Signature absente') });
    await expect(loadEmploymentContractSigner({ rpc } as never)).rejects.toThrow('Signature absente');
    rpc.mockResolvedValueOnce({ data: { signer_name: 'Another person' }, error: null } as never);
    await expect(loadEmploymentContractSigner({ rpc } as never)).rejects.toThrow('signature privée de Benjamin BON');
  });
});
