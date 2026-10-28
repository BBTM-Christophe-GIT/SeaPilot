import { describe, expect, it, vi } from 'vitest';
import { emptyProjectLocationPlan } from './projectLocation';
import {
  EMPTY_PROJECT_WRITE_INPUT,
  archiveClient,
  archiveProject,
  archiveProjectTowedAsset,
  reactivateProject,
  setProjectStatus,
  deleteProjectPlanningOccurrence,
  saveProjectPlanningOccurrence,
  fetchProjectCatalogOptions,
  saveClient,
  saveProject,
  saveProjectLocation,
  saveProjectContractDetails,
  saveProjectTowedAsset,
  validateProjectWriteInput,
  validateProjectPlanningOccurrenceInput,
  validateProjectContractHirePeriods,
} from './projectMutations';

describe('projectMutations', () => {
  it('saves only canonical geography without sending contract or client fields and preserves microseconds', async () => {
    const plan = { ...emptyProjectLocationPlan(), includeInPdf: true,
      points: [{ id: 'isolated', number: 'OSS', descriptionVhf: 'Plateforme', latitude: '50', longitude: '1', ukc: '', eta: '', denseTraffic: false, isolatedPointIcon: 'platform' as const }] };
    const original = structuredClone(plan), stamp = '2026-10-28T08:00:00.123456+00:00';
    const rpc = vi.fn().mockResolvedValue({ data: { id: 42, project_code: 'P42', title: 'Contrat conservé', updated_at: '2026-10-28T09:00:00.765432+00:00' }, error: null });
    const result = await saveProjectLocation({ rpc } as never, 42, plan, stamp);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_set_location', { target_project_id: 42, target_location_plan: original, target_expected_updated_at: stamp });
    expect(result).toEqual({ id: 42, projectCode: 'P42', title: 'Contrat conservé', updatedAt: '2026-10-28T09:00:00.765432+00:00' });
    expect(plan).toEqual(original); expect(rpc.mock.calls[0][1].target_location_plan).not.toBe(plan);
  });

  it('allows an explicit empty location without treating it as an omitted write', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 42, updated_at: '2026-10-28T08:00:00.123456Z' }], error: null });
    await saveProjectLocation({ rpc } as never, 42, null, '2026-10-28T07:00:00.654321Z');
    expect(rpc.mock.calls[0][1].target_location_plan).toBeNull();
  });

  it('rejects invalid map save identity, timestamp or geography before an RPC', async () => {
    const rpc = vi.fn();
    for (const id of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(saveProjectLocation({ rpc } as never, id, emptyProjectLocationPlan(), '2026-10-28T08:00:00Z')).rejects.toThrow('projet est obligatoire');
    }
    for (const stamp of ['', ' ', 'invalide']) {
      await expect(saveProjectLocation({ rpc } as never, 42, emptyProjectLocationPlan(), stamp)).rejects.toThrow('Rechargez le projet');
    }
    await expect(saveProjectLocation({ rpc } as never, 42, { ...emptyProjectLocationPlan(), includeInPdf: 'yes' } as never, '2026-10-28T08:00:00Z')).rejects.toThrow('localisation');
    await expect(saveProjectLocation({ rpc } as never, 42, undefined as never, '2026-10-28T08:00:00Z')).rejects.toThrow('localisation');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propagates concurrent and unauthorized map errors without retrying', async () => {
    for (const message of ['Le projet a été modifié par un autre utilisateur.', 'Droits insuffisants pour modifier la localisation du projet.']) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });
      await expect(saveProjectLocation({ rpc } as never, 42, emptyProjectLocationPlan(), '2026-10-28T08:00:00Z')).rejects.toThrow(message);
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });

  it.each([null, { id: 99, updated_at: '2026-10-28T09:00:00Z' }, { id: 42, updated_at: '' }])('rejects an unconfirmed scoped map response %s', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    await expect(saveProjectLocation({ rpc } as never, 42, emptyProjectLocationPlan(), '2026-10-28T08:00:00Z')).rejects.toThrow('n’a pas été confirmé');
  });

  it('saves a canonical location in the same RPC and returns the final microsecond concurrency token', async () => {
    const locationPlan = emptyProjectLocationPlan();
    locationPlan.waypoints = [{ id: 'wp', number: '1', descriptionVhf: '', latitude: '49° 39.000 N', longitude: '', eta: '', ukc: '', denseTraffic: true,
      weather: { untrusted: true } as never }];
    locationPlan.zones = [{ id: 'zone', name: 'Brouillon', vertices: [{ latitude: '', longitude: '' }] }];
    const original = structuredClone(locationPlan);
    const rpc = vi.fn().mockResolvedValue({ data: { id: 901, project_code: 'P1107', title: 'Projet localisé', updated_at: '2026-10-27T08:00:00.123456+00:00' }, error: null });
    const result = await saveProject({ rpc } as never, { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet localisé', locationPlan });
    expect(result.updatedAt).toBe('2026-10-27T08:00:00.123456+00:00');
    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_save_with_location', expect.objectContaining({ target_location_plan: expect.objectContaining({ includeInPdf: false,
      waypoints: [expect.objectContaining({ latitude: '49° 39.000 N', longitude: '', denseTraffic: true })], zones: locationPlan.zones }) }));
    expect(rpc.mock.calls[0][1].target_location_plan.waypoints[0]).not.toHaveProperty('weather');
    expect(locationPlan).toEqual(original);
  });

  it('keeps legacy callers on the original RPC while null explicitly clears a location through the atomic writer', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 42, project_code: 'P42', title: 'Projet', updated_at: '2026-10-27T08:00:00Z' }, error: null });
    const legacy = { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet', projectId: 42, locationPlan: undefined };
    await saveProject({ rpc } as never, legacy);
    expect(rpc).toHaveBeenLastCalledWith('projects_save', expect.not.objectContaining({ target_location_plan: expect.anything() }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('target_location_plan');
    await saveProject({ rpc } as never, { ...legacy, locationPlan: null });
    expect(rpc).toHaveBeenLastCalledWith('projects_save_with_location', expect.objectContaining({ target_location_plan: null }));
  });

  it('rejects malformed locations before any write', async () => {
    const rpc = vi.fn();
    await expect(saveProject({ rpc } as never, { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet', locationPlan: { ...emptyProjectLocationPlan(), includeInPdf: 'yes' } as never })).rejects.toThrow('localisation');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('reactivates and updates only a valid project status through controlled RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await reactivateProject({ rpc } as never, 880);
    await setProjectStatus({ rpc } as never, 880, 'Stand-by météo');
    expect(rpc.mock.calls).toEqual([
      ['projects_reactivate', { target_project_id: 880 }],
      ['projects_set_status', { target_project_id: 880, target_status: 'Stand-by météo' }],
    ]);
  });

  it('rejects invalid project ids and closure labels before lifecycle RPCs', async () => {
    const rpc = vi.fn();
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(archiveProject({ rpc } as never, id)).rejects.toThrow('Le projet est obligatoire.');
      await expect(reactivateProject({ rpc } as never, id)).rejects.toThrow('Le projet est obligatoire.');
      await expect(setProjectStatus({ rpc } as never, id, 'Validé')).rejects.toThrow('Le projet est obligatoire.');
    }
    for (const status of ['Clôturé', 'Clôturer', '', 'validé', 'Validé ']) await expect(setProjectStatus({ rpc } as never, 880, status)).rejects.toThrow('Le statut du projet est invalide.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces lifecycle RPC failures without retrying an ambiguous write', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Projet inaccessible' } });
    await expect(reactivateProject({ rpc } as never, 880)).rejects.toThrow('Projet inaccessible');
    await expect(setProjectStatus({ rpc } as never, 880, 'Validé')).rejects.toThrow('Projet inaccessible');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('persists absent project and contract dates as null without requiring a vessel', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 902, project_code: 'P902', title: 'Projet sans dates', updated_at: '2026-09-22T10:00:00Z' },
      error: null,
    });

    await saveProject({ rpc } as never, { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet sans dates' });

    expect(rpc).toHaveBeenCalledExactlyOnceWith('projects_save_with_location', expect.objectContaining({
      target_starts_on: null,
      target_ends_on: null,
      target_delivery_at: null,
      target_redelivery_at: null,
      target_charter_starts_at: null,
      target_charter_ends_at: null,
      target_primary_vessel_id: null,
      target_secondary_vessel_id: null,
      target_status: 'Non validé',
    }));
  });

  it('validates dated contract rates and rejects overlaps', () => {
    expect(validateProjectContractHirePeriods([
      { startsOn: '2026-01-01', endsOn: '2026-06-30', charterHire: 4000, standbyHire: 3000, weatherStandbyHire: 2000, hireCurrency: 'EUR', hireUnit: 'jour' },
      { startsOn: '2026-06-30', endsOn: '', charterHire: 4500, standbyHire: 3500, weatherStandbyHire: 2500, hireCurrency: 'EUR', hireUnit: 'jour' },
    ])).toContain('Les périodes tarifaires 1 et 2 se chevauchent.');
    expect(validateProjectContractHirePeriods([
      { startsOn: '2026-01-01', endsOn: '2026-06-30', charterHire: 4000, standbyHire: 3000, weatherStandbyHire: 2000, hireCurrency: 'EUR', hireUnit: 'jour' },
      { startsOn: '2026-07-01', endsOn: '', charterHire: 4500, standbyHire: 3500, weatherStandbyHire: 2500, hireCurrency: 'EUR', hireUnit: 'jour' },
    ])).toEqual([]);
  });
  it('sends one atomic project and contract RPC and uses the server-allocated number', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 901, project_code: 'P1107', title: 'Projet concurrent', updated_at: '2026-07-16T08:00:00Z' },
      error: null,
    });
    const input = {
      ...EMPTY_PROJECT_WRITE_INPUT,
      title: 'Projet concurrent',
      clientId: 50,
      primaryVesselId: 12,
      charterHire: 12500,
      hireCurrency: 'eur',
      supplytimeData: { box01_owners: 'BBTM' },
    };

    await expect(saveProject({ rpc } as never, input)).resolves.toMatchObject({ id: 901, projectCode: 'P1107' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('projects_save_with_location', expect.objectContaining({
      target_project_id: null,
      target_title: 'Projet concurrent',
      target_client_id: 50,
      target_primary_vessel_id: 12,
      target_hire_currency: 'eur',
      target_supplytime_data: { box01_owners: 'BBTM' },
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('target_project_code');
  });

  it('preserves PostgreSQL microseconds in project concurrency tokens', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 60, project_code: 'P268', title: 'ETPO FORT BOYARD', updated_at: '2026-08-11T09:00:00Z' },
      error: null,
    });
    const expectedUpdatedAt = '2026-08-07T08:05:49.643239+00:00';

    await saveProject({ rpc } as never, {
      ...EMPTY_PROJECT_WRITE_INPUT,
      expectedUpdatedAt,
      projectId: 60,
      title: 'ETPO FORT BOYARD',
    });

    expect(rpc).toHaveBeenCalledWith('projects_save_with_location', expect.objectContaining({
      target_expected_updated_at: expectedUpdatedAt,
    }));
  });

  it('validates required, vessel, period, extension and currency rules before the RPC', async () => {
    const invalid = {
      ...EMPTY_PROJECT_WRITE_INPUT,
      primaryVesselId: 12,
      secondaryVesselId: 12,
      startsOn: '2026-07-20',
      endsOn: '2026-07-10',
      extensionCount: 1,
      mobilisationFee: 200,
      feeCurrency: 'EU',
    };
    expect(validateProjectWriteInput(invalid)).toHaveLength(5);
    const rpc = vi.fn();
    await expect(saveProject({ rpc } as never, invalid)).rejects.toThrow('nom du projet est obligatoire');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces Supabase network failures without retrying an ambiguous write', async () => {
    const input = { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet réseau' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'upstream request timeout' } });
    await expect(saveProject({ rpc } as never, input)).rejects.toThrow('upstream request timeout');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('uses controlled client and archive RPCs', async () => {
    const rpc = vi.fn(async (functionName: string) => ({
      data: functionName === 'clients_save' ? { id: 52 } : null,
      error: null,
    }));
    await expect(saveClient({ rpc } as never, {
      active: true,
      address: '',
      city: 'Brest',
      clientId: null,
      code: 'NEW',
      country: 'France',
      email: '',
      expectedUpdatedAt: '',
      name: 'Nouveau client',
      phone: '',
      postalCode: '29200',
      representedBy: 'Jean DUPONT',
      website: 'https://client.example/',
      logoUrl: 'https://client.example/favicon.ico',
      logoStoragePath: '',
    })).resolves.toBe(52);
    await expect(archiveClient({ rpc } as never, 52)).resolves.toBeUndefined();
    await expect(archiveProjectTowedAsset({ rpc } as never, 8)).resolves.toBeUndefined();
    await expect(archiveProject({ rpc } as never, 901)).resolves.toBeUndefined();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'clients_save',
      'clients_archive',
      'projects_archive_towed_asset',
      'projects_archive',
    ]);
    expect(rpc).toHaveBeenCalledWith('clients_save', expect.objectContaining({
      target_logo_url: 'https://client.example/favicon.ico',
      target_postal_code: '29200',
      target_website: 'https://client.example/',
    }));
  });

  it('preserves PostgreSQL microseconds in client concurrency tokens', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 52 }, error: null });
    const expectedUpdatedAt = '2026-08-07T08:05:49.643239+00:00';

    await saveClient({ rpc } as never, {
      active: true,
      address: '',
      city: '',
      clientId: 52,
      code: 'ETPO',
      country: '',
      email: '',
      expectedUpdatedAt,
      name: 'ETPO',
      phone: '',
      postalCode: '',
      representedBy: 'Marie MARTIN',
      website: '',
      logoUrl: '',
      logoStoragePath: '',
    });

    expect(rpc).toHaveBeenCalledWith('clients_save', expect.objectContaining({
      target_expected_updated_at: expectedUpdatedAt,
      target_represented_by: 'Marie MARTIN',
    }));
  });

  it('maps the minimal catalog used by dependent modules without creating a second dataset', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 901, project_code: 'P1107', title: 'Projet concurrent' }],
      error: null,
    });
    await expect(fetchProjectCatalogOptions({ rpc } as never)).resolves.toEqual([
      { id: 901, projectCode: 'P1107', title: 'Projet concurrent' },
    ]);
    expect(rpc).toHaveBeenCalledWith('projects_catalog_options');
  });

  it('creates repeatable planning occurrences through the secured project RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 1201 }], error: null });
    const input = {
      occurrenceId: null,
      projectId: 901,
      startsOn: '2026-08-03',
      endsOn: '2026-08-08',
      vesselIds: [12, 14, 16],
      status: 'A planifier',
      description: 'Première rotation',
      charterHire: 18_000,
      hireCurrency: 'EUR',
      hireUnit: 'jour',
    };

    expect(validateProjectPlanningOccurrenceInput(input)).toEqual([]);
    await expect(saveProjectPlanningOccurrence({ rpc } as never, input)).resolves.toBe(1201);
    await expect(saveProjectPlanningOccurrence({ rpc } as never, { ...input, startsOn: '2026-08-14', endsOn: '2026-08-21' })).resolves.toBe(1201);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('projects_save_planning_occurrence', {
      target_occurrence_id: null,
      target_project_id: 901,
      target_starts_on: '2026-08-03',
      target_ends_on: '2026-08-08',
      target_vessel_ids: [12, 14, 16],
      target_status: 'Non validé',
      target_description: 'Première rotation',
      target_charter_hire: 18_000,
      target_hire_currency: 'EUR',
      target_hire_unit: 'jour',
    });
  });

  it('rejects an incomplete or inverted planning occurrence before calling Supabase', async () => {
    const rpc = vi.fn();
    const input = {
      occurrenceId: null,
      projectId: 901,
      startsOn: '2026-08-09',
      endsOn: '2026-08-08',
      vesselIds: [],
      status: '',
      description: '',
      charterHire: null,
      hireCurrency: 'EUR',
      hireUnit: 'jour',
    };
    expect(validateProjectPlanningOccurrenceInput(input)).toHaveLength(2);
    await expect(saveProjectPlanningOccurrence({ rpc } as never, input)).rejects.toThrow("fin de l'opération");
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves contract-only changes without rewriting the project row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(saveProjectContractDetails(
      { rpc } as never,
      60,
      { ...EMPTY_PROJECT_WRITE_INPUT, projectId: 60, title: 'ETPO FORT BOYARD' },
      8,
    )).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith('projects_save_contract_details', expect.objectContaining({
      target_project_id: 60,
      target_owner_identity: expect.stringContaining('BBTM'),
      target_fee_currency: 'EUR',
      target_towed_asset_id: 8,
    }));
  });

  it('creates or updates a reusable towed asset through the secured RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 8, error: null });
    await expect(saveProjectTowedAsset({ rpc } as never, {
      id: null,
      name: 'DENVER',
      assetType: 'AUTOMOTEUR FLUVIAL',
      lengthOverallM: 82,
      breadthOverallM: 8.2,
      maxDraftM: 1,
      lightDisplacementT: 700,
      flag: 'fr',
      classificationSociety: '',
      registrationNumber: '',
      ownerName: '',
      hullMachineryInsurer: '',
      liabilityInsurer: '',
      photoUrl: '',
      photoStoragePath: '',
    })).resolves.toBe(8);

    expect(rpc).toHaveBeenCalledWith('projects_save_towed_asset', expect.objectContaining({
      target_name: 'DENVER',
      target_asset_type: 'AUTOMOTEUR FLUVIAL',
      target_length_overall_m: 82,
      target_flag: 'FR',
      target_photo_storage_path: null,
    }));
  });

  it('deletes one project planning occurrence through the secured RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1201, error: null });

    await expect(deleteProjectPlanningOccurrence({ rpc } as never, {
      occurrenceId: 1201,
      projectId: 901,
    })).resolves.toBe(1201);
    expect(rpc).toHaveBeenCalledWith('projects_delete_planning_occurrence', {
      target_occurrence_id: 1201,
      target_project_id: 901,
    });
  });

  it('rejects invalid project operation identifiers before deletion', async () => {
    const rpc = vi.fn();

    await expect(deleteProjectPlanningOccurrence({ rpc } as never, {
      occurrenceId: 0,
      projectId: 901,
    })).rejects.toThrow("opération à supprimer est invalide");
    await expect(deleteProjectPlanningOccurrence({ rpc } as never, {
      occurrenceId: 1201,
      projectId: -1,
    })).rejects.toThrow('projet de cette opération est invalide');
    expect(rpc).not.toHaveBeenCalled();
  });
});
