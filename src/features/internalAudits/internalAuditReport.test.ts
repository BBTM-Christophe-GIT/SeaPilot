// @vitest-environment node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { BBTM_AUDIT_QUESTIONS } from './internalAuditSeed';
import type { AuditAnswer, AuditFinding, AuditFindingEvent, AuditParticipant, AuditPhoto, AuditSite, AuditTemplate, InternalAudit } from './internalAuditModel';
import {
  auditReportPercent, auditReportTimestampDay, buildInternalAuditGridReport, buildInternalAuditReport, buildInternalAuditTemplateReport,
  downloadInternalAuditGridReport, internalAuditReportData, internalAuditReportFilename, internalAuditReportSections,
  openInternalAuditGridPrintPreview, resolveInternalAuditReportPhoto, resolveInternalAuditReportSignature,
  type InternalAuditReportInput, type InternalAuditReportSection,
} from './internalAuditReport';

const site: AuditSite = { id: 'site-rozel', companyId: 1, name: 'LE ROZEL', kind: 'vessel', vesselId: 12, anniversaryOn: '2026-10-01' };
const rows: AuditAnswer[] = BBTM_AUDIT_QUESTIONS.map((row, index) => ({
  ...row, answer: index % 7 === 0 ? 'na' : index % 3 === 0 ? 'incomplet' : index % 4 === 0 ? 'non_conforme' : 'conforme',
  observation: index === 60 ? 'TRACE_LAST_QUESTION' : 'Documents vérifiés à bord et échanges avec l’équipage.',
}));
const audit: InternalAudit = {
  id: 'audit-2026', companyId: 1, siteId: site.id, templateId: 'template', templateName: 'Grille BBTM personnalisée LE ROZEL',
  templateVersion: 2, year: 2026, plannedOn: '2026-10-01', performedOn: '2026-10-01', auditorName: 'Auditeur de contrôle',
  status: 'completed', rows, completedAt: '2026-10-01T09:00:00Z',
};
const photo: AuditPhoto = { id: 'photo', fileName: 'Panneau de contrôle - constat.png', storagePath: '1/audit/finding/photo.png', mimeType: 'image/png', sizeBytes: 68, url: '' };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGPkr25hIAUwkaSaYVQDcYCJSHVwMKqBGEByKAEAbIwBLkmDf6QAAAAASUVORK5CYII=';
const finding: AuditFinding = {
  id: 'finding', companyId: 1, auditId: audit.id, questionId: rows[1].id, reference: rows[1].reference,
  severity: 'major', description: 'Procédure de contrôle à compléter et affichage à mettre à jour.',
  assigneePersonId: null, assigneeRole: 'chief_engineer', assigneeVesselId: 12, assigneeLabel: 'Chefs Mécaniciens LE ROZEL',
  openedOn: '2026-10-01', dueOn: '2026-10-08', treatmentDelayValue: 1, treatmentDelayUnit: 'weeks', status: 'resolved',
  treatment: 'TRACE_TREATMENT Procédure révisée, équipage informé et affichage remplacé.', resolvedAt: '2026-10-06T09:00:00Z', closedAt: null,
};
const event: AuditFindingEvent = {
  id: 'event', findingId: finding.id, actorId: 'user', actorName: 'Responsable du traitement', createdAt: '2026-10-06T09:00:00Z',
  status: 'resolved', treatment: finding.treatment,
};
const participants: AuditParticipant[] = [
  { personId: 101, firstName: 'Camille', lastName: 'QA_SIGNED_PARTICIPANT', functionLabel: 'Capitaine', source: 'selected', signatureSnapshot: { storage_path: 'test/signature.png' } },
  { personId: 102, firstName: 'Alexis', lastName: 'QA_UNSIGNED_PARTICIPANT', functionLabel: 'Matelot', source: 'contributor', signatureSnapshot: {} },
  { personId: null, userId: 'qa-user-without-rh', firstName: '', lastName: 'qa.contributor@example.invalid', functionLabel: '', source: 'contributor', signatureSnapshot: {} },
];
function input(changes: Partial<InternalAuditReportInput> = {}): InternalAuditReportInput {
  return { audit, site, audits: [], findings: [finding], events: [event], generatedAt: new Date('2026-10-01T10:00:00Z'), ...changes };
}
async function saveQaReport(filename: string, blob: Blob) {
  const directory = process.env.AUDIT_REPORT_QA_OUTPUT;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), new Uint8Array(await blob.arrayBuffer()));
}
async function pdfProof(blob: Blob) {
  const document = await PDFDocument.load(await blob.arrayBuffer());
  const streams = document.context.enumerateIndirectObjects().map(([, object]) => object).filter((object): object is PDFRawStream => object instanceof PDFRawStream);
  const content = streams.filter((stream) => stream.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image')
    .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('\n');
  const images = streams.filter((stream) => stream.dict.get(PDFName.of('Subtype'))?.toString() === '/Image');
  return { document, content, images };
}

describe('internal audit report data', () => {
  it('preserves the selected snapshot, exact N-1 comparison, scope and chronological treatment history', () => {
    const previous = { ...audit, id: 'previous', year: 2025, rows: rows.map((row) => ({ ...row, answer: 'non_conforme' as const })) };
    const data = internalAuditReportData(input({
      audits: [{ ...previous, id: 'old', year: 2024 }, previous, { ...previous, id: 'other-company', companyId: 2 }],
      findings: [finding, { ...finding, id: 'other-audit', auditId: 'other' }, { ...finding, id: 'other-company', companyId: 2 }],
      events: [event, { ...event, id: 'earlier', createdAt: '2026-10-02T09:00:00Z' }, { ...event, id: 'other', findingId: 'other-audit' }],
    }));
    expect(data.questions).toHaveLength(61);
    expect(data.questions[60].row.observation).toBe('TRACE_LAST_QUESTION');
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].events.map((value) => value.id)).toEqual(['earlier', 'event']);
    expect(data.comparison.previousAudit?.id).toBe('previous');
    expect(data.comparison.previous?.percentage).toBe(0);
    expect(data.comparison.delta).toBe(data.score.percentage);
  });
  it('keeps N/A excluded, a genuine zero visible and missing prior-year history explicit', () => {
    const data = internalAuditReportData(input({ audit: { ...audit, rows: [
      { ...rows[0], answer: 'na', maxPoints: 100 },
      { ...rows[1], answer: 'non_conforme', maxPoints: 3 },
      { ...rows[2], answer: 'incomplet', maxPoints: 3 },
    ] } }));
    expect(data.score).toMatchObject({ earnedPoints: 1.5, maxPoints: 6, percentage: 25 });
    expect(data.questions.map((row) => row.earnedPoints)).toEqual([null, 0, 1.5]);
    expect(data.questions[0].pointsLabel).toBe('Hors calcul (N/A)');
    expect(data.comparison.previous).toBeNull();
    expect(auditReportPercent(0)).toBe('0 %');
    expect(auditReportPercent(null)).toBe('N/A');
  });
  it('labels unfinished exports as drafts and rejects a mismatching site', () => {
    expect(internalAuditReportFilename({ ...audit, status: 'in_progress' }, { ...site, name: 'Armement - CHERBOURG' }))
      .toBe('Audit_ISM_Interne_Armement_CHERBOURG_2026_Brouillon.pdf');
    expect(internalAuditReportData(input({ audit: { ...audit, status: 'planned' } })).draft).toBe(true);
    expect(() => internalAuditReportData(input({ site: { ...site, companyId: 2 } }))).toThrow('ne correspond pas');
    expect(auditReportTimestampDay('2026-10-01T22:30:00Z')).toBe('2026-10-02');
  });
  it('sorts only the displayed grid by HR function with unassigned rows last and keeps scores unchanged', () => {
    const selected = { ...audit, rows: [
      { ...rows[0], hrFunction: 'Matelot' }, { ...rows[1], hrFunction: '' },
      { ...rows[2], hrFunction: 'Capitaine' }, { ...rows[3], hrFunction: ' capitaine ' },
    ] };
    const previous = { ...selected, id: 'previous', year: 2025 };
    const original = internalAuditReportData(input({ audit: selected, audits: [previous] }));
    const sorted = internalAuditReportData(input({ audit: selected, audits: [previous], sortByHrFunction: true, sections: ['chart'] }));
    expect(sorted.questions.map(({ row }) => row.id)).toEqual([rows[2].id, rows[3].id, rows[0].id, rows[1].id]);
    expect(selected.rows.map((row) => row.id)).toEqual([rows[0].id, rows[1].id, rows[2].id, rows[3].id]);
    expect(sorted.score).toEqual(original.score);
    expect(sorted.comparison).toEqual(original.comparison);
  });
  it('requires a nonempty valid PDF section selection and preserves the standard order', () => {
    expect(internalAuditReportSections()).toEqual(['grid', 'summary', 'chart']);
    expect(internalAuditReportSections(['chart', 'grid', 'grid'])).toEqual(['grid', 'chart']);
    expect(() => internalAuditReportSections([])).toThrow('au moins une section');
    expect(() => internalAuditReportSections(['unknown'] as unknown as InternalAuditReportSection[])).toThrow('section valide');
  });
});

