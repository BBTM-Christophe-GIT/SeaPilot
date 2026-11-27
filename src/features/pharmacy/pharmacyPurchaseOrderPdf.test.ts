// @vitest-environment node
import { readFileSync } from 'node:fs';
import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPharmacyPurchaseOrderPdf, type PharmacyPurchaseOrderPdfInput, type PharmacyPurchaseOrderPdfLine } from './pharmacyPurchaseOrderPdf';

const signature = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
const stamp = new Uint8Array(readFileSync(new URL('./assets/bbtm-pharmacy-stamp.jpg', import.meta.url)));
const medicine: PharmacyPurchaseOrderPdfLine = {
  section: 'medicines', category: '3 - Antalgiques', designation: 'Paracétamol', brand: 'BBTM Pharma',
  administrationRoute: 'orale', presentation: 'gélule 500 mg', requiredStrength: '500 mg', requiredQuantity: '100',
  stockQuantity: '98', expiry: '2027-03-15', classification: 'II', quantity: 1, unit: 'boîte',
};
const input: PharmacyPurchaseOrderPdfInput = {
  issuedOn: '2026-11-10', vesselName: 'Navire Démonstration', registrationNumber: 'CH 000000', imoNumber: '0000000',
  medicalDotation: 'DOTATION B restreinte', armament: 'BBTM', flagState: 'France', registrationPort: 'Cherbourg',
  medicalEmergencyBag: true, signerName: 'Camille DUPONT', signerFunction: 'Capitaine', signature,
  lines: [{ ...medicine, remarks: 'Vérifier la présentation avant commande.' }, {
    dotation: 'Sac médical d’urgence', section: 'equipment', category: '2 - Instruments', designation: 'Ciseaux de pansement',
    brand: 'Modèle 2', requiredStrength: '', presentation: 'Set stérile', remarks: 'Usage unique', quantity: 2, unit: 'pièce',
  }],
};

async function readPages(blob: Blob) {
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    if (!(contents instanceof PDFRawStream)) throw new Error('Contenu PDF illisible.');
    const text = new TextDecoder('windows-1252').decode(decodePDFRawStream(contents).decode());
    return { page, text };
  });
}

describe('bon de commande Pharmacie PDF', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stamp)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the page 47 landscape register layout for a signed order with medicines and bag equipment', async () => {
    const generated = await buildPharmacyPurchaseOrderPdf(input);
    const pages = await readPages(generated.blob);
    expect(pages).toHaveLength(1);
    const [{ page, text }] = pages;
    expect(generated.filename).toBe('bon-de-commande-pharmacie-navire-demonstration-2026-11-10.pdf');
    expect(page.getWidth()).toBeCloseTo(841.89, 1);
    expect(page.getHeight()).toBeCloseTo(595.28, 1);
    for (const label of ['217-3.A.3', '10/11/2026', 'Navire Démonstration', 'CH 000000', 'N° OMI', '0000000',
      'DOTATION B restreinte', 'Sac médical d’urgence', 'Pavillon', 'Port d’attache', 'Cherbourg', 'Armement',
      'Principe actif', 'Nom de spécialité', 'd’administration', 'Composition', 'réglementaire', 'existante', 'péremption',
      'Liste', 'à commander', '3 - Antalgiques', 'Paracétamol', 'BBTM Pharma', 'orale', 'gélule 500 mg',
      'Remarques : Vérifier la', 'avant commande.', '(100) Tj', '(98) Tj',
      '15/03/2027', '(II) Tj', '1 boîte', 'Matériel médical et objets de pansement', '2 - Instruments', 'Modèle 2',
      'Ciseaux de pansement', 'Set stérile', 'Usage unique', '2 pièces', 'Camille DUPONT', 'Capitaine', 'Signature', 'Cachet']) {
      expect(text).toContain(label);
    }
    expect(text.match(/\/I\d+ Do/g)).toHaveLength(2);
  });

  it('prints oversized orders across landscape A4 pages with repeated headings and the signature on the final page', async () => {
    const reference = (index: number) => `REF-${String(index + 1).padStart(3, '0')}`;
    const lines = Array.from({ length: 161 }, (_, index) => ({
      ...medicine, designation: `${reference(index)} - Produit de pharmacie`,
    }));
    const { blob } = await buildPharmacyPurchaseOrderPdf({ ...input, imoNumber: null, lines });
    const pages = await readPages(blob);
    expect(pages.length).toBeGreaterThan(1);
    for (const { page, text } of pages) {
      expect(page.getWidth()).toBeCloseTo(841.89, 1);
      expect(page.getHeight()).toBeCloseTo(595.28, 1);
      expect(text).toContain('Principe actif');
      expect(text).toContain('3 - Antalgiques');
      expect(text).not.toContain('N° OMI');
    }
    const text = pages.map((page) => page.text).join('\n');
    lines.forEach((_, index) => expect(text.match(new RegExp(reference(index), 'g'))).toHaveLength(1));
    expect(pages.slice(0, -1).every((page) => !page.text.includes('Camille DUPONT'))).toBe(true);
    expect(pages.at(-1)?.text).toContain('Camille DUPONT');
  });

  it('retains long remarks continued on a later page', async () => {
    const lines = [{ ...input.lines[1], remarks: 'Mot '.repeat(400) + 'Dernier mot' }];
    const { blob } = await buildPharmacyPurchaseOrderPdf({ ...input, lines });
    const pages = await readPages(blob);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.at(-1)?.text).toContain('Dernier mot');
  });
});
