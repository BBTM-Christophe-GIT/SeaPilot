// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkBillingAttachments, readBillingAttachment } from './projectBillingAttachments';
import type { ProjectBillingDocument } from './projectBilling';

const mocks = vi.hoisted(() => ({ download: vi.fn(), storage: vi.fn() }));
vi.mock('./projectDriveStorage', () => ({
  projectDriveStorage: (client: unknown, bucket: string) => { mocks.storage(client, bucket); return { download: mocks.download }; },
}));
const client = {} as Parameters<typeof checkBillingAttachments>[0];

function document(blob: Blob): ProjectBillingDocument {
  return { id: 23, billingPeriodId: 16, chargeableExpenseId: 19, documentKind: 'chargeable_expense', bucketName: 'project-files',
    objectPath: 'projects/2/16/expenses/19/original.pdf', fileName: 'Facture.pdf', mimeType: 'application/pdf', fileSizeBytes: blob.size };
}
async function pdfBlob(): Promise<Blob> {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
beforeEach(() => { vi.clearAllMocks(); mocks.download.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe('billing attachment verification', () => {
  it('checks an authorized PDF without opening the local connector by default', async () => {
    const blob = await pdfBlob();
    const file = document(blob);
    mocks.download.mockResolvedValue({ data: blob, error: null });

    expect(await checkBillingAttachments(client, [file])).toEqual([{ documentId: 23, fileName: 'Facture.pdf', status: 'available', message: 'Fichier vérifié.' }]);
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(file.objectPath, undefined, { allowLocalDrive: false });
    expect(mocks.storage).toHaveBeenCalledExactlyOnceWith(client, 'project-files');
  });

  it('allows the connector only when verification was explicitly requested', async () => {
    const blob = await pdfBlob();
    mocks.download.mockResolvedValue({ data: blob, error: null });
    await checkBillingAttachments(client, [document(blob)], { allowLocalDrive: true });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(document(blob).objectPath, undefined, { allowLocalDrive: true });
  });

  it.each([0, -1, Number.NaN])('marks invalid size metadata %s without reading the file', async (fileSizeBytes) => {
    const file = { ...document(new Blob(['file'])), fileSizeBytes };
    expect((await checkBillingAttachments(client, [file]))[0].status).toBe('invalid');
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it.each([
    [{ statusCode: '404', message: 'Fichier introuvable' }, 'missing'],
    [{ code: 'object_not_found', message: 'Fichier introuvable' }, 'missing'],
    [{ status: 403, message: 'Document introuvable' }, 'unavailable'],
    [{ statusCode: '401', message: 'Connexion requise' }, 'unavailable'],
    [{ code: '42501', statusCode: '404', message: 'Document inaccessible' }, 'unavailable'],
    [new Error('Fichier inaccessible. Vérifiez la synchronisation Google Drive.'), 'unavailable'],
  ] as const)('distinguishes provider error %j as %s without trying another source', async (error, status) => {
    mocks.download.mockRejectedValue(error);
    expect((await checkBillingAttachments(client, [document(new Blob(['file']))]))[0]).toMatchObject({ status, message: error.message });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('keeps a passive local-only file unverified and does not mistake its message for a missing file', async () => {
    const file = document(new Blob(['file']));
    const message = 'L’aperçu de ce document nécessite une copie privée accessible sans le connecteur SeaPilot.';
    mocks.download.mockRejectedValue(Object.assign(new Error(message), { code: 'LOCAL_DRIVE_REQUIRED' }));
    expect((await checkBillingAttachments(client, [file]))[0].status).toBe('unverified');
    mocks.download.mockRejectedValue(new Error(message));
    expect((await checkBillingAttachments(client, [file]))[0].status).toBe('unavailable');
  });

  it('reports a null download as missing and mismatched bytes as invalid', async () => {
    const file = document(new Blob(['file']));
    mocks.download.mockResolvedValueOnce({ data: null, error: null });
    expect((await checkBillingAttachments(client, [file]))[0].status).toBe('missing');
    mocks.download.mockResolvedValueOnce({ data: new Blob(['x']), error: null });
    expect((await checkBillingAttachments(client, [file]))[0].status).toBe('invalid');
  });

  it('rejects non-PDF bytes even when the extension claims they are PDF', async () => {
    const blob = new Blob(['this is not a PDF']);
    mocks.download.mockResolvedValue({ data: blob, error: null });
    expect((await checkBillingAttachments(client, [{ ...document(blob), mimeType: 'application/octet-stream' }]))[0])
      .toMatchObject({ status: 'invalid', message: 'Le fichier ne contient pas un PDF valide.' });
  });

  it('reports a PDF with no pages as invalid after parsing its real contents', async () => {
    const pdf = await PDFDocument.create();
    const bytes = await pdf.save({ addDefaultPage: false });
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    mocks.download.mockResolvedValue({ data: blob, error: null });
    expect((await checkBillingAttachments(client, [document(blob)]))[0]).toMatchObject({ status: 'invalid', message: 'Le PDF ne contient aucune page.' });
  });

  it('validates PDF contents for merging but preserves readable-header bytes for ZIP without a merge parse', async () => {
    const blob = await pdfBlob();
    mocks.download.mockResolvedValue({ data: blob, error: null });
    const load = vi.spyOn(PDFDocument, 'load').mockRejectedValue(new Error('Encrypted PDF'));
    expect((await readBillingAttachment(client, document(blob))).check.status).toBe('invalid');
    load.mockClear();
    expect((await readBillingAttachment(client, document(blob), { parsePdf: false })).check.status).toBe('available');
    expect(load).not.toHaveBeenCalled();
  });

  it('propagates an aborted verification instead of persisting an attachment issue', async () => {
    const controller = new AbortController();
    mocks.download.mockImplementation(async () => { controller.abort(); throw new DOMException('Cancelled', 'AbortError'); });
    await expect(checkBillingAttachments(client, [document(new Blob(['file']))], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.download.mock.calls[0][1]).toBe(controller.signal);
    mocks.download.mockClear();
    await expect(checkBillingAttachments(client, [document(new Blob(['file']))], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
