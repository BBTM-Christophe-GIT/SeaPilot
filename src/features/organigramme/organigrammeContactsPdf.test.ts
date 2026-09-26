// @vitest-environment node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildOrgContactsPdf } from './organigrammeContactsPdf';
import { selectedOrgContacts } from './organigrammeContacts';
import { ORG_DEMO } from './organigrammeFixtures';

describe('contact PDF sheets', () => {
  it('exports each list separately and starts emergencies on their own page in the combined PDF', async () => {
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const personnel = { kind: 'personnel' as const, people: selectedOrgContacts(ORG_DEMO.people, null, 'personnel') };
    const emergency = { kind: 'emergency' as const, people: selectedOrgContacts(ORG_DEMO.people, null, 'emergency') };
    for (const [name, documents, pages] of [
      ['BBTM_Liste_du_personnel', [personnel], 1],
      ['BBTM_Numeros_urgence', [emergency], 1],
      ['BBTM_Personnel_et_urgences', [personnel, emergency], 2],
    ] as const) {
      const bytes = new Uint8Array(await (await buildOrgContactsPdf([...documents], ORG_DEMO.asOf, logo)).arrayBuffer());
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(pages);
      expect(pdf.getPage(0).getHeight()).toBeGreaterThan(pdf.getPage(0).getWidth());
      if (process.env.ORG_EXPORT_QA_DIR) { await mkdir(process.env.ORG_EXPORT_QA_DIR, { recursive: true }); await writeFile(join(process.env.ORG_EXPORT_QA_DIR, `${name}.pdf`), bytes); }
    }
  });
  it('paginates long contact lists and appends emergency sheets after the final personnel page', async () => {
    const people = Array.from({ length: 90 }, (_, index) => ({ ...ORG_DEMO.people[0], id: index + 1000, name: `PERSONNEL ${index + 1}`, email: `personnel.${index + 1}@example.invalid` }));
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const personnel = { kind: 'personnel' as const, people };
    const standalone = await PDFDocument.load(await (await buildOrgContactsPdf([personnel], ORG_DEMO.asOf, logo)).arrayBuffer());
    const bytes = await (await buildOrgContactsPdf([personnel, { kind: 'emergency', people: [ORG_DEMO.people[0]] }], ORG_DEMO.asOf, logo)).arrayBuffer();
    const combined = await PDFDocument.load(bytes);
    expect(standalone.getPageCount()).toBeGreaterThan(1);
    expect(combined.getPageCount()).toBe(standalone.getPageCount() + 1);
    if (process.env.ORG_EXPORT_QA_DIR) await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'contacts-pagination-qa.pdf'), new Uint8Array(bytes));
  });
  it('refuses empty selections instead of exporting all people by accident', async () => {
    await expect(buildOrgContactsPdf([{ kind: 'personnel', people: [] }], ORG_DEMO.asOf)).rejects.toThrow('Sélectionnez');
  });
});
