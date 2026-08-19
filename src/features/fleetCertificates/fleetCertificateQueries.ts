import type { SupabaseClient } from '@supabase/supabase-js';

export const FLEET_CERTIFICATE_BUCKET = 'fleet-certificates';

const FLEET_CERTIFICATE_SELECT = [
  'id',
  'company_id',
  'vessel_id',
  'vessel_name',
  'category_key',
  'category_label',
  'document_title',
  'title',
  'status',
  'issued_on',
  'expires_on',
  'planned_on',
  'alarm_on',
  'provider_name',
  'visit_location',
  'workflow_status',
  'renewal_notes',
  'renaming_rule_key',
  'original_file_name',
  'file_name',
  'source_label',
  'file_url',
  'storage_bucket',
  'storage_path',
  'mime_type',
  'file_size_bytes',
  'current_version_no',
  'is_active_fleet',
  'notes',
  'updated_at',
  'vessel:vessels!fleet_certificates_vessel_id_fkey(acronym)',
].join(', ');

export type FleetCertificateStatus = 'valid' | 'renew_due' | 'expired' | 'missing' | 'pending_validation';
export type FleetCertificateWorkflowStatus =
  | 'not_started'
  | 'due'
  | 'planned'
  | 'requested'
  | 'document_received'
  | 'pending_validation'
  | 'validated'
  | 'cancelled';

interface FleetCertificateRow {
  id: number;
  company_id: number;
  vessel_id: number | null;
  vessel_name: string | null;
  category_key: string | null;
  category_label: string | null;
  document_title: string | null;
  title: string;
  status: string | null;
  issued_on: string | null;
  expires_on: string | null;
  planned_on: string | null;
  alarm_on: string | null;
  provider_name: string | null;
  visit_location: string | null;
  workflow_status: string | null;
  renewal_notes: string | null;
  renaming_rule_key: string | null;
  original_file_name: string | null;
  file_name: string | null;
  source_label: string | null;
  file_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  current_version_no: number | null;
  is_active_fleet: boolean | null;
  notes: string | null;
  updated_at: string | null;
  vessel: { acronym: string | null } | Array<{ acronym: string | null }> | null;
}

interface FleetCertificateVersionRow {
  id: number;
  version_no: number;
  status: FleetCertificateVersion['status'];
  original_file_name: string;
  normalized_file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  issued_on: string | null;
  expires_on: string | null;
  is_current: boolean;
  created_at: string;
  validated_at: string | null;
}

export interface FleetCertificateRecord {
  id: number;
  companyId: number;
  vesselId: number | null;
  vesselName: string;
  vesselAcronym: string;
  categoryKey: string;
  categoryLabel: string;
  documentTitle: string;
  title: string;
  status: FleetCertificateStatus;
  issuedOn: string;
  expiresOn: string;
  plannedOn: string;
  alarmOn: string;
  providerName: string;
  visitLocation: string;
  workflowStatus: FleetCertificateWorkflowStatus;
  renewalNotes: string;
  renamingRuleKey: string;
  originalFileName: string;
  fileName: string;
  sourceLabel: string;
  fileUrl: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  currentVersionNo: number;
  isActiveFleet: boolean;
  notes: string;
  updatedAt: string;
}

export interface FleetCertificateVersion {
  id: number;
  versionNo: number;
  status: 'active' | 'archived' | 'pending_validation' | 'rejected';
  originalFileName: string;
  normalizedFileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  issuedOn: string;
  expiresOn: string;
  isCurrent: boolean;
  createdAt: string;
  validatedAt: string;
}

export interface FleetCertificateMetrics {
  total: number;
  renewalDue: number;
  expired: number;
  unplannedVisits: number;
  renewalVessels: string[];
  expiredVessels: string[];
  unplannedVessels: string[];
}

export interface PlanFleetCertificateRenewalInput {
  plannedOn: string;
  providerName: string;
  visitLocation: string;
  notes: string;
}

export interface SubmitFleetCertificateRenewalInput {
  file: File;
  issuedOn: string;
  expiresOn: string;
  notes: string;
}

export interface CreateFleetCertificateDocumentInput {
  companyId: number;
  vesselId: number;
  vesselName: string;
  vesselAcronym: string;
  categoryKey: string;
  categoryLabel: string;
  documentTitle: string;
  file: File;
  issuedOn: string;
  expiresOn: string;
}

export type CreateFleetCertificateLineInput = Omit<CreateFleetCertificateDocumentInput, 'file'>;

