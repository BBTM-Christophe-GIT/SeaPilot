import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import {
  isQhsePolicyId, validateQhsePolicyObjectiveDraft, validateQhsePolicyObjectiveUpdateDraft, validateQhsePolicyProcessDraft, validateQhsePolicyProgress, validateQhsePolicySettingsDraft, validateQhsePolicyProcessOrder, validateQhsePolicyProcessDeletion,
  type QhsePolicyObjectiveDraft, type QhsePolicyObjectiveUpdateDraft, type QhsePolicyProcessDraft, type QhsePolicySettingsDraft, type QhsePolicySnapshot, type QhsePolicyOwnerKind, type QhsePolicyOwnerOptions, type QhsePolicyProcess,
} from './qhsePolicyModel';
import { normalizeQhsePolicyAxisIconKey } from './qhsePolicyIcons';

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Les données de la politique QHSE sont incomplètes.'); return value as Record<string, unknown>; }
function rows(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error('Les données de la politique QHSE sont incomplètes.'); return value; }
function text(value: unknown): string { if (typeof value !== 'string') throw new Error('Les données de la politique QHSE sont incomplètes.'); return value; }
function id(value: unknown): string { if (!isQhsePolicyId(value)) throw new Error('Identifiant QHSE invalide.'); return value; }
function number(value: unknown): number { if (value == null || value === '' || !Number.isFinite(Number(value))) throw new Error('Les données de la politique QHSE sont incomplètes.'); return Number(value); }
function revision(value: unknown): number { const result = number(value); if (!Number.isSafeInteger(result) || result < 1) throw new Error('Révision QHSE invalide.'); return result; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Les données de la politique QHSE sont incomplètes.'); return value; }
function errorMessage(code: string | undefined, reading = false): string {
  if (code === '42501') return reading ? 'Votre profil ne peut pas consulter la politique QHSE.' : 'Seuls les profils Admin et Direction peuvent modifier la politique QHSE.';
  if (code === '40001') return 'Cet élément a été modifié entre-temps. Actualisez la page avant de réessayer.';
  if (code === '23505') return 'Un axe stratégique actif portant ce nom existe déjà.';
  if (code === '22023') return 'Vérifiez les champs, la liste complète des axes et que l’axe cible et l’objectif sont actifs.';
  return reading ? 'Impossible de charger la politique QHSE. Réessayez.' : 'La modification n’a pas été enregistrée. Réessayez.';
}
export async function fetchQhsePolicySnapshot(client: SupabaseClient): Promise<QhsePolicySnapshot> {
  const { data, error } = await client.rpc('qhse_policy_snapshot');
  if (error) throw new Error(errorMessage(error.code, true), { cause: error });
  const value = object(data);
  const settings = value.settings == null ? null : object(value.settings);
  return {
    canEdit: boolean(value.can_edit),
    settings: settings ? { publicationId: settings.publication_id == null ? null : number(settings.publication_id), documentUrl: text(settings.document_url), revision: revision(settings.revision), updatedAt: text(settings.updated_at) } : null,
    processes: rows(value.processes).map((item) => { const row = object(item); return { id: id(row.id), name: text(row.name), description: text(row.description), position: number(row.position), archived: boolean(row.archived), revision: revision(row.revision), updatedAt: text(row.updated_at), iconKey: row.icon_key === undefined ? undefined : normalizeQhsePolicyAxisIconKey(row.icon_key) }; }),
    objectives: rows(value.objectives).map((item) => { const row = object(item); if (row.owner_kind != null && !['person', 'vessel', 'office'].includes(String(row.owner_kind))) throw new Error('Responsable QHSE invalide.'); return { id: id(row.id), processId: id(row.process_id), title: text(row.title), description: text(row.description), ownerLabel: text(row.owner_label), ownerKind: (row.owner_kind ?? null) as QhsePolicyOwnerKind, ownerPersonId: row.owner_person_id == null ? null : number(row.owner_person_id), ownerVesselId: row.owner_vessel_id == null ? null : number(row.owner_vessel_id), dueOn: row.due_on == null ? null : text(row.due_on), progress: validateQhsePolicyProgress(number(row.progress)), archived: boolean(row.archived), revision: revision(row.revision), createdAt: text(row.created_at), updatedAt: text(row.updated_at) }; }),
    updates: rows(value.updates).map((item) => { const row = object(item); if (!['initial', 'progress'].includes(String(row.kind))) throw new Error('Historique QHSE invalide.'); return { id: id(row.id), objectiveId: id(row.objective_id), kind: row.kind as 'initial' | 'progress', progress: validateQhsePolicyProgress(number(row.progress)), occurredOn: text(row.occurred_on), note: text(row.note), actorName: text(row.actor_name), ownerLabel: row.owner_label == null ? '' : text(row.owner_label), createdAt: text(row.created_at) }; }),
    attachments: rows(value.attachments ?? []).map((item) => { const row = object(item); return { id: id(row.id), objectiveId: id(row.objective_id), updateId: id(row.update_id), fileName: text(row.file_name), mimeType: text(row.mime_type), sizeBytes: number(row.size_bytes), storageBucket: text(row.storage_bucket), storagePath: text(row.storage_path), createdAt: text(row.created_at) }; }),
  };
}
async function write(client: SupabaseClient, name: string, parameters: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(errorMessage(error.code), { cause: error });
  return data;
}
export async function saveQhsePolicyProcess(client: SupabaseClient, draft: QhsePolicyProcessDraft): Promise<string> {
  const value = validateQhsePolicyProcessDraft(draft);
  return id(await write(client, 'qhse_policy_save_process', { p_id: value.id, p_name: value.name, p_description: value.description, p_position: value.position, p_expected_revision: value.expectedRevision, p_icon_key: value.iconKey }));
}
export async function reorderQhsePolicyProcesses(client: SupabaseClient, processes: QhsePolicyProcess[]): Promise<void> {
  await write(client, 'qhse_policy_reorder_processes', { p_processes: validateQhsePolicyProcessOrder(processes) });
}
export async function deleteQhsePolicyProcess(client: SupabaseClient, process: QhsePolicyProcess, transferTo?: QhsePolicyProcess): Promise<void> {
  const value = validateQhsePolicyProcessDeletion(process, transferTo);
  await write(client, 'qhse_policy_delete_process', { p_id: value.id, p_expected_revision: value.expectedRevision, p_transfer_to: value.transferTo, p_transfer_expected_revision: value.transferExpectedRevision });
}
export async function saveQhsePolicyObjective(client: SupabaseClient, draft: QhsePolicyObjectiveDraft): Promise<string> {
  const value = validateQhsePolicyObjectiveDraft(draft);
  return id(await write(client, 'qhse_policy_save_objective', { p_id: value.id, p_process_id: value.processId, p_title: value.title, p_description: value.description, p_owner_label: value.ownerLabel, p_owner_kind: value.ownerKind, p_owner_person_id: value.ownerPersonId, p_owner_vessel_id: value.ownerVesselId, p_due_on: value.dueOn, p_initial_progress: value.initialProgress, p_expected_revision: value.expectedRevision }));
}
export async function fetchQhsePolicyOwnerOptions(client: SupabaseClient): Promise<QhsePolicyOwnerOptions> {
  const { data, error } = await client.rpc('qhse_policy_owner_options');
  if (error) throw new Error(errorMessage(error.code), { cause: error });
  const value = object(data);
  const options = (items: unknown) => rows(items).map((item) => { const row = object(item); const key = number(row.id); if (!Number.isSafeInteger(key) || key <= 0) throw new Error('Responsable QHSE invalide.'); return { id: key, label: text(row.label) }; });
  const vessels = rows(value.vessels).map((item) => { const row = object(item); return { ...options([item])[0], lengthOverall: row.length_overall == null ? null : text(row.length_overall) }; });
  vessels.sort((a, b) => compareFleetAssets({ name: a.label, lengthOverall: a.lengthOverall }, { name: b.label, lengthOverall: b.lengthOverall }));
  return { people: options(value.people), vessels };
}
export async function addQhsePolicyObjectiveUpdate(client: SupabaseClient, draft: QhsePolicyObjectiveUpdateDraft): Promise<string> {
  const value = validateQhsePolicyObjectiveUpdateDraft(draft);
  return id(await write(client, 'qhse_policy_add_objective_update', { p_objective_id: value.objectiveId, p_progress: value.progress, p_occurred_on: value.occurredOn, p_note: value.note, p_expected_revision: value.expectedRevision }));
}
async function archive(client: SupabaseClient, kind: 'process' | 'objective', targetId: string, archived: boolean, expectedRevision: number): Promise<void> {
  if (!isQhsePolicyId(targetId) || typeof archived !== 'boolean' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('Actualisez cet élément avant de le modifier.');
  await write(client, `qhse_policy_archive_${kind}`, { p_id: targetId, p_archived: archived, p_expected_revision: expectedRevision });
}
export async function setQhsePolicyProcessArchived(client: SupabaseClient, targetId: string, archived: boolean, expectedRevision: number): Promise<void> { await archive(client, 'process', targetId, archived, expectedRevision); }
export async function setQhsePolicyObjectiveArchived(client: SupabaseClient, targetId: string, archived: boolean, expectedRevision: number): Promise<void> { await archive(client, 'objective', targetId, archived, expectedRevision); }
export async function saveQhsePolicySettings(client: SupabaseClient, draft: QhsePolicySettingsDraft): Promise<void> {
  const value = validateQhsePolicySettingsDraft(draft);
  await write(client, 'qhse_policy_save_settings', { p_publication_id: value.publicationId, p_document_url: value.documentUrl, p_expected_revision: value.expectedRevision });
}
