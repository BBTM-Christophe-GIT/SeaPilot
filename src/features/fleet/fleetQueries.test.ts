import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchFleetVessels, saveFleetVessel, type SaveFleetVesselInput } from './fleetQueries';
import { createEmptyVesselWeatherMatrix, type VesselWeatherMatrix } from './vesselWeatherMatrix';

const EMPTY_INPUT: SaveFleetVesselInput = {
  name: '', acronym: '', assetKind: 'vessel', typeLabel: '', unitTypeLabel: '', registrationNumber: '',
  imoNumber: '', registrationPort: '', callSign: '', mmsi: '', grossTonnage: '', maxPeople: null,
  crewMembers: '', medicalDotation: '', lengthOverall: '', flagState: '', brochureSubtitle: '',
  brochureSummary: '', brochureOperations: '', builtYear: null, classificationLabel: '', navigationCategory: '',
  beamOverallM: null, deadweightTonnes: null, safeManning: null, mainEngine: '',
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
      expect.objectContaining({ id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', maxPeople: null, draftMeters: null, active: true,
        medicalEmergencyBag: false }),
    ]);
    expect(client.from).toHaveBeenCalledWith('vessels');
  });

  it('rejects an empty vessel name before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: ' ' })).rejects.toThrow('au moins deux caractères');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('round-trips the emergency bag and leaves it alone if omitted by the caller', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 1, company_id: 1, name: 'Navire test', active: true, medical_emergency_bag: true },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, id: 1, name: 'Navire test', medicalDotation: 'DOTATION B restreinte' };

    await expect(saveFleetVessel(client, { ...input, medicalEmergencyBag: true })).resolves.toMatchObject({ medicalEmergencyBag: true });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      medical_dotation: 'DOTATION B restreinte', medical_emergency_bag: true,
    }));
    expect(select).toHaveBeenCalledWith(expect.stringContaining('medical_emergency_bag'));

    await saveFleetVessel(client, { ...input, medicalEmergencyBag: false });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ medical_emergency_bag: false }));
    await saveFleetVessel(client, input);
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('medical_emergency_bag');
  });

  it('stores the main and daily tanks separately and retains the original m³ capacity', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1, company_id: 1, name: 'Navire test', active: true,
      fuel_capacity_m3: '19.5', fuel_tank_capacities_liters: [5000.5, '2500.25'],
      daily_fuel_tank_capacity_liters: '300', daily_fuel_tank_name: 'Caisse service' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, id: 1, name: 'Navire test', fuelCapacityM3: 19.5 };

    await expect(saveFleetVessel(client, { ...input, fuelTankCapacitiesLiters: [5000.5, 2500.25],
      dailyFuelTankCapacityLiters: 300, dailyFuelTankName: ' Caisse service ' }))
      .resolves.toMatchObject({ fuelCapacityM3: 19.5, fuelTankCapacitiesLiters: [5000.5, 2500.25],
        dailyFuelTankCapacityLiters: 300, dailyFuelTankName: 'Caisse service' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      fuel_capacity_m3: 19.5, fuel_tank_capacities_liters: [5000.5, 2500.25],
      daily_fuel_tank_capacity_liters: 300, daily_fuel_tank_name: 'Caisse service',
    }));
    expect(select).toHaveBeenCalledWith(expect.stringContaining('daily_fuel_tank_name'));

    await saveFleetVessel(client, input);
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('fuel_tank_capacities_liters');
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('daily_fuel_tank_capacity_liters');
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('daily_fuel_tank_name');

    await saveFleetVessel(client, { ...input, dailyFuelTankCapacityLiters: null });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      daily_fuel_tank_capacity_liters: null, daily_fuel_tank_name: null,
    }));
  });

  it.each([[], [0], [0.0001], [Infinity], [10_000_001], Array<number>(21).fill(100)].map(fuelTankCapacitiesLiters => ({ fuelTankCapacitiesLiters })))('rejects invalid main tank capacities before any write (%j)', async ({ fuelTankCapacitiesLiters }) => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test', fuelTankCapacitiesLiters })).rejects.toThrow('cuves principales');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid daily tank capacity before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test', dailyFuelTankCapacityLiters: -1 })).rejects.toThrow('caisse journalière');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects an overlong daily tank name before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test',
      dailyFuelTankCapacityLiters: 300, dailyFuelTankName: 'é'.repeat(81) })).rejects.toThrow('80 caractères');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('persists trimmed names alongside capacities for three main tanks', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1, company_id: 1, name: 'Navire test', active: true,
      fuel_tank_capacities_liters: [1000, 2000, 3000], fuel_tank_names: ['Avant', 'Arrière', 'Réserve'] }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test',
      fuelTankCapacitiesLiters: [1000, 2000, 3000], fuelTankNames: [' Avant ', 'Arrière', 'Réserve'] }))
      .resolves.toMatchObject({ fuelTankNames: ['Avant', 'Arrière', 'Réserve'] });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ fuel_tank_names: ['Avant', 'Arrière', 'Réserve'] }));
    expect(select).toHaveBeenCalledWith(expect.stringContaining('fuel_tank_names'));
  });

  it('rejects duplicate fuel tank names before writing', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test', fuelTankCapacitiesLiters: [1, 2, 3],
      fuelTankNames: [' Avant ', 'Arrière', 'AVANT'] })).rejects.toThrow('nom différent');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('round-trips custom capacities and Soutes choices without overwriting omitted fields', async () => {
    const tank = { id: '8d2ac1e5-e963-4d04-8672-2a092841b402', name: 'Réserve', capacityLiters: 645.25, showInSoutes: true };
    const sections = [{ name: 'Eau douce', tanks: [tank] }, { name: 'Huiles', tanks: [] }];
    const single = vi.fn().mockResolvedValue({
      data: { id: 1, company_id: 1, name: 'Navire test', active: true,
        fuel_tank_capacities_liters: [1000, 2000], fuel_tank_names: ['Avant', 'Arrière'],
        capacity_sections: sections, hidden_fuel_tank_keys: ['main-2'] },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, id: 1, name: 'Navire test' };

    await expect(saveFleetVessel(client, { ...input, fuelTankCapacitiesLiters: [1000, 2000], fuelTankNames: [' Avant ', 'Arrière'],
      capacitySections: [{ name: ' Eau douce ', tanks: [{ ...tank, name: ' Réserve ' }] }, sections[1]],
      hiddenFuelTankKeys: ['main-2'] })).resolves.toMatchObject({
      capacitySections: sections, hiddenFuelTankKeys: ['main-2'], fuelTankNames: ['Avant', 'Arrière'],
    });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      capacity_sections: sections, hidden_fuel_tank_keys: ['main-2'], fuel_tank_names: ['Avant', 'Arrière'],
    }));
    await saveFleetVessel(client, input);
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('capacity_sections');
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('hidden_fuel_tank_keys');
    await saveFleetVessel(client, { ...input, capacitySections: [], hiddenFuelTankKeys: [] });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ capacity_sections: [], hidden_fuel_tank_keys: [] }));
  });

  it('rejects reserved section names and duplicate Soutes keys before writing', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, name: 'Navire test' };
    await expect(saveFleetVessel(client, { ...input, capacitySections: [{ name: ' PLANS ', tanks: [] }] })).rejects.toThrow('sont réservés');
    await expect(saveFleetVessel(client, { ...input, hiddenFuelTankKeys: ['main-1', 'main-1'] })).rejects.toThrow('Soutes');
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

  it('reads the net tonnage and summer freeboard independently from lightship displacement', async () => {
    const order = vi.fn().mockResolvedValue({ data: [
      { id: 1, company_id: 1, name: 'Navire neuf', active: true, net_tonnage: '93', summer_freeboard_mm: '745.5', lightship_tonnes: '400' },
      { id: 2, company_id: 1, name: 'Navire historique', active: true, lightship_tonnes: '285' },
    ], error: null });
    const select = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order }) });
    const client = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;

    await expect(fetchFleetVessels(client)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, netTonnage: 93, summerFreeboardMm: 745.5, lightshipTonnes: 400 }),
      expect.objectContaining({ id: 2, netTonnage: null, summerFreeboardMm: null, lightshipTonnes: 285 }),
    ]));
    expect(select).toHaveBeenCalledWith(expect.stringContaining('net_tonnage'));
    expect(select).toHaveBeenCalledWith(expect.stringContaining('summer_freeboard_mm'));
  });

  it('writes and clears the new measurements without overwriting lightship displacement', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 1, company_id: 1, name: 'Navire test', active: true,
      net_tonnage: 93, summer_freeboard_mm: 745.5, lightship_tonnes: 400 }, error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, id: 1, name: 'Navire test' };

    await expect(saveFleetVessel(client, { ...input, netTonnage: 93, summerFreeboardMm: 745.5 }))
      .resolves.toMatchObject({ netTonnage: 93, summerFreeboardMm: 745.5, lightshipTonnes: 400 });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ net_tonnage: 93, summer_freeboard_mm: 745.5 }));
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('lightship_tonnes');

    await saveFleetVessel(client, { ...input, netTonnage: null, summerFreeboardMm: null });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ net_tonnage: null, summer_freeboard_mm: null }));
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('lightship_tonnes');

    await saveFleetVessel(client, input);
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('net_tonnage');
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('summer_freeboard_mm');
  });

  it.each([-1, Infinity, NaN])('rejects invalid tonnage and freeboard %s before any write', async (value) => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    const input = { ...EMPTY_INPUT, name: 'Navire test' };
    await expect(saveFleetVessel(client, { ...input, netTonnage: value })).rejects.toThrow('La jauge nette');
    await expect(saveFleetVessel(client, { ...input, summerFreeboardMm: value })).rejects.toThrow('La hauteur du franc-bord');
    expect(client.from).not.toHaveBeenCalled();
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

  it('reads each vessel matrix independently and preserves a missing legacy source', async () => {
    const matrix = createEmptyVesselWeatherMatrix(); matrix.levels[0][0] = 'comfortable';
    const secondOrder = vi.fn().mockResolvedValue({ data: [
      { id: 1, company_id: 1, name: 'Configured vessel', active: true, weather_matrix: matrix },
      { id: 2, company_id: 1, name: 'Unconfigured vessel', active: true, weather_matrix: null },
      { id: 3, company_id: 1, name: 'Legacy vessel', active: true },
    ], error: null });
    const select = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: secondOrder }) });
    const client = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
    const vessels = await fetchFleetVessels(client);
    expect(select).toHaveBeenCalledWith(expect.stringContaining('weather_matrix'));
    expect(vessels.find((vessel) => vessel.id === 1)?.weatherMatrix).toEqual(matrix);
    expect(vessels.find((vessel) => vessel.id === 1)?.weatherMatrix).not.toBe(matrix);
    expect(vessels.find((vessel) => vessel.id === 2)?.weatherMatrix).toBeNull();
    expect(vessels.find((vessel) => vessel.id === 3)).not.toHaveProperty('weatherMatrix');
  });

  it('reports a malformed matrix response instead of hiding it as an unconfigured vessel', async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [{ id: 4, company_id: 1, name: 'Invalid source', active: true, weather_matrix: { version: 1 } }], error: null });
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: secondOrder }) }) }) } as unknown as SupabaseClient;
    await expect(fetchFleetVessels(client)).rejects.toThrow('matrice Hs × période reçue');
  });

  it('saves a validated matrix, clears only on explicit null and leaves omitted legacy input untouched', async () => {
    const matrix = createEmptyVesselWeatherMatrix();
    const single = vi.fn().mockResolvedValue({ data: { id: 1, company_id: 1, name: 'Navire test', active: true, weather_matrix: matrix }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    const client = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const vessel = await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test', weatherMatrix: matrix });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ weather_matrix: matrix }));
    expect(vessel.weatherMatrix).toEqual(matrix);
    await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test', weatherMatrix: null });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ weather_matrix: null }));
    await saveFleetVessel(client, { ...EMPTY_INPUT, id: 1, name: 'Navire test' });
    expect(update.mock.lastCall?.[0]).not.toHaveProperty('weather_matrix');
  });

  it.each([{}, { ...createEmptyVesselWeatherMatrix(), hsUpperBoundMeters: 0 },
    { ...createEmptyVesselWeatherMatrix(), levels: [['comfortable']] }])('refuses an invalid matrix before any vessel write', async (weatherMatrix) => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, { ...EMPTY_INPUT, name: 'Navire test', weatherMatrix: weatherMatrix as VesselWeatherMatrix })).rejects.toThrow('matrice Hs × période');
    expect(client.from).not.toHaveBeenCalled();
  });
});