export interface UpdateFleetCertificateDocumentMetadataInput {
  certificateId: number;
  vesselId: number;
  categoryKey: string;
  categoryLabel: string;
  documentTitle: string;
  issuedOn: string;
  expiresOn: string;
}

interface FleetCertificateDocumentNameRow {
  name: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeStatus(status: string | null): FleetCertificateStatus {
  if (
    status === 'valid' ||
    status === 'renew_due' ||
    status === 'expired' ||
    status === 'missing' ||
    status === 'pending_validation'
  ) {
    return status;
  }
  return 'valid';
}

function normalizeWorkflowStatus(status: string | null): FleetCertificateWorkflowStatus {
  const statuses: FleetCertificateWorkflowStatus[] = [
    'not_started', 'due', 'planned', 'requested', 'document_received',
    'pending_validation', 'validated', 'cancelled',
  ];
  return statuses.includes(status as FleetCertificateWorkflowStatus)
    ? (status as FleetCertificateWorkflowStatus)
    : 'not_started';
}

function relationAcronym(relation: FleetCertificateRow['vessel']): string {
  const vessel = Array.isArray(relation) ? relation[0] : relation;
  return vessel?.acronym?.trim() || '';
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function safeObjectName(fileName: string): string {
  const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-160) || 'certificat';
}

function randomObjectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getFleetCertificateStatusLabel(status: FleetCertificateStatus): string {
  const labels: Record<FleetCertificateStatus, string> = {
    expired: 'Expiré',
    missing: 'Manquant',
    pending_validation: 'À valider',
    renew_due: 'À renouveler',
    valid: 'Valide',
  };
  return labels[status];
}

export function getFleetCertificateCategoryLabel(categoryKey: string): string {
  if (categoryKey === 'certificate') return 'Certificat';
  return categoryKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getEffectiveFleetCertificateStatus(
  certificate: Pick<FleetCertificateRecord, 'status' | 'expiresOn'>,
  today = new Date(),
): FleetCertificateStatus {
  if (certificate.status === 'missing' || certificate.status === 'pending_validation') return certificate.status;
  if (!certificate.expiresOn) return 'valid';
  const currentDate = isoDate(today);
  if (certificate.expiresOn < currentDate) return 'expired';
  if (certificate.expiresOn <= isoDate(addDays(today, 90))) return 'renew_due';
  return 'valid';
}

export function mapFleetCertificateRows(rows: FleetCertificateRow[]): FleetCertificateRecord[] {
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    vesselId: row.vessel_id,
    vesselName: nullableText(row.vessel_name) || 'Navire non renseigné',
    vesselAcronym: relationAcronym(row.vessel),
    categoryKey: row.category_key || 'certificate',
    categoryLabel: nullableText(row.category_label) || getFleetCertificateCategoryLabel(row.category_key || 'certificate'),
    documentTitle: nullableText(row.document_title) || row.title,
    title: row.title,
    status: normalizeStatus(row.status),
    issuedOn: nullableText(row.issued_on),
    expiresOn: nullableText(row.expires_on),
    plannedOn: nullableText(row.planned_on),
    alarmOn: nullableText(row.alarm_on),
    providerName: nullableText(row.provider_name),
    visitLocation: nullableText(row.visit_location),
    workflowStatus: normalizeWorkflowStatus(row.workflow_status),
    renewalNotes: nullableText(row.renewal_notes),
    renamingRuleKey: nullableText(row.renaming_rule_key) || 'vessel-title-issued-year',
    originalFileName: nullableText(row.original_file_name),
    fileName: nullableText(row.file_name),
    sourceLabel: nullableText(row.source_label),
    fileUrl: nullableText(row.file_url),
    storageBucket: nullableText(row.storage_bucket),
    storagePath: nullableText(row.storage_path),
    mimeType: nullableText(row.mime_type),
    fileSizeBytes: row.file_size_bytes,
    currentVersionNo: row.current_version_no ?? 1,
    isActiveFleet: row.is_active_fleet !== false,
    notes: nullableText(row.notes),
    updatedAt: nullableText(row.updated_at),
  }));
}

