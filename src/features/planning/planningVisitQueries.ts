import type { SupabaseClient } from '@supabase/supabase-js';
import { planningDateFromTimestamp, planningLocalDateTimeToUtc } from './planningDates';
import { planningErrorMessage, throwPlanningDataError } from './planningErrors';
import { planningEntityId } from './planningValidation';

export const PLANNING_VISIT_TYPES = [
  'water_analysis',
  'client_audit',
  'imca_audit',
  'internal_audit',
  'anfr_visit',
  'annual_maritime_affairs',
  'annual_classification_society',
  'davits_visit',
  'crane_visit',
  'fire_visit',
  'qhse_visit',
] as const;

export type PlanningVisitType = typeof PLANNING_VISIT_TYPES[number];

const VISIT_TYPE_LABELS: Record<PlanningVisitType, string> = {
  water_analysis: 'Analyse d’Eau',
  client_audit: 'Audit Client',
  imca_audit: 'Audit IMCA',
  internal_audit: 'Audit Interne',
  anfr_visit: 'Visite ANFR',
  annual_maritime_affairs: 'Visite annuelle - Affaires Maritimes',
  annual_classification_society: 'Visite annuelle - Société de Classification',
  davits_visit: 'Visite Bossoir',
  crane_visit: 'Visite Grue',
  fire_visit: 'Visite Incendie',
  qhse_visit: 'Visite QHSE',
};

export interface PlanningServiceProvider {
  id: number;
  name: string;
  category: string;
  serviceType: string;
  activity: string;
  address: string;
  city: string;
  phone: string;
  companyEmail: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
}

export interface PlanningVisitAttachment {
  id: number;
  bucketName: string;
  objectPath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number | null;
}

export interface PlanningVisitOccurrence {
  id: number;
  scheduledAt: string;
  scheduledOn: string;
}

export interface PlanningVesselVisit {
  id: number;
  vesselId: number;
  visitType: PlanningVisitType;
  providerId: number;
  provider: PlanningServiceProvider;
  comments: string;
  occurrences: PlanningVisitOccurrence[];
  attachments: PlanningVisitAttachment[];
  createdAt: string;
  updatedAt: string;
}

interface ProviderRow {
  id: number;
  name: string;
  category: string | null;
  service_type: string | null;
  activity: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  company_email: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contact_email: string | null;
}

interface VisitRow {
  id: number;
  vessel_id: number;
  visit_type: PlanningVisitType;
  provider_id: number;
  comments: string | null;
  created_at: string;
  updated_at: string;
  provider: ProviderRow | ProviderRow[];
  occurrences: Array<{ id: number; scheduled_at: string }>;
  attachments: Array<{
    id: number;
    bucket_name: string;
    object_path: string;
    original_file_name: string;
    mime_type: string | null;
    file_size: number | null;
  }>;
}

export interface SavePlanningVisitInput {
  id?: number;
  vesselId: number;
  visitType: PlanningVisitType;
  providerId: number;
  comments: string;
  scheduledAt: string[];
}

function mapProvider(row: ProviderRow): PlanningServiceProvider {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '',
    serviceType: row.service_type || '',
    activity: row.activity || '',
    address: row.address || '',
    city: row.city || '',
    phone: row.phone || '',
    companyEmail: row.company_email || '',
    contactName: row.contact_name || '',
    contactRole: row.contact_role || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
  };
}

export function planningVisitTypeLabel(type: PlanningVisitType): string {
  return VISIT_TYPE_LABELS[type];
}

