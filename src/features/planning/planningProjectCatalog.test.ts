import { describe, expect, it, vi } from 'vitest';
import {
  createAndSchedulePlanningProject,
  createPlanningProjectClient,
  fetchPlanningProjectCatalog,
  schedulePlanningCatalogProject,
} from './planningProjectCatalog';

const planningRow = {
  id: 91,
  catalog_project_id: 41,
  title: 'P267 - Remorquage Cherbourg',
  starts_on: '2026-07-18',
  ends_on: '2026-07-18',
  description: '',
  client_name: 'Cherbourg Port',
  primary_vessel_id: 1,
  primary_vessel_name: 'GOURY',
  secondary_vessel_id: null,
  secondary_vessel_name: null,
  event_type: 'operation',
  responsible_name: null,
  status: 'A planifier',
  source_label: 'seapilot-planning',
};

describe('planning project catalog API', () => {
  it('maps the minimal read-only catalog in descending project-number order', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 42,
          project_code: 'SP-52',
          title: 'Hors Projet',
          client_name: '',
          status: 'A planifier',
          description: '',
          starts_on: '',
          ends_on: '',
        },
        {
          id: 41,
          project_code: 'P267',
          title: 'Remorquage Cherbourg',
          client_name: 'Cherbourg Port',
          status: 'Confirmé',
          description: 'Mission',
          starts_on: '2026-07-18',
          ends_on: '2026-07-19',
        },
      ],
      error: null,
    });

    await expect(fetchPlanningProjectCatalog({ rpc } as never)).resolves.toEqual([
      {
        id: 41,
        projectCode: 'P267',
        title: 'Remorquage Cherbourg',
        clientName: 'Cherbourg Port',
        status: 'Validé',
        description: 'Mission',
        startsOn: '2026-07-18',
        endsOn: '2026-07-19',
      },
      {
        id: 42,
        projectCode: 'SP-52',
        title: 'Hors Projet',
        clientName: '',
        status: 'Non validé',
        description: '',
        startsOn: '',
        endsOn: '',
      },
    ]);
  });

  it('uses the vessel cell date for existing and newly created occurrences', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [planningRow], error: null });
    const client = { rpc } as never;

    await expect(schedulePlanningCatalogProject(client, {
      projectId: 41,
      vesselId: 1,
      startsOn: '2026-07-18',
    })).resolves.toMatchObject({ id: 91, catalogProjectId: 41 });
    expect(rpc).toHaveBeenLastCalledWith('planning_schedule_catalog_project', expect.objectContaining({
      target_project_id: 41,
      target_primary_vessel_id: 1,
      target_starts_on: '2026-07-18',
      target_ends_on: '2026-07-18',
    }));

    await expect(createAndSchedulePlanningProject(client, {
      title: 'Inspection annuelle',
      clientId: 50,
      status: 'Confirmé',
      description: 'Inspection',
      vesselId: 1,
      startsOn: '2026-07-18',
    })).resolves.toMatchObject({ primaryVesselName: 'GOURY' });
    expect(rpc).toHaveBeenLastCalledWith('planning_create_and_schedule_project', expect.objectContaining({
      target_title: 'Inspection annuelle',
      target_client_id: 50,
      target_primary_vessel_id: 1,
      target_starts_on: '2026-07-18',
    }));
  });

  it('creates a client through the Planning-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 51, name: 'Nouveau client', active: true }], error: null });
    await expect(createPlanningProjectClient({ rpc } as never, {
      name: 'Nouveau client',
      code: 'NC',
      email: '',
      phone: '',
      city: 'Cherbourg',
      country: 'France',
    })).resolves.toEqual({ id: 51, name: 'Nouveau client', active: true });
  });
});
