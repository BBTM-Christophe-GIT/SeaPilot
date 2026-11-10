// @vitest-environment node
import { readFileSync } from 'node:fs';
import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPharmacyPurchaseOrderPdf, type PharmacyPurchaseOrderPdfInput } from './pharmacyPurchaseOrderPdf';

const signature = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
const stamp = new Uint8Array(readFileSync(new URL('./assets/bbtm-pharmacy-stamp.jpg', import.meta.url)));
const medicine = {
  designation: 'Paracetamol', brand: 'BBTM Pharma', requiredStrength: '500 mg', quantity: 1, unit: 'boîte',
  strength: '250 mg', packaging: '16 comprimés par boîte', reason: 'Stock insuffisant',
};
const input: PharmacyPurchaseOrderPdfInput = {
  issuedOn: '2026-11-10',
  vesselName: 'Navire Démonstration',
  registrationNumber: 'CH 000000',
  imoNumber: '0000000',
  medicalDotation: 'Dotation B',
  signerName: 'Camille DUPONT',
  signerFunction: 'Capitaine',
  signature,
  lines: [medicine, { designation: 'Ciseaux de pansement', requiredStrength: '', quantity: 2, unit: 'pièce' }],
};

async function readPage(blob: Blob) {
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  expect(pdf.getPageCount()).toBe(1);
  const [page] = pdf.getPages();
  const contents = page.node.Contents();
  if (!(contents instanceof PDFRawStream)) throw new Error('Contenu PDF illisible.');
  const text = new TextDecoder('windows-1252').decode(decodePDFRawStream(contents).decode());
  return { page, text };
}

describe('bon de commande Pharmacie PDF', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stamp)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('prints the required dosage below the article, plus the quantities and units, on one A4 page', async () => {
    const generated = await buildPharmacyPurchaseOrderPdf(input);
    const { page, text } = await readPage(generated.blob);
    expect(generated.filename).toBe('bon-de-commande-pharmacie-navire-demonstration-2026-11-10.pdf');
    expect(page.getWidth()).toBeCloseTo(595.28, 1);
    expect(page.getHeight()).toBeCloseTo(841.89, 1);
    for (const label of ['10/11/2026', 'Navire Démonstration', 'CH 000000', 'N° OMI', '0000000', 'Dotation B',
      'Article / dosage', 'Quantité', 'Paracetamol · BBTM Pharma', '500 mg', '1 boîte', '2 pièces',
      'Camille DUPONT', 'Capitaine', 'SIGNATURE', 'CACHET']) {
      expect(text).toContain(label);
    }
    for (const label of ['Conditionnement', 'Motif', '16 comprimés par boîte', 'Stock insuffisant', '250 mg']) {
      expect(text).not.toContain(label);
    }
    const articleY = Number(text.match(/[\d.]+ ([\d.]+) Td\n\(Paracetamol · BBTM Pharma\) Tj/)?.[1]);
    const dosageY = Number(text.match(/[\d.]+ ([\d.]+) Td\n\(500 mg\) Tj/)?.[1]);
    expect(dosageY).toBeLessThan(articleY);
    expect(text.match(/\/I\d+ Do/g)).toHaveLength(2);
  });

  it('keeps all references on one page for a dense order and omits an absent OMI', async () => {
    const products = [
      { designation: 'Paracétamol', requiredStrength: '500 mg' },
      { designation: 'Solution antiseptique', requiredStrength: '100 ml' },
      { designation: 'Sparadrap hypoallergénique', requiredStrength: '2,5 cm × 5 m' },
      { designation: 'Sachets pour solution de réhydratation orale', requiredStrength: '' },
    ];
    const reference = (index: number) => `REF-${String(index + 1).padStart(3, '0')}`;
    const lines = Array.from({ length: 161 }, (_, index) => ({
      ...input.lines[0],
      ...products[index % products.length],
      designation: `${reference(index)} · ${products[index % products.length].designation}`,
    }));
    const { blob } = await buildPharmacyPurchaseOrderPdf({ ...input, imoNumber: null, lines });
    const { page, text } = await readPage(blob);
    expect(page.getWidth()).toBeCloseTo(1190.55, 1);
    expect(text).not.toContain('N° OMI');
    expect(text).toContain('(500 mg) Tj');
    lines.forEach((_, index) => expect(text).toContain(reference(index)));
  });

  it('fails explicitly when all references cannot fit at readable size', async () => {
    const lines = Array.from({ length: 400 }, () => input.lines[0]);
    await expect(buildPharmacyPurchaseOrderPdf({ ...input, lines })).rejects.toThrow('une seule page lisible');
  });
});
