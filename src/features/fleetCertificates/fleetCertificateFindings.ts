import type { SupabaseClient } from '@supabase/supabase-js';
import { FLEET_CERTIFICATE_BUCKET } from './fleetCertificateQueries';

export type FleetFindingType =
  | 'major_non_conformity'
  | 'minor_non_conformity'
  | 'class_condition'
  | 'remark'
  | 'prescription'
  | 'finding';

export type FleetFindingStatus = 'declared' | 'assigned' | 'in_progress' | 'pending_validation' | 'closed';
export type FleetFindingAttachmentKind = 'finding' | 'treatment';

export interface FleetFindingAttachment {
  id: number;
  findingId: number;
  kind: FleetFindingAttachmentKind;
  originalFileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption: string;
  createdAt: string;
}

export interface FleetFindingEvent {
  id: number;
  findingId: number;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  authorName: string;
  createdAt: string;
}

export interface FleetCertificateFinding {
  id: number;
  companyId: number;
  certificateId: number;
  reference: string;
  findingType: FleetFindingType;
  title: string;
  description: string;
  detectedOn: string;
  treatmentDelayDays: number | null;
  treatmentDueOn: string;
  status: FleetFindingStatus;
  progress: number;
  responsiblePersonId: number | null;
  responsibleName: string;
  closedAt: string;
  createdAt: string;
  updatedAt: string;
  attachments: FleetFindingAttachment[];
  events: FleetFindingEvent[];
}

export interface FleetFindingResponsible {
  id: number;
  name: string;
  functionLabel: string;
}

interface FindingPayload {
  certificateId: number;
  findingType: FleetFindingType;
  title: string;
  description: string;
  detectedOn: string;
  treatmentDelayDays?: number | null;
  treatmentDueOn?: string;
  responsiblePersonId?: number | null;
  responsibleName?: string;
}

function findingSortLabel(title: string): string {
  return title.replace(/^\s*\d+\s*[.)-]?\s*/, '').trim();
}

