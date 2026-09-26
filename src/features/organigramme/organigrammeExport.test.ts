// @vitest-environment node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildOrgImage, buildOrgPdf } from './organigrammeExport';
import { buildOrganigramme, type OrgOptions } from './organigrammeModel';
import { ORG_DEMO } from './organigrammeFixtures';
import { paginateOrganigramme } from './organigrammeDiagram';

const options: OrgOptions = { view: 'vessels', vesselIds: [], includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
describe('organigramme exports', () => {
  it('builds a landscape, paginated PDF with the BBTM logo and document reference', async () => {
    const sections = buildOrganigramme(ORG_DEMO, options);
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const blob = await buildOrgPdf(sections, true, ORG_DEMO.asOf, 'vessels', logo);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toContain('REP 03-B');
    expect(pdf.getPageCount()).toBe(paginateOrganigramme(sections, true).length);
    expect(pdf.getPages().every((page) => page.getWidth() > page.getHeight())).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(10000);
    if (process.env.ORG_EXPORT_QA_DIR) {
      await mkdir(process.env.ORG_EXPORT_QA_DIR, { recursive: true });
      await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'BBTM_Organigramme_exemple.pdf'), bytes);
    }
  });
  it('exports only diagram content in SVG with no vessels or PDF letterhead when disabled', async () => {
    const sections = buildOrganigramme(ORG_DEMO, { ...options, view: 'functions', showVessels: false });
    const blob = await buildOrgImage(sections, false, 'svg');
    const svg = await blob.text();
    expect(blob.type).toContain('image/svg+xml');
    expect(svg).toContain('Élodie MARTIN'); expect(svg).toContain('Cabinet comptable');
    expect(svg).not.toContain('GOURY'); expect(svg).not.toContain('LE ROZEL');
    expect(svg).not.toContain('REP 03-B'); expect(svg).not.toContain('87-Organigramme.docx');
    if (process.env.ORG_EXPORT_QA_DIR) await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'BBTM_Organigramme_sans_navires.svg'), svg);
  });
});
