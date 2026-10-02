import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let client: SupabaseClient;
let queries: typeof import('../qhsePolicy/qhsePolicyQueries');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  client = (await import('./previewSupabaseClient')).previewSupabaseClient;
  queries = await import('../qhsePolicy/qhsePolicyQueries');
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function createProcess(name = 'Processus de test démonstration') {
  return queries.saveQhsePolicyProcess(client, { name, description: 'Éphémère, sans donnée de production.', position: 10 });
}
async function createObjective(processId: string, initialProgress = 12.5) {
  return queries.saveQhsePolicyObjective(client, { processId, title: 'Objectif de test démonstration', ownerKind: 'office', ownerLabel: 'Responsable Démonstration', dueOn: '2026-12-31', initialProgress });
}

describe('ephemeral QHSE policy preview', () => {
  it('exposes labelled demonstration objectives and reuses the existing chapter 02 publication', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const snapshot = await queries.fetchQhsePolicySnapshot(client);
    expect(snapshot.canEdit).toBe(true);
    expect(snapshot.processes).toHaveLength(3);
    expect(snapshot.objectives.map((objective) => objective.progress)).toEqual([26, 61, 100]);
    expect(snapshot.objectives.every((objective) => objective.title.includes('démonstration'))).toBe(true);
    expect(snapshot.processes.every((process) => process.description.includes('démonstration'))).toBe(true);
    expect(snapshot.updates).toHaveLength(6);
    const publications = await client.from('published_procedures').select('*');
    expect(publications.data?.find((row) => row.id === snapshot.settings?.publicationId)).toMatchObject({ ism_chapter: '02', status: 'published' });
    const policyDocument = await client.storage.from('procedure-documents').createSignedUrl('published/8102/pol-01-b.pdf', 300);
    expect(policyDocument.data?.signedUrl).toBe('/demo/politique-qhse-demo.pdf');
    const otherDocument = await client.storage.from('procedure-documents').createSignedUrl('published/8101/gen-01-a.pdf', 300);
    expect(otherDocument.data?.signedUrl).toBe('/templates/attestation-embarquement.pdf');
    snapshot.processes[0].name = 'Mutation du résultat de lecture';
    expect((await queries.fetchQhsePolicySnapshot(client)).processes[0].name).toBe('Qualité');
    expect(fetch).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('creates and edits processes while refusing stale revisions without changing the saved record', async () => {
    const id = await createProcess();
    await queries.saveQhsePolicyProcess(client, { id, name: 'Processus actualisé démonstration', position: 20, expectedRevision: 1 });
    const before = await queries.fetchQhsePolicySnapshot(client);
    expect(before.processes.find((process) => process.id === id)).toMatchObject({ name: 'Processus actualisé démonstration', position: 20, revision: 2 });
    await expect(queries.saveQhsePolicyProcess(client, { id, name: 'Ancienne saisie', expectedRevision: 1 })).rejects.toThrow('modifié entre-temps');
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(before);
  });

  it('keeps progress updates in immutable history and edits objective metadata without rewriting progress', async () => {
    const processId = await createProcess();
    const objectiveId = await createObjective(processId);
    await queries.saveQhsePolicyObjective(client, { id: objectiveId, processId, title: 'Objectif actualisé démonstration', ownerKind: 'office', ownerLabel: 'Direction Démonstration', expectedRevision: 1 });
    const updateId = await queries.addQhsePolicyObjectiveUpdate(client, { objectiveId, progress: 75.25, occurredOn: '2026-10-02', note: 'Nouvel avancement de démonstration', expectedRevision: 2 });
    const snapshot = await queries.fetchQhsePolicySnapshot(client);
    expect(snapshot.objectives.find((objective) => objective.id === objectiveId)).toMatchObject({ title: 'Objectif actualisé démonstration', progress: 75.25, revision: 3 });
    expect(snapshot.updates.filter((update) => update.objectiveId === objectiveId)).toEqual([
      expect.objectContaining({ kind: 'initial', progress: 12.5, note: 'État initial' }),
      expect.objectContaining({ id: updateId, kind: 'progress', progress: 75.25, occurredOn: '2026-10-02', actorName: 'Administrateur Démonstration' }),
    ]);
    await expect(queries.addQhsePolicyObjectiveUpdate(client, { objectiveId, progress: 99, occurredOn: '2026-10-02', note: 'Révision périmée', expectedRevision: 2 })).rejects.toThrow('modifié entre-temps');
    const directEdit = await client.rpc('qhse_policy_save_objective', { p_id: objectiveId, p_process_id: processId, p_title: 'Réécriture interdite', p_initial_progress: 100, p_expected_revision: 3 });
    expect(directEdit.error?.code).toBe('22023');
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(snapshot);
  });

  it('archives processes without deleting objectives or history and blocks progress until the process is restored', async () => {
    const processId = await createProcess();
    const objectiveId = await createObjective(processId);
    const before = await queries.fetchQhsePolicySnapshot(client);
    await queries.setQhsePolicyProcessArchived(client, processId, true, 1);
    await expect(queries.saveQhsePolicyProcess(client, { id: processId, name: 'Archive modifiée', expectedRevision: 2 })).rejects.toThrow('actifs');
    await expect(queries.addQhsePolicyObjectiveUpdate(client, { objectiveId, progress: 50, occurredOn: '2026-10-02', note: 'Suivi refusé', expectedRevision: 1 })).rejects.toThrow('actifs');
    await expect(createObjective(processId)).rejects.toThrow('actifs');
    const archived = await queries.fetchQhsePolicySnapshot(client);
    expect(archived.objectives).toEqual(before.objectives);
    expect(archived.updates).toEqual(before.updates);
    expect(archived.processes.find((process) => process.id === processId)).toMatchObject({ archived: true, revision: 2 });
    await queries.setQhsePolicyProcessArchived(client, processId, false, 2);
    await queries.addQhsePolicyObjectiveUpdate(client, { objectiveId, progress: 50, occurredOn: '2026-10-02', note: 'Suivi après restauration', expectedRevision: 1 });
    expect((await queries.fetchQhsePolicySnapshot(client)).objectives.find((objective) => objective.id === objectiveId)?.progress).toBe(50);
  });

  it('allows a name to be reused after archiving but rejects conflicting restoration atomically', async () => {
    const id = await createProcess('Processus réutilisable');
    await expect(createProcess('  PROCESSUS RÉUTILISABLE  ')).rejects.toThrow('portant ce nom');
    await queries.setQhsePolicyProcessArchived(client, id, true, 1);
    await createProcess('Processus réutilisable');
    const before = await queries.fetchQhsePolicySnapshot(client);
    await expect(queries.setQhsePolicyProcessArchived(client, id, false, 2)).rejects.toThrow('portant ce nom');
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(before);
  });

  it('archives and restores objectives while retaining every history entry', async () => {
    const objectiveId = await createObjective(await createProcess());
    const before = await queries.fetchQhsePolicySnapshot(client);
    await queries.setQhsePolicyObjectiveArchived(client, objectiveId, true, 1);
    await expect(queries.addQhsePolicyObjectiveUpdate(client, { objectiveId, progress: 100, occurredOn: '2026-10-02', note: 'Objectif archivé', expectedRevision: 2 })).rejects.toThrow('actifs');
    await queries.setQhsePolicyObjectiveArchived(client, objectiveId, false, 2);
    const after = await queries.fetchQhsePolicySnapshot(client);
    expect(after.updates).toEqual(before.updates);
    expect(after.objectives.find((objective) => objective.id === objectiveId)).toMatchObject({ archived: false, progress: 12.5, revision: 3 });
  });

  it.each([-1, 100.01, 2.555, NaN])('rejects invalid progress %s without appending history or changing revisions', async (progress) => {
    const objectiveId = await createObjective(await createProcess());
    const before = await queries.fetchQhsePolicySnapshot(client);
    const result = await client.rpc('qhse_policy_add_objective_update', { p_objective_id: objectiveId, p_progress: progress, p_occurred_on: '2026-10-02', p_note: 'Saisie invalide', p_expected_revision: 1 });
    expect(result.error?.code).toBe('22023');
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(before);
  });

  it('rejects future progress dates and free URLs, and accepts all safe published PDFs', async () => {
    const objectiveId = await createObjective(await createProcess());
    const before = await queries.fetchQhsePolicySnapshot(client);
    const future = await client.rpc('qhse_policy_add_objective_update', { p_objective_id: objectiveId, p_progress: 50, p_occurred_on: '2026-10-03', p_note: 'Suivi futur', p_expected_revision: 1 });
    expect(future.error?.code).toBe('22023');
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(before);
    await expect(queries.saveQhsePolicySettings(client, { publicationId: null, documentUrl: 'https://drive.google.com/file/d/demoPolicyPDF123/view', expectedRevision: 1 })).rejects.toThrow('PDF publié');
    await queries.saveQhsePolicySettings(client, { publicationId: 8201, expectedRevision: 1 });
    expect((await queries.fetchQhsePolicySnapshot(client)).settings).toMatchObject({ publicationId: 8201, documentUrl: '', revision: 2 });
    await expect(queries.saveQhsePolicySettings(client, { publicationId: 8202, expectedRevision: 1 })).rejects.toThrow('modifié entre-temps');
  });

  it('discards all demo edits when the preview module is recreated without writing browser storage', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    await createObjective(await createProcess());
    expect((await queries.fetchQhsePolicySnapshot(client)).objectives).toHaveLength(4);
    vi.resetModules();
    const freshClient = (await import('./previewSupabaseClient')).previewSupabaseClient;
    const freshQueries = await import('../qhsePolicy/qhsePolicyQueries');
    expect((await freshQueries.fetchQhsePolicySnapshot(freshClient)).objectives).toHaveLength(3);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('selects eligible personnel and vessel owners and preserves legacy responsibility on metadata edits', async () => {
    const owners = await queries.fetchQhsePolicyOwnerOptions(client);
    expect(owners.people.some((person) => person.label === 'Camille DURAND')).toBe(true);
    const processId = await createProcess();
    const personId = owners.people[0].id;
    const id = await queries.saveQhsePolicyObjective(client, { processId, title: 'Personnel responsable', ownerKind: 'person', ownerPersonId: personId });
    expect((await queries.fetchQhsePolicySnapshot(client)).objectives.find((objective) => objective.id === id)?.ownerLabel).toBe(owners.people[0].label);
    await queries.saveQhsePolicyObjective(client, { id, processId, title: 'Affectation navire', ownerKind: 'vessel', ownerVesselId: owners.vessels[0].id, expectedRevision: 1 });
    const before = (await queries.fetchQhsePolicySnapshot(client)).objectives.find((objective) => objective.id === id)!;
    expect(before.ownerLabel).toBe(`Équipages ${owners.vessels[0].label}`);
    await queries.saveQhsePolicyObjective(client, { id, processId, title: 'Métadonnées seules', expectedRevision: 2 });
    expect((await queries.fetchQhsePolicySnapshot(client)).objectives.find((objective) => objective.id === id)).toMatchObject({ ownerKind: before.ownerKind, ownerVesselId: before.ownerVesselId, ownerLabel: before.ownerLabel });
  });
  it('commits uploaded original bytes with history, refuses replacement/deletion and cleans a stale follow-up', async () => {
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:preview-proof'); static revokeObjectURL = vi.fn(); });
    const attachments = await import('../qhsePolicy/qhsePolicyAttachments');
    const id = await createObjective(await createProcess());
    const file = new File(['%PDF proof'], 'preuve.pdf', { type: 'application/pdf' });
    const updateId = await attachments.saveQhsePolicyObjectiveUpdateWithAttachments(client, { objectiveId: id, progress: 50, occurredOn: '2026-10-02', note: 'Preuve jointe', expectedRevision: 1 }, [file]);
    const snapshot = await queries.fetchQhsePolicySnapshot(client);
    const attachment = snapshot.attachments[0];
    expect(attachment).toMatchObject({ updateId, objectiveId: id, fileName: 'preuve.pdf', sizeBytes: file.size });
    expect(await attachments.readQhsePolicyAttachment(client, attachment)).toBe(file);
    expect(await attachments.getQhsePolicyAttachmentUrl(client, attachment)).toBe('blob:preview-proof');
    expect((await client.storage.from(attachment.storageBucket).remove([attachment.storagePath])).error).toBeTruthy();
    expect((await client.storage.from(attachment.storageBucket).upload(attachment.storagePath, file, { contentType: file.type, upsert: true })).error).toBeTruthy();
    const remove = vi.spyOn(client.storage, 'from');
    await expect(attachments.saveQhsePolicyObjectiveUpdateWithAttachments(client, { objectiveId: id, progress: 60, occurredOn: '2026-10-02', note: 'Concurrence', expectedRevision: 1 }, [file])).rejects.toThrow('modifié entre-temps');
    expect(remove).toHaveBeenCalled();
    expect(await queries.fetchQhsePolicySnapshot(client)).toEqual(snapshot);
    vi.unstubAllGlobals();
  });
});