export function compareFleetFindingTitles(
  left: Pick<FleetCertificateFinding, 'title'>,
  right: Pick<FleetCertificateFinding, 'title'>,
): number {
  return findingSortLabel(left.title).localeCompare(findingSortLabel(right.title), 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

function findingDueYear(treatmentDueOn: string): number {
  const year = Number(treatmentDueOn.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : Number.MAX_SAFE_INTEGER;
}

export function compareFleetFindingsByDueYearAndTitle(
  left: Pick<FleetCertificateFinding, 'title' | 'treatmentDueOn'>,
  right: Pick<FleetCertificateFinding, 'title' | 'treatmentDueOn'>,
): number {
  const yearOrder = findingDueYear(left.treatmentDueOn) - findingDueYear(right.treatmentDueOn);
  return yearOrder || compareFleetFindingTitles(left, right);
}

function mapAttachment(row: Record<string, unknown>): FleetFindingAttachment {
  return {
    id: Number(row.id), findingId: Number(row.finding_id), kind: row.attachment_kind as FleetFindingAttachmentKind,
    originalFileName: String(row.original_file_name || ''), storageBucket: String(row.storage_bucket || FLEET_CERTIFICATE_BUCKET),
    storagePath: String(row.storage_path || ''), mimeType: String(row.mime_type || ''),
    fileSizeBytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes), caption: String(row.caption || ''),
    createdAt: String(row.created_at || ''),
  };
}

function mapEvent(row: Record<string, unknown>): FleetFindingEvent {
  const relation = Array.isArray(row.author) ? row.author[0] : row.author;
  const author = relation && typeof relation === 'object' ? relation as Record<string, unknown> : null;
  return {
    id: Number(row.id), findingId: Number(row.finding_id), eventType: String(row.event_type || ''),
    fromStatus: String(row.from_status || ''), toStatus: String(row.to_status || ''), note: String(row.note || ''),
    authorName: String(author?.display_name || author?.email || row.created_by_name || 'Système SeaPilot'),
    createdAt: String(row.created_at || ''),
  };
}

function mapFinding(row: Record<string, unknown>, attachments: FleetFindingAttachment[], events: FleetFindingEvent[]): FleetCertificateFinding {
  const id = Number(row.id);
  return {
    id, companyId: Number(row.company_id), certificateId: Number(row.certificate_id), reference: String(row.reference || ''),
    findingType: row.finding_type as FleetFindingType, title: String(row.title || ''), description: String(row.description || ''),
    detectedOn: String(row.detected_on || ''), treatmentDelayDays: row.treatment_delay_days == null ? null : Number(row.treatment_delay_days),
    treatmentDueOn: String(row.treatment_due_on || ''), status: row.status as FleetFindingStatus, progress: Number(row.progress || 0),
    responsiblePersonId: row.responsible_person_id == null ? null : Number(row.responsible_person_id),
    responsibleName: String(row.responsible_name || 'Non assigné'), closedAt: String(row.closed_at || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''), attachments: attachments.filter((item) => item.findingId === id),
    events: events.filter((item) => item.findingId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function fetchFleetCertificateFindings(client: SupabaseClient): Promise<FleetCertificateFinding[]> {
  const [findingsResult, attachmentsResult, eventsResult] = await Promise.all([
    client.from('fleet_certificate_findings').select('*'),
    client.from('fleet_certificate_finding_attachments').select('*'),
    client.from('fleet_certificate_finding_events').select('*, author:profiles!fleet_certificate_finding_events_created_by_fkey(display_name, email)'),
  ]);
  if (findingsResult.error) throw findingsResult.error;
  if (attachmentsResult.error) throw attachmentsResult.error;
  if (eventsResult.error) throw eventsResult.error;
  const attachments = ((attachmentsResult.data || []) as Record<string, unknown>[]).map(mapAttachment);
  const events = ((eventsResult.data || []) as Record<string, unknown>[]).map(mapEvent);
  return ((findingsResult.data || []) as Record<string, unknown>[])
    .map((row) => mapFinding(row, attachments, events))
    .sort(compareFleetFindingsByDueYearAndTitle);
}

export async function fetchFleetFindingResponsibles(client: SupabaseClient): Promise<FleetFindingResponsible[]> {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  const { data, error } = await client.from('people').select('id, first_name, last_name, function_label, departed_on, active').eq('active', true);
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[])
    .filter((row) => {
      const departedOn = String(row.departed_on || '').slice(0, 10);
      return row.active !== false && (!departedOn || departedOn >= today);
    })
    .map((row) => ({
      id: Number(row.id), name: `${String(row.first_name || '')} ${String(row.last_name || '')}`.trim(),
      functionLabel: String(row.function_label || ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function createFleetCertificateFinding(client: SupabaseClient, companyId: number, payload: FindingPayload): Promise<number> {
  const { data, error } = await client.from('fleet_certificate_findings').insert({
    company_id: companyId, certificate_id: payload.certificateId, reference: '', finding_type: payload.findingType,
    title: payload.title.trim(), description: payload.description.trim(), detected_on: payload.detectedOn,
    treatment_delay_days: payload.treatmentDelayDays ?? null, treatment_due_on: payload.treatmentDueOn || null,
    responsible_person_id: payload.responsiblePersonId ?? null, responsible_name: payload.responsibleName || '',
    status: payload.responsiblePersonId ? 'assigned' : 'declared', progress: 0,
  }).select('id').single();
  if (error) throw error;
  return Number((data as { id: number }).id);
}

export async function updateFleetCertificateFinding(
  client: SupabaseClient,
  findingId: number,
  values: Partial<{
    status: FleetFindingStatus;
    progress: number;
    responsiblePersonId: number | null;
    responsibleName: string;
    treatmentDueOn: string;
    findingType: FleetFindingType;
    title: string;
    description: string;
  }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (values.status !== undefined) payload.status = values.status;
  if (values.progress !== undefined) payload.progress = values.progress;
  if (values.responsiblePersonId !== undefined) payload.responsible_person_id = values.responsiblePersonId;
  if (values.responsibleName !== undefined) payload.responsible_name = values.responsibleName;
  if (values.treatmentDueOn !== undefined) payload.treatment_due_on = values.treatmentDueOn || null;
  if (values.findingType !== undefined) payload.finding_type = values.findingType;
  if (values.title !== undefined) payload.title = values.title.trim();
  if (values.description !== undefined) payload.description = values.description.trim();
  const { error } = await client.from('fleet_certificate_findings').update(payload).eq('id', findingId);
  if (error) throw error;
}

export async function saveFleetFindingFollowup(
  client: SupabaseClient,
  findingId: number,
  progress: number,
  note: string,
): Promise<void> {
  const { error } = await client.rpc('save_fleet_certificate_finding_followup', {
    p_finding_id: findingId,
    p_progress: progress,
    p_note: note.trim() || null,
  });
  if (error) throw error;
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 120);
}

export async function uploadFleetFindingAttachment(
  client: SupabaseClient,
  finding: FleetCertificateFinding,
  vesselAcronym: string,
  kind: FleetFindingAttachmentKind,
  file: File,
): Promise<void> {
  const path = `${finding.companyId}/${vesselAcronym || 'NAV'}/findings/${finding.id}/${kind}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await client.storage.from(FLEET_CERTIFICATE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await client.from('fleet_certificate_finding_attachments').insert({
    company_id: finding.companyId, finding_id: finding.id, attachment_kind: kind, original_file_name: file.name,
    storage_bucket: FLEET_CERTIFICATE_BUCKET, storage_path: path, mime_type: file.type || null, file_size_bytes: file.size,
  });
  if (error) {
    await client.storage.from(FLEET_CERTIFICATE_BUCKET).remove([path]);
    throw error;
  }
}

export async function openFleetFindingAttachment(client: SupabaseClient, attachment: FleetFindingAttachment): Promise<void> {
  if (attachment.storagePath.startsWith('demo/')) {
    window.open(`/demo/${attachment.storagePath.split('/').pop()}`, '_blank', 'noopener,noreferrer');
    return;
  }
  const { data, error } = await client.storage.from(attachment.storageBucket).createSignedUrl(attachment.storagePath, 300);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

export async function deleteFleetCertificateFinding(client: SupabaseClient, findingId: number): Promise<void> {
  const { data, error } = await client.rpc('delete_fleet_certificate_findings', { p_finding_ids: [findingId] });
  if (error) throw error;
  const paths = ((data || []) as Array<{ storage_bucket: string; storage_path: string }>);
  await Promise.all(paths.map((item) => client.storage.from(item.storage_bucket).remove([item.storage_path])));
}

export const FLEET_FINDING_LABELS: Record<FleetFindingType, string> = {
  major_non_conformity: 'Non-conformité majeure', minor_non_conformity: 'Non-conformité mineure',
  class_condition: 'Condition de Classe', remark: 'Remarque', prescription: 'Prescription', finding: 'Findings',
};

export const FLEET_FINDING_STATUS_LABELS: Record<FleetFindingStatus, string> = {
  declared: 'À affecter', assigned: 'Assigné', in_progress: 'En cours', pending_validation: 'À valider', closed: 'Clôturé',
};
