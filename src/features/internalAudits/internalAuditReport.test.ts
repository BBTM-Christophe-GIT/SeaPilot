// @vitest-environment node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { BBTM_AUDIT_QUESTIONS } from './internalAuditSeed';
import type { AuditAnswer, AuditFinding, AuditFindingEvent, AuditPhoto, AuditSite, InternalAudit } from './internalAuditModel';
import {
  auditReportPercent, auditReportTimestampDay, buildInternalAuditReport, internalAuditReportData, internalAuditReportFilename,
  resolveInternalAuditReportPhoto, type InternalAuditReportInput,
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
function input(changes: Partial<InternalAuditReportInput> = {}): InternalAuditReportInput {
  return { audit, site, audits: [], findings: [finding], events: [event], generatedAt: new Date('2026-10-01T10:00:00Z'), ...changes };
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
});

describe('internal audit PDF export', () => {
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
