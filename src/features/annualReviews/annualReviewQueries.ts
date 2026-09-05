import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnnualReviewAnswers } from './annualReviewQuestionnaire';
import { emptyAnnualReviewAnswers } from './annualReviewQuestionnaire';
import { sha256Hex } from '../workingTime/workingTimeSignatureQueries';

export const ANNUAL_REVIEW_REPORT_BUCKET = 'annual-review-reports';

export type AnnualReviewStatus =
  | 'invitation_pending'
  | 'counter_proposed'
  | 'scheduled'
  | 'collaborator_submitted'
  | 'awaiting_signature'
  | 'archived';

export interface AnnualReviewPerson {
  id: number;
  firstName: string;
  lastName: string;
  functionLabel: string;
  active: boolean;
  userId: string;
}

export interface AnnualReviewSignatureSnapshot {
  signer_name?: string;
  signed_at?: string;
  storage_bucket?: string;
  storage_path?: string;
  mime_type?: string;
  [key: string]: unknown;
}

export interface AnnualReviewRecord {
  id: number;
  companyId: number;
  reviewYear: number;
  employeePersonId: number;
  managerPersonId: number;
  employeeName: string;
  managerName: string;
  employeeFunction: string;
  status: AnnualReviewStatus;
  startsAt: string;
  endsAt: string;
  meetingMode: 'in_person' | 'video';
  meetingLocation: string;
  videoUrl: string;
  proposalNote: string;
  proposedByPersonId: number;
  collaboratorSubmittedAt: string;
  managerValidatedAt: string;
  collaboratorSignedAt: string;
  managerIdentitySnapshot: Record<string, unknown>;
  managerSignatureSnapshot: AnnualReviewSignatureSnapshot;
  collaboratorIdentitySnapshot: Record<string, unknown>;
  collaboratorSignatureSnapshot: AnnualReviewSignatureSnapshot;
  managerReportBucket: string;
  managerReportPath: string;
  managerReportFileName: string;
  finalReportBucket: string;
  finalReportPath: string;
  finalReportFileName: string;
  hrDocumentId: number | null;
}

export interface AnnualReviewResponseRecord {
  id: number;
  reviewId: number;
  respondentPersonId: number;
  respondentRole: 'manager' | 'collaborator';
  answers: AnnualReviewAnswers;
  shareWithManager: boolean | null;
  submittedAt: string;
}

export interface AnnualReviewNotification {
  reviewId: number;
  kind: 'invitation' | 'counter_proposal' | 'signature';
  title: string;
  detail: string;
  startsAt: string;
}

interface ReviewRow {
  id: number | string;
  company_id: number | string;
  review_year: number | string;
  employee_person_id: number | string;
  manager_person_id: number | string;
  employee_name_snapshot: string;
  employee_function_snapshot: string;
  manager_name_snapshot: string;
  status: AnnualReviewStatus;
  starts_at: string;
  ends_at: string;
  meeting_mode: 'in_person' | 'video';
  meeting_location: string | null;
  video_url: string | null;
  proposal_note: string | null;
  proposed_by_person_id: number | string;
  collaborator_submitted_at: string | null;
  manager_validated_at: string | null;
  collaborator_signed_at: string | null;
  manager_identity_snapshot: Record<string, unknown> | null;
  manager_signature_snapshot: AnnualReviewSignatureSnapshot | null;
  collaborator_identity_snapshot: Record<string, unknown> | null;
  collaborator_signature_snapshot: AnnualReviewSignatureSnapshot | null;
  manager_report_bucket: string | null;
  manager_report_path: string | null;
  manager_report_file_name: string | null;
  final_report_bucket: string | null;
  final_report_path: string | null;
  final_report_file_name: string | null;
  hr_document_id: number | string | null;
}

interface ResponseRow {
  id: number | string;
  review_id: number | string;
  respondent_person_id: number | string;
  respondent_role: 'manager' | 'collaborator';
  answers: AnnualReviewAnswers | null;
  share_with_manager: boolean | null;
  submitted_at: string | null;
}

