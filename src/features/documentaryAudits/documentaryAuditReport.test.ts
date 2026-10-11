// @vitest-environment node
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import type { AuditSite } from '../internalAudits/internalAuditModel';
import type { AuditAttachment, DocumentaryAudit, DocumentaryFinding, DocumentaryFindingEvent } from './documentaryAuditModel';
import { buildDocumentaryAuditReport, documentaryReportData, type DocumentaryAuditReportInput } from './documentaryAuditReport';

const site: AuditSite = { id: '12', companyId: 7, name: 'LE ROZEL', kind: 'vessel', vesselId: 12, anniversaryOn: null };
const attachment = (id: string, mimeType = 'application/pdf'): AuditAttachment => ({ id, fileName: `${id}.${mimeType.startsWith('image/') ? 'png' : mimeType === 'text/csv' ? 'csv' : 'pdf'}`, storagePath: `7/audit/${id}`, sizeBytes: 123, mimeType, url: 'https://temporary-signed-url-never-embedded' });
const audit: DocumentaryAudit = { id: 'audit', companyId: 7, siteId: site.id, kind: 'ovid', year: 2026, title: 'Audit de démonstration - contrôle documentaire', plannedOn: null, auditedOn: '2026-10-01', auditorName: 'Auditeur de contrôle', files: [attachment('Dossier')], createdAt: '', updatedAt: '' };
const finding: DocumentaryFinding = { id: 'finding', companyId: 7, auditId: audit.id, reference: 'F-01', category: 'major', description: 'TRACE_FINDING Consignes à compléter.', assigneePersonId: 42, assigneeRole: null, assigneeVesselId: null, assigneeLabel: 'Responsable désigné', openedOn: '2026-10-01', dueOn: '2026-10-08', treatmentDelayValue: 1, treatmentDelayUnit: 'weeks', status: 'closed', treatment: 'TRACE_CLOSURE', resolvedAt: '2026-10-03T10:00:00Z', closedAt: '2026-10-04T10:00:00Z', files: [attachment('Constat', 'image/png')] };
const event: DocumentaryFindingEvent = { id: 'event', findingId: finding.id, actorId: 'user', actorName: 'Auteur du traitement', createdAt: '2026-10-04T10:00:00Z', status: 'closed', treatment: 'TRACE_CLOSURE Mesure vérifiée.', files: [attachment('Cloture', 'image/png'), attachment('Controle', 'text/csv')] };
// Synthetic vessel illustration: tests preserve image bytes and the QA PDF
// displays a legible evidence preview instead of a one-pixel black placeholder.
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAABQCAIAAABeYuqzAAABm0lEQVR4nO3ZvbHCMBBFYfdBFSQMLVABbdAKKZVAJSQE5KTkMKQMxpYs7dVqD3ND84Z3vuHH9nB9PJlwg/wVBB8AAMQeAADEHgAAxB4AAMQeAADEHgAAON/9tAFAEH1sAMjS5zEAUL5+kgEAVerPNwAgEyD7GABq1c8zACAZoOzBAADgYQC0Uj8VYPJ4AJINyh6sAVhtd60NAAAAmNe0h/MAee5UgN7OhOW5lwN0ci3oJX2kvtoOr4b6AujwfoA7gEmG1D8FwNL5vif8VWR/Ov/fWMrJJ/58rvZ/BwAAAACQDwAAAAAAAADaADB+yOsDAAAAALgHkN9LkU//DpAncFq/5EeQPITH+oW/A+Q53NUv/yUsj+KrfpVfQfI0jurX+hkqD+SlfsXzAHkmF/XrnojJY7Vfv/qZsDxZ4/UtLkXIw7Vc3+hakDxfs/U/AOvD0WDyiNmrXcYIwKmBQRY7AHcGNk1MARgAzQ0AAGIPAABiDwAPAJfbw3jyLgDo0wAQYnwHABB7/QDYf04W+SAFAAAAmHAAABB7AIj3Bjy1PrOACaB3AAAAAElFTkSuQmCC', 'base64'));
async function originals(marker = 'TRACE_ORIGINAL', sizes: [[number, number], [number, number]] = [[300, 400], [420, 600]]) {
  const document = await PDFDocument.create(); document.addPage(sizes[0]).drawText(`${marker}_PAGE_1`, { x: 20, y: sizes[0][1] - 40, size: 10 }); document.addPage(sizes[1]).drawText(`${marker}_PAGE_2`, { x: 20, y: sizes[1][1] - 40, size: 10 });
  return new Uint8Array(await document.save());
}
async function proof(blob: Blob) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  const streams = doc.context.enumerateIndirectObjects().map(([, object]) => object).filter((x): x is PDFRawStream => x instanceof PDFRawStream);
  const text = streams.filter((x) => x.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image').map((x) => Buffer.from(decodePDFRawStream(x).decode()).toString('latin1')).join('\n');
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict)?.lookupMaybe(PDFName.of('Names'), PDFArray);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; names && i < names.size(); i += 2) {
    const specification = names.lookup(i + 1, PDFDict); const stream = specification.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'));
    if (!(stream instanceof PDFRawStream)) throw new Error('Missing embedded file stream');
    const name = names.lookup(i) as PDFString | PDFHexString;
    files.push({ name: name.decodeText(), bytes: decodePDFRawStream(stream).decode() });
  }
  return { doc, text, files, images: streams.filter((x) => x.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') };
}
function input(changes: Partial<DocumentaryAuditReportInput> = {}): DocumentaryAuditReportInput {
  return { audit, site, findings: [finding], events: [event], generatedAt: new Date('2026-10-01T10:00:00Z'), ...changes };
}
describe('complete documentary audit PDF export', () => {
  it('rejects an unrelated dossier or a missing selected finding', () => {
    expect(() => documentaryReportData(input({ site: { ...site, companyId: 8 } }))).toThrow('navire');
    expect(() => documentaryReportData(input({ findingId: 'other' }))).toThrow('n’appartient');
  });
  it('includes treatment, visible photos, actual PDF pages and original attached files', async () => {
    const pdf = await originals(); const csv = new TextEncoder().encode('controle,resultat\nConsigne,OK');
    const report = await buildDocumentaryAuditReport(input({ loadFile: async (file) => new Blob([file.mimeType === 'application/pdf' ? pdf : file.mimeType === 'text/csv' ? csv : png]) }));
    const result = await proof(report.blob);
    expect(result.text).toContain('TRACE_FINDING'); expect(result.text).toContain('TRACE_CLOSURE'); expect(result.text).not.toContain('temporary-signed-url');
    expect(result.images.length).toBeGreaterThan(0); expect(result.doc.getPageCount()).toBeGreaterThanOrEqual(5);
    const appended = result.doc.getPages().at(-1)!; expect(appended.getWidth()).toBe(420); expect(appended.getHeight()).toBe(600);
    expect(result.files).toHaveLength(4); expect(result.files.find((x) => x.name.endsWith('Dossier.pdf'))?.bytes).toEqual(pdf); expect(result.files.find((x) => x.name.endsWith('Controle.csv'))?.bytes).toEqual(csv);
    if (process.env.DOCUMENTARY_REPORT_QA_DIR) { await mkdir(process.env.DOCUMENTARY_REPORT_QA_DIR, { recursive: true }); await writeFile(`${process.env.DOCUMENTARY_REPORT_QA_DIR}/documentary-audit-complete.pdf`, Buffer.from(await report.blob.arrayBuffer())); }
  });
  it('exports a single finding without unrelated findings, histories or annual dossier files', async () => {
    const loader = vi.fn(async (file: AuditAttachment) => new Blob([file.mimeType === 'text/csv' ? 'controle,ok' : png]));
    const other = { ...finding, id: 'other', description: 'TRACE_SECRET_OTHER', files: [attachment('Secret')] };
    const data = input({ findingId: finding.id, findings: [finding, other, { ...other, id: 'foreign', companyId: 8 }], events: [event, { ...event, findingId: other.id, treatment: 'TRACE_SECRET_EVENT', files: [attachment('SecretEvent')] }], loadFile: loader });
    const report = await buildDocumentaryAuditReport(data); const result = await proof(report.blob);
    expect(result.text).toContain('TRACE_FINDING'); expect(result.text).not.toContain('TRACE_SECRET'); expect(report.filename).toContain('ecart-F-01');
    expect(result.files).toHaveLength(3); expect(loader.mock.calls.map(([file]) => file.id)).toEqual(['Constat', 'Cloture', 'Controle']);
  });
  it('exports every authorized eCMID finding and its evidence while omitting all annual audit documents', async () => {
    const dossier = { ...attachment('TRACE_AUDIT_FOLDER'), fileName: 'RZL - eCMID.pdf' };
    const dossierPhoto = attachment('TRACE_AUDIT_FOLDER_PHOTO', 'image/png');
    const dossierCsv = attachment('TRACE_AUDIT_FOLDER_CSV', 'text/csv');
    const findingPdf = attachment('SecondConstatPDF');
    const findingPhoto = attachment('SecondConstatPhoto', 'image/png');
    const treatmentPhoto = attachment('Traitement', 'image/png');
    const secondCsv = attachment('SecondControle', 'text/csv');
    const second: DocumentaryFinding = { ...finding, id: 'finding-2', reference: 'F-02', description: 'TRACE_FINDING_TWO Protection à rétablir.', status: 'in_progress', treatment: 'TRACE_TREATMENT_TWO', resolvedAt: null, closedAt: null, files: [findingPdf, findingPhoto] };
    const treatment: DocumentaryFindingEvent = { ...event, id: 'treatment', createdAt: '2026-10-03T10:00:00Z', status: 'in_progress', treatment: 'TRACE_TREATMENT_ONE Protection provisoire posée.', files: [treatmentPhoto] };
    const secondEvent: DocumentaryFindingEvent = { ...event, id: 'event-2', findingId: second.id, status: 'in_progress', treatment: 'TRACE_TREATMENT_TWO Contrôle en cours.', files: [secondCsv] };
    const outsideCompany: DocumentaryFinding = { ...finding, id: 'foreign-company', companyId: 8, description: 'TRACE_SECRET_COMPANY', files: [attachment('SecretCompany')] };
    const outsideAudit: DocumentaryFinding = { ...finding, id: 'foreign-audit', auditId: 'different-audit', description: 'TRACE_SECRET_AUDIT', files: [attachment('SecretAudit')] };
    const findingDocument = await originals('TRACE_FINDING_PDF');
    const dossierDocument = await originals('TRACE_AUDIT_FOLDER', [[650, 850], [700, 900]]);
    const csv = new TextEncoder().encode('controle,resultat\nProtection,OK');
    const loader = vi.fn(async (file: AuditAttachment) => {
      if ([dossier.id, dossierPhoto.id, dossierCsv.id].includes(file.id)) throw new Error('Annual audit files must not be fetched');
      return new Blob([file.mimeType === 'application/pdf' ? findingDocument : file.mimeType === 'text/csv' ? csv : png]);
    });
    const data = input({ audit: { ...audit, kind: 'ecmid', files: [dossier, dossierPhoto, dossierCsv] }, findings: [finding, second, outsideCompany, outsideAudit],
      events: [event, secondEvent, treatment, { ...event, id: 'secret-company-event', findingId: outsideCompany.id, treatment: 'TRACE_SECRET_COMPANY_EVENT', files: [attachment('SecretCompanyEvent')] },
        { ...event, id: 'secret-audit-event', findingId: outsideAudit.id, treatment: 'TRACE_SECRET_AUDIT_EVENT', files: [attachment('SecretAuditEvent')] }], loadFile: loader });
    const reportData = documentaryReportData(data);
    expect(reportData.entries.map(({ finding: entry }) => entry.id)).toEqual([finding.id, second.id]);
    expect(reportData.auditFiles).toEqual([]);
    const report = await buildDocumentaryAuditReport(data);
    const result = await proof(report.blob);
    const evidenceIds = ['Constat', 'Traitement', 'Cloture', 'Controle', 'SecondConstatPDF', 'SecondConstatPhoto', 'SecondControle'];
    expect(loader.mock.calls.map(([file]) => file.id)).toEqual(evidenceIds);
    expect(result.files.map((file) => file.name)).toEqual(evidenceIds.map((id, index) => `${String(index + 1).padStart(2, '0')}-${id}.${id === 'SecondConstatPDF' ? 'pdf' : id.includes('Controle') ? 'csv' : 'png'}`));
    expect(result.files.find((file) => file.name.endsWith('SecondConstatPDF.pdf'))?.bytes).toEqual(findingDocument);
    expect(result.files.find((file) => file.name.endsWith('SecondControle.csv'))?.bytes).toEqual(csv);
    expect(result.files.find((file) => file.name.endsWith('Traitement.png'))?.bytes).toEqual(png);
    for (const marker of ['TRACE_FINDING', 'TRACE_FINDING_TWO', 'TRACE_TREATMENT_ONE', 'TRACE_TREATMENT_TWO', 'TRACE_CLOSURE']) expect(result.text).toContain(marker);
    expect(result.text.indexOf('TRACE_TREATMENT_ONE')).toBeLessThan(result.text.indexOf('TRACE_CLOSURE'));
    expect(result.text).not.toContain('TRACE_SECRET');
    expect(result.text).not.toContain('TRACE_AUDIT_FOLDER');
    expect(result.text).not.toContain(dossier.fileName);
    expect(result.text).not.toContain('Documents constituant');
    expect(result.text).not.toContain('temporary-signed-url');
    // pdf-lib originals encode their drawn text in hex; inspect the copied page
    // streams as well as the generated inventory and embedded-file name tree.
    expect(result.text).toContain(Buffer.from('TRACE_FINDING_PDF_PAGE_1').toString('hex').toUpperCase());
    expect(result.text).toContain(Buffer.from('TRACE_FINDING_PDF_PAGE_2').toString('hex').toUpperCase());
    expect(result.text).not.toContain(Buffer.from('TRACE_AUDIT_FOLDER_PAGE_1').toString('hex').toUpperCase());
    expect(result.files.some((file) => Buffer.from(file.bytes).equals(Buffer.from(dossierDocument)))).toBe(false);
    expect(result.doc.getPages().some((page) => page.getWidth() === 650 || page.getWidth() === 700)).toBe(false);
    expect(result.doc.getPages().slice(-2).map((page) => [page.getWidth(), page.getHeight()])).toEqual([[300, 400], [420, 600]]);
    expect(result.images.length).toBeGreaterThanOrEqual(1);
    expect(report.pageCount).toBe(result.doc.getPageCount());
    expect(report.filename).toBe('audit-ecmid-LE-ROZEL-2026.pdf');
    if (process.env.DOCUMENTARY_REPORT_QA_DIR) {
      await mkdir(process.env.DOCUMENTARY_REPORT_QA_DIR, { recursive: true });
      await writeFile(`${process.env.DOCUMENTARY_REPORT_QA_DIR}/documentary-audit-ecmid-findings.pdf`, Buffer.from(await report.blob.arrayBuffer()));
    }
  });
  it('exports an empty eCMID register without loading even an invalid annual PDF', async () => {
    const loader = vi.fn(async () => new Blob(['invalid PDF']));
    const report = await buildDocumentaryAuditReport(input({ audit: { ...audit, kind: 'ecmid', files: [attachment('Dossier')] }, findings: [], events: [], loadFile: loader }));
    const result = await proof(report.blob);
    expect(loader).not.toHaveBeenCalled();
    expect(result.files).toEqual([]);
    expect(result.doc.getPageCount()).toBe(1);
    expect(result.text).not.toContain('Dossier.pdf');
    expect(result.text).not.toContain('Annexe - document PDF');
  });
  it('includes an eCMID finding PDF whose name matches the excluded annual document', async () => {
    const dossier = { ...attachment('AnnualECMID'), fileName: 'RZL - eCMID.pdf' };
    const evidence = { ...attachment('FindingECMID'), fileName: dossier.fileName };
    const pdf = await originals('TRACE_HOMONYMOUS_FINDING');
    const loader = vi.fn(async (file: AuditAttachment) => {
      if (file.storagePath === dossier.storagePath) throw new Error('Excluded annual audit file');
      return new Blob([pdf]);
    });
    const report = await buildDocumentaryAuditReport(input({ audit: { ...audit, kind: 'ecmid', files: [dossier] },
      findings: [{ ...finding, files: [evidence] }], events: [], loadFile: loader }));
    const result = await proof(report.blob);
    expect(loader).toHaveBeenCalledTimes(1); expect(loader).toHaveBeenCalledWith(evidence);
    expect(result.files).toEqual([{ name: '01-RZL - eCMID.pdf', bytes: pdf }]);
    expect(result.text).toContain(evidence.fileName);
    expect(result.text).toContain(Buffer.from('TRACE_HOMONYMOUS_FINDING_PAGE_1').toString('hex').toUpperCase());
    expect(result.doc.getPages().slice(-2).map((page) => [page.getWidth(), page.getHeight()])).toEqual([[300, 400], [420, 600]]);
  });
  it.each(['finding', 'history'] as const)('still blocks an eCMID export when %s evidence is inaccessible', async (origin) => {
    const inaccessible = origin === 'finding' ? finding.files[0] : event.files[0];
    const loader = vi.fn(async (file: AuditAttachment) => {
      if (file.id === inaccessible.id) throw new Error('Evidence access denied');
      return new Blob([png]);
    });
    await expect(buildDocumentaryAuditReport(input({ audit: { ...audit, kind: 'ecmid' }, loadFile: loader }))).rejects.toThrow(`n’a pas pu inclure ${inaccessible.fileName}`);
    expect(loader.mock.calls.map(([file]) => file.id)).toContain(inaccessible.id);
    expect(loader.mock.calls.map(([file]) => file.id)).not.toContain('Dossier');
  });
  it.each(['ovid', 'external_ism', 'client'] as const)('keeps annual audit documents in a complete %s export', async (kind) => {
    const pdf = await originals();
    const dossier = attachment(`Dossier-${kind}`);
    const loader = vi.fn(async () => new Blob([pdf]));
    const data = input({ audit: { ...audit, kind, files: [dossier] }, findings: [], events: [], loadFile: loader });
    expect(documentaryReportData(data).auditFiles).toEqual([dossier]);
    const report = await buildDocumentaryAuditReport(data);
    const result = await proof(report.blob);
    expect(loader).toHaveBeenCalledTimes(1); expect(loader).toHaveBeenCalledWith(dossier);
    expect(result.text).toContain(dossier.fileName);
    expect(result.files).toEqual([{ name: `01-${dossier.fileName}`, bytes: pdf }]);
    expect(result.doc.getPages().slice(-2).map((page) => [page.getWidth(), page.getHeight()])).toEqual([[300, 400], [420, 600]]);
  });
  it('preserves long descriptions and history across page breaks', async () => {
    const long = { ...finding, files: [], description: `${'Consigne et contrôle détaillé '.repeat(1000)} TRACE_LAST_FINDING` };
    const history = { ...event, files: [], treatment: `${'Traitement documenté et vérifié '.repeat(800)} TRACE_LAST_EVENT` };
    const report = await buildDocumentaryAuditReport(input({ audit: { ...audit, files: [] }, findings: [long], events: [history] }));
    const document = await PDFDocument.load(await report.blob.arrayBuffer());
    const text = document.context.enumerateIndirectObjects().map(([, object]) => object).filter((x): x is PDFRawStream => x instanceof PDFRawStream).map((x) => Buffer.from(decodePDFRawStream(x).decode()).toString('latin1')).join('\n');
    expect(document.getPageCount()).toBeGreaterThan(8); expect(text).toContain('TRACE_LAST_FINDING'); expect(text).toContain('TRACE_LAST_EVENT');
    if (process.env.DOCUMENTARY_REPORT_QA_DIR) await writeFile(`${process.env.DOCUMENTARY_REPORT_QA_DIR}/documentary-audit-long.pdf`, Buffer.from(await report.blob.arrayBuffer()));
  });
  it('preserves long original filenames on photo captions and PDF annex covers', async () => {
    const photo = { ...attachment('LongPhoto', 'image/png'), fileName: `${'preuve de contrôle '.repeat(12)}FIN_PHOTO.png` };
    const documentFile = { ...attachment('LongDocument'), fileName: `${'rapport de contrôle '.repeat(11)}FIN_DOCUMENT.pdf` };
    const pdf = await originals();
    const report = await buildDocumentaryAuditReport(input({ audit: { ...audit, files: [documentFile] }, findings: [{ ...finding, files: [photo] }], events: [], loadFile: async (file) => new Blob([file.mimeType === 'application/pdf' ? pdf : png]) }));
    const result = await proof(report.blob);
    expect(result.files.map((file) => file.name)).toEqual([`01-${documentFile.fileName}`, `02-${photo.fileName}`]);
    expect(result.text).toContain('FIN_PHOTO'); expect(result.text).toContain('FIN_DOCUMENT');
    if (process.env.DOCUMENTARY_REPORT_QA_DIR) await writeFile(`${process.env.DOCUMENTARY_REPORT_QA_DIR}/documentary-audit-long-filenames.pdf`, Buffer.from(await report.blob.arrayBuffer()));
  });
  it('blocks incomplete exports when a file is unreadable or an attached PDF is invalid', async () => {
    await expect(buildDocumentaryAuditReport(input({ loadFile: async () => { throw new Error('Accès refusé'); } }))).rejects.toThrow('n’a pas pu inclure');
    await expect(buildDocumentaryAuditReport(input({ findings: [], events: [], loadFile: async () => new Blob(['broken']) }))).rejects.toThrow('protégé ou invalide');
  });
});
