import type { SupabaseClient } from '@supabase/supabase-js';

export const PROCEDURE_DOCUMENT_BUCKET = 'procedure-documents';

const PROCEDURE_FIELDS = [
  'id', 'procedure_code', 'title', 'status', 'revision_label', 'published_on', 'source_label', 'file_url', 'notes',
  'category_label', 'diffusion_on', 'description', 'regulatory_requirement', 'ism_chapter', 'vessel_name',
  'project_name', 'document_number', 'restrictions', 'annual_review', 'approval_status', 'theme', 'document_type',
  'bridge_watch', 'version_label',
].join(', ');

const PROCEDURE_SELECT = [
  PROCEDURE_FIELDS, 'source_storage_bucket', 'source_storage_path', 'source_file_name', 'source_mime_type',
  'source_size_bytes',
].join(', ');

const PUBLISHED_PROCEDURE_SELECT = [
  PROCEDURE_FIELDS, 'procedure_id', 'procedure_sharepoint_item_id', 'storage_bucket', 'storage_path', 'file_name',
  'mime_type', 'size_bytes', 'published_by',
].join(', ');

export type ProcedureStatus = 'draft' | 'review' | 'approved' | 'archived' | 'unknown';

interface ProcedureBaseRow {
  id: number;
  procedure_code: string | null;
  title: string;
  status: string | null;
  revision_label: string | null;
  published_on: string | null;
  source_label: string | null;
  file_url: string | null;
  notes: string | null;
  category_label: string | null;
  diffusion_on: string | null;
  description: string | null;
  regulatory_requirement: string | null;
  ism_chapter: string | null;
  vessel_name: string | null;
  project_name: string | null;
  document_number: string | null;
  restrictions: string | null;
  annual_review: boolean | null;
  approval_status: string | null;
  theme: string | null;
  document_type: string | null;
  bridge_watch: boolean | null;
  version_label: string | null;
}

interface ProcedureRow extends ProcedureBaseRow {
  source_storage_bucket: string | null;
  source_storage_path: string | null;
  source_file_name: string | null;
  source_mime_type: string | null;
  source_size_bytes: number | null;
}

interface PublishedProcedureRow extends ProcedureBaseRow {
  procedure_id: number | null;
  procedure_sharepoint_item_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  published_by: string | null;
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
  categoryLabel: string;
  diffusionOn: string;
  description: string;
  regulatoryRequirement: string;
  ismChapter: string;
  vesselName: string;
  projectName: string;
  documentNumber: string;
  restrictions: string;
  annualReview: boolean;
  approvalStatus: string;
  theme: string;
  documentType: string;
  bridgeWatch: boolean;
  versionLabel: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}

