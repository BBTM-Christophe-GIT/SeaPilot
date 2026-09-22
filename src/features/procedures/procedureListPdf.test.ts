// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { buildProcedureListPdf } from './procedureListPdf';
import type { ProcedureRecord } from './procedureQueries';

const logo = new Uint8Array(readFileSync('public/bbtm-report-logo.png'));

function sampleRecords(count: number): ProcedureRecord[] {
  return Array.from({ length: count }, (_, id) => ({
    id, title: `Procédure ${id + 1} - Préparation aux situations d’urgence et protection de l’environnement`,
    procedureCode: `DOC ${id + 1}-A`, documentNumber: String(id + 1), ismChapter: String((id % 5) + 1).padStart(2, '0'),
    versionLabel: 'A', revisionLabel: '', status: 'archived', vesselName: 'GOURY', diffusionOn: '2026-09-22',
  })) as ProcedureRecord[];
}

async function pdfText(blob: Blob): Promise<string[]> {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
  const parsed = await task.promise;
  const pages = await Promise.all(Array.from({ length: parsed.numPages }, async (_, index) => {
    const page = await parsed.getPage(index + 1);
    expect((await page.getOperatorList()).fnArray).toContain(OPS.paintImageXObject);
    return (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ');
  }));
  await task.destroy();
  return pages;
}

describe('procedure list PDF', () => {
  it('fits 50 documents on one portrait A4 page, groups by ISM and omits vessel and status', async () => {
    const { blob, filename } = await buildProcedureListPdf({ records: sampleRecords(50).reverse(), vessel: 'GOURY', library: 'published', logo, issuedAt: new Date('2026-09-22T12:00:00') });
    const document = await PDFDocument.load(await blob.arrayBuffer());
    expect(filename).toBe('liste-documents-qhse-goury.pdf');
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
    expect(document.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
    const [text] = await pdfText(blob);
    expect(text).toContain('LISTE DES DOCUMENTS QHSE');
    expect(text).toContain('50 document(s)');
    expect(text).not.toMatch(/GOURY|Statut|Archivée|Toute la flotte/);
    expect(text).toContain('01 - Généralités');
    expect(text).toContain('Procédure 50');
    // The input is deliberately reversed: both chapters and references must be sorted.
    expect(text.indexOf('DOC 1-A')).toBeLessThan(text.indexOf('DOC 6-A'));
    expect(text.indexOf('DOC 46-A')).toBeLessThan(text.indexOf('DOC 2-A'));
  });
  it('keeps every document when a large selection needs more than one page', async () => {
    const { blob } = await buildProcedureListPdf({ records: sampleRecords(160), vessel: '', library: 'sources', logo });
    const pages = await pdfText(blob);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((text) => text.includes('LISTE DES DOCUMENTS QHSE'))).toBe(true);
    for (let id = 1; id <= 160; id += 1) expect(pages.join(' ')).toContain(`DOC ${id}-A`);
  });
  it('retains unassigned and uncontrolled chapters after numbered chapters', async () => {
    const records = sampleRecords(3);
    records[0].ismChapter = ''; records[1].ismChapter = 'Documents non contrôlés'; records[2].ismChapter = '13';
    const { blob } = await buildProcedureListPdf({ records, vessel: '', library: 'sources', logo });
    const [text] = await pdfText(blob);
    expect(text.indexOf('DOC 3-A')).toBeLessThan(text.indexOf('DOC 2-A'));
    expect(text.indexOf('DOC 2-A')).toBeLessThan(text.indexOf('DOC 1-A'));
  });
  it('rejects an empty list', async () => {
    await expect(buildProcedureListPdf({ records: [], vessel: '', library: 'sources' })).rejects.toThrow('Sélectionnez');
  });
});
