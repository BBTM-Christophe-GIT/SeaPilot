import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_PROJECT_WRITE_INPUT,
  archiveClient,
  archiveProject,
  archiveProjectTowedAsset,
  deleteProjectPlanningOccurrence,
  saveProjectPlanningOccurrence,
  fetchProjectCatalogOptions,
  saveClient,
  saveProject,
  saveProjectContractDetails,
  saveProjectTowedAsset,
  validateProjectWriteInput,
  validateProjectPlanningOccurrenceInput,
  validateProjectContractHirePeriods,
} from './projectMutations';

describe('projectMutations', () => {
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
    expect(rpc).toHaveBeenCalledWith('projects_save', expect.objectContaining({
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

    expect(rpc).toHaveBeenCalledWith('projects_save', expect.objectContaining({
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
