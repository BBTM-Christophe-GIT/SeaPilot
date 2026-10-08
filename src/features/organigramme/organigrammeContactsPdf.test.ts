// @vitest-environment node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildOrgContactsPdf } from './organigrammeContactsPdf';
import { ORG_CONTACT_CONTENT, selectedOrgContacts } from './organigrammeContacts';
import { ORG_DEMO } from './organigrammeFixtures';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function pdfText(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const document = await task.promise;
  const pages: string[] = [];
  for (let page = 1; page <= document.numPages; page++) {
    const content = await (await document.getPage(page)).getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  await task.destroy(); return pages;
}

describe('contact PDF sheets', () => {
  it.each(['personnel', 'emergency'] as const)('prints the exact priorities, surname order and function hierarchy in the %s PDF', async (kind) => {
    const names = [['Alice','Zola','Capitaine'],['Julien','LECOCQ','Chef Mécanicien'],['Adam','DEBORDEAUX','Stagiaire'],['Zoé','Albert','Capitaine'],['Sophie','Hamel','Administration'],['Christophe','Minassian','Direction'],['Benjamin','Bon','Président']];
    const people = names.map(([firstName,lastName,functionLabel],id) => ({ id,firstName,lastName,functionLabel,name:`${firstName} ${lastName}`,population:'sedentary' }));
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const text = (await pdfText(new Uint8Array(await (await buildOrgContactsPdf([{ kind,people }],ORG_DEMO.asOf,logo)).arrayBuffer()))).join(' ');
    const ordered = ['Benjamin BON','Julien LECOCQ','Christophe MINASSIAN','Sophie HAMEL','Zoé ALBERT','Alice ZOLA','Adam DEBORDEAUX'];
    ordered.forEach((name,index) => { expect(text).toContain(name); if (index) expect(text.indexOf(name)).toBeGreaterThan(text.indexOf(ordered[index-1])); });
    expect(text).toContain('Prénom NOM'); expect(text).not.toContain('Nom / prénom');
    expect(text.indexOf('Capitaine')).toBeLessThan(text.indexOf('Zoé ALBERT'));
  });
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
  it('fits every personnel row on one A4 page and starts emergencies on the second page', async () => {
    const people = Array.from({ length: 90 }, (_, index) => ({ ...ORG_DEMO.people[0], id: index + 1000, name: `PERSONNEL ${index + 1}`, email: `personnel.${index + 1}@example.invalid` }));
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const personnel = { kind: 'personnel' as const, people };
    const standalone = await PDFDocument.load(await (await buildOrgContactsPdf([personnel], ORG_DEMO.asOf, logo)).arrayBuffer());
    const pageText = await pdfText(new Uint8Array(await (await buildOrgContactsPdf([personnel], ORG_DEMO.asOf, logo)).arrayBuffer()));
    expect(pageText[0]).toContain('PERSONNEL 1');
    expect(pageText.every((text) => text.includes('Président') && text.includes('Prénom NOM') && /PERSONNEL \d/.test(text))).toBe(true);
    const bytes = await (await buildOrgContactsPdf([personnel, { kind: 'emergency', people: [ORG_DEMO.people[0]] }], ORG_DEMO.asOf, logo)).arrayBuffer();
    const combined = await PDFDocument.load(bytes);
    expect(standalone.getPageCount()).toBe(1);
    for (let id = 1; id <= 90; id++) expect(pageText[0]).toContain(`personnel.${id}@example.invalid`);
    expect(standalone.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
    expect(standalone.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
    expect(combined.getPageCount()).toBe(standalone.getPageCount() + 1);
    if (process.env.ORG_EXPORT_QA_DIR) await writeFile(join(process.env.ORG_EXPORT_QA_DIR, 'contacts-pagination-qa.pdf'), new Uint8Array(bytes));
  });
  it('refuses empty selections instead of exporting all people by accident', async () => {
    await expect(buildOrgContactsPdf([{ kind: 'personnel', people: [] }], ORG_DEMO.asOf)).rejects.toThrow('Sélectionnez');
  });
  it.each(['personnel', 'emergency'] as const)('includes or removes each chosen field in the %s PDF', async (kind) => {
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const person = { ...ORG_DEMO.people[1], vesselLabel: 'NAVIRE TEMOIN', watchLabel: 'BORDEE TEMOIN' };
    for (const [key, text] of [['showFunctions', 'Capitaine'], ['showEmails', person.email!], ['showPhones', person.phone!], ['showVessels', person.vesselLabel], ['showWatches', person.watchLabel]] as const) {
      for (const enabled of [false, true]) {
        const blob = await buildOrgContactsPdf([{ kind, people: [person], content: { ...ORG_CONTACT_CONTENT, [key]: enabled } }], ORG_DEMO.asOf, logo);
        const output = (await pdfText(new Uint8Array(await blob.arrayBuffer()))).join(' ');
        expect(output.includes(text)).toBe(enabled);
        expect(output).toContain(person.name);
      }
    }
  });
  it('blocks unavailable selected photos but permits export with photos switched off', async () => {
    const people = [{ ...ORG_DEMO.people[0], photoUnavailable: true }];
    await expect(buildOrgContactsPdf([{ kind: 'personnel', people, content: { ...ORG_CONTACT_CONTENT, showPhotos: true } }], ORG_DEMO.asOf)).rejects.toThrow('photo sélectionnée');
    const logo = new Uint8Array(await readFile('public/bbtm-report-logo.png'));
    const pdf = await buildOrgContactsPdf([{ kind: 'personnel', people, content: ORG_CONTACT_CONTENT }], ORG_DEMO.asOf, logo);
    expect((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount()).toBe(1);
  });
});
