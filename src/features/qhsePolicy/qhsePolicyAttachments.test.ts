import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getQhsePolicyAttachmentUrl, readQhsePolicyAttachment, saveQhsePolicyObjectiveUpdateWithAttachments, validateQhsePolicyAttachmentFiles } from './qhsePolicyAttachments';
const objectiveId = 'a02c0000-0000-4000-8000-000000000002';
const updateId = 'a02c0000-0000-4000-8000-000000000003';
const uploadId = 'a02c0000-0000-4000-8000-000000000004';
const path = `1/${objectiveId}/${uploadId}.pdf`;
const draft = { objectiveId, progress: 50, occurredOn: '2026-10-01', note: 'Formation', expectedRevision: 1 };
const file = new File(['%PDF'], 'preuve.pdf', { type: 'application/pdf' });
const attachment = { id: uploadId, objectiveId, updateId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, storageBucket: 'qhse-policy-attachments', storagePath: path, createdAt: '2026-10-02' };
function mock() {
  const rpc = vi.fn().mockResolvedValueOnce({ data: [{ id: uploadId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size }], error: null }).mockResolvedValueOnce({ data: updateId, error: null });
  const upload = vi.fn().mockResolvedValue({ data: { path }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/file' }, error: null });
  const download = vi.fn().mockResolvedValue({ data: file, error: null });
  const from = vi.fn().mockReturnValue({ upload, remove, createSignedUrl, download });
  return { client: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, upload, remove, createSignedUrl, download };
}
describe('QHSE follow-up private attachments', () => {
  it('reserves server paths, uploads without replacement then atomically commits history and all tokens', async () => {
    const value = mock();
    expect(await saveQhsePolicyObjectiveUpdateWithAttachments(value.client, draft, [file])).toBe(updateId);
    expect(value.rpc).toHaveBeenNthCalledWith(1, 'qhse_policy_prepare_attachments', { p_objective_id: objectiveId, p_files: [{ file_name: 'preuve.pdf', mime_type: 'application/pdf', size_bytes: 4 }] });
    expect(value.upload).toHaveBeenCalledWith(path, file, { contentType: 'application/pdf', upsert: false });
    expect(value.rpc).toHaveBeenNthCalledWith(2, 'qhse_policy_add_objective_update_with_attachments', { p_objective_id: objectiveId, p_progress: 50, p_occurred_on: '2026-10-01', p_note: 'Formation', p_expected_revision: 1, p_upload_ids: [uploadId] });
    expect(value.remove).not.toHaveBeenCalled();
  });
  it('cleans all own staging files on failed upload and never commits the progression', async () => {
    const value = mock(); value.upload.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await expect(saveQhsePolicyObjectiveUpdateWithAttachments(value.client, draft, [file])).rejects.toThrow('transfert');
    expect(value.rpc).toHaveBeenCalledTimes(1); expect(value.remove).toHaveBeenCalledWith([path]);
  });
  it('cleans staging on stale revision while reporting no saved follow-up', async () => {
    const value = mock(); value.rpc.mockReset().mockResolvedValueOnce({ data: [{ id: uploadId, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size }], error: null }).mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    await expect(saveQhsePolicyObjectiveUpdateWithAttachments(value.client, draft, [file])).rejects.toThrow('modifié entre-temps');
    expect(value.remove).toHaveBeenCalledWith([path]);
  });
  it('uses the atomic writer without staging when the follow-up has no attachments', async () => {
    const value = mock(); value.rpc.mockReset().mockResolvedValueOnce({ data: updateId, error: null });
    expect(await saveQhsePolicyObjectiveUpdateWithAttachments(value.client, draft, [])).toBe(updateId);
    expect(value.upload).not.toHaveBeenCalled(); expect(value.rpc).toHaveBeenCalledTimes(1);
  });
  it('validates limits and safe current file extensions before any network call', async () => {
    const value = mock();
    for (const invalid of [new File(['x'], 'unsafe.html'), new File(['x'], '../preuve.pdf'), new File([], 'vide.pdf')]) await expect(saveQhsePolicyObjectiveUpdateWithAttachments(value.client, draft, [invalid])).rejects.toThrow();
    expect(() => validateQhsePolicyAttachmentFiles(Array.from({ length: 11 }, () => file))).toThrow('10');
    const big = new File(['x'], 'big.pdf'); Object.defineProperty(big, 'size', { value: 26214401 });
    expect(() => validateQhsePolicyAttachmentFiles([big])).toThrow('25 Mo');
    expect(validateQhsePolicyAttachmentFiles([new File(['x'], 'rapport.docx')])[0].mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(value.rpc).not.toHaveBeenCalled();
  });
  it('returns private signed links and complete original bytes; rejects incomplete or foreign paths', async () => {
    const value = mock();
    expect(await getQhsePolicyAttachmentUrl(value.client, attachment, true)).toBe('https://signed.test/file');
    expect(value.createSignedUrl).toHaveBeenCalledWith(path, 300, { download: 'preuve.pdf' });
    expect(await readQhsePolicyAttachment(value.client, attachment)).toBe(file);
    value.download.mockResolvedValueOnce({ data: new Blob(['x']), error: null });
    await expect(readQhsePolicyAttachment(value.client, attachment)).rejects.toThrow('intégralement');
    await expect(readQhsePolicyAttachment(value.client, { ...attachment, storagePath: '2/spoof.pdf' })).rejects.toThrow('invalide');
  });
});
