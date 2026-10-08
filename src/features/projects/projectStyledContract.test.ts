import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import terms from './assets/contract-previews/contract-terms.json';
import { BAREBOAT_CONTRACT_TYPE, TIME_CHARTER_CONTRACT_TYPE } from './projectContractOptions';
import {
  buildStyledContract,
  contractPreviewFields,
  contractTextWidth,
  STYLED_CONTRACT_SECTIONS,
  wrapContractText,
  type ContractDrawing,
} from './projectStyledContract';

const textOf = (pages: ContractDrawing[][]) => pages.flatMap((page) => page.flatMap((item) => item.type === 'text' ? item.lines : [])).join(' ');
const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();

it('keeps the time and bareboat charter PDFs identical apart from the document title', () => {
  const time = buildStyledContract('bareboat', { PROJECT_CODE: 'P279' }, 'Projet de contrôle', false, TIME_CHARTER_CONTRACT_TYPE);
  const bareboat = buildStyledContract('bareboat', { PROJECT_CODE: 'P279' }, 'Projet de contrôle', false, BAREBOAT_CONTRACT_TYPE);
  expect(time.title).toBe('CONTRAT D’AFFRÈTEMENT À TEMPS');
  expect(bareboat.title).toBe('CONTRAT D’AFFRÈTEMENT COQUE NUE');
  const withoutTitle = (pages: ContractDrawing[][]) => pages.map((page) => page.filter((item) => !(item.type === 'text' && item.x === 110 && item.y === 30)));
  expect(withoutTitle(time.pages)).toEqual(withoutTitle(bareboat.pages));
  for (const layout of [time, bareboat]) {
    const title = layout.pages[0].find((item) => item.type === 'text' && item.x === 110 && item.y === 30);
    expect(title?.type === 'text' && title.lines).toHaveLength(1);
  }
});

describe.each(['towage', 'bareboat'] as const)('%s contract layout', (kind) => {
  it('preserves every numbered field in the preview and printable layout', () => {
    const fields = STYLED_CONTRACT_SECTIONS[kind].flatMap((section) => section.fields);
    const preview = Object.fromEntries(fields.map((field, index) => [field.previewKey, `Valeur spécifique ${index} à conserver`]));
    const mapped = contractPreviewFields(kind, {
      ...preview,
      projectCode: 'P279',
      headerDate: '28/09/2026',
      ownerSignatory: 'Camille Exemple',
      ownerSignatoryFunction: 'Responsable des opérations maritimes',
      chartererSignatory: 'Alex Exemple',
      signatureStatement: 'Fait à Cherbourg, le 28 septembre 2026',
    });
    const layout = buildStyledContract(kind, mapped, 'Projet de contrôle', true);
    const content = textOf(layout.pages);
    fields.forEach((field) => {
      expect(mapped[field.key]).toBe(preview[field.previewKey]);
      expect(content).toContain(preview[field.previewKey]);
    });
    expect(content).toContain('Camille Exemple');
    expect(content).toContain('Alex Exemple');
    expect(content).toContain('Responsable des opérations maritimes');
    expect(layout.pages.flat().filter((item) => item.type === 'image' && item.source === 'signature')).toHaveLength(2);
    const legalText = layout.pages.flatMap((page) => page.flatMap((item) => item.type === 'text' && item.x === 42 && item.size === 9 && item.y >= 125 ? item.lines : [])).join(' ');
    terms[kind].sections.forEach((section) => section.paragraphs.forEach((paragraph) => {
      expect(normalized(legalText)).toContain(normalized(paragraph));
    }));
  });

  it('flows long fields across pages without losing text or crossing the footer', () => {
    const longValue = Array.from({ length: 700 }, (_, index) => `Information ${index} à conserver.`).join(' ');
    const fields = { [kind === 'towage' ? 'CONNECTION_TIME' : 'EXTENSIONS']: longValue };
    const layout = buildStyledContract(kind, fields, 'Projet', false);
    expect(normalized(textOf(layout.pages))).toContain('Information 699 à conserver.');
    for (const page of layout.pages) {
      for (const item of page) {
        if (item.type === 'text' && item.y < 806) {
          expect(item.y + item.size + (item.lines.length - 1) * item.leading).toBeLessThanOrEqual(784);
          for (const line of item.lines) expect(item.x + contractTextWidth(line, item.size, item.weight)).toBeLessThanOrEqual(554);
        }
        if (item.type === 'rect' && item.y < 806) expect(item.y + item.height).toBeLessThanOrEqual(784);
      }
    }
    const valueLines = layout.pages.flatMap((page) => page.flatMap((item) => item.type === 'text' && item.x === 217 ? item.lines : []));
    expect(normalized(valueLines.join(' '))).toContain(longValue);
  });

  it('retains the exact legal paragraphs from the existing DOCX source', async () => {
    const source = terms[kind];
    const bytes = await readFile(resolve('public/templates', source.source));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sourceSha256);
    const zip = await JSZip.loadAsync(bytes);
    const xml = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
    const paragraphs = Array.from(xml.getElementsByTagName('w:p')).map((paragraph) => (
      Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent).join('').trim()
    ));
    const [start, end] = source.paragraphRange;
    expect(source.sections.flatMap((section) => [section.title, ...section.paragraphs])).toEqual(paragraphs.slice(start, end).filter(Boolean));
  });
});

it('wraps French text and unbroken references within the actual PDF font width', async () => {
  const pdf = await PDFDocument.create();
  for (const weight of ['regular', 'bold'] as const) {
    const font = await pdf.embedFont(weight === 'bold' ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
    const lines = wrapContractText('Échéance d’affrètement : 40 000 € HT\n' + 'REFERENCE'.repeat(50), 155, 9, weight);
    expect(lines.length).toBeGreaterThan(3);
    lines.forEach((line) => expect(font.widthOfTextAtSize(line, 9)).toBeLessThanOrEqual(155));
  }
  expect(wrapContractText('34\u202f000\u00a0€ HT · Saint\u2011Nazaire', 511, 9)).toEqual(['34 000 € HT · Saint-Nazaire']);
});
