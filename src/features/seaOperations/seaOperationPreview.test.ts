import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteProjectDocument, fetchProjectDocumentDeletionSnapshot } from '../projects/projectDocumentDeletion';
import { loadProjectDocumentBlob } from '../projects/projectDocumentAssets';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('native Sea operation document demonstration', () => {
  it('confirms the full version, rejects stale writes, then hides only the removed document and retries idempotently', async () => {
    const { seaOperationPreviewRpc: rpc, seaOperationPreviewDocumentLocationVisible: visible } = await import('./seaOperationPreview');
    const target = { target_project_id: '99101', target_document_id: 'project:991011' };
    const snapshot = rpc('projects_document_deletion_snapshot', target);
    expect(snapshot.error).toBeNull();
    const expected = (snapshot.data as { expected_document: Record<string, unknown> }).expected_document;
    expect(Object.keys(expected).sort()).toEqual(['file_name', 'category_key', 'subcategory_key', 'storage_bucket', 'storage_path', 'source_url', 'file_size_bytes', 'modified_at'].sort());
    expect(expected.file_name).toBe('exemple-document-projet.pdf');
    expect(rpc('projects_delete_document', { ...target, target_expected_document: { ...expected, file_name: 'stale.pdf' } }).error?.code).toBe('40001');
    expect(rpc('projects_delete_document', { ...target, target_expected_document: { ...expected, extra: true } }).error?.code).toBe('40001');
    expect(rpc('sea_operation_project_document_access', { p_project_id: '99101', p_document_id: 'project:991011' }).error).toBeNull();
    const deleted = rpc('projects_delete_document', { ...target, target_expected_document: expected });
    expect(deleted.error).toBeNull();
    expect(deleted.data).toMatchObject({ project_id: '99101', document_id: 'project:991011', deleted_at: expect.any(String) });
    expect(rpc('projects_delete_document', { ...target, target_expected_document: expected })).toEqual(deleted);
    expect(rpc('projects_document_deletion_snapshot', target).error?.code).toBe('42501');
    expect((rpc('sea_operation_project_documents', { p_project_id: '99101' }).data as { id: string }[]).map(item => item.id)).toEqual(['project:991012']);
    expect((rpc('sea_operation_project_documents', { p_project_id: '99102' }).data as { id: string }[]).map(item => item.id)).toEqual(['project:991021']);
    expect(rpc('sea_operation_project_document_access', { p_project_id: '99101', p_document_id: 'project:991011' }).error).not.toBeNull();
    expect(visible('project-files', String(expected.storage_path))).toBe(false);
    expect(visible('project-files', 'projects/99101/attachments/sea-operation-demo.webp')).toBe(true);
  });

  it('does not confuse another demo project or a different namespaced source with the confirmed file', async () => {
    const { seaOperationPreviewRpc: rpc, isSeaOperationPreviewProject } = await import('./seaOperationPreview');
    expect(isSeaOperationPreviewProject(99101)).toBe(true);
    expect(isSeaOperationPreviewProject('99102')).toBe(true);
    for (const value of ['99101-extra', '', 9001, null, {}]) expect(isSeaOperationPreviewProject(value)).toBe(false);
    for (const target of [
      { target_project_id: '99102', target_document_id: 'project:991011' },
      { target_project_id: '99101', target_document_id: 'generated:991011' },
      { target_project_id: '99101', target_document_id: 'project:999999' },
    ]) expect(rpc('projects_document_deletion_snapshot', target).error?.code).toBe('42501');
    expect((rpc('sea_operation_project_documents', { p_project_id: '99101' }).data as unknown[])).toHaveLength(2);
  });

  it('dispatches the shared confirmation/deletion client contract to native demo data and revokes subsequent storage access', async () => {
    const { previewSupabaseClient: client } = await import('../preview/previewSupabaseClient');
    const target = { projectId: 99101, documentId: 'project:991011' };
    const snapshot = await fetchProjectDocumentDeletionSnapshot(client, target);
    expect(snapshot.expected.fileName).toBe('exemple-document-projet.pdf');
    const removed = await deleteProjectDocument(client, snapshot);
    expect(await deleteProjectDocument(client, snapshot)).toEqual(removed);
    const listing = await client.rpc('sea_operation_project_documents', { p_project_id: 99101 });
    expect((listing.data as { id: string }[]).map(item => item.id)).toEqual(['project:991012']);
    expect((await client.rpc('sea_operation_project_document_access', { p_project_id: 99101, p_document_id: target.documentId })).error).not.toBeNull();
    const path = snapshot.expected.storagePath!;
    expect((await client.storage.from('project-files').createSignedUrl(path, 300)).error).toMatchObject({ code: '42501' });
    expect((await client.storage.from('project-files').download(path)).error).toMatchObject({ code: '42501' });
  });

  it('lets the private PDF reader reach the actual demo bytes without inventing a Drive mapping', async () => {
    const { previewSupabaseClient: client } = await import('../preview/previewSupabaseClient');
    const path = 'projects/99101/attachments/sea-operation-demo.pdf';
    expect(await client.rpc('document_drive_lookup', { target_bucket: 'project-files', target_path: path })).toEqual({ data: null, error: null });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('%PDF-1.7 Demo document bytes', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    const result = await loadProjectDocumentBlob(client, { fileName: 'exemple-document-projet.pdf', storageBucket: 'project-files', storagePath: path });
    expect(await result.text()).toBe('%PDF-1.7 Demo document bytes');
    expect(result.type).toBe('application/pdf');
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/demo/politique-qhse-demo.pdf');
  });
});
