import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchFleetVessels, saveFleetVessel, type SaveFleetVesselInput } from './fleetQueries';

const EMPTY_INPUT: SaveFleetVesselInput = {
  name: '', acronym: '', assetKind: 'vessel', typeLabel: '', unitTypeLabel: '', registrationNumber: '',
  imoNumber: '', registrationPort: '', callSign: '', mmsi: '', grossTonnage: '', maxPeople: null,
  crewMembers: '', medicalDotation: '', lengthOverall: '', flagState: '', brochureSubtitle: '',
  brochureSummary: '', brochureOperations: '', builtYear: null, classificationLabel: '', navigationCategory: '',
  beamOverallM: null, lightshipTonnes: null, deadweightTonnes: null, safeManning: null, mainEngine: '',
  mainEnginePowerKw: null, bowThrusterPowerKw: null, gensets: '', maxSpeedKnots: null,
  bollardPullTonnes: null, fuelCapacityM3: null, rangeDescription: '', deckEquipment: '',
  electronicsCommunications: '', accommodation: '',
};

describe('fleetQueries', () => {
  it('maps the canonical vessels table and keeps an absent capacity empty', async () => {
    const secondOrder = vi.fn().mockResolvedValue({
      data: [{ id: 1, company_id: 1, name: 'GOURY', acronym: 'GRY', asset_kind: 'vessel', active: true }],
      error: null,
    });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const select = vi.fn().mockReturnValue({ order: firstOrder });
    const client = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;

    await expect(fetchFleetVessels(client)).resolves.toEqual([
      expect.objectContaining({ id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', maxPeople: null, active: true }),
    ]);
    expect(client.from).toHaveBeenCalledWith('vessels');
  });

  it('rejects an empty vessel name before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: ' ' })).rejects.toThrow('au moins deux caractères');
    expect(client.from).not.toHaveBeenCalled();
  });
});
