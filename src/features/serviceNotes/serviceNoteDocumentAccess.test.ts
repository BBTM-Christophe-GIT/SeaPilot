import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createPurchaseRequestAttachmentUrl, type PurchaseRequestAttachment } from '../purchaseRequests/purchaseRequestQueries';
import { buildServiceNoteDownloadArchive } from './serviceNoteDownloads';
import { createServiceNoteAttachmentUrl, createServiceNoteSourceUrl, fetchServiceNoteAttachmentBlob, type ServiceNote, type ServiceNoteAttachment } from './serviceNoteQueries';

const mapped = { blob_pathname: 'documents/imports/fixture.pdf', bytes: 4, sha256: 'a'.repeat(64), file_name: 'fixture.pdf', mime_type: 'application/pdf' };
const sourceUrl = 'https://fixture.sharepoint.com/Note.docx?web=1';
const freshUrl = 'https://fixture.private.blob.vercel-storage.com/documents/imports/fixture.pdf?signed=fresh';
const external: ServiceNoteAttachment = {
  id: 42, noteId: 24, kind: 'file', displayName: 'Annexe', externalUrl: 'https://fixture.sharepoint.com/annexe.pdf',
  storageBucket: '', storagePath: '', linkedRecordId: null, mimeType: 'application/pdf', fileSizeBytes: 4, sortOrder: 0,
};
const note = { id: 24, chronologyCode: 'NS 24', subject: 'Fixture', sourceWebUrl: sourceUrl, sourceFileName: 'Note.docx', attachments: [external] } as ServiceNote;
const purchase = { id: 32, storageBucket: '', storagePath: '', downloadUrl: 'https://fixture.sharepoint.com/purchase.pdf' } as PurchaseRequestAttachment;

function clientFixture(data: unknown = mapped, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: freshUrl }, error: null });
  const download = vi.fn().mockResolvedValue({ data: new Blob(['%PDF'], { type: 'application/pdf' }), error: null });
  const storageFrom = vi.fn(() => ({ createSignedUrl, download }));
  const from = vi.fn(() => { throw new Error('Historical linked provider must not be read'); });
  const client = { rpc, from, storage: { from: storageFrom } } as unknown as SupabaseClient;
  return { client, rpc, createSignedUrl, download, storageFrom, from };
}

describe('migrated external document readers', () => {
  it('opens a migrated purchase attachment by its record id with a fresh private URL', async () => {
    const { client, rpc, createSignedUrl, storageFrom } = clientFixture();
    await expect(createPurchaseRequestAttachmentUrl(client, purchase)).resolves.toBe(freshUrl);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('document_blob_lookup', { target_bucket: 'purchase-request-external', target_path: '32' });
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith('purchase-request-external');
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith('32', 120);
  });

  it('opens a migrated historical DOCX note source through HTTPS', async () => {
    const { client, rpc, createSignedUrl, storageFrom } = clientFixture({ ...mapped, file_name: 'Note.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await expect(createServiceNoteSourceUrl(client, note)).resolves.toBe(freshUrl);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('document_blob_lookup', { target_bucket: 'service-note-source', target_path: '24' });
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith('service-note-source');
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith('24', 900);
  });

  it('uses the original authenticated SharePoint URL for a genuinely unmapped note source', async () => {
    const { client, storageFrom } = clientFixture(null);
    await expect(createServiceNoteSourceUrl(client, note)).resolves.toBe(sourceUrl);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it('opens and downloads a migrated external note attachment before resolving any historical linked file', async () => {
    const { client, storageFrom, createSignedUrl, download, from } = clientFixture();
    await expect(createServiceNoteAttachmentUrl(client, external)).resolves.toBe(freshUrl);
    const file = await fetchServiceNoteAttachmentBlob(client, external);
    expect(file.filename).toBe('Annexe.pdf');
    expect(await file.blob.text()).toBe('%PDF');
    expect(storageFrom).toHaveBeenCalledWith('service-note-external');
    expect(createSignedUrl).toHaveBeenCalledWith('42', 900, undefined);
    expect(download).toHaveBeenCalledExactlyOnceWith('42');
    expect(from).not.toHaveBeenCalled();
  });

  it('puts the real migrated attachment bytes in the ZIP instead of an Internet shortcut', async () => {
    const { client, download } = clientFixture();
    const result = await buildServiceNoteDownloadArchive(client, note, false);
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(result.entries).toEqual(['Pieces jointes/Annexe.pdf']);
    expect(await archive.file(result.entries[0])?.async('string')).toBe('%PDF');
    expect(download).toHaveBeenCalledExactlyOnceWith('42');
  });

  it('keeps the historical link and shortcut only when the external attachment lookup is NULL', async () => {
    const { client, storageFrom } = clientFixture(null);
    await expect(createServiceNoteAttachmentUrl(client, external)).resolves.toBe(external.externalUrl);
    const file = await fetchServiceNoteAttachmentBlob(client, external);
    expect(file.filename).toBe('Annexe.url');
    expect(await file.blob.text()).toContain('URL=' + external.externalUrl);
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it.each([
    (client: SupabaseClient) => createPurchaseRequestAttachmentUrl(client, purchase),
    (client: SupabaseClient) => createServiceNoteSourceUrl(client, note),
    (client: SupabaseClient) => createServiceNoteAttachmentUrl(client, external),
    (client: SupabaseClient) => fetchServiceNoteAttachmentBlob(client, external),
  ])('never revives an original URL on a mapped permission refusal', async (read) => {
    const error = { code: '42501', message: 'Document access denied' };
    const { client, storageFrom, from } = clientFixture(null, error);
    await expect(read(client)).rejects.toBe(error);
    expect(storageFrom).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    (client: SupabaseClient) => createPurchaseRequestAttachmentUrl(client, purchase),
    (client: SupabaseClient) => createServiceNoteSourceUrl(client, note),
    (client: SupabaseClient) => createServiceNoteAttachmentUrl(client, external),
  ])('never revives an original URL when fresh signing fails after a successful lookup', async (read) => {
    const error = new Error('Signing refused');
    const { client, createSignedUrl } = clientFixture();
    createSignedUrl.mockResolvedValue({ data: null, error } as never);
    await expect(read(client)).rejects.toThrow('Signing refused');
  });
});
