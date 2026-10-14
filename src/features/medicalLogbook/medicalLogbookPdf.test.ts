// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import type { MedicalEntry, MedicalVessel } from './medicalLogbookModel';
import { createMedicalLogbookPdf } from './medicalLogbookPdf';

const vessel: MedicalVessel = {
  id: 349, company_id: 1, name: 'ILE DE FRANCE', acronym: 'IDF', can_write: true,
  registration_number: 'CH 123456', call_sign: '', registration_port: '',
};
const signaturePng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
const entry: MedicalEntry = {
  id: 1, company_id: 1, vessel_id: 349, occurred_on: '2026-10-14', occurred_time: '14:35',
  patient_name: 'Patient TEST', injury_illness: 'Blessure au doigt', treatment_medicines: 'Pansement stérile',
  first_aider_name: 'Secouriste TEST', signature_name: 'Signature TEST', signature_version_id: 42,
  signature_snapshot: {
    signature_id: 42, version_number: 2, signer_person_id: 12, signer_user_id: 'test-signature-user',
    signer_name: 'Signature TEST', storage_bucket: 'working-time-signatures', storage_path: '1/12/v2/test.png',
    mime_type: 'image/png', file_size_bytes: signaturePng.length, sha256: 'a'.repeat(64), valid_from: '2026-10-14T10:00:00Z',
  },
  revision: 1, archived: false, created_at: '', updated_at: '',
};

function signedPdf(entries: MedicalEntry[], options: { year?: string } = {}) {
  return createMedicalLogbookPdf(vessel, entries, { ...options, signatureImages: new Map(entries.map((record) => [record.id, signaturePng])) });
}

async function inspect(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const document = await PDFDocument.load(bytes);
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => 'str' in item);
    pages.push({
      text: items.map((item) => 'str' in item ? item.str : '').join(' '),
      items,
      operators: await page.getOperatorList(),
      height: page.view[3], width: page.view[2],
    });
  }
  await task.destroy();
  return { document, pages, text: pages.map((page) => page.text).join(' ') };
}

describe('medical register PDF', () => {
  it('prints the seven-column blank paper grid on a single landscape page without fetching assets', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const result = await inspect(await createMedicalLogbookPdf(vessel, [], { blank: true, year: '2026' }));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].width).toBeGreaterThan(result.pages[0].height);
      expect(result.text).toContain('Registre médical');
      expect(result.text).toContain('Navire : ILE DE FRANCE');
      expect(result.text).toContain('Année : 2026');
      for (const label of ['Date', 'Heure', 'Nom du patient', 'Blessure / maladie', 'Traitement / médicaments', 'Premiers soins', 'Signature du']) expect(result.text).toContain(label);
      expect(result.text).not.toContain('SAMPLE');
      expect(result.text).not.toContain('Aucune entrée');
      // Les bordures et lignes d’écriture restent des tracés vectoriels.
      expect(result.pages[0].operators.fnArray.filter((operation) => operation === OPS.constructPath).length).toBeGreaterThan(65);
    } finally { fetchSpy.mockRestore(); }
  });

  it('exports the supplied filtered entries with the date, treatment and first-aider signature', async () => {
    const result = await inspect(await signedPdf([entry, { ...entry, id: 2, vessel_id: 12, patient_name: 'AUTRE NAVIRE' }, { ...entry, id: 3, occurred_on: '2025-10-14', patient_name: 'AUTRE ANNEE' }], { year: '2026' }));
    expect(result.text).toContain('14/10/2026');
    expect(result.text).toContain('14:35');
    for (const value of [entry.patient_name, entry.injury_illness, entry.treatment_medicines, entry.first_aider_name, entry.signature_name]) expect(result.text).toContain(value);
    expect(result.text).not.toContain('AUTRE NAVIRE');
    expect(result.text).not.toContain('AUTRE ANNEE');
    expect(result.text).toContain('1 / 1');
  });

  it('preserves every long line over several pages, repeats headings and stays within the paper margins', async () => {
    const longLines = Array.from({ length: 180 }, (_, index) => `Note médicale ${String(index + 1).padStart(3, '0')} : texte complet à conserver.`);
    const result = await inspect(await signedPdf([{ ...entry, injury_illness: longLines.join('\n') }, { ...entry, id: 2, patient_name: 'DERNIER PATIENT' }], { year: '2026' }));
    expect(result.pages.length).toBeGreaterThan(2);
    // L’ordre de lecture contient aussi les colonnes voisines et les en-têtes répétés.
    // Vérifier la colonne des blessures isole les mots répartis sur plusieurs pages.
    const injuryX = (12 + 20 + 15 + 39 + 2) * 72 / 25.4;
    const clinicalText = result.pages.flatMap((page) => page.items
      .filter((item) => Math.abs(item.transform[4] - injuryX) < 0.1)
      .map((item) => item.str)).join(' ').replace(/\s+/g, ' ');
    for (const line of longLines) expect(clinicalText).toContain(line);
    expect(result.text).toContain('DERNIER PATIENT');
    for (const [index, page] of result.pages.entries()) {
      expect(page.text).toContain('Registre médical');
      expect(page.text).toContain('Nom du patient');
      expect(page.text).toContain(`${index + 1} / ${result.pages.length}`);
      for (const item of page.items) {
        expect(item.transform[4]).toBeGreaterThanOrEqual(33);
        expect(item.transform[4] + item.width).toBeLessThan(page.width - 30);
        expect(item.transform[5]).toBeGreaterThan(20);
        expect(item.transform[5]).toBeLessThan(page.height - 20);
      }
    }
  });

  it('embeds the saved profile signature PNG without fetching private assets', async () => {
    const unsigned = await inspect(await createMedicalLogbookPdf(vessel, [], { blank: true }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const signed = await inspect(await signedPdf([entry]));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(signed.text).toContain(entry.signature_name);
    expect(unsigned.pages[0].operators.fnArray).not.toContain(OPS.paintImageXObject);
    expect(signed.pages[0].operators.fnArray).toContain(OPS.paintImageXObject);
    const signatureIndex = signed.pages[0].operators.fnArray.indexOf(OPS.paintImageXObject);
    expect(signatureIndex).toBeGreaterThan(0);
  });

  it('refuses a signed export if its saved profile signature image is unavailable', async () => {
    await expect(createMedicalLogbookPdf(vessel, [entry])).rejects.toThrow('signature enregistrée');
  });
});
