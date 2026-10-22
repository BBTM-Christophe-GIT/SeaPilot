import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { isSeaOperationPayload, type SeaOperationPayload } from './seaOperationModel';

export interface SeaOperationRecord {
  id: string;
  companyId: number;
  version: number;
  status: 'draft' | 'signed';
  draft: SeaOperationPayload;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
  signedBy: string | null;
  signedByName: string | null;
  signedAt: string | null;
  captainName: string | null;
  /** Permissions come from the authenticated server account, including assignments. */
  canEdit: boolean;
  canSign: boolean;
  signatureSnapshot?: SeaOperationSignatureSnapshot | null;
  signatureUrl?: string;
}

export interface SeaOperationSignatureSnapshot {
  signature_id: number;
  signer_person_id: number;
  signer_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  sha256: string;
  version_number: number;
}

export interface SeaOperationPlanningCaptain {
  personId: string;
  name: string;
  functionLabel: string;
  hasSignature: boolean;
  canSign: boolean;
}
export interface SeaOperationPlanningChoice {
  operationId: string;
  projectId: string;
  project: string;
  client: string;
  clientContact: string;
  description: string;
  vessel: Pick<SeaOperationPayload['vessel'], 'id' | 'name' | 'registrationImo' | 'departurePort' | 'arrivalPort' | 'etd' | 'eta'> & { lengthOverall?: string | null };
  captains: SeaOperationPlanningCaptain[];
  canSign: boolean;
}
export interface SeaOperationPlanningContext { date: string; choices: SeaOperationPlanningChoice[] }

export interface SeaOperationVessel {
  id: number;
  name: string;
  registrationImo: string;
  lengthOverall: string | null;
  draftMeters?: number | null;
  canSign: boolean;
}

export interface SeaOperationData {
  companyId: number;
  actorId: string;
  actorName: string;
  records: SeaOperationRecord[];
  vessels: SeaOperationVessel[];
}

type Row = Record<string, unknown>;
const nullableText = (value: unknown): string | null => value == null ? null : String(value);

function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La réponse du module Opération en Mer est invalide.');
  }
  return value as Row;
}

export function mapSeaOperationRecord(value: unknown): SeaOperationRecord {
  const row = object(value);
  const draft = row.draft;
  if (!row.id || !Number.isInteger(row.version) || Number(row.version) < 1
    || (row.status !== 'draft' && row.status !== 'signed') || !isSeaOperationPayload(draft)) {
    throw new Error('La réponse du module Opération en Mer est invalide.');
  }
  return {
    id: String(row.id), companyId: Number(row.company_id), version: Number(row.version), status: row.status,
    draft,
    createdBy: String(row.created_by), createdByName: String(row.created_by_name), createdAt: String(row.created_at),
    updatedBy: String(row.updated_by), updatedByName: String(row.updated_by_name), updatedAt: String(row.updated_at),
    signedBy: nullableText(row.signed_by), signedByName: nullableText(row.signed_by_name), signedAt: nullableText(row.signed_at),
    captainName: nullableText(row.captain_name), canEdit: row.can_edit === true, canSign: row.can_sign === true,
    signatureSnapshot: mapSignature(row.signature_snapshot),
  };
}

function mapSignature(value: unknown): SeaOperationSignatureSnapshot | null {
  if (value == null) return null;
  const row = object(value);
  if (!Object.keys(row).length) return null;
  if (row.storage_bucket !== 'working-time-signatures' || typeof row.storage_path !== 'string' || !row.storage_path
    || !['image/png', 'image/jpeg', 'image/webp'].includes(String(row.mime_type)) || typeof row.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('La signature RH est invalide.');
  return row as unknown as SeaOperationSignatureSnapshot;
}

async function hydrateSignature(client: SupabaseClient, record: SeaOperationRecord): Promise<SeaOperationRecord> {
  const snapshot = record.signatureSnapshot;
  if (snapshot) {
    try {
      const { data, error } = await client.storage.from(snapshot.storage_bucket).createSignedUrl(snapshot.storage_path, 600);
      if (!error && data?.signedUrl) record.signatureUrl = data.signedUrl;
    } catch { /* A signature image outage must not hide a valid historical record. */ }
  }
  return record;
}

async function rpc(client: SupabaseClient, name: string, args?: Row): Promise<Row> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return object(data);
}

export async function fetchSeaOperationData(client: SupabaseClient): Promise<SeaOperationData> {
  const data = await rpc(client, 'sea_operations_overview');
  if (!Array.isArray(data.records) || !Array.isArray(data.vessels)) {
    throw new Error('La réponse du module Opération en Mer est invalide.');
  }
  const vessels = data.vessels.map((value): SeaOperationVessel => {
    const row = object(value);
    return { id: Number(row.id), name: String(row.name), registrationImo: String(row.registration_imo || ''),
      lengthOverall: nullableText(row.length_overall), draftMeters: row.draft_m == null ? null : Number(row.draft_m),
      canSign: row.can_sign === true };
  }).sort(compareFleetAssets);
  return { companyId: Number(data.company_id), actorId: String(data.actor_id), actorName: String(data.actor_name),
    records: data.records.map(mapSeaOperationRecord), vessels };
}

