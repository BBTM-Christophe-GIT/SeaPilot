// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { auditDueOnFromDuration } from '../internalAudits/internalAuditModel';
import { defaultDocumentaryDuration, documentaryFindingIssues, documentaryFindingOverdue, type DocumentaryAudit, type DocumentaryFinding } from './documentaryAuditModel';
import { discardDocumentaryUploads, documentaryFileMime, documentaryFileReferences, hydrateDocumentaryFiles, uploadDocumentaryFiles, validateDocumentaryFiles } from './documentaryAuditFiles';
import { addDocumentaryTreatment, fetchDocumentaryAuditData, mapDocumentaryAudit, saveDocumentaryAudit, saveDocumentaryFinding } from './documentaryAuditQueries';

const audit: DocumentaryAudit = { id: 'audit', companyId: 7, siteId: '12', kind: 'ovid', year: 2026, title: 'OVID 2026', plannedOn: null, auditedOn: null, auditorName: '', files: [], createdAt: '', updatedAt: '' };
const finding: DocumentaryFinding = { id: 'finding', companyId: 7, auditId: audit.id, reference: 'F1', category: 'major', description: 'Contrôle requis', assigneePersonId: 42, assigneeRole: null, assigneeVesselId: null, assigneeLabel: 'Responsable', openedOn: '2026-10-01', dueOn: '2026-10-08', treatmentDelayValue: 1, treatmentDelayUnit: 'weeks', status: 'open', treatment: '', resolvedAt: null, closedAt: null, files: [] };
const pdf = () => new File(['%PDF-1.7\n'], 'audit.pdf', { type: 'application/pdf' });
function mockClient() {
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const remove = vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
  const signed = vi.fn().mockImplementation(async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: 'https://signed.example/file' })), error: null }));
  const from = vi.fn().mockReturnValue({ upload, remove, createSignedUrls: signed });
  const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
  const client = { storage: { from }, auth: { getUser }, rpc } as unknown as SupabaseClient;
  return { client, upload, remove, signed, rpc, getUser, from };
}
describe('documentary audit defaults and validation', () => {
  it('uses a week, a calendar month and optional deadlines with month-end clamping', () => {
    expect(auditDueOnFromDuration('2026-01-31', defaultDocumentaryDuration('major'))).toBe('2026-02-07');
    expect(auditDueOnFromDuration('2026-01-31', defaultDocumentaryDuration('minor'))).toBe('2026-02-28');
    for (const category of ['remark', 'finding'] as const) expect(defaultDocumentaryDuration(category)).toBeNull();
    expect(documentaryFindingOverdue({ ...finding, category: 'remark', dueOn: null }, '2030-01-01')).toBe(false);
  });
  it('requires one real assignee and complete optional durations', () => {
    expect(documentaryFindingIssues({ ...finding, assigneeRole: 'captain', assigneeVesselId: 12 })).toContain('Désignez une personne ou une fonction sur un navire.');
    expect(documentaryFindingIssues({ ...finding, category: 'remark' })).toContain('Une remarque ne comporte pas de délai.');
    expect(documentaryFindingIssues({ ...finding, category: 'finding', dueOn: null, treatmentDelayUnit: null })).toContain('Le délai est invalide.');
    expect(documentaryFindingIssues({ ...finding, category: 'finding', dueOn: null, treatmentDelayUnit: null, treatmentDelayValue: null })).toEqual([]);
  });
});
describe('documentary file storage', () => {
  it('accepts missing browser MIME only for a known extension and rejects spoofed content before upload', async () => {
    expect(documentaryFileMime(new File(['%PDF-1.7'], 'audit.pdf'))).toBe('application/pdf');
    const mock = mockClient();
    await expect(uploadDocumentaryFiles(mock.client, { companyId: 7, auditId: 'a', recordId: 'a', kind: 'audit' }, [pdf(), new File(['<svg/>'], 'faux.pdf', { type: 'application/pdf' })])).rejects.toThrow('ne correspond pas');
    expect(mock.upload).not.toHaveBeenCalled(); expect(mock.getUser).not.toHaveBeenCalled();
  });
  it('rejects executable content, empty files, limits and excessive batches', async () => {
    await expect(validateDocumentaryFiles([new File(['MZ'], 'run.exe')])).rejects.toThrow('Utilisez un PDF');
    await expect(validateDocumentaryFiles([new File([], 'empty.pdf')])).rejects.toThrow('limite');
    await expect(validateDocumentaryFiles([{ name: 'large.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 } as File])).rejects.toThrow('10 Mo');
    await expect(validateDocumentaryFiles([{ name: 'large.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 + 1 } as File])).rejects.toThrow('25 Mo');
    await expect(validateDocumentaryFiles(Array.from({ length: 11 }, pdf))).rejects.toThrow('10 fichiers');
  });
  it('keeps the scope and actor in immutable paths and cleans partial failed uploads', async () => {
    const mock = mockClient(); mock.upload.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: null, error: new Error('Storage indisponible') });
    await expect(uploadDocumentaryFiles(mock.client, { companyId: 7, auditId: 'a', recordId: 'f', kind: 'closure' }, [pdf(), pdf()])).rejects.toThrow('Storage indisponible');
    const path = mock.upload.mock.calls[0][0]; expect(path).toMatch(/^7\/a\/f\/closure\/actor\/[\w-]+\.pdf$/);
    expect(mock.upload.mock.calls[0][2].upsert).toBe(false); expect(mock.remove).toHaveBeenCalledWith([path]);
  });
  it('does not claim cleanup succeeded if RLS retained a saved proof', async () => {
    const mock = mockClient(); mock.remove.mockResolvedValue({ data: [], error: null });
    expect(await discardDocumentaryUploads(mock.client, [{ id: 'f', fileName: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 1, storagePath: 'linked', url: '' }])).toBe(false);
  });
  it('never persists signed URLs and keeps history readable during a Storage outage', async () => {
    const mock = mockClient(); const file = { id: 'f', fileName: 'f.pdf', mimeType: 'application/pdf', sizeBytes: 1, storagePath: 'path', url: 'https://secret-signature' };
    expect(documentaryFileReferences([file])[0]).not.toHaveProperty('url');
    mock.signed.mockRejectedValue(new Error('offline')); await expect(hydrateDocumentaryFiles(mock.client, [file])).resolves.toBeUndefined();
  });
});
describe('documentary RPC contracts', () => {
  it('maps planned and actual dates independently and treats legacy planned fields as absent', () => {
    const row = { id: 'audit', company_id: 7, kind: 'ovid', site_id: 12, year: 2026, title: 'OVID', planned_on: '2026-10-05', audited_on: '2026-10-09' };
    expect(mapDocumentaryAudit(row)).toMatchObject({ plannedOn: '2026-10-05', auditedOn: '2026-10-09', siteId: '12' });
    expect(mapDocumentaryAudit({ ...row, planned_on: null }).plannedOn).toBeNull();
    expect(mapDocumentaryAudit({ audited_on: '2026-10-09' }).plannedOn).toBeNull();
  });
  it('saves and clears planned dates explicitly while retaining the separate actual date', async () => {
    const mock = mockClient();
    mock.rpc.mockResolvedValue({ data: { id: audit.id, company_id: 7, kind: 'ovid', site_id: 12, year: 2026, title: 'OVID', planned_on: '2026-02-28', audited_on: '2026-03-02' }, error: null });
    expect(await saveDocumentaryAudit(mock.client, { ...audit, plannedOn: '2026-02-28', auditedOn: '2026-03-02' })).toMatchObject({ plannedOn: '2026-02-28', auditedOn: '2026-03-02' });
    expect(mock.rpc).toHaveBeenLastCalledWith('documentary_audit_save', expect.objectContaining({ p_payload: expect.objectContaining({ plannedOn: '2026-02-28', auditedOn: '2026-03-02' }) }));
    await saveDocumentaryAudit(mock.client, { ...audit, plannedOn: null, auditedOn: '2026-03-02' });
    expect(mock.rpc).toHaveBeenLastCalledWith('documentary_audit_save', expect.objectContaining({ p_payload: expect.objectContaining({ plannedOn: null, auditedOn: '2026-03-02' }) }));
  });
  it('rejects impossible and non-date planning values before uploading files or calling the server', async () => {
    const mock = mockClient();
    for (const plannedOn of ['2026-02-30', '2026-13-01', '2026-10-01T08:00:00Z', '']) {
      await expect(saveDocumentaryAudit(mock.client, { ...audit, plannedOn }, [pdf()])).rejects.toThrow('date prévue valide');
    }
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('passes the selected audit family and trusts only server treatment permissions', async () => {
    const mock = mockClient(); mock.rpc.mockResolvedValue({ data: { company_id: 7, sites: [{ id: 12, company_id: 7, name: 'LE ROZEL', kind: 'vessel', vessel_id: 12 }], audits: [], findings: [], events: [], people: [], permissions: { canManage: false, treatableFindingIds: ['f1'] } }, error: null });
    const data = await fetchDocumentaryAuditData(mock.client, 'external_ism'); expect(data.sites[0].id).toBe('12'); expect(data.permissions).toEqual({ canManage: false, treatableFindingIds: ['f1'] });
    expect(mock.rpc).toHaveBeenCalledWith('documentary_audits_overview', { p_kind: 'external_ism' });
  });
  it('propagates authorization denial rather than replacing it with empty data', async () => {
    const mock = mockClient(); const error = { message: 'Dossier inaccessible', code: '42501' }; mock.rpc.mockResolvedValue({ data: null, error });
    await expect(fetchDocumentaryAuditData(mock.client, 'ovid')).rejects.toBe(error);
  });
  it('validates finding assignees and annual dossier before calling the server', async () => {
    const mock = mockClient(); await expect(saveDocumentaryFinding(mock.client, { ...finding, assigneePersonId: null })).rejects.toThrow('Désignez');
    await expect(saveDocumentaryAudit(mock.client, { ...audit, year: 1890 })).rejects.toThrow('année valide'); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('transmits treatment evidence with the authorized scope and reports ambiguous saved uploads', async () => {
    const mock = mockClient(); mock.rpc.mockResolvedValueOnce({ data: { company_id: 7, audit_id: 'audit' }, error: null }).mockResolvedValueOnce({ data: null, error: new Error('réponse perdue') });
    mock.remove.mockResolvedValue({ data: [], error: null });
    await expect(addDocumentaryTreatment(mock.client, 'finding', 'closed', '', [pdf()])).rejects.toThrow('rechargez');
    expect(mock.rpc.mock.calls[0]).toEqual(['documentary_audit_upload_scope', { p_audit_id: null, p_finding_id: 'finding', p_kind: 'closure' }]);
    expect(mock.rpc.mock.calls[1][1].p_files[0]).not.toHaveProperty('url'); expect(mock.rpc.mock.calls[1][1].p_status).toBe('closed');
  });
});