export interface PublishedProcedureRecord extends ProcedureRecord {
  procedureId: number | null;
  procedureSharePointItemId: string;
  publishedBy: string;
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

export interface ProcedureInput {
  procedureCode: string;
  title: string;
  status: ProcedureStatus;
  revisionLabel: string;
  diffusionOn: string;
  categoryLabel: string;
  description: string;
  regulatoryRequirement: string;
  ismChapter: string;
  vesselName: string;
  projectName: string;
  documentNumber: string;
  restrictions: string;
  annualReview: boolean;
  approvalStatus: string;
  theme: string;
  documentType: string;
  bridgeWatch: boolean;
  versionLabel: string;
  notes: string;
}

export type CreateProcedureInput = ProcedureInput;

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStatus(status: string | null): ProcedureStatus {
  return status === 'draft' || status === 'review' || status === 'approved' || status === 'archived' || status === 'unknown'
    ? status
    : 'unknown';
}

function mapProcedureBase(row: ProcedureBaseRow) {
  return {
    id: row.id,
    procedureCode: nullableText(row.procedure_code),
    title: row.title,
    status: normalizeStatus(row.status),
    revisionLabel: nullableText(row.revision_label),
    publishedOn: nullableText(row.published_on),
    sourceLabel: nullableText(row.source_label),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
    categoryLabel: nullableText(row.category_label),
    diffusionOn: nullableText(row.diffusion_on),
    description: nullableText(row.description),
    regulatoryRequirement: nullableText(row.regulatory_requirement),
    ismChapter: nullableText(row.ism_chapter),
    vesselName: nullableText(row.vessel_name),
    projectName: nullableText(row.project_name),
    documentNumber: nullableText(row.document_number),
    restrictions: nullableText(row.restrictions),
    annualReview: Boolean(row.annual_review),
    approvalStatus: nullableText(row.approval_status),
    theme: nullableText(row.theme),
    documentType: nullableText(row.document_type),
    bridgeWatch: Boolean(row.bridge_watch),
    versionLabel: nullableText(row.version_label),
  };
}

export function getProcedureStatusLabel(status: ProcedureStatus): string {
  return { approved: 'Approuvée', archived: 'Archivée', draft: 'Brouillon', review: 'En revue', unknown: 'Non renseigné' }[status];
}

export function mapProcedureRows(rows: ProcedureRow[]): ProcedureRecord[] {
  return rows.map((row) => ({
    ...mapProcedureBase(row),
    storageBucket: nullableText(row.source_storage_bucket),
    storagePath: nullableText(row.source_storage_path),
    fileName: nullableText(row.source_file_name) || row.title,
    mimeType: nullableText(row.source_mime_type),
    sizeBytes: row.source_size_bytes,
  }));
}

export function mapPublishedProcedureRows(rows: PublishedProcedureRow[]): PublishedProcedureRecord[] {
  return rows.map((row) => ({
    ...mapProcedureBase(row),
    procedureId: row.procedure_id,
    procedureSharePointItemId: nullableText(row.procedure_sharepoint_item_id),
    storageBucket: nullableText(row.storage_bucket),
    storagePath: nullableText(row.storage_path),
    fileName: nullableText(row.file_name) || row.title,
    mimeType: nullableText(row.mime_type) || 'application/pdf',
    sizeBytes: row.size_bytes,
    publishedBy: nullableText(row.published_by),
  }));
}

export function buildProcedureMetrics(data: ProceduresData): ProcedureMetrics {
  return {
    totalProcedures: data.procedures.length,
    approvedProcedures: data.procedures.filter((item) => item.status === 'approved').length,
    reviewProcedures: data.procedures.filter((item) => item.status === 'review').length,
    draftProcedures: data.procedures.filter((item) => item.status === 'draft').length,
    publishedProcedures: data.publications.length,
  };
}

export async function fetchProcedures(client: SupabaseClient): Promise<ProcedureRecord[]> {
  const { data, error } = await client.from('procedures').select(PROCEDURE_SELECT)
    .order('ism_chapter', { ascending: true, nullsFirst: false })
    .order('procedure_code', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });
  if (error) throw error;
  return mapProcedureRows((data || []) as unknown as ProcedureRow[]);
}

