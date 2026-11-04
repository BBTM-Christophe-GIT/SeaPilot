// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmploymentContractDraft, employmentContractValues } from './employmentContractModel';
import { generateEmploymentContractPdf } from './employmentContractPdf';
import { EMPLOYMENT_CONTRACT_TEXT } from './employmentContractText';
import type { PersonRecord } from './peopleQueries';
import { salaryGridConventionLabel } from './salaryGridModel';
import { employmentContractClauseRuns } from './employmentContractClausesPdf';

const person = {
  id: 7, firstName: 'Éléonore & Alex', lastName: 'd’Exemple', birthDate: '1990-05-04', birthPlace: 'Rouen',
  postalAddress: '1 quai du Port\n76000 Rouen', sailorNumber: '2000123', functionLabel: 'Matelot polyvalent',
  enimCategory: 12, enimFunctionCode: 'AA01A', hiredOn: '2026-11-04', contractType: 'CDI',
} as PersonRecord;
// Synthetic drawing for tests. No personal signature is committed in the source tree.
const signature = { mimeType: 'image/png' as const, bytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAYAAACdi3yvAAACj0lEQVR4nO2d7W3DMAxEE0NTcIWu1PG6UlfoGin6w4VhOP6QJZF3vPczCJLQfDo6ttI+X6/XQwgvJrd3FkICCm+UgMIVCShckYDCFQkoXJGAwhUJKFyRgMIVCShckYDClfIgwj4+/29s/3x/PX0/jUgl4FK+LBjBgiuM8qE2I+NigxaQqRF3akZecBPL+EFuwtl6GUYuRQJuNWJ+jKUxWU4v4ARkTIGaWlkWHIyA7EmQtVYIAbOkniUSD0bAM/IxjCO7sMgY6oUQMEPyWcLUgxCQXb7s4oUV8GpjEMfRncVlgPXCCKjUy0cYAZnl07gNLmCtfAjjqOXCMoB6oQRkSoa/Wpafn6k2SgGZRu5cC9tOFVoBW8gXYRztbQdr/bksQL1n0z+0gCzJ904+5Jo89mMOFZBBvpGptybSMWu1GXiIgL1OyEc2xFM8C7Tzu3UvC2LqjWyIp3iR6DW9ugqIPnIjyGfOXz5697CbgMjyRRDPm1H9ay5g7wuwPRMhu3jmcB2zqYBKPczxa44X0Et2+TKnngW4c1OQ5GuZCFnFs2AX0Kdsybf+gfeaKDVY4/G7rHv9mr1qPnO5rDoBEXd7IIjXmnVA7InY4j2uUlBS785ByyaebYTDXfGOJBu2GQFp5PY6aL2xSlHe9ebK641erIVRvr3Tgztbh6JiB+LtPb7FyONTEM73alfw1vOZ5LOKH7OffX4YARlSDwk7WGxX+xH9OBR0+VjEO6KmFwjHYlfA+dtT1EIQFshdjLzGZ/T/mL41klhTz4LdpUjzu+CzsIq3BXNtkAKyj6IMtcGN4EyJl5WwfyVf8uUgfAIq9bgJLaDgJ+wIFjmQgMIVCShckYDCFQkoXJGAwhUJKB6e/ALhezv3ppuZKgAAAABJRU5ErkJggg==', 'base64')) };

function draft(type: 'CDI' | 'CDD') {
  return { ...createEmploymentContractDraft(person, type, {
    socialSecurityNumber: '190057612345678', vesselNames: 'GOURY & THÉRÈSE', grossMonthlySalary: '3250,50',
    collectiveAgreement: 'CONVENTION COLLECTIVE PERSONNELS EXECUTION', endDate: '2027-05-03',
  }), signatureDate: '2020-01-01', employerRepresentative: 'Ancien représentant' };
}

async function pdfText(bytes: Uint8Array) {
  const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' '));
  }
  await task.destroy();
  return pages;
}

afterEach(() => vi.useRealTimers());

