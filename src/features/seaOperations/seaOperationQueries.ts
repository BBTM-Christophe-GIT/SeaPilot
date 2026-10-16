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
}

export interface SeaOperationVessel {
  id: number;
  name: string;
  registrationImo: string;
  lengthOverall: string | null;
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
  };
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
      lengthOverall: nullableText(row.length_overall), canSign: row.can_sign === true };
  }).sort(compareFleetAssets);
  return { companyId: Number(data.company_id), actorId: String(data.actor_id), actorName: String(data.actor_name),
    records: data.records.map(mapSeaOperationRecord), vessels };
}

export async function fetchSeaOperationDetail(client: SupabaseClient, id: string): Promise<SeaOperationRecord> {
  return mapSeaOperationRecord(await rpc(client, 'sea_operation_detail', { p_id: id }));
}

export async function saveSeaOperation(
  client: SupabaseClient, draft: SeaOperationPayload, existing?: Pick<SeaOperationRecord, 'id' | 'version'> | null,
): Promise<SeaOperationRecord> {
  return mapSeaOperationRecord(await rpc(client, 'sea_operation_save', {
    p_id: existing?.id ?? null, p_version: existing?.version ?? null, p_draft: draft,
  }));
}

/** Signs an already persisted revision; identity, permission and timestamps are server-derived. */
export async function signSeaOperation(
  client: SupabaseClient, record: Pick<SeaOperationRecord, 'id' | 'version'>, captainName: string, acknowledged: boolean,
): Promise<SeaOperationRecord> {
  return mapSeaOperationRecord(await rpc(client, 'sea_operation_sign', {
    p_id: record.id, p_version: record.version, p_captain_name: captainName.trim(), p_acknowledged: acknowledged,
  }));
}