export async function fetchPublishedProcedures(client: SupabaseClient): Promise<PublishedProcedureRecord[]> {
  const { data, error } = await client.from('published_procedures').select(PUBLISHED_PROCEDURE_SELECT)
    .order('ism_chapter', { ascending: true, nullsFirst: false })
    .order('procedure_code', { ascending: true, nullsFirst: false })
    .order('published_on', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return mapPublishedProcedureRows((data || []) as unknown as PublishedProcedureRow[]);
}

export async function fetchProceduresData(client: SupabaseClient, includeSources = true): Promise<ProceduresData> {
  const [procedures, publications] = await Promise.all([
    includeSources ? fetchProcedures(client) : Promise.resolve([]),
    fetchPublishedProcedures(client),
  ]);
  return { procedures, publications };
}

function procedurePayload(input: ProcedureInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Le titre de la procédure est obligatoire.');
  return {
    procedure_code: optionalText(input.procedureCode || input.documentNumber),
    title,
    status: input.status,
    revision_label: optionalText(input.revisionLabel || input.versionLabel),
    source_label: 'seapilot',
    notes: optionalText(input.notes),
    category_label: optionalText(input.categoryLabel),
    diffusion_on: optionalText(input.diffusionOn),
    description: optionalText(input.description),
    regulatory_requirement: optionalText(input.regulatoryRequirement),
    ism_chapter: optionalText(input.ismChapter),
    vessel_name: optionalText(input.vesselName),
    project_name: optionalText(input.projectName),
    document_number: optionalText(input.documentNumber || input.procedureCode),
    restrictions: optionalText(input.restrictions),
    annual_review: input.annualReview,
    approval_status: optionalText(input.approvalStatus),
    theme: optionalText(input.theme),
    document_type: optionalText(input.documentType),
    bridge_watch: input.bridgeWatch,
    version_label: optionalText(input.versionLabel || input.revisionLabel),
  };
}

function sanitizeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '') || 'document';
}

function sourceMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').pop();
  return {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odt: 'application/vnd.oasis.opendocument.text',
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[extension || ''] || 'text/plain';
}

