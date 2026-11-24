// @vitest-environment node
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLEET_LIST_COLUMNS } from './fleetList';
import { buildFleetListPdf, downloadFleetListPdfs } from './fleetListPdf';
import type { FleetVessel } from './fleetQueries';

const logo = readFileSync('public/bbtm-report-logo.png');
const vessel: FleetVessel = {
  id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', typeLabel: 'Navire de charge',
  unitTypeLabel: 'Navire', fleetExitOn: '', registrationNumber: '934968', imoNumber: '9213870',
  registrationPort: 'MARSEILLE', callSign: 'FLBU', mmsi: '361001000', grossTonnage: '293', maxPeople: 12,
  crewMembers: '', medicalDotation: 'Dotation B', lengthOverall: '30.62 m', flagState: 'France', active: true,
  sharePointListId: '', sharePointItemId: '', sourceModifiedAt: '', sourceGuid: '', sourceEtag: '', sourceActiveLabel: '',
  sourceFleetExitAt: '', photoUrl: '', photoStorageBucket: '', photoStoragePath: '', brochureSubtitle: '',
  brochureSummary: '', brochureOperations: [], builtYear: 2001, classificationLabel: 'DNV',
  navigationCategory: 'Catégorie 2', beamOverallM: 8.5, draftMeters: 2.65, lightshipTonnes: 400, deadweightTonnes: 100,
  safeManning: 4, mainEngine: 'CATERPILLAR C3512 B', mainEnginePowerKw: 750, bowThrusterPowerKw: 75,
  gensets: '', maxSpeedKnots: 12.5, bollardPullTonnes: 12, fuelCapacityM3: 110,
  rangeDescription: '', deckEquipment: '', electronicsCommunications: '', accommodation: '', liabilityInsurer: '',
};

const fleet = [
  'GOURY', 'LANDEMER', 'LE ROZEL', 'SUROIT', 'KROKDUR', 'HIRONDELLE DE LA MANCHE', 'HOLENN EUSA',
  'ECREHOUEL', 'BBTM 2710', 'BBTM 2810',
].map((name, index) => ({ ...vessel, id: index + 1, name }));

async function pdfText(data: ArrayBuffer) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  try {
    const doc = await task.promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    expect((await page.getOperatorList()).fnArray).toContain(OPS.paintImageXObject);
    return (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
  } finally {
    await task.destroy();
  }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(logo)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fleet list PDF', () => {
  it('renders the selected vessels and columns on one branded A4 page in French and English', async () => {
    const selection = [
      ...fleet,
      { ...vessel, id: 49, name: 'REMORQUEUR DU PORT', typeLabel: 'Remorqueur fluvial' },
      { ...vessel, id: 50, assetKind: 'office' as const, name: 'BUREAU BBTM' },
      { ...vessel, id: 51, active: false, name: 'NAVIRE ARCHIVE' },
    ];
    const columns = ['typeLabel', 'flagState', 'registrationNumber', 'lengthOverall', 'maxSpeedKnots', 'maxPeople'] as const;
    const [french, english] = await Promise.all([
      buildFleetListPdf(selection, columns, 'fr'),
      buildFleetListPdf(selection, columns, 'en'),
    ]);
    for (const [blob, title] of [[french, 'Flotte BBTM'], [english, 'BBTM Fleet']] as const) {
      const data = await blob.arrayBuffer();
      const doc = await PDFDocument.load(data);
      expect(blob.type).toBe('application/pdf');
      expect(doc.getTitle()).toBe(title);
      expect(doc.getAuthor()).toBe('BBTM');
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getPage(0).getWidth()).toBeCloseTo(595.28, 0);
      expect(doc.getPage(0).getHeight()).toBeCloseTo(841.89, 0);
      const text = await pdfText(data);
      expect(text).toContain(title);
      fleet.forEach(({ name }) => expect(text).toContain(name));
      expect(text).not.toMatch(/BUREAU BBTM|NAVIRE ARCHIVE|9213870|SeaPilot|1\s*\/\s*1/);
      expect(text).toContain(title === 'Flotte BBTM' ? 'GOURY Navire de charge' : 'GOURY Cargo ship');
      expect(text).toContain(title === 'Flotte BBTM' ? 'REMORQUEUR DU PORT Remorqueur fluvial' : 'REMORQUEUR DU PORT River tug');
      expect(text).toContain(title === 'Flotte BBTM' ? '30,62 m' : '30.62 m');
    }
  }, 15_000);

  it('fits a wider selection in landscape and retains the selected model values', async () => {
    const data = await (await buildFleetListPdf(fleet, [
      'typeLabel', 'flagState', 'registrationPort', 'registrationNumber', 'imoNumber', 'callSign', 'mmsi',
      'builtYear', 'lengthOverall', 'beamOverallM', 'mainEngine', 'fuelCapacity',
    ], 'en')).arrayBuffer();
    const doc = await PDFDocument.load(data);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(841.89, 0);
    const text = await pdfText(data);
    expect(text).toContain('9213870');
    expect(text).toContain('CATERPILLAR C3512 B');
    expect(text).toContain('110,000 L');
    expect(text).toContain('BBTM 2810');
  }, 15_000);

  it('fits all characteristics for 14 vessels in both languages without splitting identifiers', async () => {
    const fullFleet = [...fleet, ...['BBTM TENDER 1', 'BBTM 2811', 'BBTM 2812', 'BBTM 2813']
      .map((name, index) => ({ ...vessel, id: fleet.length + index + 1, name }))];
    for (const language of ['fr', 'en'] as const) {
      const blob = await buildFleetListPdf(fullFleet, FLEET_LIST_COLUMNS.map(({ key }) => key), language);
      const text = await pdfText(await blob.arrayBuffer());
      expect(text).toContain('HIRONDELLE DE LA MANCHE');
      expect(text).toContain('361001000');
      expect(text).toContain('CATERPILLAR C3512 B');
      expect(text).toContain(language === 'fr' ? '110 000 L' : '110,000 L');
      expect(text).toContain(language === 'fr' ? 'Catégorie 2' : 'Category 2');
      expect(text).toContain(language === 'fr' ? '293 UMS' : '293 GT');
      expect(text).toContain('BBTM 2813');
    }
  }, 15_000);

  it('downloads both language PDFs together in one archive', async () => {
    const anchor = { download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor, body: { append: vi.fn() } });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fleet-export');

    await downloadFleetListPdfs([vessel], ['imoNumber'], ['fr', 'en']);

    expect(anchor.download).toBe('Flotte-BBTM-FR-EN.zip');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const [archiveBlob] = createObjectUrl.mock.calls[0];
    if (!(archiveBlob instanceof Blob)) throw new Error('Expected a ZIP blob');
    const archive = await JSZip.loadAsync(await archiveBlob.arrayBuffer());
    expect(Object.keys(archive.files)).toEqual(['Flotte-BBTM-FR.pdf', 'BBTM-Fleet-EN.pdf']);
    for (const file of Object.values(archive.files)) {
      const pdf = await PDFDocument.load(await file.async('uint8array'));
      expect(pdf.getPageCount()).toBe(1);
    }
  });

  it('rejects empty and oversized selections without generating extra pages', async () => {
    await expect(buildFleetListPdf([], [], 'fr')).rejects.toThrow('Sélectionnez au moins un navire');
    const oversized = Array.from({ length: 100 }, (_, index) => ({ ...vessel, id: index + 1, name: `Navire ${index + 1}` }));
    await expect(buildFleetListPdf(oversized, [], 'fr')).rejects.toThrow('La sélection dépasse une page A4');
  });
});