describe('internal audit PDF export', () => {
  it.each<InternalAuditReportSection[]>([
    ['grid'], ['summary'], ['chart'], ['grid', 'summary'], ['grid', 'chart'], ['summary', 'chart'], ['grid', 'summary', 'chart'],
  ])('includes exactly the selected sections %j followed by all participants', async (...sections) => {
    const loadPhoto = vi.fn(async () => png);
    const loadSignature = vi.fn(async () => png);
    const report = await buildInternalAuditReport(input({
      sections, audit: { ...audit, rows: [{ ...rows[0], observation: 'TRACE_SECTION_GRID' }], participants },
      findings: [{ ...finding, photos: [photo], treatment: 'TRACE_SECTION_SUMMARY' }], events: [], loadPhoto, loadSignature,
    }));
    const proof = await pdfProof(report.blob);
    expect(proof.content.includes('01 - Grille')).toBe(sections.includes('grid'));
    expect(proof.content.includes('02 - Synth')).toBe(sections.includes('summary'));
    expect(proof.content.includes('03 - Graphique')).toBe(sections.includes('chart'));
    expect(proof.content.includes('TRACE_SECTION_GRID')).toBe(sections.includes('grid'));
    expect(proof.content.includes('TRACE_SECTION_SUMMARY')).toBe(sections.includes('summary'));
    expect(loadPhoto).toHaveBeenCalledTimes(sections.includes('summary') ? 1 : 0);
    expect(loadSignature).toHaveBeenCalledOnce();
    expect(loadSignature).toHaveBeenCalledWith(participants[0]);
    for (const participant of participants) expect(proof.content).toContain(participant.lastName);
    expect(proof.content).toContain('Camille');
    expect(proof.content).toContain('Alexis');
    expect(proof.content).toContain('Non sign');
    expect(proof.content).toContain('04 - Participants et signatures');
    expect(proof.content).not.toContain('test/signature.png');
    expect(proof.content).not.toContain('qa-user-without-rh');
    expect(proof.images.length).toBeGreaterThan(0);
    const lastSection = sections.includes('chart') ? '03 - Graphique' : sections.includes('summary') ? '02 - Synth' : '01 - Grille';
    expect(proof.content.lastIndexOf('04 - Participants et signatures')).toBeGreaterThan(proof.content.lastIndexOf(lastSection));
    if (sections.length === 3 && process.env.AUDIT_REPORT_QA_OUTPUT) {
      const fullReport = await buildInternalAuditReport(input({ audit: { ...audit, participants,
        rows: rows.map((row, index) => ({ ...row, hrFunction: index % 2 === 0 ? 'Capitaine' : 'Matelot' })) }, loadSignature, sortByHrFunction: true }));
      await saveQaReport('audit-all-sections-signatures.pdf', fullReport.blob);
    }
  });
  it('downloads the blank persisted grid before the audit is completed', async () => {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const append = vi.fn();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-grid');
    vi.stubGlobal('document', { createElement: () => link, body: { append } });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    try {
      await downloadInternalAuditGridReport(input({ audit: { ...audit, status: 'planned', performedOn: null, rows: [{ ...rows[0], answer: null, observation: '' }] } }));
      expect(link.download).toBe('Grille_Audit_ISM_Interne_LE_ROZEL_2026_Brouillon.pdf');
      expect(link.href).toBe('blob:download-grid');
      expect(append).toHaveBeenCalledWith(link);
      expect(link.click).toHaveBeenCalledOnce();
      expect(link.remove).toHaveBeenCalledOnce();
      const proof = await pdfProof(createUrl.mock.calls[0][0] as Blob);
      expect(proof.content).toContain('Non renseign');
      expect(proof.content).toContain('BROUILLON');
      expect(proof.content).not.toContain('TRACE_TREATMENT');
    } finally { createUrl.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('exports the template with blank answers before planning, HR order and no invented audit dates', async () => {
    const template: AuditTemplate = { id: 'qa-template', companyId: 1, siteId: site.id, name: 'Grille BBTM QA', version: 4, active: true,
      rows: rows.map((row, index) => ({ ...row, hrFunction: index % 3 === 0 ? 'Matelot' : index % 3 === 1 ? 'Capitaine' : '',
        question: `${index === 0 ? 'QA_TEMPLATE_MATE ' : index === 1 ? 'QA_TEMPLATE_CAPTAIN ' : index === 2 ? 'QA_TEMPLATE_NONE ' : ''}${row.question}` })) };
    const report = await buildInternalAuditTemplateReport({ template, site, sortByHrFunction: true });
    const proof = await pdfProof(report.blob);
    expect(report.filename).toBe('Modele_Grille_Audit_ISM_Grille_BBTM_QA_v4.pdf');
    expect(proof.content).toContain('GRILLE VIERGE');
    expect(proof.content).toContain('Version 4');
    expect(proof.content).toContain('Non affect');
    expect(proof.content.indexOf('QA_TEMPLATE_CAPTAIN')).toBeLessThan(proof.content.indexOf('QA_TEMPLATE_MATE'));
    expect(proof.content.indexOf('QA_TEMPLATE_MATE')).toBeLessThan(proof.content.indexOf('QA_TEMPLATE_NONE'));
    expect(proof.content).not.toContain('TRACE_LAST_QUESTION');
    expect(proof.content).not.toContain('Campagne');
    expect(proof.content).not.toContain('Date de r');
    expect(proof.content).not.toContain('Audit 0');
    expect(proof.content).not.toContain('BROUILLON');
    expect(proof.content).not.toContain('04 - Participants');
    expect(proof.content).not.toContain('02 - Synth');
    expect(proof.content).not.toContain('03 - Graphique');
    expect(proof.images).toHaveLength(0);
    expect(template.rows[60]).toMatchObject({ answer: rows[60].answer, observation: 'TRACE_LAST_QUESTION' });
    await expect(buildInternalAuditTemplateReport({ template, site: { ...site, companyId: 2 } })).rejects.toThrow('ne correspond pas');
    await saveQaReport('audit-template-blank-hr.pdf', report.blob);
  });
  it('keeps long participant identities and their unsigned status on a summary-only report', async () => {
    const longParticipant = { ...participants[1], firstName: 'Marie Elisabeth Sophie Anne '.repeat(12) + 'QA_FIRSTNAME_END',
      lastName: 'de la Roche Saint Pierre '.repeat(12) + 'QA_LASTNAME_END' };
    const report = await buildInternalAuditReport(input({ sections: ['summary'], audit: { ...audit, participants: [longParticipant] } }));
    const proof = await pdfProof(report.blob);
    expect(proof.content).toContain('QA_FIRSTNAME_END');
    expect(proof.content).toContain('QA_LASTNAME_END');
    expect(proof.content).toContain('Non sign');
    expect(proof.content).not.toContain('03 - Graphique');
    expect(proof.content).not.toContain('01 - Grille');
    await saveQaReport('audit-summary-long-participant.pdf', report.blob);
  });
  it('distinguishes an absent profile signature from a stored signature that cannot be downloaded', async () => {
    const loadSignature = vi.fn(async () => png);
    expect(await resolveInternalAuditReportSignature(input({ loadSignature }), participants[1])).toBeNull();
    expect(loadSignature).not.toHaveBeenCalled();
    await expect(buildInternalAuditReport(input({ audit: { ...audit, participants: [participants[0]] }, loadSignature: async () => null })))
      .rejects.toThrow('signature de Camille QA_SIGNED_PARTICIPANT est indisponible');
    await expect(resolveInternalAuditReportSignature(input({ loadSignature: async () => { throw new Error('Storage failure'); } }), participants[0]))
      .rejects.toThrow('signature de Camille QA_SIGNED_PARTICIPANT est indisponible');
    await expect(resolveInternalAuditReportSignature(input(), participants[0])).rejects.toThrow('signature de Camille QA_SIGNED_PARTICIPANT est indisponible');
    await expect(resolveInternalAuditReportSignature(input({ loadSignature: async () => 'data:image/gif;base64,AA==' }), participants[0]))
      .rejects.toThrow('n’est pas compatible');
    const loadPhoto = vi.fn(async () => png);
    await expect(buildInternalAuditReport(input({ sections: [], audit: { ...audit, participants: [participants[0]] },
      findings: [{ ...finding, photos: [photo] }], loadPhoto, loadSignature }))).rejects.toThrow('au moins une section');
    expect(loadPhoto).not.toHaveBeenCalled();
    expect(loadSignature).not.toHaveBeenCalled();
  });
  it('builds an entire printable grid without synthesis, graph or private-photo downloads', async () => {
    const loadPhoto = vi.fn(async () => { throw new Error('Private photo unavailable'); });
    const report = await buildInternalAuditGridReport(input({ audit: { ...audit, status: 'in_progress' }, findings: [{ ...finding, photos: [photo] }], loadPhoto }));
    const proof = await pdfProof(report.blob);
    expect(report.filename).toBe('Grille_Audit_ISM_Interne_LE_ROZEL_2026_Brouillon.pdf');
    expect(proof.content).toContain('TRACE_LAST_QUESTION');
    expect(proof.content).toContain('BROUILLON');
    expect(proof.content).not.toContain('TRACE_TREATMENT');
    expect(proof.content).not.toContain('02 - Synth');
    expect(proof.content).not.toContain('03 - Graphique');
    expect(loadPhoto).not.toHaveBeenCalled();
    expect(proof.images).toHaveLength(0);
    expect(report.pageCount).toBeGreaterThan(3);
    if (process.env.AUDIT_REPORT_QA_OUTPUT) await writeFile(join(process.env.AUDIT_REPORT_QA_OUTPUT, 'audit-grid-only.pdf'), new Uint8Array(await report.blob.arrayBuffer()));
  });
  it('reserves a preview during the click and never invokes physical printing', async () => {
    const preview = { opener: {}, document: { title: '', body: { textContent: '' } }, location: { replace: vi.fn() }, close: vi.fn(), closed: false, print: vi.fn() };
    const open = vi.fn(() => preview);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grid-preview');
    vi.stubGlobal('window', { open, setTimeout: vi.fn() });
    try {
      const promise = openInternalAuditGridPrintPreview(input());
      expect(open).toHaveBeenCalledWith('', '_blank');
      expect(preview.opener).toBeNull();
      await promise;
      expect(preview.location.replace).toHaveBeenCalledWith('blob:grid-preview');
      expect(preview.print).not.toHaveBeenCalled();
      expect(preview.close).not.toHaveBeenCalled();
    } finally { createUrl.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('reports a blocked preview explicitly before generating a document', async () => {
    vi.stubGlobal('window', { open: () => null });
    try { await expect(openInternalAuditGridPrintPreview(input())).rejects.toThrow('aperçu a été bloqué'); }
    finally { vi.unstubAllGlobals(); }
  });
  it('generates a real multipage landscape PDF containing the full grid, treatment and comparison', async () => {
    const report = await buildInternalAuditReport(input());
    const proof = await pdfProof(report.blob);
    expect(report.blob.type).toBe('application/pdf');
    expect(proof.document.getPageCount()).toBe(report.pageCount);
    expect(report.pageCount).toBeGreaterThan(4);
    expect(proof.document.getPage(0).getWidth()).toBeGreaterThan(proof.document.getPage(0).getHeight());
    expect(proof.content).toContain('TRACE_LAST_QUESTION');
    expect(proof.content).toContain('TRACE_TREATMENT');
    expect(proof.content).toContain('03 - Graphique');
    expect(proof.content).toContain('Aucun audit');
    expect(proof.content).toContain('2025');
    const chapterBlocks = proof.content.split('BT').filter((block) => block.includes('(5. Responsabilit'));
    expect(chapterBlocks.length).toBeGreaterThan(1);
    // A page header must not change the following chart label to its 13-point bold font.
    expect(chapterBlocks.every((block) => Number(block.match(/\/F\d+ ([\d.]+) Tf/)?.[1]) <= 8.5)).toBe(true);
  });
  it('embeds finding and treatment photos and handles very long user-entered text across pages', async () => {
    const qaDirectory = process.env.AUDIT_REPORT_QA_OUTPUT;
    const image = qaDirectory ? await readFile(join(qaDirectory, 'qa-photo-base64.txt'), 'utf8') : png;
    const loadPhoto = vi.fn(async () => image);
    const longText = 'Contrôle du système de gestion de la sécurité, documents conservés à bord et consignes applicables à l’équipage. '.repeat(75);
    const example = input({
      site: { ...site, name: 'HIRONDELLE DE LA MANCHE' },
      audit: { ...audit, status: 'in_progress', rows: [...rows.slice(0, -1), { ...rows[60], question: longText, guidance: longText, observation: 'TRACE_LAST_QUESTION ' + longText }] },
      findings: [{ ...finding, photos: [photo], description: longText }],
      events: [{ ...event, treatment: 'TRACE_TREATMENT ' + longText, photos: [photo] }],
      audits: [{ ...audit, id: 'previous', year: 2025, rows: rows.map((row) => ({ ...row, answer: 'non_conforme' })) }],
      loadPhoto,
    });
    const report = await buildInternalAuditReport(example);
    const proof = await pdfProof(report.blob);
    expect(report.filename).toContain('_Brouillon.pdf');
    expect(proof.images.length).toBeGreaterThan(0);
    expect(report.pageCount).toBeGreaterThan(8);
    expect(proof.content).toContain('TRACE_LAST_QUESTION');
    expect(proof.content).toContain('TRACE_TREATMENT');
    expect(loadPhoto).toHaveBeenCalledOnce();
    if (qaDirectory) {
      await mkdir(qaDirectory, { recursive: true });
      await writeFile(join(qaDirectory, 'audit-long-questions-photos.pdf'), new Uint8Array(await report.blob.arrayBuffer()));
      const { buildInternalAuditWorkbook } = await import('./internalAuditWorkbook');
      const workbook = await buildInternalAuditWorkbook(example);
      await writeFile(join(qaDirectory, 'audit-long-questions-photos.xlsx'), new Uint8Array(await workbook.blob.arrayBuffer()));
      const standard = await buildInternalAuditReport(input());
      await writeFile(join(qaDirectory, 'audit-completed-no-previous.pdf'), new Uint8Array(await standard.blob.arrayBuffer()));
    }
  });
  it('fails explicitly before download when any photo is unavailable or in an unsupported format', async () => {
    await expect(buildInternalAuditReport(input({ findings: [{ ...finding, photos: [photo] }], loadPhoto: async () => null })))
      .rejects.toThrow('ne peut pas être incluse');
    await expect(resolveInternalAuditReportPhoto(input({ loadPhoto: async () => 'data:image/gif;base64,AA==' }), photo))
      .rejects.toThrow('n’est pas compatible');
  });
});
