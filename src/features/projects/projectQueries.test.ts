import { describe, expect, it, vi } from 'vitest';
import { fetchProjectsData, mapProjectContractRows, mapProjectRows } from './projectQueries';

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

  it('keeps projects visible and reports secondary Supabase failures as partial data', async () => {
    const client = createReadClient({
      clients: { data: [], error: null },
      contract_documents: { data: [], error: null },
      project_contracts: { data: null, error: new Error('contracts unavailable') },
      project_documents: { data: [], error: null },
      projects: { data: [projectRow], error: null },
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
      projects: { data: null, error: new Error('projects unavailable') },
    });

    await expect(fetchProjectsData(client as never)).rejects.toThrow('projects unavailable');
  });
});
