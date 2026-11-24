// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFleetBrochurePdf, fleetBrochureFileName } from './fleetBrochure';
import type { FleetVessel } from './fleetQueries';

const TINY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));

const vessel: FleetVessel = {
  id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', typeLabel: 'Navire de charge',
  unitTypeLabel: 'Navire', fleetExitOn: '', registrationNumber: '934968', imoNumber: '9213870',
  registrationPort: 'MARSEILLE', callSign: 'FLBU', mmsi: '361001000', grossTonnage: '293', maxPeople: 12,
  crewMembers: '', medicalDotation: 'Dotation B', lengthOverall: '30.62 m', flagState: 'France', active: true,
  sharePointListId: '543b9f00-aed2-489a-808a-7b64cc835a83', sharePointItemId: '1', sourceModifiedAt: '',
  sourceGuid: '', sourceEtag: '33', sourceActiveLabel: 'GOURY', sourceFleetExitAt: '', photoUrl: '/vessels/goury.jpg',
  photoStorageBucket: '', photoStoragePath: '', brochureSubtitle: 'Offshore Guard Vessel',
  brochureSummary: 'Navire polyvalent conçu pour les opérations maritimes.',
  brochureOperations: ['Standby & Guard Vessel', 'Support plongée'], builtYear: 2001, classificationLabel: 'DNV',
  navigationCategory: 'Catégorie 2', beamOverallM: 8.5, lightshipTonnes: 400, deadweightTonnes: 100,
  safeManning: 4, mainEngine: 'CATERPILLAR C3512 B', mainEnginePowerKw: 750, bowThrusterPowerKw: 75,
  gensets: '2 × 230 KVA', maxSpeedKnots: 12, bollardPullTonnes: 12, fuelCapacityM3: 110,
  rangeDescription: '4 semaines', deckEquipment: 'Grue de pont', electronicsCommunications: 'SMDSM',
  accommodation: '12 personnes', liabilityInsurer: "Shipowner’s Club",
};

afterEach(() => vi.unstubAllGlobals());

function pictureResponse() {
  return new Response(TINY_PNG, { headers: { 'content-type': 'image/png' } });
}

async function scanPdf(blob: Blob) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    return await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const text = (await page.getTextContent()).items.flatMap((item) => 'str' in item && item.str.trim()
        ? [{ text: item.str, x: item.transform[4] }]
        : []);
      const operators = await page.getOperatorList();
      const pictures = operators.fnArray.flatMap((operation, index) => {
        if (operation !== OPS.paintImageXObject && operation !== OPS.paintInlineImageXObject) return [];
        const transform = operators.fnArray[index - 1] === OPS.dependency ? index - 2 : index - 1;
        return operators.fnArray[transform] === OPS.transform
          ? [operators.argsArray[transform] as [number, number, number, number, number, number]]
          : [];
      });
      return { width: page.getViewport({ scale: 1 }).width, text, pictures };
    }));
  } finally {
    await task.destroy();
  }
}

