import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSeaOperationProjectDocumentUrl, fetchSeaOperationProjectDocuments, loadSeaOperationProjectDocumentBlob, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';

const storageMocks = vi.hoisted(() => ({ adapter: vi.fn(), download: vi.fn() }));
vi.mock('../projects/projectDriveStorage', () => ({ projectDriveStorage: (client: unknown, bucket: string) => { storageMocks.adapter(client, bucket); return { download: storageMocks.download }; } }));

const document = { id: 'generated:41', project_id: '12', title: 'Procédure du chantier', file_name: 'procedure.pdf', mime_type: 'application/pdf',
  category_label: 'HSE', subcategory_label: 'Procédure', created_at: '2026-10-22T08:00:00Z', expires_on: null };

describe('sea operation project document queries', () => {
  it('reauthorizes bytes through the Sea RPC before passive storage reads and never launches a local connector', async () => {
    storageMocks.adapter.mockClear(); storageMocks.download.mockClear();
    const rpc = vi.fn().mockResolvedValue({ data: { bucket: 'project-files', path: 'projects/12/attachments/plan.pdf' }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const file: SeaOperationProjectDocument = { id: 'project:41', projectId: '12', title: 'Plan', fileName: 'plan.pdf', mimeType: 'application/pdf', categoryLabel: 'HSE', subcategoryLabel: '', createdAt: '2026-10-30', expiresOn: null };
    const bytes = new Blob(['authorized private bytes']); storageMocks.download.mockResolvedValue({ data: bytes, error: null });
    const signal = new AbortController().signal;
    const result = await loadSeaOperationProjectDocumentBlob(client, '12', file, signal);
    expect(rpc).toHaveBeenCalledWith('sea_operation_project_document_access', { p_project_id: '12', p_document_id: 'project:41' });
    expect(storageMocks.adapter).toHaveBeenCalledWith(client, 'project-files');
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(storageMocks.adapter.mock.invocationCallOrder[0]);
    expect(storageMocks.download).toHaveBeenCalledWith('projects/12/attachments/plan.pdf', signal, { allowLocalDrive: false });
    expect(await result.text()).toBe('authorized private bytes'); expect(result.type).toBe('application/pdf');
  });

  it('does not read bytes on an access denial, mismatched project or aborted request', async () => {
    storageMocks.adapter.mockClear(); storageMocks.download.mockClear();
    const denial = { code: '42501', message: 'Document non autorisé.' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: denial });
    const client = { rpc } as unknown as SupabaseClient;
    const file = { id: 'project:41', projectId: '12' } as SeaOperationProjectDocument;
    await expect(loadSeaOperationProjectDocumentBlob(client, '12', file)).rejects.toBe(denial);
    expect(storageMocks.adapter).not.toHaveBeenCalled();
    rpc.mockClear();
    await expect(loadSeaOperationProjectDocumentBlob(client, '13', file)).rejects.toThrow('ne correspond pas');
    expect(rpc).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(loadSeaOperationProjectDocumentBlob(client, '12', file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(rpc).not.toHaveBeenCalled(); expect(storageMocks.download).not.toHaveBeenCalled();
  });

  it('requests only the selected project projection and maps its operational metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [document], error: null });
    const rows = await fetchSeaOperationProjectDocuments({ rpc } as unknown as SupabaseClient, '12');
    expect(rpc).toHaveBeenCalledWith('sea_operation_project_documents', { p_project_id: '12' });
    expect(rows).toEqual([{ id: 'generated:41', projectId: '12', title: 'Procédure du chantier', fileName: 'procedure.pdf', mimeType: 'application/pdf',
      categoryLabel: 'HSE', subcategoryLabel: 'Procédure', createdAt: '2026-10-22T08:00:00Z', expiresOn: null }]);
  });

  it('keeps bigint project identities exact', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchSeaOperationProjectDocuments({ rpc } as unknown as SupabaseClient, '9007199254740993');
    expect(rpc).toHaveBeenCalledWith('sea_operation_project_documents', { p_project_id: '9007199254740993' });
  });

  it.each(['', '0', '-1', '1.5', '12/13', '9223372036854775808'])('rejects malformed project identity %s before calling the server', async (id) => {
    const rpc = vi.fn();
    await expect(fetchSeaOperationProjectDocuments({ rpc } as unknown as SupabaseClient, id)).rejects.toThrow('projet');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, [{ ...document, project_id: '13' }], [{ ...document, id: 'billing:41' }], [{ ...document, file_name: null }]])(
    'fails closed on invalid or cross-project document metadata', async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      await expect(fetchSeaOperationProjectDocuments({ rpc } as unknown as SupabaseClient, '12')).rejects.toThrow('réponse');
    },
  );

  it('revalidates the exact ID before signing only the authorized private location for five minutes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { bucket: 'project-files', path: 'projects/12/attachments/hse/procedure.pdf' }, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.example/document' }, error: null });
    const from = vi.fn(() => ({ createSignedUrl }));
    expect(await createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'generated:41')).toBe('https://private.example/document');
    expect(rpc).toHaveBeenCalledWith('sea_operation_project_document_access', { p_project_id: '12', p_document_id: 'generated:41' });
    expect(from).toHaveBeenCalledWith('project-files');
    expect(createSignedUrl).toHaveBeenCalledWith('projects/12/attachments/hse/procedure.pdf', 300);
  });

  it('uses registered private Drive aliases through the authenticated storage gateway', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { bucket: 'project-drive', path: '82' }, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'blob:https://app.example/local-file' }, error: null });
    const from = vi.fn(() => ({ createSignedUrl }));
    await createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'project:41');
    expect(from).toHaveBeenCalledWith('project-drive');
    expect(createSignedUrl).toHaveBeenCalledWith('82', 300);
  });

  it('stops on access refusal and never requests a cached or caller-supplied URL', async () => {
    const error = { code: '42501', message: 'Document inaccessible' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const from = vi.fn();
    await expect(createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'generated:41')).rejects.toBe(error);
    expect(from).not.toHaveBeenCalled();
  });

  it('opens a server-authorized historical SharePoint reference only within the existing trusted site', async () => {
    const url = 'https://bbtm668.sharepoint.com/sites/qhse/Documents/HSE/procedure.pdf';
    const rpc = vi.fn().mockResolvedValue({ data: { sharepoint_url: url }, error: null });
    const from = vi.fn();
    expect(await createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'project:41')).toBe(url);
    expect(from).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { sharepoint_url: 'https://bbtm668.sharepoint.com.evil.example/sites/qhse/private.pdf' }, error: null });
    await expect(createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'project:41')).rejects.toThrow('sécurisé');
  });

  it.each([{ bucket: 'hr-documents', path: 'private/person.pdf' }, { bucket: 'sharepoint', path: 'https://sharepoint.example/offer.pdf' },
    { bucket: 'project-files', path: 'projects/13/attachments/hse/foreign.pdf' }, { bucket: 'project-files', path: 'projects/12/../offer.pdf' },
    { bucket: 'project-drive', path: '../82' }])('rejects an unexpected server location without signing it', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const from = vi.fn();
    await expect(createSeaOperationProjectDocumentUrl({ rpc, storage: { from } } as unknown as SupabaseClient, '12', 'generated:41')).rejects.toThrow('sécurisé');
    expect(from).not.toHaveBeenCalled();
  });

  it('propagates storage denial without exposing an alternate link', async () => {
    const error = { message: 'forbidden' };
    const rpc = vi.fn().mockResolvedValue({ data: { bucket: 'project-files', path: 'projects/12/a.pdf' }, error: null });
    const client = { rpc, storage: { from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null, error }) }) } } as unknown as SupabaseClient;
    await expect(createSeaOperationProjectDocumentUrl(client, '12', 'generated:41')).rejects.toBe(error);
  });
});
