import { describe, expect, it, vi } from 'vitest';
import {
  fetchProjectsData,
  mapClientRows,
  mapProjectContractHirePeriodRows,
  mapProjectContractRows,
  mapProjectOperationDocumentRows,
  mapProjectPlanningOccurrenceRows,
  mapProjectRows,
  mapProjectTowedAssetRows,
} from './projectQueries';

const projectRow = {
  archived_at: null,
  charter_ends_at: '2026-07-15T18:00:00+02:00',
  charter_starts_at: '2026-07-01T08:00:00+02:00',
  client_id: 50,
  client_name: 'Ifremer',
  client_sharepoint_item_id: '50',
  contract_type: 'SUPPLYTIME 2017',
  delivery_at: '2026-07-01T08:00:00+02:00',
  delivery_port: 'Brest',
  description: 'Campagne bathymétrie',
  ends_on: '2026-07-15',
  id: 880,
  is_diving_support: false,
  is_rov_support: true,
  operation_area: 'Atlantique Nord',
  primary_vessel_id: 12,
  primary_vessel_name: 'COTENTIN',
  primary_vessel_sharepoint_item_id: '12',
  project_code: 'P1086',
  redelivery_at: '2026-07-15T18:00:00+02:00',
  redelivery_port: 'Saint-Nazaire',
  secondary_vessel_id: null,
  secondary_vessel_name: null,
  secondary_vessel_sharepoint_item_id: null,
  sharepoint_item_id: '880',
  sharepoint_list_title: 'BBTM - Projets',
  source_label: 'sharepoint',
  source_modified_at: '2026-07-14T12:00:00Z',
  starts_on: '2026-07-01',
  status: 'Contrat signé',
  title: 'Campagne Atlantique 2026',
};

function createReadClient(results: Record<string, { data: unknown[] | null; error: unknown }>) {
  return {
    rpc: vi.fn((functionName: string) => {
      if (functionName === 'projects_planning_occurrences') return Promise.resolve(results.planning_projects);
      if (functionName === 'projects_towed_assets') return Promise.resolve({ data: [], error: null });
      throw new Error(`Unexpected RPC ${functionName}`);
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          gt: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(results[table]),
          })),
        })),
      })),
    })),
  };
}