async function uploadProcedureFile(client: SupabaseClient, folder: string, file: File): Promise<string> {
  const uniqueId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${folder}/${Date.now()}-${uniqueId}-${sanitizeFileName(file.name)}`;
  const { error } = await client.storage.from(PROCEDURE_DOCUMENT_BUCKET).upload(path, file, {
    cacheControl: '3600', contentType: sourceMimeType(file), upsert: false,
  });
  if (error) throw error;
  return path;
}

async function removeStorageObjects(client: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await client.storage.from(PROCEDURE_DOCUMENT_BUCKET).remove(paths);
  if (error) throw error;
}

export async function createProcedure(client: SupabaseClient, input: CreateProcedureInput, sourceFile: File): Promise<ProcedureRecord> {
  if (!sourceFile || sourceFile.size <= 0) throw new Error('Le fichier source modifiable est obligatoire.');
  const sourcePath = await uploadProcedureFile(client, 'sources', sourceFile);
  const payload = {
    ...procedurePayload(input),
    source_storage_bucket: PROCEDURE_DOCUMENT_BUCKET,
    source_storage_path: sourcePath,
    source_file_name: sourceFile.name,
    source_mime_type: sourceMimeType(sourceFile),
    source_size_bytes: sourceFile.size,
  };
  const { data, error } = await client.from('procedures').insert(payload).select(PROCEDURE_SELECT).single();
  if (error) {
    await removeStorageObjects(client, [sourcePath]).catch(() => undefined);
    throw error;
  }
  return mapProcedureRows([data as unknown as ProcedureRow])[0];
}

export async function updateProcedure(
  client: SupabaseClient,
  procedure: ProcedureRecord,
  input: ProcedureInput,
  replacementFile?: File | null,
): Promise<ProcedureRecord> {
  let replacementPath = '';
  const storagePayload = replacementFile ? {
    source_storage_bucket: PROCEDURE_DOCUMENT_BUCKET,
    source_storage_path: (replacementPath = await uploadProcedureFile(client, 'sources', replacementFile)),
    source_file_name: replacementFile.name,
    source_mime_type: sourceMimeType(replacementFile),
    source_size_bytes: replacementFile.size,
  } : {};
  const { data, error } = await client.from('procedures').update({ ...procedurePayload(input), ...storagePayload })
    .eq('id', procedure.id).select(PROCEDURE_SELECT).single();
  if (error) {
    if (replacementPath) await removeStorageObjects(client, [replacementPath]).catch(() => undefined);
    throw error;
  }
  if (replacementPath && procedure.storagePath) await removeStorageObjects(client, [procedure.storagePath]).catch(() => undefined);
  return mapProcedureRows([data as unknown as ProcedureRow])[0];
}

export async function publishProcedure(client: SupabaseClient, procedure: ProcedureRecord, pdfFile: File): Promise<PublishedProcedureRecord> {
  if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('La publication doit être un fichier PDF.');
  }
  const publishedOn = new Date().toISOString().slice(0, 10);
  const storagePath = await uploadProcedureFile(client, `published/${procedure.id}`, pdfFile);
  const payload = {
    procedure_id: procedure.id,
    procedure_sharepoint_item_id: null,
    procedure_code: optionalText(procedure.procedureCode),
    title: pdfFile.name,
    status: 'approved',
    revision_label: optionalText(procedure.revisionLabel),
    published_on: publishedOn,
    source_label: 'seapilot', file_url: null, notes: optionalText(procedure.notes),
    category_label: optionalText(procedure.categoryLabel),
    diffusion_on: optionalText(procedure.diffusionOn || publishedOn),
    description: optionalText(procedure.description),
    regulatory_requirement: optionalText(procedure.regulatoryRequirement),
    ism_chapter: optionalText(procedure.ismChapter),
    vessel_name: optionalText(procedure.vesselName), project_name: optionalText(procedure.projectName),
    document_number: optionalText(procedure.documentNumber || procedure.procedureCode),
    restrictions: optionalText(procedure.restrictions), annual_review: procedure.annualReview,
    approval_status: 'Document approuve', theme: optionalText(procedure.theme),
    document_type: optionalText(procedure.documentType), bridge_watch: procedure.bridgeWatch,
    version_label: optionalText(procedure.versionLabel || procedure.revisionLabel),
    storage_bucket: PROCEDURE_DOCUMENT_BUCKET, storage_path: storagePath, file_name: pdfFile.name,
    mime_type: 'application/pdf', size_bytes: pdfFile.size,
  };
  const { data, error } = await client.from('published_procedures').insert(payload)
    .select(PUBLISHED_PROCEDURE_SELECT).single();
  if (error) {
    await removeStorageObjects(client, [storagePath]).catch(() => undefined);
    throw error;
  }
  const publication = mapPublishedProcedureRows([data as unknown as PublishedProcedureRow])[0];
  const { error: procedureError } = await client.from('procedures').update({
    status: 'approved', approval_status: 'Document approuve', published_on: publishedOn,
    diffusion_on: procedure.diffusionOn || publishedOn,
  }).eq('id', procedure.id);
  if (procedureError) {
    await client.from('published_procedures').delete().eq('id', publication.id);
    await removeStorageObjects(client, [storagePath]).catch(() => undefined);
    throw procedureError;
  }
  return publication;
}

export async function deleteProcedure(client: SupabaseClient, procedure: ProcedureRecord, publications: PublishedProcedureRecord[]) {
  const { error } = await client.from('procedures').delete().eq('id', procedure.id);
  if (error) throw error;
  const paths = [procedure.storagePath, ...publications.map((item) => item.storagePath)].filter(Boolean);
  await removeStorageObjects(client, paths).catch(() => undefined);
}

export async function deletePublishedProcedure(client: SupabaseClient, publication: PublishedProcedureRecord) {
  const { error } = await client.from('published_procedures').delete().eq('id', publication.id);
  if (error) throw error;
  if (publication.storagePath) await removeStorageObjects(client, [publication.storagePath]).catch(() => undefined);
}

export async function getProcedureFileUrl(client: SupabaseClient, record: ProcedureRecord | PublishedProcedureRecord): Promise<string> {
  if (!record.storageBucket || !record.storagePath) {
    if (record.fileUrl) return record.fileUrl;
    throw new Error('Aucun fichier disponible pour ce document.');
  }
  const { data, error } = await client.storage.from(record.storageBucket).createSignedUrl(record.storagePath, 300, {
    download: record.fileName || true,
  });
  if (error) throw error;
  return data.signedUrl;
}