const REVIEW_SELECT = [
  'id,company_id,review_year,employee_person_id,manager_person_id,employee_name_snapshot,employee_function_snapshot,manager_name_snapshot,status,starts_at,ends_at',
  'meeting_mode,meeting_location,video_url,proposal_note,proposed_by_person_id',
  'collaborator_submitted_at,manager_validated_at,collaborator_signed_at',
  'manager_identity_snapshot,manager_signature_snapshot,collaborator_identity_snapshot,collaborator_signature_snapshot',
  'manager_report_bucket,manager_report_path,manager_report_file_name',
  'final_report_bucket,final_report_path,final_report_file_name,hr_document_id',
].join(',');

function mapReview(row: ReviewRow): AnnualReviewRecord {
  return {
    id: Number(row.id), companyId: Number(row.company_id), reviewYear: Number(row.review_year),
    employeePersonId: Number(row.employee_person_id), managerPersonId: Number(row.manager_person_id),
    employeeName: row.employee_name_snapshot, managerName: row.manager_name_snapshot,
    employeeFunction: row.employee_function_snapshot, status: row.status,
    startsAt: row.starts_at, endsAt: row.ends_at, meetingMode: row.meeting_mode,
    meetingLocation: row.meeting_location || '', videoUrl: row.video_url || '', proposalNote: row.proposal_note || '',
    proposedByPersonId: Number(row.proposed_by_person_id), collaboratorSubmittedAt: row.collaborator_submitted_at || '',
    managerValidatedAt: row.manager_validated_at || '', collaboratorSignedAt: row.collaborator_signed_at || '',
    managerIdentitySnapshot: row.manager_identity_snapshot || {}, managerSignatureSnapshot: row.manager_signature_snapshot || {},
    collaboratorIdentitySnapshot: row.collaborator_identity_snapshot || {}, collaboratorSignatureSnapshot: row.collaborator_signature_snapshot || {},
    managerReportBucket: row.manager_report_bucket || '', managerReportPath: row.manager_report_path || '',
    managerReportFileName: row.manager_report_file_name || '', finalReportBucket: row.final_report_bucket || '',
    finalReportPath: row.final_report_path || '', finalReportFileName: row.final_report_file_name || '',
    hrDocumentId: row.hr_document_id === null ? null : Number(row.hr_document_id),
  };
}

function mapResponse(row: ResponseRow): AnnualReviewResponseRecord {
  return {
    id: Number(row.id), reviewId: Number(row.review_id), respondentPersonId: Number(row.respondent_person_id),
    respondentRole: row.respondent_role, answers: row.answers || emptyAnnualReviewAnswers(),
    shareWithManager: row.share_with_manager, submittedAt: row.submitted_at || '',
  };
}

function assertResult(error: { message?: string } | null, fallback: string): void {
  if (!error) return;
  const message = error.message || fallback;
  if (message.includes('ALREADY_EXISTS')) throw new Error('Un entretien existe déjà pour ce collaborateur et cette année.');
  if (message.includes('SIGNATURE_REQUIRED')) throw new Error('Une signature active doit être enregistrée dans le dossier RH avant de continuer.');
  if (message.includes('SHARING_DECISION_REQUIRED')) throw new Error('Choisissez si vos réponses peuvent être partagées avec le manager.');
  if (message.includes('ANSWERS_INCOMPLETE')) throw new Error('Toutes les réponses obligatoires doivent être renseignées avant la remise.');
  if (message.includes('RESPONSE_LOCKED')) throw new Error('Vos réponses et votre choix de confidentialité sont figés depuis leur remise.');
  if (message.includes('CAPTAIN_SCOPE')) throw new Error('Ce collaborateur ne relève pas de votre équipage à la date proposée.');
  if (message.includes('ROLE_REQUIRED') || message.includes('SCOPE_DENIED') || message.includes('FORBIDDEN')) {
    throw new Error('Vous n’êtes pas autorisé à effectuer cette action.');
  }
  throw new Error(message);
}

