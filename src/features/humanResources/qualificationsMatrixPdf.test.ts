// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildQualificationsMatrixPdf } from './qualificationsMatrixPdf';
import {
  QUALIFICATIONS_MATRIX_CATEGORIES, QUALIFICATIONS_MATRIX_STATUS_LABELS,
  type QualificationsMatrix, type QualificationsMatrixDocument, type QualificationsMatrixPerson,
} from './qualificationsMatrixModel';

const generatedOn = new Date('2026-11-03T23:30:00Z');
const categories = QUALIFICATIONS_MATRIX_CATEGORIES.map((category) => ({ ...category }));

function document(documentId: number, title: string, status: QualificationsMatrixDocument['status'] = 'valid', expiresOn = '2027-12-31'): QualificationsMatrixDocument {
  return { documentId, title, status, statusLabel: QUALIFICATIONS_MATRIX_STATUS_LABELS[status], expiresOn,
    expiresOnLabel: expiresOn ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${expiresOn}T12:00:00Z`)) : 'Non renseignée' };
}

function person(personId: number, personName: string, functionLabel: string, rows: Partial<QualificationsMatrixPerson['categories']> = {}): QualificationsMatrixPerson {
  return { personId, personName, functionLabel, active: true, employmentStatusLabel: 'En poste',
    categories: { deck: [], engine: [], safety_training: [], medical_visit: [], safety_induction: [], lifting: [], ...rows } };
}

function example(): QualificationsMatrix {
  return { categories, peopleCount: 2, groups: [
    { functionLabel: 'Capitaine', people: [person(1, 'Marin ALPHA', 'Capitaine', {
      deck: [document(1, 'Brevet de capitaine de démonstration')],
      engine: [document(2, 'Certificat machine sans date', 'missing', '')],
      safety_training: [document(3, 'Formation de sécurité de démonstration', 'expired', '2020-01-01')],
      medical_visit: [document(4, 'Certificat médical de démonstration', 'renew_due')],
      lifting: [document(5, 'Formation de levage de démonstration', 'pending_validation')],
    })] },
    { functionLabel: 'Chef Mécanicien', people: [{ ...person(2, 'Marin BÊTA', 'Chef Mécanicien', {
      engine: [document(6, 'Brevet machine de démonstration')],
    }), active: false, employmentStatusLabel: 'Ancien' }] },
  ] };
}

async function inspect(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  const bounds: Array<{ page: number; text: string; x: number; y: number; right: number; pageWidth: number }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' '));
    for (const item of content.items) if ('str' in item && item.str.trim()) bounds.push({ page: pageNumber,
      text: item.str, x: item.transform[4], y: item.transform[5], right: item.transform[4] + item.width, pageWidth: viewport.width });
  }
  await task.destroy();
  return { pages, bounds, document: await PDFDocument.load(bytes) };
}

describe('qualification matrix PDF', () => {
  it('exports the authorized function, seafarer, categories and three document fields with Paris date and page footers', async () => {
    const matrix = example(), before = structuredClone(matrix);
    const result = await buildQualificationsMatrixPdf(matrix, generatedOn);
    expect(result.fileName).toBe('Matrice-des-Qualifications-2026-11-04.pdf');
    expect(result.blob.type).toBe('application/pdf');
    const { pages, bounds, document: pdf } = await inspect(result.blob);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    const text = pages.join(' ');
    expect(text).toContain('MATRICE DES QUALIFICATIONS');
    expect(text).toContain('Catégories exportées : Pont');
    expect(text).toContain('04/11/2026');
    expect(text.indexOf('Capitaine')).toBeLessThan(text.indexOf('Chef Mécanicien'));
    expect(text).toContain('Marin ALPHA'); expect(text).toContain('Marin BÊTA');
    expect(text).toContain('Ancien'); expect(text).toContain('Profil archivé');
    for (const category of categories.filter(category => category.key !== 'safety_induction')) expect(text).toContain(category.label);
    expect(text).not.toContain('Safety Induction');
    expect(bounds.filter(item => item.text === 'Machine')).toHaveLength(2);
    expect(bounds.filter(item => item.text === 'Pont')).toHaveLength(1);
    expect(text).toContain('Document'); expect(text).toContain('Échéance'); expect(text).toContain('Statut');
    expect(text).toContain('Brevet de capitaine de démonstration');
    expect(text).toContain('31/12/2027'); expect(text).toContain('Non renseignée');
    for (const label of Object.values(QUALIFICATIONS_MATRIX_STATUS_LABELS)) expect(text).toContain(label);
    expect(text).not.toContain('Aucun document enregistré.');
    pages.forEach((page, index) => expect(page).toContain(`Page ${index + 1} / ${pages.length}`));
    expect(matrix).toEqual(before);
  });

  it('keeps all personnel listed without empty category bands, column headers or placeholders and never discloses hidden documents', async () => {
    const matrix = example();
    matrix.categories = [categories[0]];
    matrix.groups = [{ functionLabel: 'Capitaine', people: [person(1, 'Marin ALPHA', 'Capitaine', {
      medical_visit: [document(50, 'HIDDEN-MEDICAL-DOCUMENT', 'expired')],
    }), person(2, 'Marin BÊTA', 'Capitaine')] },
    { functionLabel: 'Chef Mécanicien', people: [person(3, 'Marin GAMMA', 'Chef Mécanicien')] }];
    matrix.peopleCount = 3;
    const { pages } = await inspect((await buildQualificationsMatrixPdf(matrix, generatedOn)).blob);
    const text = pages.join(' ');
    expect(text).toContain('Catégories exportées : Aucune');
    for (const name of ['Marin ALPHA', 'Marin BÊTA', 'Marin GAMMA', 'Capitaine', 'Chef Mécanicien']) expect(text).toContain(name);
    expect(text).toContain('3 marin(s)');
    expect(text).not.toMatch(/Aucun document enregistré|Non renseigné|Manquant|Échu|HIDDEN-MEDICAL-DOCUMENT|Visite Médicale|Pont|Document|Échéance|Statut/);
  });

  it('keeps two distinct records with the same title as separate rows', async () => {
    const matrix: QualificationsMatrix = { categories: [categories[0]], peopleCount: 1,
      groups: [{ functionLabel: 'Capitaine', people: [person(1, 'Marin ALPHA', 'Capitaine', {
        deck: [document(101, 'CERTIFICAT-DUPLIQUÉ'), document(102, 'CERTIFICAT-DUPLIQUÉ')],
      })] }] };
    const { pages } = await inspect((await buildQualificationsMatrixPdf(matrix, generatedOn)).blob);
    expect(pages.join(' ').match(/CERTIFICAT-DUPLIQUÉ/g)).toHaveLength(2);
  });

  it('repeats function, person, category and column headers while preserving a document longer than a whole page', async () => {
    const words = Array.from({ length: 800 }, (_, index) => `QUALIFICATION${String(index).padStart(4, '0')}`);
    const longTitle = `DÉBUT-DOCUMENT ${words.join(' ')} FIN-DOCUMENT`;
    const matrix: QualificationsMatrix = { categories, peopleCount: 1,
      groups: [{ functionLabel: 'Capitaine', people: [person(1, 'Marin EXEMPLE AUX QUALIFICATIONS TRÈS DÉTAILLÉES', 'Capitaine', {
        safety_induction: [document(1, longTitle, 'expired', '')],
      })] }] };
    const { pages, bounds } = await inspect((await buildQualificationsMatrixPdf(matrix, generatedOn)).blob);
    expect(pages.length).toBeGreaterThan(2);
    const text = pages.join(' ');
    expect(text).toContain('DÉBUT-DOCUMENT'); expect(text).toContain('FIN-DOCUMENT');
    for (const word of words) expect(text).toContain(word);
    for (const page of pages) {
      expect(page).toContain('Capitaine'); expect(page).toContain('Marin EXEMPLE');
      expect(page).toContain('Safety Induction'); expect(page).toContain('Document'); expect(page).toContain('Échéance'); expect(page).toContain('Statut');
      expect(page).toContain('Non renseignée'); expect(page).toContain('Échu');
    }
    expect(text).not.toMatch(/Pont|Machine|Formation de sécurité|Visite Médicale|Levage|Aucun document enregistré/);
    expect(pages[1]).toContain('Safety Induction (suite)');
    for (const item of bounds) {
      expect(item.x, item.text).toBeGreaterThanOrEqual(32);
      expect(item.right, item.text).toBeLessThanOrEqual(item.pageWidth - 32);
      expect(item.y, item.text).toBeGreaterThanOrEqual(18);
    }
  });

  it('produces a dated, legible empty report without adding fictional people', async () => {
    const { pages } = await inspect((await buildQualificationsMatrixPdf({ categories, groups: [], peopleCount: 0 }, generatedOn)).blob);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('Aucun marin à afficher'); expect(pages[0]).toContain('0 marin(s)');
    expect(pages[0]).toContain('Page 1 / 1');
  });

  it('makes unavailable categories explicit instead of presenting them as empty qualifications', async () => {
    const matrix = example(); matrix.categories = [];
    const { pages } = await inspect((await buildQualificationsMatrixPdf(matrix, generatedOn)).blob);
    expect(pages[0]).toContain('Catégories exportées : Aucune');
    expect(pages[0]).toContain('Aucune catégorie de qualification accessible.');
    expect(pages.join(' ')).not.toMatch(/Brevet de capitaine|Aucun document enregistré/);
  });
});
