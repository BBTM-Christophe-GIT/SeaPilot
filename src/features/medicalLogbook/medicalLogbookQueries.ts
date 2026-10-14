import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { normalizedMedicalDraft, validateMedicalDraft, type MedicalDraft, type MedicalEntry, type MedicalHistory, type MedicalVessel, type MedicalSigner, type MedicalSignatureSnapshot } from './medicalLogbookModel';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse du registre médical invalide. Rechargez le registre.');
  return value as Record<string, unknown>;
}
function id(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }

export function parseMedicalSignature(value: unknown): MedicalSignatureSnapshot {
  const row = object(value);
  const path = text(row.storage_path);
  if (!id(row.signature_id) || !id(row.version_number) || !id(row.signer_person_id)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text(row.signer_user_id))
    || !text(row.signer_name).trim() || row.storage_bucket !== 'working-time-signatures' || row.mime_type !== 'image/png'
    || !new RegExp(`^[1-9][0-9]*/${row.signer_person_id}/[A-Za-z0-9_-]+[.]png$`).test(path)
    || !id(row.file_size_bytes) || Number(row.file_size_bytes) > 1_048_576 || !/^[0-9a-f]{64}$/.test(text(row.sha256)) || !text(row.valid_from)) {
    throw new Error('La référence de signature personnelle est invalide.');
  }
  return { signature_id: row.signature_id, version_number: row.version_number, signer_person_id: row.signer_person_id,
    signer_user_id: text(row.signer_user_id), signer_name: text(row.signer_name), storage_bucket: 'working-time-signatures',
    storage_path: path, mime_type: 'image/png', file_size_bytes: row.file_size_bytes, sha256: text(row.sha256), valid_from: text(row.valid_from) };
}

export function parseMedicalEntry(value: unknown): MedicalEntry {
  const row = object(value);
  const rawTime = text(row.occurred_time);
  const draft: MedicalDraft = { occurred_on: text(row.occurred_on), occurred_time: /^\d{2}:\d{2}:00$/.test(rawTime) ? rawTime.slice(0, 5) : rawTime,
    patient_name: text(row.patient_name), injury_illness: text(row.injury_illness), treatment_medicines: text(row.treatment_medicines),
    first_aider_name: text(row.first_aider_name) };
  if (!id(row.id) || !id(row.company_id) || !id(row.vessel_id) || !id(row.revision)
    || typeof row.archived !== 'boolean' || !text(row.created_at) || !text(row.updated_at) || validateMedicalDraft(draft)) {
    throw new Error('Réponse du registre médical invalide. Rechargez le registre.');
  }
  const signature = parseMedicalSignature(row.signature_snapshot);
  if (row.signature_version_id !== signature.signature_id || row.signature_name !== signature.signer_name
    || draft.first_aider_name !== signature.signer_name) throw new Error('La référence de signature personnelle est invalide.');
  return { ...draft, signature_name: signature.signer_name, signature_version_id: signature.signature_id, signature_snapshot: signature,
    id: row.id, company_id: row.company_id, vessel_id: row.vessel_id, revision: row.revision,
    archived: row.archived, created_at: text(row.created_at), updated_at: text(row.updated_at) };
}

async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === '40001') throw new Error('Cette entrée a été modifiée depuis un autre écran. Actualisez le registre avant de réessayer.');
    if (error.code === '42501') throw new Error('Le registre médical est réservé aux administrateurs et aux capitaines de leurs navires autorisés.');
    if (error.code === '23514' && error.message === 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED') throw new Error('Ajoutez votre signature dans votre fiche RH, section Signature, avant d’enregistrer le registre médical.');
    if (error.code === '22023' || error.code === '23514' || error.code === '22007') throw new Error('Les informations saisies ne sont pas valides. Vérifiez le formulaire.');
    throw new Error('Impossible de charger ou d’enregistrer le registre médical. Réessayez.');
  }
  return data;
}

export async function fetchMedicalSigner(client: SupabaseClient): Promise<MedicalSigner> {
  const row = object(await rpc(client, 'get_medical_logbook_signer'));
  if ((row.person_id !== null && !id(row.person_id)) || typeof row.signer_name !== 'string') throw new Error('Impossible de lire votre profil de signature.');
  const signature = row.signature === null ? null : parseMedicalSignature(row.signature);
  if (signature && (signature.signer_person_id !== row.person_id || signature.signer_name !== row.signer_name)) throw new Error('La référence de signature personnelle est invalide.');
  return { person_id: row.person_id, signer_name: row.signer_name, signature };
}

export async function createMedicalSignatureUrl(client: SupabaseClient, signature: MedicalSignatureSnapshot): Promise<string> {
  const safe = parseMedicalSignature(signature);
  const { data, error } = await client.storage.from(safe.storage_bucket).createSignedUrl(safe.storage_path, 600);
  if (error || !data?.signedUrl) throw new Error('Impossible d’afficher la signature personnelle. Réessayez.');
  return data.signedUrl;
}