describe('projectQueries', () => {
  it('maps the client representative stored in Supabase', () => {
    expect(mapClientRows([{
      id: 50,
      name: 'COSMA',
      represented_by: 'Jean DUPONT',
      code: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      country: null,
      website: 'https://cosma.example/',
      logo_url: 'https://cosma.example/favicon.ico',
      logo_storage_path: null,
      active: true,
      source_label: 'seapilot',
      sharepoint_list_title: null,
      sharepoint_item_id: null,
      source_modified_at: null,
      archived_at: null,
      updated_at: '2026-08-20T10:00:00Z',
    }])).toEqual([expect.objectContaining({
      logoUrl: 'https://cosma.example/favicon.ico',
      representedBy: 'Jean DUPONT',
      website: 'https://cosma.example/',
    })]);
  });

  it('maps reusable towed assets and their numeric dimensions', () => {
    expect(mapProjectTowedAssetRows([{
      id: 8,
      name: 'DENVER',
      asset_type: 'AUTOMOTEUR FLUVIAL',
      length_overall_m: '82.00',
      breadth_overall_m: '8.20',
      max_draft_m: '1.00',
      light_displacement_t: '700.00',
      flag: 'FR',
      classification_society: null,
      registration_number: null,
      owner_name: null,
      hull_machinery_insurer: null,
      liability_insurer: null,
      photo_url: null,
      photo_storage_path: 'towed-assets/8/denver.webp',
      active: true,
    }])).toEqual([expect.objectContaining({
      id: 8,
      name: 'DENVER',
      lengthOverallM: 82,
      breadthOverallM: 8.2,
      lightDisplacementT: 700,
      photoStoragePath: 'towed-assets/8/denver.webp',
    })]);
  });

  it('maps the full typed project model and SharePoint provenance', () => {
    const [project] = mapProjectRows([projectRow] as never);

    expect(project).toMatchObject({
      contractType: 'SUPPLYTIME 2017',
      deliveryAt: '2026-07-01T08:00:00+02:00',
      deliveryPort: 'Brest',
      isRovSupport: true,
      operationArea: 'Atlantique Nord',
      sharePointItemId: '880',
      sharePointListTitle: 'BBTM - Projets',
    });
  });

  it('maps numeric contract fields and ignores invalid nested SUPPLYTIME values defensively', () => {
    const [contract] = mapProjectContractRows([
      {
        archived_at: null,
        auto_extension_period: 'Voyage',
        charter_hire: '12000.50',
        demobilisation_fee: null,
        extension_count: 1,
        extension_duration: '5',
        extension_hire: null,
        extension_unit: 'jours',
        fee_currency: 'EUR',
        hire_currency: 'EUR',
        hire_unit: 'jour',
        id: 10,
        max_audit_period: '30 jours',
        max_extension_days: 10,
        mobilisation_fee: '2000',
        owner_identity: 'Armateur BBTM',
        project_id: 880,
        sharepoint_item_id: '880',
        sharepoint_list_title: 'BBTM - Projets',
        source_label: 'sharepoint',
        source_modified_at: '2026-07-14T12:00:00Z',
        supplytime_data: { box05_cancelling_date: '30 juin', invalid: { nested: true } },
        supplytime_schema_version: 'supplytime-2017-v1',
        vessel_assignment_limit: 'Europe',
      },
    ] as never);

    expect(contract.charterHire).toBe(12000.5);
    expect(contract.extensionDuration).toBe(5);
    expect(contract.supplytimeData).toEqual({ box05_cancelling_date: '30 juin' });
  });

  it('maps all three contract hire amounts for a dated period', () => {
    expect(mapProjectContractHirePeriodRows([{
      id: 8,
      project_id: 880,
      contract_id: 10,
      starts_on: '2026-07-01',
      ends_on: null,
      charter_hire: '12000',
      standby_hire: '9000',
      weather_standby_hire: '6000',
      hire_currency: 'EUR',
      hire_unit: 'jour',
    }])).toEqual([expect.objectContaining({
      charterHire: 12000,
      standbyHire: 9000,
      weatherStandbyHire: 6000,
    })]);
  });

  it('maps private Supabase project attachments without requiring SharePoint metadata', () => {
    expect(mapProjectOperationDocumentRows([{
      id: 73,
      project_id: 880,
      planning_occurrence_id: null,
      document_type: 'project_attachment',
      category_key: 'toilette_de_mer',
      subcategory_key: 'toilette_de_mer_attestation_expert_bv',
      expires_on: null,
      file_name: 'Attestation Expert BV.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 512,
      sharepoint_web_url: null,
      sharepoint_folder_path: null,
      storage_bucket: 'project-files',
      storage_path: 'projects/880/attachments/toilette_de_mer/attestation.pdf',
      created_at: '2026-08-29T06:00:00Z',
    }])).toEqual([expect.objectContaining({
      sharePointWebUrl: '',
      storageBucket: 'project-files',
      storagePath: 'projects/880/attachments/toilette_de_mer/attestation.pdf',
    })]);
  });

  it('keeps projects visible and reports secondary Supabase failures as partial data', async () => {
    const client = createReadClient({
      clients: { data: [], error: null },
      contract_documents: { data: [], error: null },
      project_contracts: { data: null, error: new Error('contracts unavailable') },
      project_documents: { data: [], error: null },
      project_generated_documents: { data: [], error: null },
      planning_projects: { data: [], error: null },
      projects: { data: [projectRow], error: null },
      vessels: { data: [], error: null },
    });

    const data = await fetchProjectsData(client as never);

    expect(data.projects).toHaveLength(1);
    expect(data.projectContracts).toEqual([]);
    expect(data.warnings).toEqual([
      { label: 'les informations contractuelles et SUPPLYTIME', source: 'projectContracts' },
    ]);
  });

  it('rejects when the primary projects query fails instead of returning an empty portfolio', async () => {
    const client = createReadClient({
      clients: { data: [], error: null },
      contract_documents: { data: [], error: null },
      project_contracts: { data: [], error: null },
      project_documents: { data: [], error: null },
      project_generated_documents: { data: [], error: null },
      planning_projects: { data: [], error: null },
      projects: { data: null, error: new Error('projects unavailable') },
      vessels: { data: [], error: null },
    });

    await expect(fetchProjectsData(client as never)).rejects.toThrow('projects unavailable');
  });

  it('maps only planning occurrences explicitly linked to a catalog project', () => {
    expect(mapProjectPlanningOccurrenceRows([
      {
        id: 1,
        catalog_project_id: 880,
        starts_on: '2026-07-01',
        ends_on: '2026-07-05',
        primary_vessel_id: 12,
        primary_vessel_name: 'COTENTIN',
        status: 'Validé',
        description: 'Rotation 1',
        charter_hire: '18000',
        hire_currency: 'EUR',
        hire_unit: 'jour',
        source_label: 'seapilot-projects',
        created_at: '2026-07-16T08:00:00Z',
      },
      {
        id: 2,
        catalog_project_id: null,
        starts_on: '2026-07-10',
        ends_on: '2026-07-12',
        primary_vessel_id: 12,
        primary_vessel_name: 'COTENTIN',
        status: 'Validé',
        description: 'Événement planning indépendant',
        charter_hire: null,
        hire_currency: null,
        hire_unit: null,
        source_label: 'seapilot-admin',
        created_at: '2026-07-16T08:00:00Z',
      },
    ] as never)).toEqual([
      expect.objectContaining({
        charterHire: 18000,
        hireCurrency: 'EUR',
        hireUnit: 'jour',
        id: 1,
        projectId: 880,
        primaryVesselName: 'COTENTIN',
      }),
    ]);
  });
});
