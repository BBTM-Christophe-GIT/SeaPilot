import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildLiftingPaperPdf } from './liftingPaperPdf';
import { createLiftingPreviewClient, demoVessel } from './liftingPreview';
import { fetchLiftingPaperInventory } from './liftingQueries';
import type { LiftingItem } from './liftingModel';

async function readPdf(blob: Blob) {
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  const text = pdf.getPages().map((page) => {
    const contents = page.node.Contents(); if (!contents) return '';
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    return streams.map((ref) => {
      const stream = pdf.context.lookup(ref);
      return stream instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode()) : '';
    }).join('\n');
  }).join('\n');
  return { pdf, text };
}

describe('blank paper PDFs', () => {
  it.each(['lifting', 'towing'] as const)('prints only the current %s inventory with blank results, decisions and observations', async (kind) => {
    const current = await fetchLiftingPaperInventory(createLiftingPreviewClient(), demoVessel.id, kind);
    const rows = current.items.map((item) => ({ ...item, description: 'MATERIEL ACTUEL', swl_tonnes: kind === 'lifting' ? 6.5 : null, notes: 'ANCIEN RESULTAT A NE PAS REPRENDRE' }));
    const excluded = { ...rows[0], id: 999, active: false, description: 'MATERIEL SUPPRIME' };
    const result = await buildLiftingPaperPdf(demoVessel, kind, [...rows, excluded], { includeNotice: false, generatedAt: new Date('2026-09-09T12:30:00Z') });
    const { pdf, text } = await readPdf(result.blob);
    expect(result.filename).toContain('Fiche de contrôle papier');
    expect(result.filename).toContain('2026-09-09');
    expect(result.itemCount).toBe(current.items.length);
    expect(pdf.getTitle()).toContain(demoVessel.name);
    expect(text).toContain('MATERIEL ACTUEL');
    expect(text).toContain(kind === 'lifting' ? '(CMU : 6,5 t)' : '(CMU : non renseignée)');
    expect(text).not.toContain('MATERIEL SUPPRIME');
    expect(text).not.toContain('ANCIEN RESULTAT');
    expect(text).toContain('(C)'); expect(text).toContain('(NC)');
    expect(text).not.toContain('(S)'); expect(text).not.toContain('(I)');
    expect(text).not.toContain('SeaPilot |');
    expect(text).not.toContain('Ancien ID');
    expect(text).toContain(kind === 'towing' ? '(NID)' : '(ID)');
    expect(text).not.toContain('Rapport LEV-');
    for (const page of pdf.getPages()) { expect(page.getWidth()).toBeCloseTo(841.89, 0); expect(page.getHeight()).toBeCloseTo(595.28, 0); }
  });
  it('groups by accessory, sorts identifiers numerically and includes new categories awaiting guidance', async () => {
    const base = (await fetchLiftingPaperInventory(createLiftingPreviewClient(), demoVessel.id, 'lifting')).items[0];
    const rows = [
      { ...base, id: 1, material_type: 'Manilles', reference: '10', description: 'MANILLE DIX' },
      { ...base, id: 2, material_type: 'Manilles', reference: '2', description: 'MANILLE DEUX' },
      { ...base, id: 3, material_type: 'Anneaux de levage', reference: '1', description: 'ANNEAU UN' },
      { ...base, id: 4, material_type: 'Grappins', reference: '3', description: 'GRAPPIN TROIS' },
    ] as LiftingItem[];
    const { text } = await readPdf((await buildLiftingPaperPdf(demoVessel, 'lifting', rows, { includeNotice: false })).blob);
    expect(text.indexOf('ANNEAU UN')).toBeLessThan(text.indexOf('GRAPPIN TROIS'));
    expect(text.indexOf('GRAPPIN TROIS')).toBeLessThan(text.indexOf('MANILLE DEUX'));
    expect(text.indexOf('MANILLE DEUX')).toBeLessThan(text.indexOf('MANILLE DIX'));
    expect(text).toContain('(?)');
  });
  it('paginates a large inventory without dropping items and appends the current notice on one A3 page', async () => {
    const base = (await fetchLiftingPaperInventory(createLiftingPreviewClient(), demoVessel.id, 'lifting')).items[0];
    const rows = Array.from({ length: 41 }, (_, index) => ({ ...base, id: index + 1, reference: String(index + 1), description: `UNIQUE-MATERIEL-${String(index + 1).padStart(3, '0')}` }));
    const { pdf, text } = await readPdf((await buildLiftingPaperPdf(demoVessel, 'lifting', rows)).blob);
    expect(pdf.getPageCount()).toBeGreaterThan(5);
    for (const item of rows) expect(text.split(item.description)).toHaveLength(2);
    expect(text).toContain('NOTICE EXPLICATIVE');
    expect(text).toContain('Plate lifting clamps');
    expect(pdf.getPages().at(-1)!.getWidth()).toBeCloseTo(1190.55, 0);
    expect(pdf.getPages().slice(0, -1).every((page) => page.getWidth() < 850)).toBe(true);
  });
});
