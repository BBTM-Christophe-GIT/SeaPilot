import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { deleteProjectDocument, fetchProjectDocumentDeletionSnapshot, type ProjectDocumentDeletionInput } from './projectDocumentDeletion';

const target = { projectId: 880, documentId: 'generated:91' };
const input: ProjectDocumentDeletionInput = { ...target, expected: {
  fileName: 'Rapport HSE.pdf', categoryKey: 'hse', subcategoryKey: 'hse_audits', storageBucket: 'project-files',
  storagePath: 'projects/880/attachments/report.pdf', sourceUrl: null, fileSizeBytes: 512, modifiedAt: '2026-10-30T08:00:00.123Z',
} };
const expectedDocument = { file_name: input.expected.fileName, category_key: 'hse', subcategory_key: 'hse_audits',
  storage_bucket: 'project-files', storage_path: input.expected.storagePath, source_url: null, file_size_bytes: 512, modified_at: input.expected.modifiedAt };
const response = { project_id: '880', document_id: 'generated:91' };

describe('project document logical deletion', () => {
  it('fetches the exact manager-authorized snapshot needed by both Project and Sea confirmations', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, expected_document: expectedDocument }, error: null });
    expect(await fetchProjectDocumentDeletionSnapshot({ rpc } as unknown as SupabaseClient, target)).toEqual(input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_document_deletion_snapshot', { target_project_id: '880', target_document_id: 'generated:91' });
  });

  it('sends the complete expected version and checks the namespaced acknowledgement without touching file storage', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, deleted_at: '2026-10-30T09:00:00.000+00:00' }, error: null });
    const storage = { from: vi.fn() };
    expect(await deleteProjectDocument({ rpc, storage } as unknown as SupabaseClient, input)).toEqual({ ...target, deletedAt: '2026-10-30T09:00:00.000+00:00' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_delete_document', { target_project_id: '880', target_document_id: 'generated:91', target_expected_document: expectedDocument });
    expect(storage.from).not.toHaveBeenCalled();
  });

  it('accepts historical references with missing metadata or invalid old URLs because deletion never fetches their bytes', async () => {
    const expected = { fileName: 'Historique.pdf', categoryKey: null, subcategoryKey: null, storageBucket: null, storagePath: null,
      sourceUrl: 'https://obsolete.example/unavailable.pdf', fileSizeBytes: null, modifiedAt: null };
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, deleted_at: '2026-10-30T09:00:00Z' }, error: null });
    await deleteProjectDocument({ rpc } as unknown as SupabaseClient, { ...target, expected });
    expect(rpc.mock.calls[0][1].target_expected_document).toEqual({ file_name: expected.fileName, category_key: null, subcategory_key: null,
      storage_bucket: null, storage_path: null, source_url: expected.sourceUrl, file_size_bytes: null, modified_at: null });
  });

  it.each([{ projectId: 0 }, { projectId: 1.2 }, { projectId: Number.MAX_SAFE_INTEGER + 1 }, { documentId: 'generated:0' },
    { documentId: 'other:91' }, { documentId: 'project:9223372036854775808' }])('rejects malformed targets before either RPC: %j', async invalid => {
    const rpc = vi.fn(); const client = { rpc } as unknown as SupabaseClient;
    await expect(fetchProjectDocumentDeletionSnapshot(client, { ...target, ...invalid })).rejects.toThrow('invalide');
    await expect(deleteProjectDocument(client, { ...input, ...invalid })).rejects.toThrow('invalide');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([{ fileName: '' }, { categoryKey: 12 }, { storagePath: undefined }, { fileSizeBytes: -1 }, { fileSizeBytes: 2.5 }, { modifiedAt: 'not-a-date' }])('rejects an incomplete or malformed confirmation version: %j', async invalid => {
    const rpc = vi.fn();
    await expect(deleteProjectDocument({ rpc } as unknown as SupabaseClient,
      { ...input, expected: { ...input.expected, ...invalid } } as ProjectDocumentDeletionInput)).rejects.toThrow('invalide');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { ...response, document_id: 'project:91' }, { ...response, project_id: '881' }])('rejects missing or cross-document acknowledgements: %j', async data => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(deleteProjectDocument({ rpc } as unknown as SupabaseClient, input)).rejects.toThrow();
    await expect(fetchProjectDocumentDeletionSnapshot({ rpc } as unknown as SupabaseClient, target)).rejects.toThrow();
  });

  it.each([null, {}, { ...expectedDocument, file_name: null }, { ...expectedDocument, file_size_bytes: '512' }])('rejects unconfirmed or malformed server versions: %j', async expected_document => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, expected_document }, error: null });
    await expect(fetchProjectDocumentDeletionSnapshot({ rpc } as unknown as SupabaseClient, target)).rejects.toThrow();
  });

  it('does not announce success for an unconfirmed deletion timestamp', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...response, deleted_at: 'invalid' }, error: null });
    await expect(deleteProjectDocument({ rpc } as unknown as SupabaseClient, input)).rejects.toThrow('pas été confirmée');
  });

  it.each([{ code: '42501', message: 'Suppression interdite.' }, { code: '40001', message: 'Le document a été modifié.' }])('preserves permission/conflict failures without retrying a write: %j', async error => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(deleteProjectDocument({ rpc } as unknown as SupabaseClient, input)).rejects.toMatchObject(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
