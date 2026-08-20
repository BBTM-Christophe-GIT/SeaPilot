import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFleetBrochurePdf } from './fleetBrochure';
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
  accommodation: '12 personnes',
};

afterEach(() => vi.unstubAllGlobals());

describe('fleetBrochure', () => {
  it('builds a three-page BBTM vessel brochure without SeaPilot branding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob([TINY_PNG], { type: 'image/png' }),
    }));

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

  it('rejects brochure generation for offices and quays', async () => {
    await expect(buildFleetBrochurePdf({ ...vessel, assetKind: 'office' }, '')).rejects.toThrow('réservée aux navires');
  });
});
