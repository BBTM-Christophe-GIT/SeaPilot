import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildFleetBrochurePdf } from '../fleet/fleetBrochure';
import { fetchFleetVessel, resolveFleetVesselPhotoUrl, type FleetVessel } from '../fleet/fleetQueries';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { COMMERCIAL_QUOTE_DURATION_DAYS_KEY } from './projectCommercialOffer';
import type { ProjectOfferDocumentInput } from './projectDocumentGeneration';
import { emptyProjectLocationPlan } from './projectLocation';
import { buildProjectQuoteExport } from './projectQuoteExport';
import { QUOTE_FUEL_EXCLUDED, QUOTE_FUEL_INCLUDED } from './projectQuoteTerms';

vi.mock('../fleet/fleetQueries', () => ({
  fetchFleetVessel: vi.fn(),
  resolveFleetVesselPhotoUrl: vi.fn(),
}));
vi.mock('../fleet/fleetBrochure', async (importOriginal) => ({
  ...await importOriginal<typeof import('../fleet/fleetBrochure')>(),
  buildFleetBrochurePdf: vi.fn(),
}));

const client = {} as SupabaseClient;
const project: ProjectOfferDocumentInput['project'] = {
  charterStartsAt: '2026-11-30T08:00',
  clientName: 'Ifremer',
  contractType: 'Offre Commerciale',
  deliveryAt: '',
  deliveryPort: 'Brest',
  description: 'Campagne bathymétrique',
  endsOn: '',
  operationArea: '',
  primaryVesselName: 'Goury',
  projectCode: 'P1234',
  redeliveryAt: '',
  redeliveryPort: 'Cherbourg',
  startsOn: '',
  title: 'Campagne Atlantique',
};

function pageText(pdf: PDFDocument, index: number): string {
  const content = pdf.getPage(index).node.lookup(PDFName.of('Contents'));
  if (!(content instanceof PDFRawStream)) throw new Error('Expected a PDF content stream');
  return Buffer.from(decodePDFRawStream(content).decode()).toString('latin1');
}

describe('projectQuoteExport', () => {
  it.each([QUOTE_FUEL_EXCLUDED, QUOTE_FUEL_INCLUDED])('includes the supplied terms and uses the selected fuel clause (%s)', async (fuel) => {
    const logo = await readFile(resolve('public/bbtm-report-logo.png'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(logo));
    try {
      const result = await buildProjectQuoteExport(client, {
        offer: {
          project,
          contract: {
            charterHire: 2000, demobilisationFee: 1000, extensionHire: null, feeCurrency: 'EUR',
            hireCurrency: 'EUR', hireUnit: 'jour', mobilisationFee: 1500,
            supplytimeData: { [COMMERCIAL_QUOTE_DURATION_DAYS_KEY]: '4', box19_special_fuel: fuel },
          },
        },
        annexDocuments: [], annexFiles: [], brochureVessels: [],
      });
      const pdf = await PDFDocument.load(await result.offer.blob.arrayBuffer());
      const cover = pageText(pdf, 0);
      const terms = pdf.getPages().slice(1).map((_, index) => pageText(pdf, index + 1)).join('\n');

      expect(result.pdfs).toEqual([result.offer]);
      expect(result.offer.fileName).toBe('P1234 - Offre - R1.pdf');
      expect(cover).toContain('OFFRE COMMERCIALE');
      expect(cover).toContain('30 nov. 2026');
      expect(cover).toContain('Brest');
      expect(cover).toContain('Cherbourg');
      expect(cover).toContain('4 jours');
      expect(cover).toContain('TOTAL HT DU DEVIS');
      expect(cover).toContain('10 500');
      expect(terms).toContain('Préambule');
      expect(terms).toContain('Article 6');
      expect(terms).toContain('Article 12');
      if (fuel === QUOTE_FUEL_INCLUDED) {
        expect(terms).toContain('inclus dans le prix de la prestation');
        expect(terms).not.toContain('refacturé Ad Cost');
        expect(terms).not.toContain('Avitailler le fuel pour le compte');
      } else {
        expect(terms).toContain('refacturé Ad Cost');
        expect(terms).toContain('Avitailler le fuel pour le compte');
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('appends the location and embeds each selected brochure while retaining separate PDF files', async () => {
    const logo = await readFile(resolve('public/bbtm-report-logo.png'));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(logo));
    const brochure = await PDFDocument.create();
    brochure.addPage();
    const brochureBytes = new Uint8Array(await brochure.save());
    const brochureBlob = new Blob([brochureBytes], { type: 'application/pdf' });
    vi.mocked(fetchFleetVessel).mockImplementation(async (_client, id) => ({
      id, name: id === 1 ? 'Goury' : 'Landemer', assetKind: 'vessel',
    } as FleetVessel));
    vi.mocked(resolveFleetVesselPhotoUrl).mockResolvedValue('/vessels/example.jpg');
    vi.mocked(buildFleetBrochurePdf).mockResolvedValue(brochureBlob);
    const locationPlan = {
      ...emptyProjectLocationPlan(),
      includeInPdf: true,
      points: [{ ...emptySeaOperationWaypoint('worksite'), number: '1', descriptionVhf: 'Chantier', latitude: '49.65', longitude: '-1.62' }],
    };
    try {
      const result = await buildProjectQuoteExport(client, {
        offer: { project: { ...project, locationPlan } },
        annexDocuments: [],
        annexFiles: [new File([brochureBytes], 'Annexe.pdf', { type: 'application/pdf' })],
        brochureVessels: [{ id: 1, name: 'Goury' }, { id: 2, name: 'Landemer' }],
      });
      expect(result.pdfs.map(({ fileName }) => fileName)).toEqual([
        'P1234 - Offre - R1.pdf', 'brochure-goury.pdf', 'brochure-landemer.pdf', 'Annexe.pdf',
      ]);
      const pdf = await PDFDocument.load(await result.offer.blob.arrayBuffer());
      const location = pdf.getPages().at(-1)!;
      expect(location.getWidth()).toBeGreaterThan(location.getHeight());
      const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict)
        .lookup(PDFName.of('EmbeddedFiles'), PDFDict)
        .lookup(PDFName.of('Names'), PDFArray);
      expect(names.size()).toBe(6);
      for (let index = 0; index < names.size(); index += 2) {
        const fileName = names.lookup(index, PDFHexString).decodeText();
        const file = names.lookup(index + 1, PDFDict)
          .lookup(PDFName.of('EF'), PDFDict)
          .lookup(PDFName.of('F'));
        if (!(file instanceof PDFRawStream)) throw new Error('Expected an embedded PDF stream');
        expect(result.pdfs.map((document) => document.fileName).slice(1)).toContain(fileName);
        expect(decodePDFRawStream(file).decode()).toEqual(brochureBytes);
      }
    } finally {
      fetchMock.mockRestore();
    }
  });
});
