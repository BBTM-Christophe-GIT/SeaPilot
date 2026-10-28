import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchProjectSeaOperationDocuments, saveProjectSeaOperationDocuments } from './projectSeaOperationDocumentsQueries';

const document = {
  id: 'generated:41', project_id: '12', title: 'Procédure du chantier', file_name: 'procedure.pdf', mime_type: 'application/pdf',
  category_label: 'HSE', subcategory_label: 'Procédure', created_at: '2026-10-22T08:00:00Z', expires_on: null, selected: true,
};
const payload = { configured: false, documents: [document] };
const clientWith = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient;

describe('Project operational document selection queries', () => {
  it('requests the Project-authorized catalog and retains only typed document metadata and selection', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...payload, documents: [{ ...document, storage_path: 'private/path.pdf', file_url: 'https://private.example/file' }] }, error: null });
    expect(await fetchProjectSeaOperationDocuments(clientWith(rpc), 12)).toEqual({
      configured: false,
      documents: [{ id: 'generated:41', projectId: '12', title: 'Procédure du chantier', fileName: 'procedure.pdf', mimeType: 'application/pdf',
        categoryLabel: 'HSE', subcategoryLabel: 'Procédure', createdAt: '2026-10-22T08:00:00Z', expiresOn: null, selected: true }],
    });
    expect(rpc).toHaveBeenCalledWith('project_sea_operation_documents', { p_project_id: '12' });
  });

  it('saves an exact explicit selection, including historical IDs, and parses the authoritative returned selection', async () => {
    const returned = { configured: true, documents: [{ ...document, selected: false }, { ...document, id: 'project:42', selected: true }] };
    const rpc = vi.fn().mockResolvedValue({ data: returned, error: null });
    const ids = Object.freeze(['project:42']);
    const result = await saveProjectSeaOperationDocuments(clientWith(rpc), 12, ids);
    expect(rpc).toHaveBeenCalledWith('set_project_sea_operation_documents', { p_project_id: '12', p_document_ids: ['project:42'] });
    expect(result.configured).toBe(true);
    expect(result.documents.map(item => [item.id, item.selected])).toEqual([['generated:41', false], ['project:42', true]]);
    expect(ids).toEqual(['project:42']);
  });

  it('transmits an empty allow-list distinctly from an unconfigured catalog', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { configured: true, documents: [] }, error: null });
    expect(await saveProjectSeaOperationDocuments(clientWith(rpc), 12, [])).toEqual({ configured: true, documents: [] });
    expect(rpc).toHaveBeenCalledWith('set_project_sea_operation_documents', { p_project_id: '12', p_document_ids: [] });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe Project identity %s before requesting a catalog or changing selection', async projectId => {
    const rpc = vi.fn();
    await expect(fetchProjectSeaOperationDocuments(clientWith(rpc), projectId)).rejects.toThrow('projet');
    await expect(saveProjectSeaOperationDocuments(clientWith(rpc), projectId, [])).rejects.toThrow('projet');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['billing:41'], ['contract:41'], ['generated:0'], ['generated:-1'], ['project:1/2'], ['project:01'],
    ['project:9223372036854775808'], ['generated:41', 'generated:41'],
  ].map(ids => ({ ids })))('rejects malformed, unsupported or duplicate document identities before saving: $ids', async ({ ids }) => {
    const rpc = vi.fn();
    await expect(saveProjectSeaOperationDocuments(clientWith(rpc), 12, ids)).rejects.toThrow('sélection');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps maximum bigint document IDs as strings', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { configured: true, documents: [] }, error: null });
    await saveProjectSeaOperationDocuments(clientWith(rpc), 12, ['generated:9223372036854775807']);
    expect(rpc).toHaveBeenCalledWith('set_project_sea_operation_documents', { p_project_id: '12', p_document_ids: ['generated:9223372036854775807'] });
  });

  it.each([
    null, [], {}, { ...payload, configured: 'false' }, { ...payload, documents: null },
    { ...payload, documents: [{ ...document, project_id: '13' }] },
    { ...payload, documents: [{ ...document, id: 'billing:41' }] },
    { ...payload, documents: [{ ...document, selected: 'true' }] },
    { ...payload, documents: [{ ...document, selected: undefined }] },
    { ...payload, documents: [{ ...document, file_name: null }] },
    { ...payload, documents: [{ ...document, subcategory_label: null }] },
    { ...payload, documents: [null] },
    { ...payload, documents: [document, document] },
  ])('fails closed on malformed, duplicate or cross-project response metadata', async data => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(fetchProjectSeaOperationDocuments(clientWith(rpc), 12)).rejects.toThrow('invalide');
    await expect(saveProjectSeaOperationDocuments(clientWith(rpc), 12, ['generated:41'])).rejects.toThrow('invalide');
  });

  it('propagates a server refusal and never falls back to the operational reader catalog', async () => {
    const error = { code: '42501', message: 'Gestion inaccessible' };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error });
    await expect(fetchProjectSeaOperationDocuments(clientWith(rpc), 12)).rejects.toBe(error);
    await expect(saveProjectSeaOperationDocuments(clientWith(rpc), 12, [])).rejects.toBe(error);
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['project_sea_operation_documents', 'set_project_sea_operation_documents']);
  });
});