export function mapPlanningVisitRows(rows: VisitRow[]): PlanningVesselVisit[] {
  return rows.map((row) => {
    const providerRow = Array.isArray(row.provider) ? row.provider[0] : row.provider;
    return {
      id: row.id,
      vesselId: row.vessel_id,
      visitType: row.visit_type,
      providerId: row.provider_id,
      provider: mapProvider(providerRow),
      comments: row.comments || '',
      occurrences: [...(row.occurrences || [])]
        .sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at))
        .map((occurrence) => ({
          id: occurrence.id,
          scheduledAt: occurrence.scheduled_at,
          scheduledOn: planningDateFromTimestamp(occurrence.scheduled_at),
        })),
      attachments: (row.attachments || []).map((attachment) => ({
        id: attachment.id,
        bucketName: attachment.bucket_name,
        objectPath: attachment.object_path,
        originalFileName: attachment.original_file_name,
        mimeType: attachment.mime_type || '',
        fileSize: attachment.file_size,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function fetchPlanningServiceProviders(client: SupabaseClient): Promise<PlanningServiceProvider[]> {
  const { data, error } = await client
    .from('service_providers')
    .select('id, name, category, service_type, activity, address, city, phone, company_email, contact_name, contact_role, contact_phone, contact_email')
    .eq('active', true)
    .order('name');
  if (error) throwPlanningDataError('load-service-providers', 'Impossible de charger les prestataires.', error);
  return ((data || []) as ProviderRow[]).map(mapProvider);
}

export async function fetchPlanningVesselVisits(client: SupabaseClient): Promise<PlanningVesselVisit[]> {
  const { data, error } = await client
    .from('vessel_visits')
    .select(`
      id, vessel_id, visit_type, provider_id, comments, created_at, updated_at,
      provider:service_providers!vessel_visits_provider_id_fkey(
        id, name, category, service_type, activity, address, city, phone,
        company_email, contact_name, contact_role, contact_phone, contact_email
      ),
      occurrences:vessel_visit_occurrences(id, scheduled_at),
      attachments:vessel_visit_attachments(id, bucket_name, object_path, original_file_name, mime_type, file_size)
    `)
    .order('created_at', { ascending: false });
  if (error) throwPlanningDataError('load-vessel-visits', 'Impossible de charger les visites et audits.', error);
  return mapPlanningVisitRows((data || []) as unknown as VisitRow[]);
}

export async function savePlanningVesselVisit(client: SupabaseClient, input: SavePlanningVisitInput): Promise<number> {
  if (!PLANNING_VISIT_TYPES.includes(input.visitType)) throw new Error('Le type de visite est invalide.');
  if (!input.scheduledAt.length) throw new Error('Ajoutez au moins une date de visite.');
  if (input.scheduledAt.length > 10) throw new Error('Une demande ne peut pas contenir plus de 10 visites.');
  if (new Set(input.scheduledAt).size !== input.scheduledAt.length) throw new Error('Une même date et heure ne peut être ajoutée deux fois.');
  if (input.comments.trim().length > 2000) throw new Error('Les commentaires ne peuvent pas dépasser 2 000 caractères.');

  const { data, error } = await client.rpc('save_vessel_visit', {
    p_visit_id: input.id || null,
    p_vessel_id: planningEntityId(input.vesselId, 'Le navire'),
    p_visit_type: input.visitType,
    p_provider_id: planningEntityId(input.providerId, 'Le prestataire'),
    p_comments: input.comments.trim(),
    p_scheduled_at: input.scheduledAt.map(planningLocalDateTimeToUtc),
  });
  if (error) throwPlanningDataError('save-vessel-visit', 'Impossible d’enregistrer la visite ou l’audit.', error);
  return planningEntityId(Number(data), 'La visite');
}

function safeObjectName(fileName: string): string {
  const normalized = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120) || 'piece-jointe';
}

export async function uploadPlanningVisitAttachments(
  client: SupabaseClient,
  visitId: number,
  files: readonly File[],
): Promise<void> {
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} dépasse la limite de 20 Mo.`);
    const objectPath = `${visitId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;
    const { error: uploadError } = await client.storage.from('vessel-visits').upload(objectPath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (uploadError) throw new Error(planningErrorMessage(uploadError, `Impossible d’envoyer ${file.name}.`));

    const { error: metadataError } = await client.from('vessel_visit_attachments').insert({
      visit_id: visitId,
      bucket_name: 'vessel-visits',
      object_path: objectPath,
      original_file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
    });
    if (metadataError) {
      await client.storage.from('vessel-visits').remove([objectPath]);
      throwPlanningDataError('save-vessel-visit-attachment', `Impossible d’enregistrer ${file.name}.`, metadataError);
    }
  }
}

export async function createPlanningVisitAttachmentUrl(
  client: SupabaseClient,
  attachment: PlanningVisitAttachment,
): Promise<string> {
  const { data, error } = await client.storage.from(attachment.bucketName).createSignedUrl(attachment.objectPath, 300);
  if (error || !data?.signedUrl) {
    throw new Error(planningErrorMessage(error, 'Impossible d’ouvrir la pièce jointe.'));
  }
  return data.signedUrl;
}

export async function deletePlanningVesselVisit(client: SupabaseClient, visit: PlanningVesselVisit): Promise<number> {
  if (visit.attachments.length) {
    const byBucket = new Map<string, string[]>();
    visit.attachments.forEach((attachment) => {
      byBucket.set(attachment.bucketName, [...(byBucket.get(attachment.bucketName) || []), attachment.objectPath]);
    });
    for (const [bucket, paths] of byBucket) {
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw new Error(planningErrorMessage(error, 'Impossible de supprimer les pièces jointes.'));
    }
  }
  const { data, error } = await client.rpc('delete_vessel_visit', { p_visit_id: visit.id });
  if (error) throwPlanningDataError('delete-vessel-visit', 'Impossible de supprimer la visite ou l’audit.', error);
  return planningEntityId(Number(data), 'La visite');
}