describe('fleetBrochure', () => {
  it('builds a three-page BBTM vessel brochure without SeaPilot branding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pictureResponse()));

    const blob = await buildFleetBrochurePdf(vessel, '/vessels/goury.jpg');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);

    expect(blob.type).toBe('application/pdf');
    expect(bytes.byteLength).toBeGreaterThan(5_000);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getAuthor()).toBe('BBTM');
    expect(pdf.getCreator()).toBe('BBTM');
    expect(Buffer.from(bytes).toString('latin1').toLowerCase()).not.toContain('seapilot');
  }, 15_000);

  it('keeps the folded brochure on two landscape A4 faces and recovers missing cover assets', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/missing.jpg') return { ok: false, status: 404 };
      if (url === '/cover.jpg') return new Response(new Uint8Array(readFileSync('public/vessels/goury.jpg')));
      return pictureResponse();
    });
    vi.stubGlobal('fetch', fetch);
    const name = 'HIRONDELLE DE LA MANCHE';
    const blob = await buildFleetBrochurePdf({ ...vessel, name }, '/missing.jpg', {
      format: 'folded', fallbackPhotoUrls: ['/cover.jpg'],
    });
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(841.89);
      expect(page.getHeight()).toBeCloseTo(595.28);
    }
    expect(fetch.mock.calls.map(([url]) => url)).toContain('/cover.jpg');
    expect(fleetBrochureFileName(name)).toBe('brochure-hirondelle-de-la-manche.pdf');
    expect(fleetBrochureFileName(name, 'folded')).toBe('brochure-hirondelle-de-la-manche-a4-pliee.pdf');
    const [outside, inside] = await scanPdf(blob);
    expect(outside.text.every(({ x }) => x > outside.width / 2)).toBe(true);
    const [cover] = outside.pictures.filter(([width]) => width > 100);
    expect(cover[0]).toBeCloseTo(outside.width / 2);
    expect(cover[4]).toBeCloseTo(outside.width / 2);
    expect(cover[0] / cover[3]).toBeCloseTo(1.5);
    expect(inside.text.some(({ text }) => /BBTM|Document édité/.test(text))).toBe(false);
    expect(outside.text.some(({ text }) => /nœuds|personnes/.test(text))).toBe(false);
  }, 15_000);

  it('localizes the brochure in both paper formats', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pictureResponse()));
    for (const format of ['a4', 'folded'] as const) {
      const pdf = await buildFleetBrochurePdf(vessel, '', { language: 'en', format });
      const pages = await scanPdf(pdf);
      const text = pages.flatMap((page) => page.text).map((item) => item.text).join(' ');
      expect(text).toContain('Commercial enquiries');
      expect(text).toContain('Vessel specifications');
      expect(text).toContain('Onboard equipment');
      expect(text).toContain('Main deck');
      expect(text).not.toContain('Équipements à bord');
      expect(fleetBrochureFileName(vessel.name, format, 'en')).toMatch(/-en\.pdf$/);
    }
  }, 15_000);

  it('keeps the crew and navigation data of an ordinary Goury brochure in the folded layout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pictureResponse()));
    const data = {
      ...vessel,
      draftMeters: 4.1,
      navigationCategory: 'Catégorie 2 — jusqu’à 200 milles des côtes',
      rangeDescription: '4 semaines · 11 000 milles nautiques à 8 nœuds · Hs 5 m',
    };
    const pdf = await buildFleetBrochurePdf(data, '', { format: 'folded' });
    const [, page] = await scanPdf(pdf);
    const technical = page.text.filter(({ x }) => x < page.width / 2).map(({ text }) => text).join(' ');
    expect(technical).toContain('Capacité maximale');
    expect(technical).toContain('Navigation et conformité');
    expect(technical).toContain('11 000 milles nautiques');
  }, 15_000);

  it('retains the same section and field labels when a vessel has missing values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pictureResponse()));
    const empty = {
      ...vessel, name: 'EXEMPLE', navigationCategory: '', classificationLabel: '',
      draftMeters: null, bowThrusterPowerKw: null, flagState: '', deckEquipment: '',
      electronicsCommunications: '', accommodation: '', fuelCapacityM3: null,
    };
    for (const format of ['a4', 'folded'] as const) {
      const pages = await scanPdf(await buildFleetBrochurePdf(empty, '', { format }));
      const text = pages.slice(1).flatMap((page) => page.text).map((item) => item.text).join(' ');
      expect(text).toContain('Navigation et conformité');
      expect(text).toContain('Pavillon —');
      expect(text).toContain('Tirant d’eau —');
      expect(text).toContain('Carburant —');
      expect(text).toContain('Emménagements —');
    }
  }, 15_000);

  it('continues long A4 sections and keeps long folded exports on one sheet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pictureResponse()));
    const longVessel = {
      ...vessel,
      deckEquipment: Array.from({ length: 120 }, (_, index) => `Équipement embarqué ${index + 1}`).join('\n'),
    };
    const a4 = await buildFleetBrochurePdf(longVessel, '');
    const folded = await buildFleetBrochurePdf(longVessel, '', { format: 'folded' });
    expect((await PDFDocument.load(await a4.arrayBuffer())).getPageCount()).toBeGreaterThan(3);
    expect((await PDFDocument.load(await folded.arrayBuffer())).getPageCount()).toBe(2);
  }, 15_000);

  it('rejects brochure generation for offices and quays', async () => {
    await expect(buildFleetBrochurePdf({ ...vessel, assetKind: 'office' }, '')).rejects.toThrow('réservée aux navires');
  });
});
