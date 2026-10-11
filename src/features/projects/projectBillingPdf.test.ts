// @vitest-environment node
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateBillingPdf, type BillingExportInput } from './projectBilling';

function billingInput(): BillingExportInput {
  return {
    project: {
      id: 144, title: 'GUARD VESSEL EMDT', projectCode: 'P145', clientId: 1,
      clientSharePointItemId: '', clientName: 'EMDT', primaryVesselId: 1,
      primaryVesselSharePointItemId: '', primaryVesselName: 'GOURY', secondaryVesselId: null,
      secondaryVesselSharePointItemId: '', secondaryVesselName: '', startsOn: '2024-06-01',
      endsOn: '2026-10-31', deliveryAt: '', redeliveryAt: '', charterStartsAt: '', charterEndsAt: '',
      deliveryPort: '', redeliveryPort: '', contractType: 'Affrètement', operationArea: '',
      isRovSupport: false, isDivingSupport: false, status: 'Facturé', description: '',
      sourceLabel: 'test', sharePointListTitle: '', sharePointItemId: '', sourceModifiedAt: '',
      archivedAt: '', updatedAt: '',
    },
    operations: [],
    period: {
      id: 1, projectId: 144, companyId: 1, periodMonth: '2026-10-01',
      clientReference: 'TRE-PO-000503', invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '',
      paymentDueOn: '', paidOn: '', amountHt: 0, comments: '',
    },
    expenses: [
      {
        id: 1, billingPeriodId: 1, category: 'port', nature: '',
        supplier: 'Régie Dieppoise des Activités Portuaires', supplierSpecialties: ['Frais de port'],
        invoiceDate: '2026-09-30', invoiceNumber: 'R202601553', amountHt: 330, amountTtc: null,
        currency: 'EUR', quantity: null, unit: '', comments: '', dprReportId: null,
      },
      {
        id: 2, billingPeriodId: 1, category: 'fuel', nature: '',
        supplier: 'ETABLISSEMENTS MARCHAND', supplierSpecialties: ['Gasoil', 'Lubrifiants'],
        invoiceDate: '2026-10-06', invoiceNumber: '06100174', amountHt: 11008.8, amountTtc: null,
        currency: 'EUR', quantity: null, unit: '', comments: '', dprReportId: null,
      },
    ],
    services: [{
      id: 1, billingPeriodId: 1, serviceCatalogId: null, category: 'Affrètement Journalier',
      descriptionHtml: '', unitAmountHt: 5450, quantity: 7,
    }],
    includeBbtmService: true,
    dprs: Array.from({ length: 9 }, (_, index) => ({
      id: 101 + index, reportDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
      vesselId: 1, vesselName: 'GOURY',
      operation: index === 5 ? '24/24 Crew Change' : index >= 7 ? '24/24 Weather Stand-by' : '24/24 Operation',
      amountHt: 4016.13, vesselStatus: '',
      arrivalAt: index === 5 ? '2026-10-06T08:15:00Z' : '',
      departureAt: index === 5 ? '2026-10-06T21:30:00Z' : '', fuelLiters: index === 5 ? 9174 : null,
    })),
    selectedVesselName: 'GOURY', startDate: '2026-10-01', endDate: '2026-10-31',
  };
}

async function readBillingPdf(input: BillingExportInput) {
  const blob = await generateBillingPdf(input);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const document = await PDFDocument.load(bytes);
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const parsed = await task.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= parsed.numPages; pageNumber += 1) {
      const page = await parsed.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item);
      pages.push({ width: viewport.width, height: viewport.height, items });
    }
  } finally {
    await task.destroy();
  }
  const text = pages.flatMap((page) => page.items.map((item) => item.str))
    .join(' ').replace(/[\s\u00a0\u202f]+/g, ' ').trim();
  const operators = document.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return streams.map((reference) => {
      const stream = document.context.lookup(reference);
      return stream instanceof PDFRawStream
        ? new TextDecoder('windows-1252').decode(decodePDFRawStream(stream).decode()) : '';
    }).join('\n');
  }).join('\n');
  return { blob, document, pages, text, operators };
}

function expectLandscapeA4(result: Awaited<ReturnType<typeof readBillingPdf>>) {
  for (const page of result.pages) {
    expect(page.width).toBeCloseTo(841.89, 1);
    expect(page.height).toBeCloseTo(595.28, 1);
    for (const item of page.items) {
      const [, , , , x, y] = item.transform;
      expect(x, `Left edge of '${item.str}'`).toBeGreaterThanOrEqual(-1);
      expect(x + item.width, `Right edge of '${item.str}'`).toBeLessThanOrEqual(page.width + 1);
      expect(y, `Bottom edge of '${item.str}'`).toBeGreaterThanOrEqual(-1);
      expect(y + item.height, `Top edge of '${item.str}'`).toBeLessThanOrEqual(page.height + 1);
    }
  }
}

beforeEach(() => {
  // Font, content and layout checks remain independent of browser logo decoding.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Logo unavailable in PDF test')));
});

afterEach(() => vi.unstubAllGlobals());

