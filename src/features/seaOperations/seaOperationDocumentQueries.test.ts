import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSeaOperationProjectDocumentUrl, fetchSeaOperationProjectDocuments } from './seaOperationDocumentQueries';

const document = { id: 'generated:41', project_id: '12', title: 'Procédure du chantier', file_name: 'procedure.pdf', mime_type: 'application/pdf',
  category_label: 'HSE', subcategory_label: 'Procédure', created_at: '2026-10-22T08:00:00Z', expires_on: null };

describe('sea operation project document queries', () => {
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