export function formatAnnualReviewDateTime(value: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export async function fetchAnnualReviewPeople(client: SupabaseClient): Promise<AnnualReviewPerson[]> {
  const { data, error } = await client.from('people')
    .select('id,first_name,last_name,function_label,active,user_id')
    .eq('active', true).not('user_id', 'is', null)
    .order('last_name', { ascending: true }).order('first_name', { ascending: true });
  assertResult(error, 'Impossible de charger les collaborateurs actifs.');
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id), firstName: String(row.first_name || ''), lastName: String(row.last_name || ''),
    functionLabel: String(row.function_label || ''), active: Boolean(row.active), userId: String(row.user_id || ''),
  }));
}

export async function fetchAnnualReviews(client: SupabaseClient): Promise<AnnualReviewRecord[]> {
  const { data, error } = await client.from('annual_reviews').select(REVIEW_SELECT).order('starts_at', { ascending: false });
  assertResult(error, 'Impossible de charger les entretiens.');
  return ((data || []) as unknown as ReviewRow[]).map(mapReview);
}

export async function fetchAnnualReview(client: SupabaseClient, reviewId: number): Promise<AnnualReviewRecord> {
  const { data, error } = await client.from('annual_reviews').select(REVIEW_SELECT).eq('id', reviewId).single();
  assertResult(error, 'Impossible de charger cet entretien.');
  if (!data) throw new Error('Entretien introuvable.');
  return mapReview(data as unknown as ReviewRow);
}

export async function fetchAnnualReviewResponses(client: SupabaseClient, reviewId: number): Promise<AnnualReviewResponseRecord[]> {
  const { data, error } = await client.from('annual_review_responses')
    .select('id,review_id,respondent_person_id,respondent_role,answers,share_with_manager,submitted_at')
    .eq('review_id', reviewId);
  assertResult(error, 'Impossible de charger les réponses.');
  return ((data || []) as unknown as ResponseRow[]).map(mapResponse);
}

export async function createAnnualReviewInvitation(client: SupabaseClient, input: {
  employeePersonId: number; reviewYear: number; startsAt: string; endsAt: string;
  meetingMode: 'in_person' | 'video'; meetingLocation: string; videoUrl: string; proposalNote: string;
}): Promise<number> {
  const { data, error } = await client.rpc('annual_review_create_invitation', {
    p_employee_person_id: input.employeePersonId, p_review_year: input.reviewYear,
    p_starts_at: input.startsAt, p_ends_at: input.endsAt, p_meeting_mode: input.meetingMode,
    p_meeting_location: input.meetingLocation || null, p_video_url: input.videoUrl || null,
    p_proposal_note: input.proposalNote || null,
  });
  assertResult(error, 'Impossible d’envoyer l’invitation.');
  return Number(data);
}

async function callReviewRpc(client: SupabaseClient, name: string, args: Record<string, unknown>, fallback: string): Promise<number> {
  const { data, error } = await client.rpc(name, args);
  assertResult(error, fallback);
  return Number(data);
}

export const acceptAnnualReviewInvitation = (client: SupabaseClient, reviewId: number) =>
  callReviewRpc(client, 'annual_review_accept_invitation', { p_review_id: reviewId }, 'Impossible d’accepter l’invitation.');

export const counterProposeAnnualReview = (client: SupabaseClient, reviewId: number, startsAt: string, endsAt: string, note: string) =>
  callReviewRpc(client, 'annual_review_counter_propose', { p_review_id: reviewId, p_starts_at: startsAt, p_ends_at: endsAt, p_proposal_note: note || null }, 'Impossible de proposer ce créneau.');

export const managerScheduleAnnualReview = (client: SupabaseClient, reviewId: number, accept: boolean, startsAt?: string, endsAt?: string, note?: string) =>
  callReviewRpc(client, 'annual_review_manager_schedule', { p_review_id: reviewId, p_accept: accept, p_starts_at: startsAt || null, p_ends_at: endsAt || null, p_proposal_note: note || null }, 'Impossible de traiter cette proposition.');

export const saveAnnualReviewResponse = (client: SupabaseClient, reviewId: number, answers: AnnualReviewAnswers, submit: boolean, shareWithManager: boolean | null) =>
  callReviewRpc(client, 'annual_review_save_response', { p_review_id: reviewId, p_answers: answers, p_submit: submit, p_share_with_manager: shareWithManager }, 'Impossible d’enregistrer les réponses.');

