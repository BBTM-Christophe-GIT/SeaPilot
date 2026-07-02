import type { SupabaseClient } from '@supabase/supabase-js';

const FLEET_CERTIFICATE_SELECT = [
  'id',
  'vessel_id',
  'vessel_name',
  'category_key',
  'title',
  'status',
  'issued_on',
  'expires_on',
  'source_label',
  'file_url',
  'notes',
].join(', ');

export type FleetCertificateStatus = 'valid' | 'renew_due' | 'expired' | 'missing' | 'pending_validation';

interface FleetCertificateRow {
  id: number;
  vessel_id: number | null;
  vessel_name: string | null;
  category_key: string | null;
  title: string;
  status: string | null;
  issued_on: string | null;
  expires_on: string | null;
  source_label: string | null;
  file_url: string | null;
  notes: string | null;
}

export interface FleetCertificateRecord {
  id: number;
  vesselId: number | null;
  vesselName: string;
  categoryKey: string;
  title: string;
  status: FleetCertificateStatus;
  issuedOn: string;
  expiresOn: string;
  sourceLabel: string;
  fileUrl: string;
  notes: string;
}

export interface FleetCertificateMetrics {
  total: number;
  valid: number;
  renewalDue: number;
  expired: number;
  missing: number;
}

export interface CreateFleetCertificateInput {
  vesselName: string;
  categoryKey: string;
  title: string;
  status: FleetCertificateStatus;
  issuedOn: string;
  expiresOn: string;
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

export function getFleetCertificateStatusLabel(status: FleetCertificateStatus): string {
  const labels: Record<FleetCertificateStatus, string> = {
    expired: 'Expire',
    missing: 'Manquant',
    pending_validation: 'Validation',
    renew_due: 'A renouveler',
    valid: 'Valide',
  };

  return labels[status];
}

export function getFleetCertificateCategoryLabel(categoryKey: string): string {
  if (categoryKey === 'certificate') {
    return 'Certificat';
  }

  return categoryKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function mapFleetCertificateRows(rows: FleetCertificateRow[]): FleetCertificateRecord[] {
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    vesselName: nullableText(row.vessel_name) || 'Navire non renseigne',
    categoryKey: row.category_key || 'certificate',
    title: row.title,
    status: normalizeStatus(row.status),
    issuedOn: nullableText(row.issued_on),
    expiresOn: nullableText(row.expires_on),
    sourceLabel: nullableText(row.source_label),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
  }));
}

export function buildFleetCertificateMetrics(certificates: FleetCertificateRecord[]): FleetCertificateMetrics {
  return {
    total: certificates.length,
    valid: certificates.filter((certificate) => certificate.status === 'valid').length,
    renewalDue: certificates.filter((certificate) => certificate.status === 'renew_due').length,
    expired: certificates.filter((certificate) => certificate.status === 'expired').length,
    missing: certificates.filter((certificate) => certificate.status === 'missing').length,
  };
}

export async function fetchFleetCertificates(client: SupabaseClient): Promise<FleetCertificateRecord[]> {
  const { data, error } = await client
    .from('fleet_certificates')
    .select(FLEET_CERTIFICATE_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false })
    .order('vessel_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapFleetCertificateRows((data || []) as unknown as FleetCertificateRow[]);
}

export async function createFleetCertificate(
  client: SupabaseClient,
  input: CreateFleetCertificateInput,
): Promise<FleetCertificateRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error('Le titre du certificat est obligatoire.');
  }

  const payload = {
    vessel_name: input.vesselName.trim() || 'Navire non renseigne',
    category_key: input.categoryKey.trim() || 'certificate',
    title,
    status: input.status,
    issued_on: optionalText(input.issuedOn),
    expires_on: optionalText(input.expiresOn),
    source_label: 'seapilot',
    file_url: optionalText(input.fileUrl),
    notes: optionalText(input.notes),
  };
  const { data, error } = await client.from('fleet_certificates').insert(payload).select(FLEET_CERTIFICATE_SELECT).single();

  if (error) {
    throw error;
  }

  return mapFleetCertificateRows([data as unknown as FleetCertificateRow])[0];
}
