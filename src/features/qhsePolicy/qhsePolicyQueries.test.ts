import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { addQhsePolicyObjectiveUpdate, fetchQhsePolicySnapshot, fetchQhsePolicyOwnerOptions, saveQhsePolicyObjective, saveQhsePolicyProcess, saveQhsePolicySettings, setQhsePolicyObjectiveArchived } from './qhsePolicyQueries';
const processId = 'a02c0000-0000-4000-8000-000000000001';
const objectiveId = 'a02c0000-0000-4000-8000-000000000002';
const updateId = 'a02c0000-0000-4000-8000-000000000003';
function client(data: unknown, error: unknown = null) { const rpc = vi.fn().mockResolvedValue({ data, error }); return { client: { rpc } as unknown as SupabaseClient, rpc }; }
const raw = { can_edit: false, settings: null, processes: [{ id: processId, name: 'Sécurité', description: '', position: 0, archived: false, revision: 1, updated_at: '2026-10-02T06:00:00Z' }], objectives: [{ id: objectiveId, process_id: processId, title: 'Objectif réel', description: '', owner_label: '', due_on: null, progress: '0.00', archived: false, revision: 1, created_at: '2026-10-02T06:00:00Z', updated_at: '2026-10-02T06:00:00Z' }], updates: [] };

describe('QHSE policy queries', () => {
  it('maps server permissions, explicit zero and the actual empty document selection', async () => {
    const { client: db, rpc } = client(raw);
    const result = await fetchQhsePolicySnapshot(db);
    expect(rpc).toHaveBeenCalledWith('qhse_policy_snapshot');
    expect(result).toMatchObject({ canEdit: false, settings: null, objectives: [{ progress: 0, dueOn: null, ownerLabel: '' }] });
  });
  it.each([null, { ...raw, objectives: [{ ...raw.objectives[0], progress: null }] }, { ...raw, processes: [] , updates: null }, { ...raw, can_edit: null }])('rejects incomplete data rather than inventing zero progress', async (data) => await expect(fetchQhsePolicySnapshot(client(data).client)).rejects.toThrow());
  it('creates process and objective with server-controlled audit fields omitted', async () => {
    const process = client(processId);
    await saveQhsePolicyProcess(process.client, { name: ' Sécurité ' });
    expect(process.rpc).toHaveBeenCalledWith('qhse_policy_save_process', { p_id: null, p_name: 'Sécurité', p_description: '', p_position: 0, p_expected_revision: null });
    const objective = client(objectiveId);
    await saveQhsePolicyObjective(objective.client, { processId, title: 'Formation', initialProgress: 12.25, ownerKind: 'vessel', ownerVesselId: 1 });
    expect(objective.rpc).toHaveBeenCalledWith('qhse_policy_save_objective', { p_id: null, p_process_id: processId, p_title: 'Formation', p_description: '', p_owner_label: '', p_owner_kind: 'vessel', p_owner_person_id: null, p_owner_vessel_id: 1, p_due_on: null, p_initial_progress: 12.25, p_expected_revision: null });
  });
  it('adds progress and historical entry in one RPC with optimistic concurrency', async () => {
    const { client: db, rpc } = client(updateId);
    await addQhsePolicyObjectiveUpdate(db, { objectiveId, progress: 100, occurredOn: '2026-10-01', note: ' Terminé ', expectedRevision: 4 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('qhse_policy_add_objective_update', { p_objective_id: objectiveId, p_progress: 100, p_occurred_on: '2026-10-01', p_note: 'Terminé', p_expected_revision: 4 });
  });
  it('archives with revision and saves an exclusive document source', async () => {
    const { client: db, rpc } = client(null);
    await setQhsePolicyObjectiveArchived(db, objectiveId, true, 4);
    expect(rpc).toHaveBeenCalledWith('qhse_policy_archive_objective', { p_id: objectiveId, p_archived: true, p_expected_revision: 4 });
    await saveQhsePolicySettings(db, { publicationId: 46, expectedRevision: 2 });
    expect(rpc).toHaveBeenCalledWith('qhse_policy_save_settings', { p_publication_id: 46, p_document_url: '', p_expected_revision: 2 });
  });
  it('rejects invalid progress locally before a network write', async () => {
    const { client: db, rpc } = client(updateId);
    await expect(addQhsePolicyObjectiveUpdate(db, { objectiveId, progress: 200, occurredOn: '2026-10-01', note: 'Terminé', expectedRevision: 1 })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([['40001', 'Actualisez'], ['42501', 'Admin et Direction'], ['23505', 'existe déjà'], ['network', 'Réessayez']])('reports mutation failure %s without claiming success', async (code, message) => await expect(saveQhsePolicyProcess(client(null, { code }).client, { name: 'Sécurité' })).rejects.toThrow(message));
  it('maps only the minimal manager owner catalog and does not query HR tables', async () => {
    const mock = client({ people: [{ id: 7, label: 'Sophie Hamel' }], vessels: [{ id: 1, label: 'GOURY' }] });
    expect(await fetchQhsePolicyOwnerOptions(mock.client)).toEqual({ people: [{ id: 7, label: 'Sophie Hamel' }], vessels: [{ id: 1, label: 'GOURY', lengthOverall: null }] });
    expect(mock.rpc).toHaveBeenCalledWith('qhse_policy_owner_options');
    await expect(fetchQhsePolicyOwnerOptions(client(null, { code: '42501' }).client)).rejects.toThrow('Admin et Direction');
  });
  it('orders vessel owners from longest to shortest using actual dimensions and catalog fallback', async () => {
    const mock = client({ people: [], vessels: [{ id: 1, label: 'LANDEMER' }, { id: 2, label: 'GOURY' }, { id: 3, label: 'Other', length_overall: '35 m' }, { id: 4, label: 'Unknown' }] });
    expect((await fetchQhsePolicyOwnerOptions(mock.client)).vessels.map((vessel) => vessel.label)).toEqual(['Other', 'GOURY', 'LANDEMER', 'Unknown']);
  });
});
