// @vitest-environment node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildOrgImage, buildOrgPdf, orgPdfGeometry } from './organigrammeExport';
import { buildOrganigramme, type OrgOptions } from './organigrammeModel';
import { ORG_DEMO, ORG_LINKS_DEMO } from './organigrammeFixtures';
import { layoutOrganigramme } from './organigrammeDiagram';

const options: OrgOptions = { view: 'vessels', vesselIds: [], includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
describe('organigramme exports', () => {
  it.each(['vessels', 'functions'] as const)('exports the complete %s chart on exactly one landscape page', async (view) => {
    const sections = buildOrganigramme(ORG_LINKS_DEMO, { ...options, view });
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const blob = await buildOrgPdf(sections, true, ORG_DEMO.asOf, view, logo);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toContain('REP 03-B');
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages().every((page) => page.getWidth() > page.getHeight())).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(10000);
    if (process.env.ORG_EXPORT_QA_DIR && view === 'vessels') {
      await mkdir(process.env.ORG_EXPORT_QA_DIR, { recursive: true });
      await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'BBTM_Organigramme_exemple.pdf'), bytes);
    }
  });
  it('keeps a wide fleet on one page and fits every card between header and footer', async () => {
    const base = buildOrganigramme(ORG_LINKS_DEMO, options);
    const template = base.find((section) => section.kind === 'vessel')!;
    const fleet = Array.from({ length: 8 }, (_, index) => ({ ...template, key: `test-${index}`, label: `NAVIRE ${index + 1}` }));
    const sections = [base[0], ...fleet, ...base.filter((section) => section.kind === 'external' || section.kind === 'relations')];
    const diagram = layoutOrganigramme(sections);
    const { width, height, scale, offsetX, offsetY } = orgPdfGeometry(diagram);
    diagram.boxes.forEach((box) => {
      expect(offsetX + box.x * scale).toBeGreaterThanOrEqual(12);
      expect(offsetX + (box.x + box.width) * scale).toBeLessThanOrEqual(width - 12);
      expect(offsetY + box.y * scale).toBeGreaterThanOrEqual(35);
      expect(offsetY + (box.y + box.height) * scale).toBeLessThanOrEqual(height - 20);
    });
    const blob = await buildOrgPdf(sections, true, ORG_DEMO.asOf, 'vessels', new Uint8Array(await readFile('public/bbtm-report-logo.png')));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0].getWidth() * 25.4 / 72).toBeCloseTo(width, 1);
    if (process.env.ORG_EXPORT_QA_DIR) await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'BBTM_Organigramme_flotte_8_navires.pdf'), bytes);
  });
  it('scales exceptional dimensions within the PDF page limits without adding pages', () => {
    const geometry = orgPdfGeometry({ width: 100_000, height: 100_000, boxes: [], lines: [] });
    expect(geometry.width).toBeLessThan(5080); expect(geometry.height).toBeLessThan(5080);
    expect(geometry.scale * 100_000 + geometry.offsetY).toBeLessThanOrEqual(geometry.height - 20);
    expect(geometry.scale * 100_000 + geometry.offsetX).toBeLessThanOrEqual(geometry.width - 12);
  });
  it('exports only diagram content in SVG with no vessels or PDF letterhead when disabled', async () => {
    const sections = buildOrganigramme(ORG_LINKS_DEMO, { ...options, view: 'functions', showVessels: false });
    const blob = await buildOrgImage(sections, false, 'svg');
    const svg = await blob.text();
    expect(blob.type).toContain('image/svg+xml');
    expect(svg).toContain('Élodie MARTIN'); expect(svg).toContain('Cabinet comptable');
    expect(svg).not.toContain('GOURY'); expect(svg).not.toContain('LE ROZEL');
    expect(svg).toContain('Référente opérationnelle'); expect(svg).toContain('Liens');
    expect(svg).not.toContain('REP 03-B'); expect(svg).not.toContain('87-Organigramme.docx');
    if (process.env.ORG_EXPORT_QA_DIR) await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'BBTM_Organigramme_sans_navires.svg'), svg);
  });
});
