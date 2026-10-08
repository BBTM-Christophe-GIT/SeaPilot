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
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
async function originals() {
  const document = await PDFDocument.create(); document.addPage([300, 400]).drawText('TRACE_ORIGINAL_PAGE_1'); document.addPage([420, 600]).drawText('TRACE_ORIGINAL_PAGE_2');
  return new Uint8Array(await document.save());
}
async function proof(blob: Blob) {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  const streams = doc.context.enumerateIndirectObjects().map(([, object]) => object).filter((x): x is PDFRawStream => x instanceof PDFRawStream);
  const text = streams.filter((x) => x.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image').map((x) => Buffer.from(decodePDFRawStream(x).decode()).toString('latin1')).join('\n');
  const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < names.size(); i += 2) {
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
