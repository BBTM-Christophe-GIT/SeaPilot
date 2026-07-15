import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_PROJECT_WRITE_INPUT,
  archiveProject,
  fetchProjectCatalogOptions,
  saveClient,
  saveProject,
  validateProjectWriteInput,
} from './projectMutations';

describe('projectMutations', () => {
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

  it('surfaces Supabase network and stale-write failures', async () => {
    const input = { ...EMPTY_PROJECT_WRITE_INPUT, title: 'Projet réseau' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(saveProject({ rpc } as never, input)).rejects.toThrow('Failed to fetch');
  });

  it('uses controlled client and archive RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: 52 }, error: null })
      .mockResolvedValueOnce({ data: { id: 901 }, error: null });
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
    })).resolves.toBe(52);
    await expect(archiveProject({ rpc } as never, 901)).resolves.toBeUndefined();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['clients_save', 'projects_archive']);
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
});