describe('project billing PDF design', () => {
  it('uses the reference hierarchy and navy palette on an A4 landscape invoice', async () => {
    const result = await readBillingPdf(billingInput());
    expect(result.blob.type).toBe('application/pdf');
    expect(result.document.getPageCount()).toBe(1);
    expectLandscapeA4(result);
    for (const value of [
      'GUARD VESSEL EMDT', 'Octobre 2026', 'TRE-PO-000503', 'GOURY', '01/10/2026', '31/10/2026',
      "Loyers d'Affrètement", 'Frais imputables', 'Prestations BBTM', 'Total facture du mois HT',
      'R202601553', '06100174', 'Lubrifiants', 'Affrètement Journalier',
      'Accosté au port à 10h15', 'Refueling : 9 174 L', 'Appareillage du quai à 23h30',
      '36 145,17 €', '11 338,80 €', '38 150,00 €', '85 633,97 €',
    ]) expect(result.text).toContain(value);
    expect(result.document.getTitle()).toBe('P145 - Éléments de facturation - 2026-10');
    const items = result.pages[0].items;
    const project = items.find((item) => item.str.includes('GUARD VESSEL EMDT'))!;
    const heading = items.find((item) => item.str.toLocaleLowerCase('fr-FR')
      .replace(/\s/g, '').includes('élémentsdefacturation'))!;
    const month = items.find((item) => item.str.includes('Octobre 2026'))!;
    const period = items.find((item) => item.str.startsWith('Période :'))!;
    const reference = items.find((item) => item.str.startsWith('Référence client :'))!;
    expect(heading.height).toBeGreaterThan(project.height);
    expect(heading.transform[5]).toBeGreaterThan(project.transform[5]);
    expect(month.transform[4]).toBeGreaterThan(result.pages[0].width * 0.60);
    expect(month.transform[5]).toBeGreaterThan(result.pages[0].height * 0.80);
    expect(period.transform[4]).toBeGreaterThan(result.pages[0].width * 0.60);
    expect(period.transform[5]).toBeLessThan(month.transform[5]);
    expect(period.transform[5]).toBeGreaterThan(reference.transform[5]);
    const final = items.find((item) => item.str === 'Total facture du mois HT')!;
    const subtotals = items.filter((item) => item.str.startsWith('Sous-total '));
    expect(subtotals).toHaveLength(6);
    const summary = subtotals.slice(-3);
    expect(summary.map((item) => item.str)).toEqual([
      "Sous-total Loyers d'Affrètement HT", 'Sous-total Frais imputables HT', 'Sous-total Prestations BBTM HT',
    ]);
    for (const item of summary) {
      expect(item.transform[4]).toBeGreaterThan(result.pages[0].width / 2);
      expect(item.transform[5]).toBeGreaterThan(final.transform[5]);
    }
    expect(final.transform[4]).toBeGreaterThan(result.pages[0].width / 2);
    const colors = [...result.operators.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)]
      .map((match) => match.slice(1).map(Number));
    expect(colors.some((color) => color.every((value, index) => Math.abs(value - [7, 39, 78][index] / 255) < 0.006)))
      .toBe(true);
  });

  it('keeps complete glyph bounds and dense operation, expense, service and raw detail content on one page', async () => {
    const input = billingInput();
    input.dprs = Array.from({ length: 48 }, (_, index) => ({
      ...input.dprs[5], id: 1000 + index, amountHt: 100,
      operation: `Intervention maritime détaillée avec contrôle des équipements et assistance au navire fin-operation-${index}`,
    }));
    input.expenses = Array.from({ length: 32 }, (_, index) => ({
      ...input.expenses[index % 2], id: 1000 + index, amountHt: 10,
      supplier: `Entreprise de travaux maritimes et de services portuaires de la côte normande fin-fournisseur-${index}`,
      invoiceNumber: `FACTURE-${index}`, supplierSpecialties: [`Spécialité ${index}`],
    }));
    input.services = Array.from({ length: 24 }, (_, index) => ({
      ...input.services[0], id: 1000 + index, unitAmountHt: 20, quantity: 2,
      category: `Service de maintenance et de contrôle des équipements de sécurité à bord fin-service-${index}`,
    }));
    input.rawLines = Array.from({ length: 32 }, (_, index) => ({
      id: 1000 + index, billingPeriodId: 1, serviceCatalogId: null,
      serviceDate: '2026-10-10', vesselName: `Navire historique ${index}`,
      designation: `Intervention maritime fin-detail-${index}`, unitAmountHt: 0.29,
      quantity: 1.5, includeInPdf: index % 2 === 0,
    }));
    const result = await readBillingPdf(input);
    expect(result.document.getPageCount()).toBe(1);
    for (let index = 0; index < input.dprs.length; index += 1) expect(result.text).toContain(`fin-operation-${index}`);
    for (let index = 0; index < input.expenses.length; index += 1) {
      expect(result.text).toContain(`fin-fournisseur-${index}`);
      expect(result.text).toContain(`FACTURE-${index}`);
      expect(result.text).toContain(`Spécialité ${index}`);
    }
    for (let index = 0; index < input.services.length; index += 1) expect(result.text).toContain(`fin-service-${index}`);
    for (let index = 0; index < input.rawLines.length; index += 1) {
      expect(result.text).toContain(`fin-detail-${index}`);
      expect(result.text).toContain(`Navire historique ${index}`);
    }
    expect(result.text).not.toContain('Navire : GOURY');
    expect(result.text.match(/Refueling : 9 174 L/g)).toHaveLength(input.dprs.length);
    expect(result.text).toContain('4 800,00 €');
    expect(result.text).toContain('320,00 €');
    expect(result.text).toContain('960,00 €');
    expect(result.text).toContain('14,08 €');
    expect(result.text).toContain('6 094,08 €');
    expectLandscapeA4(result);
  }, 30_000);
});