export async function fetchMedicalSignatureImages(client: SupabaseClient, entries: MedicalEntry[]): Promise<ReadonlyMap<number, Uint8Array>> {
  const versions = new Map<number, MedicalSignatureSnapshot>();
  entries.forEach((entry) => versions.set(entry.signature_version_id, parseMedicalSignature(entry.signature_snapshot)));
  const images = new Map<number, Uint8Array>();
  // A bounded queue avoids opening a separate request for every medical row.
  const pending = [...versions.values()];
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (pending.length) {
      const signature = pending.shift()!;
      const { data, error } = await client.storage.from(signature.storage_bucket).download(signature.storage_path);
      if (error || !data || data.size !== signature.file_size_bytes || data.size > 1_048_576) throw new Error('Impossible de récupérer une signature du registre. Le PDF n’a pas été créé.');
      const bytes = new Uint8Array(await data.arrayBuffer());
      const header = [137, 80, 78, 71, 13, 10, 26, 10];
      if (!header.every((value, index) => bytes[index] === value)) throw new Error('Le fichier de signature n’est pas un PNG valide.');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
      if (hash !== signature.sha256) throw new Error('Le fichier de signature ne correspond plus à la version enregistrée.');
      images.set(signature.signature_id, bytes);
    }
  }));
  return new Map(entries.map((entry) => [entry.id, images.get(entry.signature_version_id)!]));
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Réponse du registre médical invalide. Rechargez le registre.');
  return value;
}

export async function fetchMedicalVessels(client: SupabaseClient): Promise<MedicalVessel[]> {
  return array(await rpc(client, 'get_medical_logbook_vessels')).map((value) => {
    const row = object(value);
    if (!id(row.id) || !id(row.company_id) || !text(row.name) || typeof row.can_write !== 'boolean') throw new Error('Liste des navires invalide.');
    return { id: row.id, company_id: row.company_id, name: text(row.name), acronym: text(row.acronym),
      registration_number: text(row.registration_number), call_sign: text(row.call_sign), registration_port: text(row.registration_port),
      length_overall: row.length_overall == null ? null : String(row.length_overall),
      illustration_thumbnail_url: typeof row.illustration_thumbnail_url === 'string' ? row.illustration_thumbnail_url : null,
      can_write: row.can_write };
  }).sort(compareFleetAssets);
}

export async function fetchMedicalEntries(client: SupabaseClient, vesselId: number): Promise<MedicalEntry[]> {
  const entries = array(await rpc(client, 'list_medical_logbook_entries', { p_vessel_id: vesselId })).map(parseMedicalEntry);
  if (entries.some((entry) => entry.vessel_id !== vesselId)) throw new Error('Réponse du registre médical invalide. Rechargez le registre.');
  return entries.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.occurred_time.localeCompare(a.occurred_time) || b.id - a.id);
}

export async function saveMedicalEntry(client: SupabaseClient, vesselId: number, draft: MedicalDraft, entry?: MedicalEntry): Promise<MedicalEntry> {
  const error = validateMedicalDraft(draft);
  if (error) throw new Error(error);
  if (entry && (entry.vessel_id !== vesselId || entry.archived)) throw new Error('Cette entrée ne peut pas être modifiée dans ce registre.');
  return parseMedicalEntry(await rpc(client, 'save_medical_logbook_entry', { p_vessel_id: vesselId,
    p_entry_id: entry?.id ?? null, p_expected_revision: entry?.revision ?? null, p_entry: normalizedMedicalDraft(draft) }));
}

export async function setMedicalEntryArchived(client: SupabaseClient, entry: MedicalEntry, archived: boolean): Promise<MedicalEntry> {
  return parseMedicalEntry(await rpc(client, 'set_medical_logbook_entry_archived', {
    p_entry_id: entry.id, p_expected_revision: entry.revision, p_archived: archived,
  }));
}

export async function fetchMedicalHistory(client: SupabaseClient, entryId: number): Promise<MedicalHistory[]> {
  return array(await rpc(client, 'get_medical_logbook_history', { p_entry_id: entryId })).map((value) => {
    const row = object(value);
    if (!id(row.id) || !id(row.revision) || !['created', 'updated', 'archived', 'restored'].includes(text(row.action))
      || !text(row.changed_at) || typeof row.actor_name !== 'string') throw new Error('Historique du registre médical invalide.');
    const entry = parseMedicalEntry(row.entry);
    if (entry.id !== entryId || entry.revision !== row.revision) throw new Error('Historique du registre médical invalide.');
    return { id: row.id, revision: row.revision, action: row.action as MedicalHistory['action'],
      changed_at: text(row.changed_at), actor_name: row.actor_name, entry };
  });
}