export function buildFleetCertificateMetrics(
  certificates: FleetCertificateRecord[],
  today = new Date(),
): FleetCertificateMetrics {
  const dueLimit = isoDate(addDays(today, 90));
  const todayIso = isoDate(today);
  const renewalDue = certificates.filter((certificate) => {
    const status = getEffectiveFleetCertificateStatus(certificate, today);
    return status === 'renew_due';
  });
  const expired = certificates.filter((certificate) => getEffectiveFleetCertificateStatus(certificate, today) === 'expired');
  const unplanned = certificates.filter(
    (certificate) => certificate.expiresOn >= todayIso && certificate.expiresOn <= dueLimit && !certificate.plannedOn,
  );
  return {
    total: certificates.length,
    renewalDue: renewalDue.length,
    expired: expired.length,
    unplannedVisits: unplanned.length,
    renewalVessels: uniqueSorted(renewalDue.map((certificate) => certificate.vesselName)),
    expiredVessels: uniqueSorted(expired.map((certificate) => certificate.vesselName)),
    unplannedVessels: uniqueSorted(unplanned.map((certificate) => certificate.vesselName)),
  };
}

export function buildFleetCertificateFileName(
  certificate: Pick<FleetCertificateRecord, 'vesselName' | 'documentTitle'>,
  issuedOn: string,
  originalFileName: string,
): string {
  const extension = originalFileName.includes('.') ? originalFileName.split('.').pop()?.toLowerCase() || 'pdf' : 'pdf';
  const issueDate = issuedOn?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    throw new Error("Renseignez la date d'émission du document.");
  }
  const vesselName = certificate.vesselName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const title = certificate.documentTitle.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${vesselName} - ${title} - ${issueDate.slice(0, 4)}.${extension}`;
}

export function getDefaultFleetCertificateExpiryDate(issuedOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) return '';
  const [year, month, day] = issuedOn.split('-').map(Number);
  const lastDayNextYearMonth = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return [year + 1, String(month).padStart(2, '0'), String(Math.min(day, lastDayNextYearMonth)).padStart(2, '0')].join('-');
}

export function normalizeFleetCertificateDocumentName(title: string, vesselLabels: string[] = []): string {
  let normalized = title.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/\s+/g, ' ').trim();
  const labels = Array.from(new Set(vesselLabels.map((label) => label.trim()).filter(Boolean)))
    .sort((left, right) => right.length - left.length);
  labels.forEach((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized
      .replace(new RegExp(`^${escaped}\\s*[-–—_]\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[-–—_]\\s*${escaped}$`, 'i'), '');
  });
  normalized = normalized
    .replace(/\s*[-–—_/]\s*(?:19|20)\d{2}(?:-\d{2}-\d{2})?\s*$/i, '')
    .replace(/^(?:19|20)\d{2}(?:-\d{2}-\d{2})?\s*[-–—_/]\s*/i, '')
    .replace(/^[-–—_\s]+|[-–—_\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || title.trim();
}

export async function fetchFleetCertificateDocumentNames(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from('fleet_certificate_document_names')
    .select('name')
    .order('name', { ascending: true });
  if (error) throw error;
  return uniqueSorted(((data || []) as FleetCertificateDocumentNameRow[]).map((row) => row.name.trim()));
}

export async function fetchFleetCertificates(client: SupabaseClient): Promise<FleetCertificateRecord[]> {
  const { data, error } = await client
    .from('fleet_certificates')
    .select(FLEET_CERTIFICATE_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false })
    .order('vessel_name', { ascending: true });
  if (error) throw error;
  return mapFleetCertificateRows((data || []) as unknown as FleetCertificateRow[]);
}

export async function fetchFleetCertificateVersions(
  client: SupabaseClient,
  certificateId: number,
): Promise<FleetCertificateVersion[]> {
  const { data, error } = await client
    .from('fleet_certificate_versions')
    .select('id, version_no, status, original_file_name, normalized_file_name, storage_bucket, storage_path, mime_type, file_size_bytes, issued_on, expires_on, is_current, created_at, validated_at')
    .eq('certificate_id', certificateId)
    .order('version_no', { ascending: false });
  if (error) throw error;
  return ((data || []) as FleetCertificateVersionRow[]).map((row) => ({
    id: row.id,
    versionNo: row.version_no,
    status: row.status,
    originalFileName: row.original_file_name,
    normalizedFileName: row.normalized_file_name,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: nullableText(row.mime_type),
    fileSizeBytes: row.file_size_bytes,
    issuedOn: nullableText(row.issued_on),
    expiresOn: nullableText(row.expires_on),
    isCurrent: row.is_current,
    createdAt: row.created_at,
    validatedAt: nullableText(row.validated_at),
  }));
}

export async function openFleetCertificateDocument(
  client: SupabaseClient,
  document: Pick<FleetCertificateRecord | FleetCertificateVersion, 'storageBucket' | 'storagePath'>,
): Promise<string> {
  if (!document.storageBucket || !document.storagePath) throw new Error('Aucun document Supabase disponible.');
  const { data, error } = await client.storage.from(document.storageBucket).createSignedUrl(document.storagePath, 300);
  if (error || !data?.signedUrl) throw error || new Error("Impossible d'ouvrir ce document.");
  return data.signedUrl;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadFleetCertificateDocuments(
  client: SupabaseClient,
  certificates: FleetCertificateRecord[],
): Promise<void> {
  if (!certificates.length) throw new Error('Sélectionnez au moins un document.');

  const documents = await Promise.all(certificates.map(async (certificate) => {
    if (!certificate.storageBucket || !certificate.storagePath) {
      throw new Error(`Le document « ${certificate.documentTitle} » est indisponible.`);
    }
    const { data, error } = await client.storage.from(certificate.storageBucket).download(certificate.storagePath);
    if (error || !data) throw error || new Error(`Impossible de télécharger « ${certificate.documentTitle} ».`);
    return { blob: data, fileName: certificate.fileName || certificate.originalFileName || `${certificate.documentTitle}.pdf` };
  }));

  if (documents.length === 1) {
    triggerBlobDownload(documents[0].blob, documents[0].fileName);
    return;
  }

  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  documents.forEach(({ blob, fileName }) => archive.file(fileName, blob));
  const generated = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  triggerBlobDownload(generated, `Certificats-flotte-${isoDate(new Date())}.zip`);
}

export async function createFleetCertificateDocument(
  client: SupabaseClient,
  input: CreateFleetCertificateDocumentInput,
): Promise<void> {
  if (!input.file) throw new Error('Sélectionnez un document.');
  if (!input.documentTitle.trim()) throw new Error('Renseignez le titre du document.');
  if (input.file.size > 50 * 1024 * 1024) throw new Error('Le document dépasse la limite de 50 Mo.');
  const extension = input.file.name.split('.').pop()?.toLowerCase() || '';
  if (!['pdf', 'png', 'jpg', 'jpeg', 'xlsx'].includes(extension)) {
    throw new Error('Formats acceptés : PDF, PNG, JPG et XLSX.');
  }

  const normalizedName = buildFleetCertificateFileName({
    vesselName: input.vesselName,
    documentTitle: input.documentTitle.trim(),
  }, input.issuedOn, input.file.name);
  const acronym = input.vesselAcronym || safeObjectName(input.vesselName).slice(0, 12).toUpperCase();
  const storagePath = `${input.companyId}/${acronym}/documents/${randomObjectId()}-${safeObjectName(normalizedName)}`;
  const { error: uploadError } = await client.storage.from(FLEET_CERTIFICATE_BUCKET).upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await client.rpc('create_fleet_certificate_document', {
    p_vessel_id: input.vesselId,
    p_category_key: input.categoryKey,
    p_category_label: input.categoryLabel,
    p_document_title: input.documentTitle.trim(),
    p_original_file_name: input.file.name,
    p_normalized_file_name: normalizedName,
    p_storage_path: storagePath,
    p_mime_type: input.file.type || null,
    p_file_size_bytes: input.file.size,
    p_issued_on: input.issuedOn || null,
    p_expires_on: input.expiresOn || null,
  });
  if (metadataError) {
    await client.storage.from(FLEET_CERTIFICATE_BUCKET).remove([storagePath]);
    throw metadataError;
  }
}

export async function createFleetCertificateLine(
  client: SupabaseClient,
  input: CreateFleetCertificateLineInput,
): Promise<void> {
  if (!input.vesselId) throw new Error('Sélectionnez un navire.');
  if (!input.categoryKey.trim() || !input.categoryLabel.trim()) throw new Error('Sélectionnez une catégorie.');
  if (!input.documentTitle.trim()) throw new Error('Renseignez le nom de la ligne.');
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
    throw new Error("La date d'échéance ne peut pas être antérieure à la date d'émission.");
  }

  const { error } = await client.rpc('create_fleet_certificate_line', {
    p_vessel_id: input.vesselId,
    p_category_key: input.categoryKey.trim(),
    p_category_label: input.categoryLabel.trim(),
    p_document_title: input.documentTitle.trim(),
    p_issued_on: input.issuedOn || null,
    p_expires_on: input.expiresOn || null,
  });
  if (error) throw new Error(error.message || 'Impossible d’ajouter cette ligne.');
}

export async function updateFleetCertificateDocumentMetadata(
  client: SupabaseClient,
  input: UpdateFleetCertificateDocumentMetadataInput,
): Promise<void> {
  if (!input.certificateId || !input.vesselId) throw new Error('Le document ou le navire est introuvable.');
  if (!input.categoryKey.trim() || !input.categoryLabel.trim()) throw new Error('Sélectionnez une catégorie.');
  if (!input.documentTitle.trim()) throw new Error('Renseignez le nom du document.');
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
    throw new Error("La date d'échéance ne peut pas être antérieure à la date d'émission.");
  }

  const { error } = await client.rpc('update_fleet_certificate_document_metadata', {
    p_certificate_id: input.certificateId,
    p_vessel_id: input.vesselId,
    p_category_key: input.categoryKey.trim(),
    p_category_label: input.categoryLabel.trim(),
    p_document_title: input.documentTitle.trim(),
    p_issued_on: input.issuedOn || null,
    p_expires_on: input.expiresOn || null,
  });
  if (error) throw new Error(error.message || 'Impossible de modifier les informations du document.');
}

export async function deleteFleetCertificateDocuments(
  client: SupabaseClient,
  certificateIds: number[],
): Promise<void> {
  if (!certificateIds.length) return;
  const { data, error } = await client.rpc('delete_fleet_certificate_documents', {
    p_certificate_ids: certificateIds,
  });
  if (error) throw error;

  const objects = (data || []) as Array<{ storage_bucket: string; storage_path: string }>;
  const pathsByBucket = new Map<string, string[]>();
  objects.forEach((object) => {
    if (!object.storage_bucket || !object.storage_path) return;
    pathsByBucket.set(object.storage_bucket, [...(pathsByBucket.get(object.storage_bucket) || []), object.storage_path]);
  });
  for (const [bucket, paths] of pathsByBucket) {
    const { error: removeError } = await client.storage.from(bucket).remove(Array.from(new Set(paths)));
    if (removeError) throw removeError;
  }
}

export async function planFleetCertificateRenewal(
  client: SupabaseClient,
  certificateId: number,
  input: PlanFleetCertificateRenewalInput,
): Promise<void> {
  const { error } = await client.rpc('plan_fleet_certificate_renewal', {
    p_certificate_id: certificateId,
    p_planned_on: input.plannedOn,
    p_provider_name: input.providerName.trim() || null,
    p_visit_location: input.visitLocation.trim() || null,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw error;
}

export async function submitFleetCertificateRenewal(
  client: SupabaseClient,
  certificate: FleetCertificateRecord,
  input: SubmitFleetCertificateRenewalInput,
): Promise<void> {
  if (!input.file) throw new Error('Sélectionnez un document.');
  if (!input.issuedOn) throw new Error("Renseignez la date d'émission du document.");
  if (input.file.size > 50 * 1024 * 1024) throw new Error('Le document dépasse la limite de 50 Mo.');
  const extension = input.file.name.split('.').pop()?.toLowerCase() || '';
  if (!['pdf', 'png', 'jpg', 'jpeg', 'xlsx'].includes(extension)) {
    throw new Error('Formats acceptés : PDF, PNG, JPG et XLSX.');
  }

  const normalizedName = buildFleetCertificateFileName(certificate, input.issuedOn, input.file.name);
  const acronym = certificate.vesselAcronym || safeObjectName(certificate.vesselName).slice(0, 12).toUpperCase();
  const storagePath = `${certificate.companyId}/${acronym}/${certificate.id}/renewals/${randomObjectId()}-${safeObjectName(normalizedName)}`;
  const { error: uploadError } = await client.storage.from(FLEET_CERTIFICATE_BUCKET).upload(storagePath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: metadataError } = await client.rpc('submit_fleet_certificate_renewal', {
    p_certificate_id: certificate.id,
    p_original_file_name: input.file.name,
    p_normalized_file_name: normalizedName,
    p_storage_path: storagePath,
    p_mime_type: input.file.type || null,
    p_file_size_bytes: input.file.size,
    p_issued_on: input.issuedOn || null,
    p_expires_on: input.expiresOn || null,
    p_notes: input.notes.trim() || null,
  });
  if (metadataError) {
    await client.storage.from(FLEET_CERTIFICATE_BUCKET).remove([storagePath]);
    throw metadataError;
  }
}

export async function validateFleetCertificateRenewal(client: SupabaseClient, versionId: number): Promise<void> {
  const { error } = await client.rpc('validate_fleet_certificate_renewal', { p_version_id: versionId });
  if (error) throw error;
}
