import type { SupabaseClient } from '@supabase/supabase-js';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptySeaOperation, emptySeaOperationWaypoint } from './seaOperationModel';
import { createEmptyVesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { deleteSeaOperation, reviseSeaOperation, fetchSeaOperationCaptainSignature, fetchSeaOperationData, fetchSeaOperationDetail, fetchSeaOperationPlanning, fetchSeaOperationWeatherObservations, loadSeaOperationSignature, mapSeaOperationRecord, saveSeaOperation, signSeaOperation } from './seaOperationQueries';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';

afterEach(() => vi.unstubAllGlobals());
const signature = { signature_id: 17, signer_person_id: 4, signer_name: 'Arthur DUPONT', storage_bucket: 'working-time-signatures',
  storage_path: 'immutable/captain-v1.png', mime_type: 'image/png', sha256: 'a'.repeat(64), version_number: 1 };

function record(overrides: Record<string, unknown> = {}) {
  return { id: 'record-1', company_id: 1, version: 3, status: 'draft', draft: emptySeaOperation(),
    created_by: 'crew-id', created_by_name: 'Marin réel', created_at: '2026-10-16T08:00:00Z',
    updated_by: 'manager-id', updated_by_name: 'Armement réel', updated_at: '2026-10-16T09:00:00Z',
    signed_by: null, signed_by_name: null, signed_at: null, captain_name: null, can_edit: true, can_sign: false, ...overrides };
}
const observation = (): ObservationResult => ({ pointId: 'point-1', latitude: 49.65, longitude: -1.62,
  etaUtc: '2026-10-23T10:00:00Z', recordedAt: '2026-10-24T08:00:00Z', wind: null, waves: null,
  status: 'unavailable', message: 'Aucune mesure officielle proche disponible.' });

describe('sea operation queries', () => {
  it('fails closed for absent or non-boolean administrator capabilities', () => {
    expect(mapSeaOperationRecord(record())).toMatchObject({ canRevise: false, canDelete: false, previousRevisionId: null, supersededById: null });
    expect(mapSeaOperationRecord(record({ can_revise: 'true', can_delete: 1 }))).toMatchObject({ canRevise: false, canDelete: false });
    expect(mapSeaOperationRecord(record({ can_revise: true, can_delete: true, previous_revision_id: 'old', superseded_by_id: 'new' })))
      .toMatchObject({ canRevise: true, canDelete: true, previousRevisionId: 'old', supersededById: 'new' });
  });

  it('requests an administrator revision with the expected version and accepts server metadata only', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record({ id: 'new-record', previous_revision_id: 'record-1', version: 1 }), error: null });
    const result = await reviseSeaOperation({ rpc } as unknown as SupabaseClient, { id: 'record-1', version: 3 });
    expect(rpc).toHaveBeenCalledWith('sea_operation_revise', { p_id: 'record-1', p_version: 3 });
    expect(result).toMatchObject({ id: 'new-record', previousRevisionId: 'record-1', version: 1, status: 'draft' });
  });

  it('requires a matching server acknowledgement before accepting deletion', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'record-1', deleted: true }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(deleteSeaOperation(client, { id: 'record-1', version: 3 })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('sea_operation_delete', { p_id: 'record-1', p_version: 3 });
    for (const result of [{ id: 'another', deleted: true }, { id: 'record-1', deleted: false }, {}]) {
      rpc.mockResolvedValueOnce({ data: result, error: null });
      await expect(deleteSeaOperation(client, { id: 'record-1', version: 3 })).rejects.toThrow('n’a pas été confirmée');
    }
  });

  it('propagates administrator permission and concurrent-update failures', async () => {
    const error = { message: 'Version périmée', code: '40001' };
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error }) } as unknown as SupabaseClient;
    await expect(reviseSeaOperation(client, { id: 'record-1', version: 3 })).rejects.toBe(error);
    await expect(deleteSeaOperation(client, { id: 'record-1', version: 3 })).rejects.toBe(error);
  });

  it('uses server permissions and orders real vessel options by decreasing length', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel',
      records: [record()], vessels: [
        { id: 1, name: 'Petit', length_overall: '12 m', draft_m: '1.4', registration_imo: '123', can_sign: false },
        { id: 2, name: 'Grand', length_overall: '45 m', draft_m: 2.1, registration_imo: '456', can_sign: true },
      ] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.actorId).toBe('crew-id');
    expect(data.records[0]).toMatchObject({ version: 3, canEdit: true, canSign: false, signedAt: null });
    expect(data.vessels.map((vessel) => vessel.id)).toEqual([2, 1]);
    expect(data.vessels.map((vessel) => vessel.draftMeters)).toEqual([2.1, 1.4]);
    expect(rpc).toHaveBeenCalledWith('sea_operations_overview', undefined);
  });

  it('keeps unknown vessel draughts empty, including historical RPC responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel', records: [],
      vessels: [{ id: 1, name: 'Inconnu', draft_m: null }, { id: 2, name: 'Historique' }] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.vessels.every((vessel) => vessel.draftMeters === null)).toBe(true);
  });

  it('reads vessel maximum speed through the existing operational overview without adding it to the saved form', async () => {
    const saved = record();
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'captain-server-account', actor_name: 'Capitaine réel', records: [saved],
      vessels: [{ id: 1, name: 'Rapide', max_speed_knots: 12.5 }, { id: 2, name: 'Numérique', max_speed_knots: ' 8.25 ' }] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.vessels.find(vessel => vessel.id === 1)?.maxSpeedKnots).toBe(12.5);
    expect(data.vessels.find(vessel => vessel.id === 2)?.maxSpeedKnots).toBe(8.25);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sea_operations_overview', undefined);
    expect(data.records[0].draft).toBe(saved.draft);
    expect(data.records[0].draft.vessel).not.toHaveProperty('maxSpeedKnots');
  });

  it('keeps missing, unknown and invalid maximum speeds unusable instead of fabricating a sailing speed', async () => {
    const invalid = [null, 0, -1, '', ' ', true, 'invalid', Infinity, 'Infinity', {}, 'NaN'];
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'sailor-server-account', actor_name: 'Marin réel', records: [],
      vessels: [{ id: 100, name: 'Ancienne réponse' }, ...invalid.map((value, index) => ({ id: index + 1, name: `Inconnu ${index}`, max_speed_knots: value }))] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.vessels.find(vessel => vessel.id === 100)).not.toHaveProperty('maxSpeedKnots');
    expect(data.vessels.filter(vessel => vessel.id !== 100).every(vessel => vessel.maxSpeedKnots === null)).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sea_operations_overview', undefined);
  });

  it('maps vessel matrices without substituting another vessel or guessing legacy absence', async () => {
    const matrix = createEmptyVesselWeatherMatrix(); matrix.levels[0][0] = 'unlivable';
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel', records: [], vessels: [
      { id: 1, name: 'Configured', weather_matrix: matrix, can_sign: false },
      { id: 2, name: 'Unconfigured', weather_matrix: null, can_sign: true }, { id: 3, name: 'Legacy' },
    ] }, error: null });
    const data = await fetchSeaOperationData({ rpc } as unknown as SupabaseClient);
    expect(data.vessels.find((vessel) => vessel.id === 1)).toMatchObject({ weatherMatrix: matrix, canSign: false });
    expect(data.vessels.find((vessel) => vessel.id === 2)).toMatchObject({ weatherMatrix: null, canSign: true });
    expect(data.vessels.find((vessel) => vessel.id === 3)).not.toHaveProperty('weatherMatrix');
  });

  it('reports malformed canonical matrices instead of silently replacing them with no matrix', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { company_id: 1, actor_id: 'crew-id', actor_name: 'Marin réel', records: [], vessels: [
      { id: 1, name: 'Malformed', weather_matrix: { version: 1 } },
    ] }, error: null });
    await expect(fetchSeaOperationData({ rpc } as unknown as SupabaseClient)).rejects.toThrow('matrice Hs × période reçue');
  });

  it('keeps the exact planning vessel matrix and distinguishes loaded null from legacy omission', async () => {
    const matrix = createEmptyVesselWeatherMatrix(); matrix.levels[5][6] = 'twelve_hours';
    const vessel = { name: 'Navire', registrationImo: '', departurePort: '', arrivalPort: '', etd: '', eta: '' };
    const base = { projectId: '1', project: 'Mission', client: '', clientContact: '', description: '', captains: [], canSign: false };
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-23', choices: [
      { ...base, operationId: '1:1', vessel: { ...vessel, id: '1', weatherMatrix: matrix } },
      { ...base, operationId: '2:2', vessel: { ...vessel, id: '2', weatherMatrix: null } },
      { ...base, operationId: '3:3', vessel: { ...vessel, id: '3' } },
    ] }, error: null });
    const { choices } = await fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-23');
    expect(choices[0].vessel.weatherMatrix).toEqual(matrix);
    expect(choices[0].vessel.weatherMatrix).not.toBe(matrix);
    expect(choices[1].vessel.weatherMatrix).toBeNull();
    expect(choices[2].vessel).not.toHaveProperty('weatherMatrix');
  });

  it('reports malformed planning vessel matrices without exposing an apparently unconfigured choice', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-23', choices: [{ operationId: '1:1', projectId: '1', project: 'Mission', client: '', clientContact: '', description: '', captains: [],
      vessel: { id: '1', name: 'Navire', registrationImo: '', departurePort: '', arrivalPort: '', etd: '', eta: '', weatherMatrix: false } }] }, error: null });
    await expect(fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-23')).rejects.toThrow('matrice Hs × période reçue');
  });

  it('saves only payload and expected revision, without accepting client actor metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record(), error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const draft = emptySeaOperation();
    await saveSeaOperation(client, draft);
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save', { p_id: null, p_version: null, p_draft: draft });
    await saveSeaOperation(client, draft, { id: 'record-1', version: 2 });
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save', { p_id: 'record-1', p_version: 2, p_draft: draft });
  });

  it('round trips optional automatic and manual ETA modes without adding a mode to historical waypoints', async () => {
    const draft = emptySeaOperation();
    draft.waypoints = [{ ...emptySeaOperationWaypoint('legacy'), eta: '2026-10-27T12:00' },
      { ...emptySeaOperationWaypoint('generated'), eta: '2026-10-27T13:00', etaMode: 'automatic' },
      { ...emptySeaOperationWaypoint('override'), eta: '2026-10-27T15:30', etaMode: 'manual' }];
    const rpc = vi.fn().mockResolvedValue({ data: record({ draft }), error: null });
    const saved = await saveSeaOperation({ rpc } as unknown as SupabaseClient, draft);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sea_operation_save', { p_id: null, p_version: null, p_draft: draft });
    expect(saved.draft.waypoints[0]).not.toHaveProperty('etaMode');
    expect(saved.draft.waypoints[1]).toMatchObject({ eta: '2026-10-27T13:00', etaMode: 'automatic' });
    expect(saved.draft.waypoints[2]).toMatchObject({ eta: '2026-10-27T15:30', etaMode: 'manual' });
  });

  it('signs the saved version and preserves server-authenticated signatory metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record({ status: 'signed', version: 4, can_edit: false, can_sign: false,
      signed_by: 'real-captain-id', signed_by_name: 'Capitaine authentifié', captain_name: 'Nom déclaré', signed_at: '2026-10-16T10:00:00Z' }), error: null });
    const result = await signSeaOperation({ rpc } as unknown as SupabaseClient, { id: 'record-1', version: 3 }, ' Nom déclaré ', true);
    expect(rpc).toHaveBeenCalledWith('sea_operation_sign', { p_id: 'record-1', p_version: 3, p_captain_name: 'Nom déclaré', p_acknowledged: true });
    expect(result).toMatchObject({ status: 'signed', version: 4, signedBy: 'real-captain-id', signedByName: 'Capitaine authentifié', canEdit: false });
  });

  it('loads the measured annex separately for a signed revision without changing its saved form', async () => {
    const signed = record({ status: 'signed', signed_at: '2026-10-23T08:00:00Z', can_edit: false });
    const originalDraft = structuredClone(signed.draft);
    const points = [observation()];
    const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'sea_operation_detail' ? signed : { operationId: 'record-1', points }, error: null }));
    const result = await fetchSeaOperationDetail({ rpc } as unknown as SupabaseClient, 'record-1');
    expect(result.weatherObservations).toEqual(points);
    expect(result.draft).toEqual(originalDraft);
    expect(result.weatherHistoryError).toBeUndefined();
    expect(rpc).toHaveBeenNthCalledWith(2, 'sea_operation_weather_observations', { p_id: 'record-1' });
    expect(signed.draft).toEqual(originalDraft);
  });

  it('does not collect a measured annex while an operation is a draft', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record(), error: null });
    const result = await fetchSeaOperationDetail({ rpc } as unknown as SupabaseClient, 'record-1');
    expect(result.weatherObservations).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['detail', 'sign'] as const)('keeps the valid signed %s readable when the measured annex cannot be read', async (action) => {
    const signed = record({ status: 'signed', version: 4, signed_by: 'actual-captain', signed_by_name: 'Capitaine réel',
      signed_at: '2026-10-23T08:00:00Z', can_edit: false, can_sign: false });
    const rpc = vi.fn().mockImplementation(async (name: string) => name === 'sea_operation_weather_observations'
      ? { data: null, error: { code: '42501', message: 'Lecture indisponible.' } } : { data: signed, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const result = action === 'detail' ? await fetchSeaOperationDetail(client, 'record-1')
      : await signSeaOperation(client, { id: 'record-1', version: 3 }, 'Capitaine réel', true);
    expect(result).toMatchObject({ id: 'record-1', status: 'signed', version: 4, signedBy: 'actual-captain', canEdit: false,
      weatherHistoryError: 'Les mesures météo enregistrées sont temporairement indisponibles. Réessayez leur lecture.' });
    expect(result.weatherObservations).toBeUndefined();
    expect(result.draft).toEqual(signed.draft);
  });

  it('reads only the requested operation measured annex', async () => {
    const points = [observation()];
    const rpc = vi.fn().mockResolvedValue({ data: { operationId: 'record-1', points }, error: null });
    expect(await fetchSeaOperationWeatherObservations({ rpc } as unknown as SupabaseClient, 'record-1')).toEqual(points);
    expect(rpc).toHaveBeenCalledWith('sea_operation_weather_observations', { p_id: 'record-1' });
  });

  it('retains all points of an existing long passage plan without an artificial 64-point limit', async () => {
    const points = Array.from({ length: 120 }, (_, index) => ({ ...observation(), pointId: `point-${index}` }));
    const rpc = vi.fn().mockResolvedValue({ data: { operationId: 'record-1', points }, error: null });
    expect(await fetchSeaOperationWeatherObservations({ rpc } as unknown as SupabaseClient, 'record-1')).toEqual(points);
  });

  it.each([
    { operationId: 'another-operation', points: [] }, { operationId: 'record-1', points: null },
    { operationId: 'record-1', points: [{ ...observation(), status: 'recorded' }] },
    { operationId: 'record-1', points: [{ ...observation(), etaUtc: '2026-02-30T10:00:00Z' }] },
  ])('rejects malformed or mismatched measured annexes %o', async (value) => {
    const rpc = vi.fn().mockResolvedValue({ data: value, error: null });
    await expect(fetchSeaOperationWeatherObservations({ rpc } as unknown as SupabaseClient, 'record-1')).rejects.toThrow('invalides');
  });

  it('propagates revision and permission failures instead of falling back to a writable form', async () => {
    const error = { code: '40001', message: 'Rechargez l’opération.' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(fetchSeaOperationDetail({ rpc } as unknown as SupabaseClient, 'record-1')).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledWith('sea_operation_detail', { p_id: 'record-1' });
  });

  it.each([null, [], { id: 'bad', version: 1, status: 'signed', draft: null }, { ...record(), version: 0.5 },
    { ...record(), draft: { version: 1 } }, { ...record(), version: 0 }])(
    'rejects malformed record responses', (value) => expect(() => mapSeaOperationRecord(value)).toThrow('réponse'),
  );

  it('fails closed when the server omits permission booleans', () => {
    expect(mapSeaOperationRecord(record({ can_edit: undefined, can_sign: 'true' }))).toMatchObject({ canEdit: false, canSign: false });
  });

  it('keeps distinct same-day planning occurrences and their own linked data and actual captain permissions', async () => {
    const choices = [1, 2].map((id) => ({ operationId: `${id}:42`, projectId: String(id), project: `P${id}`, client: `Client ${id}`,
      clientContact: `Contact ${id}`, description: `Mission ${id}`, vessel: { id: '42', name: 'Navire', registrationImo: 'IMO1', departurePort: `Port ${id}`, arrivalPort: '', etd: '', eta: '' },
      captains: [{ personId: '5', name: 'Alice MARTIN', functionLabel: 'Capitaine', hasSignature: true, canSign: id === 1 }], canSign: id === 1 }));
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-16', choices }, error: null });
    const result = await fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-16');
    expect(rpc).toHaveBeenCalledWith('sea_operation_planning_context', { p_date: '2026-10-16' });
    expect(result.choices.map((choice) => [choice.operationId, choice.client, choice.captains[0].canSign])).toEqual([
      ['1:42', 'Client 1', true], ['2:42', 'Client 2', false],
    ]);
  });

  it('requests a signature for the exact planning choice before obtaining private image access', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: signature, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.test/short-lived' }, error: null });
    const client = { rpc, storage: { from: vi.fn(() => ({ createSignedUrl })) } } as unknown as SupabaseClient;
    const result = await fetchSeaOperationCaptainSignature(client, '2026-10-16', '1:42', '4');
    expect(rpc).toHaveBeenCalledWith('sea_operation_captain_signature', { p_date: '2026-10-16', p_operation_id: '1:42', p_captain_person_id: '4' });
    expect(createSignedUrl).toHaveBeenCalledWith('immutable/captain-v1.png', 600);
    expect(result).toEqual({ snapshot: signature, url: 'https://private.test/short-lived' });
  });

  it('does not invent a signature when the selected captain has none', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as unknown as SupabaseClient;
    expect(await fetchSeaOperationCaptainSignature(client, '2026-10-16', '1:42', '4')).toBeNull();
  });

  it('orders vessels within one planning occurrence by decreasing fleet length', async () => {
    const base = { projectId: '1', project: 'P1', client: '', clientContact: '', description: '', captains: [], canSign: false };
    const vessel = { registrationImo: '', departurePort: '', arrivalPort: '', etd: '', eta: '' };
    const rpc = vi.fn().mockResolvedValue({ data: { date: '2026-10-16', choices: [
      { ...base, operationId: '1:2', vessel: { ...vessel, id: '2', name: 'Petit', lengthOverall: '12 m' } },
      { ...base, operationId: '1:3', vessel: { ...vessel, id: '3', name: 'Grand', lengthOverall: '42 m' } },
    ] }, error: null });
    expect((await fetchSeaOperationPlanning({ rpc } as unknown as SupabaseClient, '2026-10-16')).choices.map((choice) => choice.vessel.name)).toEqual(['Grand', 'Petit']);
  });

  it('keeps valid saved records readable when refreshing a signature URL is unavailable', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: record({ signature_snapshot: signature }), error: null });
    const client = { rpc, storage: { from: () => ({ createSignedUrl: vi.fn().mockRejectedValue(new Error('offline')) }) } } as unknown as SupabaseClient;
    const saved = await fetchSeaOperationDetail(client, 'record-1');
    expect(saved).toMatchObject({ id: 'record-1', signatureSnapshot: signature });
    expect(saved.signatureUrl).toBeUndefined();
  });

  it('exports the immutable snapshot bytes after checking their stored checksum', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = new Uint8Array([1, 2, 3]);
    const sha256 = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const download = vi.fn().mockResolvedValue({ data: { arrayBuffer: async () => bytes.buffer }, error: null });
    const client = { storage: { from: () => ({ download }) } } as unknown as SupabaseClient;
    const saved = mapSeaOperationRecord(record({ signature_snapshot: { ...signature, sha256 } }));
    expect(await loadSeaOperationSignature(client, saved)).toBe('data:image/png;base64,AQID');
    expect(download).toHaveBeenCalledWith('immutable/captain-v1.png');
    saved.signatureSnapshot!.sha256 = '0'.repeat(64);
    await expect(loadSeaOperationSignature(client, saved)).rejects.toThrow('empreinte');
  });
});
