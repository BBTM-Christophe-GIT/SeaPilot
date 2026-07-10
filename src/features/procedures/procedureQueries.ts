import type { SupabaseClient } from '@supabase/supabase-js';

const PROCEDURE_SELECT = [
  'id',
  'procedure_code',
  'title',
  'status',
  'revision_label',
  'published_on',
  'source_label',
  'file_url',
  'notes',
].join(', ');

const PUBLISHED_PROCEDURE_SELECT = [
  'id',
  'procedure_id',
  'procedure_sharepoint_item_id',
  'procedure_code',
  'title',
  'status',
  'revision_label',
  'published_on',
  'source_label',
  'file_url',
  'notes',
].join(', ');

export type ProcedureStatus = 'draft' | 'review' | 'approved' | 'archived' | 'unknown';

interface ProcedureRow {
  id: number;
  procedure_code: string | null;
  title: string;
  status: string | null;
  revision_label: string | null;
  published_on: string | null;
  source_label: string | null;
  file_url: string | null;
  notes: string | null;
}

interface PublishedProcedureRow extends ProcedureRow {
  procedure_id: number | null;
  procedure_sharepoint_item_id: string | null;
}

export interface ProcedureRecord {
  id: number;
  procedureCode: string;
  title: string;
  status: ProcedureStatus;
  revisionLabel: string;
  publishedOn: string;
  sourceLabel: string;
  fileUrl: string;
  notes: string;
}

export interface PublishedProcedureRecord extends ProcedureRecord {
  procedureId: number | null;
  procedureSharePointItemId: string;
}

export interface ProceduresData {
  procedures: ProcedureRecord[];
  publications: PublishedProcedureRecord[];
}

export interface ProcedureMetrics {
  totalProcedures: number;
  approvedProcedures: number;
  reviewProcedures: number;
  draftProcedures: number;
  publishedProcedures: number;
}

export interface CreateProcedureInput {
  procedureCode: string;
  title: string;
  status: ProcedureStatus;
  revisionLabel: string;
  publishedOn: string;
  fileUrl: string;
  notes: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStatus(status: string | null): ProcedureStatus {
  if (
    status === 'draft' ||
    status === 'review' ||
    status === 'approved' ||
    status === 'archived' ||
    status === 'unknown'
  ) {
    return status;
  }

  return 'unknown';
}

export function getProcedureStatusLabel(status: ProcedureStatus): string {
  const labels: Record<ProcedureStatus, string> = {
    approved: 'Approuvee',
    archived: 'Archivee',
    draft: 'Brouillon',
    review: 'En revue',
    unknown: 'Non renseigne',
  };

  return labels[status];
}

export function mapProcedureRows(rows: ProcedureRow[]): ProcedureRecord[] {
  return rows.map((row) => ({
    id: row.id,
    procedureCode: nullableText(row.procedure_code),
    title: row.title,
    status: normalizeStatus(row.status),
    revisionLabel: nullableText(row.revision_label),
    publishedOn: nullableText(row.published_on),
    sourceLabel: nullableText(row.source_label),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
  }));
}

export function mapPublishedProcedureRows(rows: PublishedProcedureRow[]): PublishedProcedureRecord[] {
  return rows.map((row) => ({
    ...mapProcedureRows([row])[0],
    procedureId: row.procedure_id,
    procedureSharePointItemId: nullableText(row.procedure_sharepoint_item_id),
  }));
}

export function buildProcedureMetrics(data: ProceduresData): ProcedureMetrics {
  return {
    totalProcedures: data.procedures.length,
    approvedProcedures: data.procedures.filter((procedure) => procedure.status === 'approved').length,
    reviewProcedures: data.procedures.filter((procedure) => procedure.status === 'review').length,
    draftProcedures: data.procedures.filter((procedure) => procedure.status === 'draft').length,
    publishedProcedures: data.publications.length,
  };
}

export async function fetchProcedures(client: SupabaseClient): Promise<ProcedureRecord[]> {
  const { data, error } = await client
    .from('procedures')
    .select(PROCEDURE_SELECT)
    .order('published_on', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapProcedureRows((data || []) as unknown as ProcedureRow[]);
}

export async function fetchPublishedProcedures(client: SupabaseClient): Promise<PublishedProcedureRecord[]> {
  const { data, error } = await client
    .from('published_procedures')
    .select(PUBLISHED_PROCEDURE_SELECT)
    .order('published_on', { ascending: false, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPublishedProcedureRows((data || []) as unknown as PublishedProcedureRow[]);
}

export async function fetchProceduresData(client: SupabaseClient): Promise<ProceduresData> {
  const [procedures, publications] = await Promise.all([fetchProcedures(client), fetchPublishedProcedures(client)]);

  return { procedures, publications };
}

export async function createProcedure(
  client: SupabaseClient,
  input: CreateProcedureInput,
): Promise<ProcedureRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error('Le titre de la procedure est obligatoire.');
  }

  const payload = {
    procedure_code: optionalText(input.procedureCode),
    title,
    status: input.status,
    revision_label: optionalText(input.revisionLabel),
    published_on: optionalText(input.publishedOn),
    source_label: 'seapilot',
    file_url: optionalText(input.fileUrl),
    notes: optionalText(input.notes),
  };
  const { data, error } = await client.from('procedures').insert(payload).select(PROCEDURE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapProcedureRows([data as unknown as ProcedureRow])[0];
}
