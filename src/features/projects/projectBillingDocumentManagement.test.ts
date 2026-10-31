// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProjectBillingDocument, replaceProjectBillingDocument, type ProjectBillingDocument } from './projectBilling';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), storage: vi.fn() }));
vi.mock('./projectDriveStorage', () => ({
  projectDriveStorage: (client: unknown, bucket: string) => {
    mocks.storage(client, bucket);
    return { upload: mocks.upload, remove: mocks.remove };
  },
}));

type Row = Record<string, unknown>;
const oldRow = {
  id: 23, company_id: 1, project_id: 2, billing_period_id: 16, chargeable_expense_id: 19,
  document_kind: 'chargeable_expense', bucket_name: 'project-files', object_path: 'projects/2/16/expenses/19/missing-original.pdf',
  file_name: 'Facture initiale.pdf', mime_type: 'application/pdf', file_size_bytes: 0, created_by: 'original-uploader',
};
const oldDocument: ProjectBillingDocument = {
  id: 23, billingPeriodId: 16, chargeableExpenseId: 19, documentKind: 'chargeable_expense', bucketName: 'project-files',
  objectPath: oldRow.object_path, fileName: oldRow.file_name, mimeType: 'application/pdf', fileSizeBytes: 0,
};
let fixtureNumber = 0;
function fixture(options: {
  row?: Row | null;
  denyWrite?: boolean;
  denyRead?: boolean;
  changeBeforeWrite?: Partial<Row>;
  transportFailure?: 'before-update' | 'after-update';
  updateFailure?: { code: string; committed: boolean };
} = {}) {
  let row: Row | null = options.row === null ? null : { ...(options.row || oldRow) };
  const requests: { method: string; filters: Record<string, string>; body?: Row }[] = [];
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const denied = () => respond({ code: '42501', message: 'Permission refusée pour cette pièce jointe', details: '', hint: '' }, 403);
  const fetcher = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(request));
    expect(url.pathname).toBe('/rest/v1/project_billing_documents');
    const method = init?.method || 'GET';
    const filters = Object.fromEntries(url.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) as Row : undefined;
    requests.push({ method, filters, body });
    if (method === 'GET' && options.denyRead || method !== 'GET' && options.denyWrite) return denied();
    if (method !== 'GET' && options.changeBeforeWrite && row) row = { ...row, ...options.changeBeforeWrite };
    const matches = row && Object.entries(filters).every(([key, value]) => key === 'select' || value === `eq.${row![key]}`);
    const selected = matches ? { ...row } : null;
    if (method === 'PATCH') {
      if (options.transportFailure === 'before-update') throw new TypeError('Failed to fetch');
      if (options.updateFailure) {
        if (matches && options.updateFailure.committed) row = { ...row, ...body };
        return respond({ code: options.updateFailure.code, message: 'Résultat de la mise à jour indisponible', details: '', hint: '' }, 400);
      }
      if (matches) row = { ...row, ...body };
      if (options.transportFailure === 'after-update') throw new TypeError('Failed to fetch');
    } else if (method === 'DELETE') {
      if (matches) row = null;
    } else if (method !== 'GET') throw new Error(`Unexpected method ${method}`);
    const result = method === 'PATCH' ? matches ? row : null : selected;
    const value = result && filters.select === 'id' ? { id: result.id } : result;
    const wantsObject = new Headers(init?.headers).get('Accept')?.includes('object');
    return respond(wantsObject ? value : value ? [value] : []);
  });
  const client = createClient('https://billing-documents.example.invalid', 'fixture-publishable-key', {
    global: { fetch: fetcher }, auth: { storageKey: `billing-document-fixture-${++fixtureNumber}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, requests, row: () => row };
}
const target = { projectId: 2, expenseId: 19, document: oldDocument };
const replacement = () => new File(['replacement bytes'], 'Facture corrigée.pdf', { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.remove.mockReset().mockResolvedValue({ error: null });
});

describe('billing expense document deletion', () => {
  it('unlinks the exact document even when its old binary is absent, without touching archives', async () => {
    const server = fixture();
    await deleteProjectBillingDocument(server.client, target);
    expect(server.row()).toBeNull();
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatchObject({ method: 'DELETE', filters: {
      id: 'eq.23', project_id: 'eq.2', chargeable_expense_id: 'eq.19', document_kind: 'eq.chargeable_expense',
      bucket_name: 'eq.project-files', object_path: `eq.${oldDocument.objectPath}`, select: 'id',
    } });
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it('preserves the row after a manager-permission refusal', async () => {
    const server = fixture({ denyWrite: true });
    await expect(deleteProjectBillingDocument(server.client, target)).rejects.toMatchObject({ code: '42501' });
    expect(server.row()).toEqual(oldRow);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not delete another project’s document or a concurrently replaced reference', async () => {
    const foreign = fixture();
    await expect(deleteProjectBillingDocument(foreign.client, { ...target, projectId: 999 })).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_CONFLICT' });
    expect(foreign.row()).toEqual(oldRow);
    const concurrent = fixture({ changeBeforeWrite: { bucket_name: 'sharepoint', object_path: 'new-concurrent-reference' } });
    await expect(deleteProjectBillingDocument(concurrent.client, target)).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_CONFLICT' });
    expect(concurrent.row()).toMatchObject({ bucket_name: 'sharepoint', object_path: 'new-concurrent-reference' });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects a document belonging to a different expense before contacting the database', async () => {
    const server = fixture();
    await expect(deleteProjectBillingDocument(server.client, { ...target, expenseId: 20 })).rejects.toThrow('frais sélectionné');
    expect(server.requests).toEqual([]);
  });
});

describe('billing expense document replacement', () => {
  it('uploads first and atomically updates the same legacy row without inserting or deleting another document', async () => {
    const legacyRow = { ...oldRow, bucket_name: 'sharepoint', object_path: 'https://example.sharepoint.com/legacy/invoice.pdf' };
    const document = { ...oldDocument, bucketName: legacyRow.bucket_name, objectPath: legacyRow.object_path };
    const server = fixture({ row: legacyRow });
    const file = replacement();
    mocks.upload.mockImplementation(async () => {
      expect(server.row()).toEqual(legacyRow);
      expect(server.requests.map((request) => request.method)).toEqual(['GET']);
      return { error: null };
    });
    const result = await replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, document, file });

    expect(result).toMatchObject({ id: 23, chargeableExpenseId: 19, billingPeriodId: 16, bucketName: 'project-files', fileName: file.name, fileSizeBytes: file.size });
    expect(result.objectPath).toMatch(/^projects\/2\/16\/expenses\/19\/[a-f0-9-]{36}-Facture-corrigee\.pdf$/);
    expect(server.row()).toMatchObject({ id: 23, project_id: 2, chargeable_expense_id: 19, created_by: oldRow.created_by, object_path: result.objectPath });
    expect(server.requests.map((request) => request.method)).toEqual(['GET', 'PATCH']);
    expect(server.requests[1].filters).toMatchObject({ bucket_name: 'eq.sharepoint', object_path: `eq.${legacyRow.object_path}`, project_id: 'eq.2', chargeable_expense_id: 'eq.19', id: 'eq.23' });
    expect(mocks.upload).toHaveBeenCalledExactlyOnceWith(result.objectPath, file, { cacheControl: '3600', contentType: 'application/pdf', upsert: false });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(document.objectPath).toBe(legacyRow.object_path);
  });

  it('keeps the old reference when the new upload is refused', async () => {
    const server = fixture();
    mocks.upload.mockResolvedValue({ error: { code: '42501', message: 'Téléversement refusé' } });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: '42501' });
    expect(server.row()).toEqual(oldRow);
    expect(server.requests.map((request) => request.method)).toEqual(['GET']);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('cleans up only the new address after a confirmed database permission refusal', async () => {
    const server = fixture({ denyWrite: true });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: '42501' });
    expect(server.row()).toEqual(oldRow);
    const newPath = mocks.upload.mock.calls[0][0];
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([newPath]);
    expect(newPath).not.toBe(oldDocument.objectPath);
  });

  it('preserves a concurrent replacement and cleans up the losing upload', async () => {
    const concurrentPath = 'projects/2/16/expenses/19/concurrent.pdf';
    const server = fixture({ changeBeforeWrite: { object_path: concurrentPath } });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_CONFLICT' });
    expect(server.row()?.object_path).toBe(concurrentPath);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
  });

  it.each([null, { ...oldRow, project_id: 999 }])('does not upload against a missing or foreign target %j', async (row) => {
    const server = fixture({ row });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: 'BILLING_DOCUMENT_CONFLICT' });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('honours a read refusal before creating any replacement bytes', async () => {
    const server = fixture({ denyRead: true });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: '42501' });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects an empty replacement before any write or upload', async () => {
    const server = fixture();
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: new File([], 'empty.pdf') })).rejects.toThrow('fichier non vide');
    expect(server.requests).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('reconciles an UPDATE whose response was lost without deleting the newly linked bytes', async () => {
    const server = fixture({ transportFailure: 'after-update' });
    const result = await replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() });
    expect(result.id).toBe(23);
    expect(server.row()?.object_path).toBe(result.objectPath);
    expect(server.requests.map((request) => request.method)).toEqual(['GET', 'PATCH', 'GET']);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('keeps bytes when an interrupted UPDATE cannot be confirmed, preserving the original reference', async () => {
    const server = fixture({ transportFailure: 'before-update' });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toThrow('Actualisez les frais');
    expect(server.row()).toEqual(oldRow);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['40003', '08006', '08007', 'PGRST116'])('reconciles committed %s without cleaning up newly linked bytes', async (code) => {
    const server = fixture({ updateFailure: { code, committed: true } });
    const result = await replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() });
    expect(result.id).toBe(23);
    expect(server.row()?.object_path).toBe(result.objectPath);
    expect(server.requests.map((request) => request.method)).toEqual(['GET', 'PATCH', 'GET']);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['40003', '08006', '08007', 'PGRST116'])('preserves bytes and the old reference when %s remains unconfirmed', async (code) => {
    const server = fixture({ updateFailure: { code, committed: false } });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() }))
      .rejects.toThrow('Le remplacement n’a pas pu être confirmé');
    expect(server.row()).toEqual(oldRow);
    expect(server.requests.map((request) => request.method)).toEqual(['GET', 'PATCH', 'GET']);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each(['23503', '23505', '23514'])('cleans up only the new upload for the confirmed integrity refusal %s', async (code) => {
    const server = fixture({ updateFailure: { code, committed: false } });
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code });
    expect(server.row()).toEqual(oldRow);
    expect(server.requests.map((request) => request.method)).toEqual(['GET', 'PATCH']);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]]);
  });

  it('preserves the primary write failure if cleanup itself is unavailable', async () => {
    const server = fixture({ denyWrite: true });
    mocks.remove.mockRejectedValue(new Error('Nettoyage indisponible'));
    await expect(replaceProjectBillingDocument(server.client, { ...target, billingPeriodId: 16, file: replacement() })).rejects.toMatchObject({ code: '42501' });
    expect(server.row()).toEqual(oldRow);
  });
});