export async function fetchSeaOperationDetail(client: SupabaseClient, id: string): Promise<SeaOperationRecord> {
  return hydrateSignature(client, mapSeaOperationRecord(await rpc(client, 'sea_operation_detail', { p_id: id })));
}

export async function saveSeaOperation(
  client: SupabaseClient, draft: SeaOperationPayload, existing?: Pick<SeaOperationRecord, 'id' | 'version'> | null,
): Promise<SeaOperationRecord> {
  return hydrateSignature(client, mapSeaOperationRecord(await rpc(client, 'sea_operation_save', {
    p_id: existing?.id ?? null, p_version: existing?.version ?? null, p_draft: draft,
  })));
}

/** Signs an already persisted revision; identity, permission and timestamps are server-derived. */
export async function signSeaOperation(
  client: SupabaseClient, record: Pick<SeaOperationRecord, 'id' | 'version'>, captainName: string, acknowledged: boolean,
): Promise<SeaOperationRecord> {
  return hydrateSignature(client, mapSeaOperationRecord(await rpc(client, 'sea_operation_sign', {
    p_id: record.id, p_version: record.version, p_captain_name: captainName.trim(), p_acknowledged: acknowledged,
  })));
}

export async function fetchSeaOperationPlanning(client: SupabaseClient, date: string): Promise<SeaOperationPlanningContext> {
  const context = await rpc(client, 'sea_operation_planning_context', { p_date: date });
  if (typeof context.date !== 'string' || !Array.isArray(context.choices)) throw new Error('Le contexte Planning est invalide.');
  const choices = context.choices.map((value): SeaOperationPlanningChoice => {
    const row = object(value);
    const vessel = object(row.vessel);
    if (!Array.isArray(row.captains) || !['operationId', 'projectId', 'project', 'client', 'clientContact', 'description'].every((key) => typeof row[key] === 'string')
      || !['id', 'name', 'registrationImo', 'departurePort', 'arrivalPort', 'etd', 'eta'].every((key) => typeof vessel[key] === 'string')) throw new Error('Le contexte Planning est invalide.');
    return { operationId: String(row.operationId), projectId: String(row.projectId), project: String(row.project), client: String(row.client),
      clientContact: String(row.clientContact), description: String(row.description), vessel: { ...vessel, lengthOverall: nullableText(vessel.lengthOverall) } as SeaOperationPlanningChoice['vessel'],
      captains: row.captains.map((value) => { const person = object(value); return { personId: String(person.personId), name: String(person.name),
        functionLabel: String(person.functionLabel), hasSignature: person.hasSignature === true, canSign: person.canSign === true }; }), canSign: row.canSign === true };
  });
  const byOccurrence = new Map<string, SeaOperationPlanningChoice[]>();
  for (const choice of choices) {
    const occurrence = choice.operationId.split(':')[0];
    const group = byOccurrence.get(occurrence) ?? [];
    group.push(choice);
    byOccurrence.set(occurrence, group);
  }
  return { date: context.date, choices: [...byOccurrence.values()].flatMap((group) => group.sort((a, b) => compareFleetAssets(a.vessel, b.vessel))) };
}

export async function fetchSeaOperationCaptainSignature(client: SupabaseClient, date: string, operationId: string, personId: string): Promise<{ snapshot: SeaOperationSignatureSnapshot; url: string } | null> {
  const { data, error } = await client.rpc('sea_operation_captain_signature', { p_date: date, p_operation_id: operationId, p_captain_person_id: personId });
  if (error) throw error;
  const snapshot = mapSignature(data);
  if (!snapshot) return null;
  const result = await client.storage.from(snapshot.storage_bucket).createSignedUrl(snapshot.storage_path, 600);
  if (result.error) throw result.error;
  if (!result.data?.signedUrl) throw new Error('La signature RH est indisponible.');
  return { snapshot, url: result.data.signedUrl };
}

/** Downloads the immutable HR snapshot, never the captain's current replacement. */
export async function loadSeaOperationSignature(client: SupabaseClient, record: SeaOperationRecord): Promise<string | null> {
  const snapshot = record.signatureSnapshot;
  if (!snapshot) return null;
  const { data, error } = await client.storage.from(snapshot.storage_bucket).download(snapshot.storage_path);
  if (error) throw error;
  if (!data) throw new Error('La signature RH enregistrée est indisponible.');
  const bytes = new Uint8Array(await data.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== snapshot.sha256) throw new Error('Le fichier de signature RH ne correspond pas à son empreinte enregistrée.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${snapshot.mime_type};base64,${btoa(binary)}`;
}
