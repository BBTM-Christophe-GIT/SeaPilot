// @vitest-environment node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QhsePolicyAttachment, QhsePolicySnapshot } from './qhsePolicyModel';
import { buildQhsePolicyExport, type QhsePolicyExportInput } from './qhsePolicyExport';
import type { QhsePolicyAxisIconKey } from './qhsePolicyIcons';
import * as axisPdfIcons from './qhsePolicyPdfIcons';

const generatedAt = new Date('2026-10-02T10:00:00Z');
afterEach(() => vi.restoreAllMocks());
const blob = (bytes: Uint8Array) => new Blob([bytes.slice().buffer]);
function snapshot(): QhsePolicySnapshot {
  return { settings: null, canEdit: false, processes: [
    { id: 'p1', name: 'Qualité', description: 'Maîtrise documentaire et suivi complet.', position: 1, archived: false, revision: 1, updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'p2', name: 'Sécurité archivée', description: 'TRACE_ARCHIVE_PROCESS', position: 2, archived: true, revision: 2, updatedAt: '2026-10-01T10:00:00Z' },
  ], objectives: [
    { id: 'o1', processId: 'p1', title: 'Réviser les procédures', description: 'TRACE_OBJECTIVE_DESCRIPTION', ownerLabel: 'LE ROZEL', ownerKind: 'vessel', ownerPersonId: null, ownerVesselId: 12, dueOn: '2026-12-31', progress: 42.25, archived: false, revision: 2, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'o2', processId: 'p2', title: 'Objectif ancien', description: 'TRACE_ARCHIVE_OBJECTIVE', ownerLabel: 'Bureau', ownerKind: 'office', ownerPersonId: null, ownerVesselId: null, dueOn: null, progress: 100, archived: true, revision: 2, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-10-01T10:00:00Z' },
  ], updates: [
    { id: 'u1', objectiveId: 'o1', kind: 'initial', progress: 0, occurredOn: '2026-09-01', note: 'État initial', actorName: 'Christophe', ownerLabel: 'Ancien responsable', createdAt: '2026-09-01T08:00:00Z' },
    { id: 'u2', objectiveId: 'o1', kind: 'progress', progress: 42.25, occurredOn: '2026-10-01', note: 'TRACE_HISTORY_COMMENT', actorName: 'Sophie', ownerLabel: 'LE ROZEL', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'u3', objectiveId: 'o2', kind: 'progress', progress: 100, occurredOn: '2026-10-01', note: 'TRACE_ARCHIVE_HISTORY', actorName: 'Auteur archivé', ownerLabel: 'Bureau', createdAt: '2026-10-01T10:00:00Z' },
  ], attachments: [] };
}
async function pdfBytes(prefix: string, encrypted = false) {
  const document = await PDFDocument.create();
  document.addPage([300, 400]).drawText(`${prefix}_PAGE_1`, { x: 24, y: 350, size: 12 });
  document.addPage([420, 600]).drawText(`${prefix}_PAGE_2`, { x: 24, y: 550, size: 12 });
  if (encrypted) document.context.trailerInfo.Encrypt = document.context.register(document.context.obj({ Filter: 'Standard', V: 1, R: 2 }));
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}
async function docxBytes() {
  const { default: JSZip } = await import('jszip'); const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document bureautique original de démonstration.</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'uint8array' });
}
async function input(): Promise<QhsePolicyExportInput> {
  return { snapshot: snapshot(), policy: { blob: blob(await pdfBytes('TRACE_POLICY')), title: 'Politique de démonstration - contrôle export' }, logo: new Uint8Array(await readFile('public/bbtm-report-logo.png')), generatedAt, readAttachment: async () => { throw new Error('Unexpected attachment'); } };
}
function file(id: string, mimeType: string, sizeBytes: number, objectiveId = 'o1', updateId = 'u2'): QhsePolicyAttachment {
  return { id, objectiveId, updateId, fileName: `${id}.${mimeType === 'application/pdf' ? 'pdf' : mimeType.startsWith('image/') ? 'png' : 'docx'}`, mimeType, sizeBytes,
    storageBucket: 'private-bucket', storagePath: 'https://private-signed-url/never-export?token=secret', createdAt: '2026-10-01T11:00:00Z' };
}
async function proof(blob: Blob) {
  const document = await PDFDocument.load(await blob.arrayBuffer());
  const streams = document.context.enumerateIndirectObjects().map(([, value]) => value).filter((value): value is PDFRawStream => value instanceof PDFRawStream);
  const text = streams.filter((value) => value.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image' && value.dict.get(PDFName.of('Type'))?.toString() !== '/EmbeddedFile')
    .map((value) => Buffer.from(decodePDFRawStream(value).decode()).toString('latin1').replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_, hex: string) => Buffer.from(hex, 'hex').toString('latin1'))).join('\n');
  const names = document.catalog.lookup(PDFName.of('Names'), PDFDict).lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (let index = 0; index < names.size(); index += 2) {
    const name = names.lookup(index) as PDFString | PDFHexString;
    const spec = names.lookup(index + 1, PDFDict); const content = spec.lookup(PDFName.of('EF'), PDFDict).lookup(PDFName.of('F'));
    if (!(content instanceof PDFRawStream)) throw new Error('Fichier intégré manquant');
    files.push({ name: name.decodeText(), bytes: decodePDFRawStream(content).decode() });
  }
  return { document, text, files, images: streams.filter((value) => value.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') };
}
async function qa(name: string, report: { blob: Blob }) {
  if (!process.env.QHSE_EXPORT_QA_DIR) return;
  await mkdir(process.env.QHSE_EXPORT_QA_DIR, { recursive: true });
  await writeFile(`${process.env.QHSE_EXPORT_QA_DIR}/${name}.pdf`, Buffer.from(await report.blob.arrayBuffer()));
}

describe('complete QHSE policy PDF export', () => {
  // Original multi-page PDFs, a large PNG and Office bytes exercise the real
  // export pipeline; cold Windows runs can exceed 20 seconds under parallel CI.
  it('includes complete policy pages, archives, responsibility, dates, comments and original attachments byte for byte', async () => {
    const data = await input(); const attachedPdf = await pdfBytes('TRACE_ATTACHMENT'); const office = await docxBytes();
    const photo = new Uint8Array(await readFile('public/demo/action-plan-finding-ppe.png'));
    data.snapshot.attachments = [file('PDF', 'application/pdf', attachedPdf.length), file('PHOTO', 'image/png', photo.length), file('WORD', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', office.length, 'o2', 'u3')];
    data.readAttachment = vi.fn(async (record) => blob(record.id === 'PDF' ? attachedPdf : record.id === 'PHOTO' ? photo : office));
    const report = await buildQhsePolicyExport(data); const result = await proof(report.blob);
    expect(report.fileName).toBe('Politique-QHSE-complete-2026-10-02.pdf'); expect(report.pageCount).toBe(result.document.getPageCount());
    for (const marker of ['TRACE_POLICY_PAGE_1', 'TRACE_POLICY_PAGE_2', 'TRACE_ATTACHMENT_PAGE_1', 'TRACE_ATTACHMENT_PAGE_2', 'TRACE_ARCHIVE_PROCESS', 'TRACE_ARCHIVE_OBJECTIVE', 'TRACE_ARCHIVE_HISTORY', 'TRACE_HISTORY_COMMENT', 'TRACE_OBJECTIVE_DESCRIPTION', 'LE ROZEL', 'Ancien responsable', 'Sophie', '31/12/2026', '42,25']) expect(result.text).toContain(marker);
    expect(result.text).not.toContain('private-signed-url'); expect(result.text).not.toContain('token=secret');
    expect(result.files).toHaveLength(4);
    expect(result.files.find((record) => record.name.startsWith('00-'))?.bytes).toEqual(new Uint8Array(await data.policy.blob.arrayBuffer()));
    expect(result.files.find((record) => record.name.endsWith('-PDF.pdf'))?.bytes).toEqual(attachedPdf);
    expect(result.files.find((record) => record.name.endsWith('-PHOTO.png'))?.bytes).toEqual(photo);
    expect(result.files.find((record) => record.name.endsWith('-WORD.docx'))?.bytes).toEqual(office);
    expect(result.images.length).toBeGreaterThan(1); expect(result.document.getPageCount()).toBeGreaterThanOrEqual(10);
    expect(result.document.getPages().filter((page) => page.getWidth() === 420 && page.getHeight() === 600)).toHaveLength(2);
    expect(data.readAttachment).toHaveBeenCalledTimes(3); await qa('qhse-policy-complete', report);
  }, 60000);
  it('keeps long axis descriptions, objective details, follow-up notes and filenames across page breaks', async () => {
    const data = await input(); const attached = await pdfBytes('LONG_ATTACHMENT');
    data.snapshot.processes[0].description = `${'Axe stratégique et contrôle documentaire détaillé. '.repeat(180)} TRACE_LAST_PROCESS`;
    data.snapshot.objectives[0].description = `${'Objectif, responsable et échéance documentés. '.repeat(200)} TRACE_LAST_OBJECTIVE`;
    data.snapshot.updates[1].note = `${'Suivi, commentaire et mesure vérifiée. '.repeat(230)} TRACE_LAST_HISTORY`;
    data.snapshot.attachments = [{ ...file('LONG', 'application/pdf', attached.length), fileName: `${'rapport de contrôle '.repeat(8)}FIN_DOCUMENT.pdf` }];
    data.readAttachment = async () => blob(attached);
    const report = await buildQhsePolicyExport(data); const result = await proof(report.blob);
    expect(result.document.getPageCount()).toBeGreaterThan(9);
    for (const marker of ['TRACE_LAST_PROCESS', 'TRACE_LAST_OBJECTIVE', 'TRACE_LAST_HISTORY', 'FIN_DOCUMENT']) expect(result.text).toContain(marker);
    expect(result.files.find((row) => row.name.endsWith('FIN_DOCUMENT.pdf'))?.bytes).toEqual(attached); await qa('qhse-policy-long', report);
  });
  it('draws all seven strategic-axis icons in persisted position order and uses the new wording throughout the PDF', async () => {
    const data = await input();
    const keys: QhsePolicyAxisIconKey[] = ['safety', 'ethics', 'health', 'environment', 'customer', 'technical', 'cybersecurity'];
    const draw = vi.spyOn(axisPdfIcons, 'drawQhsePolicyAxisIcon');
    data.snapshot = { ...data.snapshot, objectives: [], updates: [], processes: keys.map((iconKey, position) => ({
      ...data.snapshot.processes[0], id: `axis-${iconKey}`, name: `TRACE_AXIS_${iconKey}`, iconKey, position,
    })).reverse() };
    const report = await buildQhsePolicyExport(data); const result = await proof(report.blob);
    expect(draw.mock.calls.map((call) => call[1])).toEqual(keys);
    for (const call of draw.mock.calls) {
      expect(call[2]).toBe(15); expect(call[3]).toBeGreaterThanOrEqual(39); expect(call[3] + call[4]).toBeLessThanOrEqual(273);
    }
    const headings = keys.map((key) => result.text.indexOf(`TRACE_AXIS_${key}`));
    expect(headings.every((offset) => offset >= 0)).toBe(true);
    expect(headings).toEqual([...headings].sort((a, b) => a - b));
    expect(result.text).toContain('axes stratégiques'); expect(result.text).toContain('Axe stratégique');
    expect(result.text).not.toMatch(/processus/i); expect(result.document.getSubject()).toContain('axes stratégiques');
    expect(result.files[0].bytes).toEqual(new Uint8Array(await data.policy.blob.arrayBuffer()));
    await qa('qhse-axes-seven-icons', report);
  });
  it('uses saved icon choices for custom axes and recognises legacy names without losing an unknown axis', async () => {
    const data = await input(); const draw = vi.spyOn(axisPdfIcons, 'drawQhsePolicyAxisIcon');
    const axes: Array<{ name: string; iconKey?: QhsePolicyAxisIconKey; expected: QhsePolicyAxisIconKey }> = [
      { name: 'Sécurité des opérations', expected: 'safety' },
      { name: 'Éthique et conformité', expected: 'ethics' },
      { name: 'Santé au travail', expected: 'health' },
      { name: 'Environnement', expected: 'environment' },
      { name: 'Satisfaction client', expected: 'customer' },
      { name: 'Cybersécurité', expected: 'cybersecurity' },
      { name: 'Axe personnalisé - engagements', iconKey: 'environment', expected: 'environment' },
      { name: 'Sécurité - choix explicite général', iconKey: 'general', expected: 'general' },
      { name: 'Axe inconnu conservé', expected: 'general' },
    ];
    data.snapshot = { ...data.snapshot, objectives: [], updates: [], processes: axes.map((axis, position) => ({
      ...data.snapshot.processes[0], id: `custom-${position}`, name: axis.name, iconKey: axis.iconKey, position,
    })) };
    const report = await buildQhsePolicyExport(data); const result = await proof(report.blob);
    expect(draw.mock.calls.map((call) => call[1])).toEqual(axes.map((axis) => axis.expected));
    expect(result.text).toContain('Axe personnalisé'); expect(result.text).toContain('Axe inconnu conservé');
    await qa('qhse-axes-legacy-and-custom', report);
  });
  it('keeps long axis headings and icons aligned when axis content spans several pages', async () => {
    const data = await input();
    const original = axisPdfIcons.drawQhsePolicyAxisIcon;
    const positions: Array<{ page: number; y: number }> = [];
    vi.spyOn(axisPdfIcons, 'drawQhsePolicyAxisIcon').mockImplementation((doc, key, x, y, size) => {
      positions.push({ page: doc.getCurrentPageInfo().pageNumber, y });
      original(doc, key, x, y, size);
    });
    data.snapshot.processes[0].name = `TRACE_LONG_AXIS_BEGIN ${'engagements de sécurité maritime et de qualité '.repeat(3)} TRACE_LONG_AXIS_END`;
    data.snapshot.processes[0].description = `${'Maîtrise documentaire détaillée et engagements vérifiés. '.repeat(180)} TRACE_AXIS_CONTENT_END`;
    data.snapshot.processes[1].name = `TRACE_ARCHIVED_AXIS_BEGIN ${'responsabilité environnementale et conformité '.repeat(3)} TRACE_ARCHIVED_AXIS_END`;
    const report = await buildQhsePolicyExport(data); const result = await proof(report.blob);
    expect(positions).toHaveLength(2); expect(positions[1].page).toBeGreaterThan(positions[0].page);
    expect(positions.every((position) => position.y >= 39 && position.y + 8 <= 273)).toBe(true);
    for (const marker of ['TRACE_LONG_AXIS_BEGIN', 'TRACE_LONG_AXIS_END', 'TRACE_AXIS_CONTENT_END', 'TRACE_ARCHIVED_AXIS_BEGIN', 'TRACE_ARCHIVED_AXIS_END']) expect(result.text).toContain(marker);
    expect(result.text).toContain('AXE STRATÉGIQUE ARCHIVÉ');
    await qa('qhse-axes-long-headings', report);
  });
  it('exports an empty objective register with the complete original policy and no fabricated average', async () => {
    const data = await input(); data.snapshot = { ...snapshot(), processes: [], objectives: [], updates: [] };
    const result = await proof((await buildQhsePolicyExport(data)).blob);
    expect(result.text).toContain('Aucun objectif actif'); expect(result.text).toContain('TRACE_POLICY_PAGE_2'); expect(result.files).toHaveLength(1);
  });
  it('rejects orphan attachment/objective references before reading any private file', async () => {
    const data = await input(); const reader = vi.fn(); data.readAttachment = reader;
    data.snapshot.attachments = [file('orphan', 'application/pdf', 5, 'o2', 'u2')];
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('ne correspond pas'); expect(reader).not.toHaveBeenCalled();
    data.snapshot.attachments = []; data.snapshot.objectives[0].processId = 'other';
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('incomplet');
  });
  it.each(['unreadable', 'empty', 'size-mismatch'] as const)('blocks a complete export when an attachment is %s', async (failure) => {
    const data = await input(); data.snapshot.attachments = [file('missing', 'text/plain', 3)];
    data.readAttachment = async () => { if (failure === 'unreadable') throw new Error('403'); return new Blob([failure === 'empty' ? '' : 'changed']); };
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('export complet a été interrompu');
  });
  it('blocks invalid photos, corrupt PDFs and encrypted PDFs rather than silently omitting them', async () => {
    const data = await input();
    data.snapshot.attachments = [file('broken', 'image/png', 3)]; data.readAttachment = async () => new Blob(['bad']);
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('photo');
    data.snapshot.attachments[0].mimeType = 'application/pdf';
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('protégé, corrompu ou vide');
    const encrypted = await pdfBytes('ENCRYPTED', true); data.snapshot.attachments[0].sizeBytes = encrypted.length;
    data.readAttachment = async () => blob(encrypted);
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('protégé, corrompu ou vide');
    data.snapshot.attachments = []; data.policy.blob = new Blob(['corrupt-policy']);
    await expect(buildQhsePolicyExport(data)).rejects.toThrow('protégé, corrompu ou vide');
  });
});