export async function uploadAnnualReviewReport(client: SupabaseClient, review: AnnualReviewRecord, stage: 'manager' | 'final', fileName: string, pdf: Blob): Promise<{ path: string; sha256: string }> {
  if (pdf.type !== 'application/pdf' || pdf.size < 1 || pdf.size > 10_485_760) throw new Error('Le rapport PDF est invalide ou dépasse 10 Mo.');
  const safeName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^A-Za-z0-9._-]+/gu, '-');
  const path = `${review.companyId}/${review.id}/${stage}/${crypto.randomUUID()}-${safeName}`;
  const sha256 = await sha256Hex(pdf);
  const { error } = await client.storage.from(ANNUAL_REVIEW_REPORT_BUCKET).upload(path, pdf, {
    contentType: 'application/pdf', cacheControl: '3600', upsert: false,
  });
  assertResult(error, 'Impossible de déposer le rapport PDF.');
  return { path, sha256 };
}

export async function validateAnnualReviewManagerReport(client: SupabaseClient, reviewId: number, path: string, fileName: string, pdf: Blob, sha256: string): Promise<number> {
  const { data, error } = await client.rpc('annual_review_validate_manager_report', {
    p_review_id: reviewId, p_storage_path: path, p_file_name: fileName,
    p_file_size_bytes: pdf.size, p_sha256: sha256,
  });
  if (error) await client.storage.from(ANNUAL_REVIEW_REPORT_BUCKET).remove([path]);
  assertResult(error, 'Impossible de valider le rapport du manager.');
  return Number(data);
}

export async function signAndArchiveAnnualReview(client: SupabaseClient, reviewId: number, path: string, fileName: string, pdf: Blob, sha256: string): Promise<number> {
  const { data, error } = await client.rpc('annual_review_sign_and_archive', {
    p_review_id: reviewId, p_storage_path: path, p_file_name: fileName,
    p_file_size_bytes: pdf.size, p_sha256: sha256,
  });
  if (error) await client.storage.from(ANNUAL_REVIEW_REPORT_BUCKET).remove([path]);
  assertResult(error, 'Impossible de signer et d’archiver le rapport.');
  return Number(data);
}

export async function createAnnualReviewReportUrl(client: SupabaseClient, review: AnnualReviewRecord, final = false): Promise<string> {
  const bucket = final ? review.finalReportBucket : review.managerReportBucket;
  const path = final ? review.finalReportPath : review.managerReportPath;
  if (!bucket || !path) throw new Error('Aucun rapport n’est disponible.');
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 600);
  assertResult(error, 'Impossible d’ouvrir le rapport.');
  return data?.signedUrl || '';
}

export async function fetchAnnualReviewNotifications(client: SupabaseClient, currentPersonId: number): Promise<AnnualReviewNotification[]> {
  const reviews = await fetchAnnualReviews(client);
  return reviews.flatMap((review): AnnualReviewNotification[] => {
    if (review.employeePersonId === currentPersonId && review.status === 'invitation_pending') return [{
      reviewId: review.id, kind: 'invitation', title: 'Invitation à votre entretien',
      detail: `${review.managerName} propose le ${formatAnnualReviewDateTime(review.startsAt)}`, startsAt: review.startsAt,
    }];
    if (review.managerPersonId === currentPersonId && review.status === 'counter_proposed') return [{
      reviewId: review.id, kind: 'counter_proposal', title: 'Nouveau créneau proposé',
      detail: `${review.employeeName} propose le ${formatAnnualReviewDateTime(review.startsAt)}`, startsAt: review.startsAt,
    }];
    if (review.employeePersonId === currentPersonId && review.status === 'awaiting_signature') return [{
      reviewId: review.id, kind: 'signature', title: 'Rapport à lire et signer',
      detail: `${review.managerName} a validé votre entretien`, startsAt: review.startsAt,
    }];
    return [];
  });
}

export function notifyAnnualReviewChanged(): void {
  window.dispatchEvent(new Event('annual-reviews:changed'));
}
