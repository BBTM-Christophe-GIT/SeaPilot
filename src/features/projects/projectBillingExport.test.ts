// @vitest-environment node
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBillingExportPackage, type BillingExportInput, type ProjectBillingDocument } from './projectBilling';
import { BillingAttachmentExportError } from './projectBillingAttachments';

const mocks = vi.hoisted(() => ({ download: vi.fn(), storage: vi.fn() }));
vi.mock('./projectDriveStorage', () => ({
  projectDriveStorage: (client: unknown, bucket: string) => {
    mocks.storage(client, bucket);
    return { download: mocks.download };
  },
}));

const client = {} as Parameters<typeof generateBillingExportPackage>[0];
const missingNames = [
  '2026-09-30 - R202601553 - Frais de Port.PDF',
  '2026-10-06 - 061000174 - Fuel.pdf',
  '2026-10-14 - R202601622 - Frais de Port.PDF',
];

function billingInput(): BillingExportInput {
  return {
    project: {
      id: 2, title: 'GUARD VESSEL EMDT', projectCode: 'P144', clientId: 1,
      clientSharePointItemId: '', clientName: 'EMDT', primaryVesselId: 3,
      primaryVesselSharePointItemId: '', primaryVesselName: 'GOURY', secondaryVesselId: null,
      secondaryVesselSharePointItemId: '', secondaryVesselName: '', startsOn: '2024-06-01',
      endsOn: '2026-10-31', deliveryAt: '', redeliveryAt: '', charterStartsAt: '', charterEndsAt: '',
      deliveryPort: '', redeliveryPort: '', contractType: 'Affrètement', operationArea: '',
      isRovSupport: false, isDivingSupport: false, status: 'Facturé', description: '',
      sourceLabel: 'test', sharePointListTitle: '', sharePointItemId: '', sourceModifiedAt: '', archivedAt: '', updatedAt: '',
    },
    operations: [],
    period: {
      id: 16, projectId: 2, companyId: 1, periodMonth: '2026-10-01', clientReference: 'TRE-PO-000503',
      invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0, comments: '',
    },
    expenses: [19, 20, 21].map((id) => ({
      id, billingPeriodId: 16, category: 'port' as const, nature: '', supplier: `Fournisseur ${id}`, supplierSpecialties: [],
      invoiceDate: '2026-10-01', invoiceNumber: String(id), amountHt: 100, amountTtc: null, currency: 'EUR',
      quantity: null, unit: '', comments: '', dprReportId: null,
    })),
    services: [], dprs: [], selectedVesselName: 'GOURY', startDate: '2026-10-01', endDate: '2026-10-31',
  };
}

function attachment(fileName: string, id: number, expenseId: number | null = 19, mimeType = 'application/pdf', fileSizeBytes = 1): ProjectBillingDocument {
  return {
    id, billingPeriodId: 16, chargeableExpenseId: expenseId, documentKind: 'chargeable_expense',
    bucketName: 'project-files', objectPath: `projects/2/16/expense/${id}/${fileName}`, fileName, mimeType, fileSizeBytes,
  };
}

async function pdfBlob(pageCount = 1): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) pdf.addPage();
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

