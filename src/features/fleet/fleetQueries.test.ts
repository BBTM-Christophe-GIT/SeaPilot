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
  electronicsCommunications: '', accommodation: '', liabilityInsurer: '',
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
      expect.objectContaining({ id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', maxPeople: null, draftMeters: null, active: true }),
    ]);
    expect(client.from).toHaveBeenCalledWith('vessels');
  });

  it('rejects an empty vessel name before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: ' ' })).rejects.toThrow('au moins deux caractères');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('reads nullable draft measurements from the canonical vessel column', async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [
      { id: 1, company_id: 1, name: 'Navire test A', active: true, draft_m: '3.25' },
      { id: 2, company_id: 1, name: 'Navire test B', active: true, draft_m: null },
    ], error: null });
    const select = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: secondOrder }) });
    const client = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
    const vessels = await fetchFleetVessels(client);
    expect(vessels.find((vessel) => vessel.id === 1)?.draftMeters).toBe(3.25);
    expect(vessels.find((vessel) => vessel.id === 2)?.draftMeters).toBeNull();
    expect(select).toHaveBeenCalledWith(expect.stringContaining('draft_m'));
  });

  it.each([0, -1, 50.01, Infinity, NaN])('rejects an invalid draft %s before any write', async (draftMeters) => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test', draftMeters })).rejects.toThrow('tirant d’eau doit être supérieur à 0 et inférieur ou égal à 50 m');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('persists a supplied measurement, clears it only on explicit null and preserves omitted legacy inputs', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1, company_id: 1, name: 'Navire test', active: true, draft_m: 3.25 }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const vessel = await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test', draftMeters: 3.25 });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ draft_m: 3.25 }));
    expect(vessel.draftMeters).toBe(3.25);
    await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test', draftMeters: null });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ draft_m: null }));
    await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test' });
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('draft_m');
    await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test', draftMeters: 50 });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ draft_m: 50 }));
  });

  it('keeps existing photographs and additional illustrations independently reusable', async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [{
      id: 1, company_id: 1, name: 'GOURY', acronym: 'GRY', active: true,
      photo_url: '/vessels/goury.jpg', photo_storage_bucket: null, photo_storage_path: null,
      illustration_storage_bucket: 'fleet-media', illustration_storage_path: '1/1/illustration.png',
      illustration_thumbnail_url: '/vessels/bbtm/goury-small.webp',
    }], error: null });
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: secondOrder }) }) }) } as unknown as SupabaseClient;
    const [vessel] = await fetchFleetVessels(client);
    expect(vessel).toMatchObject({
      photoUrl: '/vessels/goury.jpg', photoStoragePath: '',
      illustrationStorageBucket: 'fleet-media', illustrationStoragePath: '1/1/illustration.png',
      illustrationThumbnailUrl: '/vessels/bbtm/goury-small.webp',
    });
  });
});