describe('BBTM employment PDFs', () => {
  it.each(['CDI', 'CDD'] as const)('fills %s on its original three pages with today’s date and the private final signature', async (type) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T23:30:00Z'));
    const template = new Uint8Array(await readFile(`public/templates/employment-contract-${type.toLowerCase()}-bbtm.pdf`));
    const blob = await generateEmploymentContractPdf(draft(type), signature, template);
    expect(blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(3);
    const pages = await pdfText(bytes);
    expect(pages.every((page) => page.includes('04/11/2026'))).toBe(true);
    expect(pages[0]).toContain('Éléonore & Alex');
    expect(pages[0]).toContain('1 quai du Port'); expect(pages[0]).toContain('76000 Rouen');
    expect(pages[0]).toContain('190057612345678');
    expect(pages[0]).toContain('GOURY & THÉRÈSE');
    expect(pages[0]).toContain('3 250,50 €');
    expect(pages.at(-1)).toContain('Benjamin BON');
    expect(pages.at(-1)).toContain('Éléonore & Alex D’EXEMPLE');
    expect(pages.at(-1)).toContain('mercredi 4 novembre 2026');
    expect(pages.join(' ')).not.toMatch(/SPFIELD|Ancien représentant|2020-01-01/);
    expect(pages.join(' ')).not.toMatch(/l[’']employé/i);
    expect(pages.slice(1).join(' ')).not.toContain('« Éléonore & Alex D’EXEMPLE »');
    const clauses = EMPLOYMENT_CONTRACT_TEXT[type].slice(EMPLOYMENT_CONTRACT_TEXT[type].indexOf('CLAUSES GÉNÉRALES') + 1);
    for (const paragraph of clauses.filter((text) => text.length > 65 && !text.includes('{{') && !/l[’']employé|\((1a|1b|1|9|10|11|12|13|14)\)/i.test(text))) {
      // Word's preserved font runs may insert extraction-only spaces inside words.
      expect(pages.join(' ').replace(/\s+/g, '')).toContain(paragraph.replace(/\s+/g, ''));
    }
    const firstImages = document.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys();
    const finalImages = document.getPage(document.getPageCount() - 1).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys();
    expect(firstImages).toHaveLength(1); // BBTM logo only, no public employer signature.
    expect(finalImages).toHaveLength(2); // BBTM logo plus the supplied private signature.
  });

  it.each([
    ['CDI', 'Officier'], ['CDD', 'Officier'], ['CDI', 'PEX'], ['CDD', 'PEX'],
  ] as const)('reflows %s clauses for a long name and %s, replacing actual first-page references', async (type, ccn) => {
    const fullName = 'Alexandre-Louis DE LA ROCHE SAINT CLAIR';
    const input = { ...draft(type), firstName: 'Alexandre-Louis', lastName: 'de la Roche Saint Clair', functionLabel: 'Capitaine',
      collectiveAgreement: salaryGridConventionLabel({ ccn }) };
    const template = new Uint8Array(await readFile(`public/templates/employment-contract-${type.toLowerCase()}-bbtm.pdf`));
    const blob = await generateEmploymentContractPdf(input, signature, template);
    const pages = await pdfText(new Uint8Array(await blob.arrayBuffer()));
    expect(pages).toHaveLength(3);
    const clauses = pages.slice(1).join(' '), compact = clauses.replace(/\s+/g, '');
    expect(compact).toContain(`${fullName} est embauché au poste Capitaine sur le(s) navire(s) définis au GOURY & THÉRÈSE correspondant à la fonction ENIM défini au AA01A et à la catégorie 12.`.replace(/\s+/g, ''));
    expect(compact).toContain(`${fullName} percevra la rémunération mensuelle brute prévue au 3 250,50 €`.replace(/\s+/g, ''));
    expect(compact).toContain(`${fullName} est embauché à compter de la date stipulée au 04/11/2026`.replace(/\s+/g, ''));
    if (type === 'CDD') expect(compact).toContain('se terminant au 03/05/2027'.replace(/\s+/g, ''));
    else expect(clauses).toContain('trois (3) mois de navigation effective');
    expect(clauses).not.toMatch(/\((1a|1b|1|9|10|11|12|13|14)\)|l[’']employé/i);
    expect(clauses).toContain(input.collectiveAgreement);
    expect(pages.at(-1)).toContain('Benjamin BON');
    expect(pages.at(-1)).toContain(fullName);
    const values = { ...employmentContractValues(input), fullName, grossMonthlySalary: '3 250,50 €' };
    const intro = employmentContractClauseRuns(type, values).find((clause) => clause.kind === 'intro')!;
    expect(intro.runs.some((run) => run.bold && run.text === fullName)).toBe(true);
    expect(intro.runs.some((run) => !run.bold && run.text === fullName)).toBe(true);
  });

  it.each([
    ['CDI', 'Officier'], ['CDD', 'Officier'], ['CDI', 'PEX'], ['CDD', 'PEX'],
  ] as const)('fits the complete %s agreement selected from the %s salary grid', async (type, ccn) => {
    const collectiveAgreement = salaryGridConventionLabel({ ccn });
    const template = new Uint8Array(await readFile(`public/templates/employment-contract-${type.toLowerCase()}-bbtm.pdf`));
    const blob = await generateEmploymentContractPdf({ ...draft(type), collectiveAgreement }, signature, template);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pages = await pdfText(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages[0]).toContain(collectiveAgreement);
    if (type === 'CDI') expect(pages.slice(1).join(' ')).toContain(`La ${collectiveAgreement}.`);
    expect(pages[0]).toContain('3 250,50 €');
    expect(pages.slice(1).join(' ')).toContain('Le code des transports - partie Travail Maritime.');
  });

  it('rejects overflowing profile values without clipping or losing text', async () => {
    const template = new Uint8Array(await readFile('public/templates/employment-contract-cdi-bbtm.pdf'));
    await expect(generateEmploymentContractPdf({ ...draft('CDI'), postalAddress: 'Adresse très longue '.repeat(50) }, signature, template))
      .rejects.toThrow('Adresse : le texte est trop long');
  });

  it('requires a valid private signature rather than producing an unsigned document', async () => {
    const template = new Uint8Array(await readFile('public/templates/employment-contract-cdi-bbtm.pdf'));
    await expect(generateEmploymentContractPdf(draft('CDI'), { ...signature, bytes: new Uint8Array() }, template)).rejects.toThrow('signature enregistrée');
    await expect(generateEmploymentContractPdf(draft('CDI'), { ...signature, bytes: new Uint8Array([1, 2, 3]) }, template)).rejects.toThrow('signature enregistrée');
  });
});