async function unavailableP144Annexes() {
  const existing = await pdfBlob();
  const documents = [
    ...missingNames.map((name, index) => attachment(name, 23 + index, 19 + index)),
    ...Array.from({ length: 6 }, (_, index) => attachment(`annexe-accessible-${index + 1}.pdf`, 40 + index, 19, 'application/pdf', existing.size)),
  ];
  mocks.download.mockImplementation(async (path: string) => {
    if (path === documents[0].objectPath) throw new Error('Fichier inaccessible. Vérifiez la synchronisation Google Drive.');
    if (path === documents[1].objectPath) return { data: null, error: { message: 'Copie privée indisponible', statusCode: '404' } };
    if (path === documents[2].objectPath) return { data: null, error: null };
    return { data: existing, error: null };
  });
  return documents;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.download.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Logo unavailable in export test')));
  // JSZip uses the browser FileReader API for Blob inputs; provide its bounded
  // read in this Node test so the real ZIP implementation processes real bytes.
  vi.stubGlobal('FileReader', class {
    onload: ((event: { target: { result: ArrayBuffer } }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((result) => this.onload?.({ target: { result } }), (error: unknown) => this.onerror?.(error));
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('billing export attachments', () => {
  it('reports all three unavailable P144 annexes without producing a partial ZIP', async () => {
    const documents = await unavailableP144Annexes();
    const failure = await generateBillingExportPackage(client, billingInput(), documents, 'zip').then(
      () => { throw new Error('A complete export was expected to fail.'); },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(BillingAttachmentExportError);
    const message = (failure as Error).message;
    for (const name of missingNames) expect(message).toContain(name);
    expect(message).toContain('Fichier inaccessible');
    expect(message).toContain('Copie privée indisponible');
    expect(message).toContain('aucun fichier');
    expect(message).toContain('relancer l’export ZIP');
    expect(message).not.toContain('annexe-accessible');
    expect(mocks.download).toHaveBeenCalledTimes(9);
    expect((failure as BillingAttachmentExportError).attachmentIssues.map(({ documentId, status }) => ({ documentId, status })))
      .toEqual([{ documentId: 23, status: 'unavailable' }, { documentId: 24, status: 'missing' }, { documentId: 25, status: 'missing' }]);
    expect((failure as BillingAttachmentExportError).checkedDocumentIds).toEqual([]);
  });

  it('generates the merged PDF with six available P144 annexes and reports the three inaccessible files', async () => {
    const documents = await unavailableP144Annexes();
    const result = await generateBillingExportPackage(client, billingInput(), documents, 'merged-pdf');

    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(7);
    expect(result.attachmentIssues?.map((issue) => issue.fileName)).toEqual(missingNames);
    expect(result.checkedDocumentIds).toEqual(documents.map((document) => document.id));
    expect(mocks.download).toHaveBeenCalledTimes(9);
    expect(mocks.download.mock.calls.every(([, , options]) => options.allowLocalDrive === true)).toBe(true);
  });

  it('keeps every selected PDF, image and Office file intact in a complete ZIP', async () => {
    const pdf = await pdfBlob();
    const image = new Blob([new Uint8Array([0, 255, 127, 42])], { type: 'image/png' });
    const word = new Blob(['Office attachment bytes'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const documents = [attachment('facture.pdf', 1, 19, pdf.type, pdf.size), attachment('preuve.png', 2, 20, image.type, image.size), attachment('notes.docx', 3, 21, word.type, word.size)];
    const blobs = new Map(documents.map((document, index) => [document.objectPath, [pdf, image, word][index]]));
    mocks.download.mockImplementation(async (path: string) => ({ data: blobs.get(path), error: null }));

    const result = await generateBillingExportPackage(client, billingInput(), documents, 'zip');
    expect(result.extension).toBe('zip');
    expect(result.attachmentIssues).toBeUndefined();
    expect(result.checkedDocumentIds).toBeUndefined();
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['01-Elements-de-facturation.pdf', '02-facture.pdf', '03-preuve.png', '04-notes.docx']);
    const summary = await PDFDocument.load(await zip.file('01-Elements-de-facturation.pdf')!.async('uint8array'));
    expect(summary.getPageCount()).toBe(1);
    for (const [name, blob] of [['02-facture.pdf', pdf], ['03-preuve.png', image], ['04-notes.docx', word]] as const) {
      expect(await zip.file(name)!.async('uint8array')).toEqual(new Uint8Array(await blob.arrayBuffer()));
    }
    expect(mocks.storage).toHaveBeenCalledTimes(3);
    expect(mocks.storage).toHaveBeenCalledWith(client, 'project-files');
  });

  it('merges PDFs identified by MIME or extension and never reads other annexes', async () => {
    const first = await pdfBlob(2);
    const second = await pdfBlob();
    const documents = [
      attachment('facture.bin', 1, 19, 'APPLICATION/PDF', first.size),
      attachment('annexe.PDF', 2, 20, 'application/octet-stream', second.size),
      attachment('image-absente.png', 3, 21, 'image/png'),
      attachment('notes-absentes.docx', 4, 21, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ];
    mocks.download.mockImplementation(async (path: string) => {
      if (path === documents[0].objectPath) return { data: first, error: null };
      if (path === documents[1].objectPath) return { data: second, error: null };
      throw new Error('A non-PDF attachment must not be read.');
    });

    const result = await generateBillingExportPackage(client, billingInput(), documents, 'merged-pdf');
    expect(result.extension).toBe('pdf');
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(4);
    expect(mocks.download.mock.calls.map(([path]) => path)).toEqual(documents.slice(0, 2).map((document) => document.objectPath));
  });

  it('keeps the summary and valid annex pages when selected files have bad metadata, magic or PDF content', async () => {
    const valid = await pdfBlob(2);
    const badMagic = new Blob(['not a PDF']);
    const emptyPdf = await PDFDocument.create();
    const bytes = await emptyPdf.save({ addDefaultPage: false });
    const noPages = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const documents = [
      attachment('fichier-vide.pdf', 1, 19, 'application/pdf', 0),
      attachment('mauvais-format.pdf', 2, 19, 'application/pdf', badMagic.size),
      attachment('sans-pages.pdf', 3, 20, 'application/pdf', noPages.size),
      attachment('annexe-valide.pdf', 4, 21, 'application/pdf', valid.size),
    ];
    const blobs = new Map([[documents[1].objectPath, badMagic], [documents[2].objectPath, noPages], [documents[3].objectPath, valid]]);
    mocks.download.mockImplementation(async (path: string) => ({ data: blobs.get(path), error: null }));

    const result = await generateBillingExportPackage(client, billingInput(), documents, 'merged-pdf');
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(3);
    expect(result.attachmentIssues?.map(({ documentId, status }) => ({ documentId, status })))
      .toEqual([{ documentId: 1, status: 'invalid' }, { documentId: 2, status: 'invalid' }, { documentId: 3, status: 'invalid' }]);
    expect(mocks.download).toHaveBeenCalledTimes(3);
  });

  it('generates the merged summary when every annex is unavailable, without changing the invoice input', async () => {
    const input = billingInput();
    const original = structuredClone(input);
    mocks.download.mockRejectedValue({ status: 403, code: '42501', message: 'Accès refusé' });

    const result = await generateBillingExportPackage(client, input, [attachment('annexe-interdite.pdf', 1)], 'merged-pdf');
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(1);
    expect(result.attachmentIssues).toEqual([{ documentId: 1, fileName: 'annexe-interdite.pdf', status: 'unavailable', message: 'Accès refusé' }]);
    expect(input).toEqual(original);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it.each(['zip', 'merged-pdf'] as const)('does not read excluded expenses, unrelated documents or client invoices in a %s', async (format) => {
    const input = billingInput();
    input.expenses[0].includeInPdf = false;
    const documents = [attachment('frais-exclu.pdf', 1), attachment('autre-frais.pdf', 2, 999), attachment('facture-client.pdf', 3, null)];

    await generateBillingExportPackage(client, input, documents, format);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['zip', 'merged-pdf'] as const)('does not read annexes when all expenses are hidden from the %s', async (format) => {
    const input = billingInput();
    input.period.includeExpensesInPdf = false;

    await generateBillingExportPackage(client, input, [attachment(missingNames[0], 23)], format);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('generates a standard PDF without reading any attachment', async () => {
    const result = await generateBillingExportPackage(client, billingInput(), missingNames.map((name, index) => attachment(name, 23 + index)), 'pdf');

    expect(result.extension).toBe('pdf');
    expect((await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount()).toBe(1);
    expect(result.attachmentIssues).toBeUndefined();
    expect(result.checkedDocumentIds).toBeUndefined();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('propagates a summary PDF failure instead of returning an incomplete document', async () => {
    const renderer = await import('./projectBillingPdf');
    const render = vi.spyOn(renderer, 'renderBillingPdf').mockRejectedValueOnce(new Error('PDF summary unavailable'));
    try {
      await expect(generateBillingExportPackage(client, billingInput(), [attachment('annexe.pdf', 1)], 'merged-pdf'))
        .rejects.toThrow('PDF summary unavailable');
      expect(mocks.storage).not.toHaveBeenCalled();
    } finally {
      render.mockRestore();
    }
  });
});
