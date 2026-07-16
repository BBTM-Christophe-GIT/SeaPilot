import type { SupabaseClient } from '@supabase/supabase-js';
import { planningDateFromTimestamp, planningLocalDateTimeToUtc } from './planningDates';
import { throwPlanningDataError } from './planningErrors';
import { fetchPlanningManningMatrices } from './planningP11Queries';
import type {
  PlanningAbsenceRecord,
  PlanningAbsenceType,
  PlanningConflictCaseHistoryRecord,
  PlanningConflictCaseRecord,
  PlanningConflictPriority,
  PlanningConflictStatus,
  PlanningDetectedConflict,
  PlanningP12Data,
} from './planningP12';
import { assertPlanningDateTimeRange, planningEntityId } from './planningValidation';

const ABSENCE_SELECT = 'id, person_id, absence_type, starts_at, ends_at, reason, status, requested_by, reviewed_by, reviewed_at, review_comment, created_at, updated_at';
const CONFLICT_CASE_SELECT = 'id, conflict_key, conflict_type, severity, title, description, person_id, vessel_id, assignment_id, project_id, handover_id, absence_id, starts_on, ends_on, owner_id, owner_name, priority, status, last_comment, derogation_id, first_seen_at, last_seen_at, resolved_at, updated_at';
const CONFLICT_HISTORY_SELECT = 'id, case_id, action, comment, payload, changed_by, changed_by_name, changed_at';

interface AbsenceRow {
  id: number;
  person_id: number;
  absence_type: PlanningAbsenceRecord['absenceType'];
  starts_at: string;
  ends_at: string;
  reason: string;
  status: PlanningAbsenceRecord['status'];
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
}

interface ConflictCaseRow {
  id: number;
  conflict_key: string;
  conflict_type: PlanningConflictCaseRecord['conflictType'];
  severity: PlanningConflictCaseRecord['severity'];
  title: string;
  description: string;
  person_id: number | null;
  vessel_id: number | null;
  assignment_id: number | null;
  project_id: number | null;
  handover_id: number | null;
  absence_id: number | null;
  starts_on: string;
  ends_on: string;
  owner_id: string | null;
  owner_name: string | null;
  priority: PlanningConflictPriority;
  status: PlanningConflictStatus;
  last_comment: string | null;
  derogation_id: number | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  updated_at: string;
}

interface ConflictHistoryRow {
  id: number;
  case_id: number;
  action: string;
  comment: string | null;
  payload: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_name: string;
  changed_at: string;
}

export interface SavePlanningAbsenceInput {
  id?: number;
  personId: number;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  reason: string;
}

export type ReviewPlanningAbsenceAction = 'approve' | 'reject' | 'cancel';

export interface UpdatePlanningConflictCaseInput {
  caseId: number;
  assignToMe: boolean;
  priority: PlanningConflictPriority;
  status: PlanningConflictStatus;
  comment: string;
  derogationId: number | null;
}

function planningExclusiveEndDate(value: string): string {
  const instant = Date.parse(value);
  return planningDateFromTimestamp(new Date(instant - 1).toISOString());
}

export function mapPlanningAbsenceRows(rows: AbsenceRow[]): PlanningAbsenceRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    absenceType: row.absence_type,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    startsOn: planningDateFromTimestamp(row.starts_at),
    endsOn: planningExclusiveEndDate(row.ends_at),
    reason: row.reason,
    status: row.status,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at || '',
    reviewComment: row.review_comment || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchPlanningAbsences(client: SupabaseClient): Promise<PlanningAbsenceRecord[]> {
  const { data, error } = await client
    .from('planning_absences')
    .select(ABSENCE_SELECT)
    .order('starts_at', { ascending: false });
  if (error) throwPlanningDataError('load-planning-absences', 'Impossible de charger les demandes de congés.', error);
  return mapPlanningAbsenceRows((data || []) as AbsenceRow[]);
}

export function mapPlanningConflictCaseRows(rows: ConflictCaseRow[]): PlanningConflictCaseRecord[] {
  return rows.map((row) => ({
    id: row.id,
    conflictKey: row.conflict_key,
    conflictType: row.conflict_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    personId: row.person_id,
    vesselId: row.vessel_id,
    assignmentId: row.assignment_id,
    projectId: row.project_id,
    handoverId: row.handover_id,
    absenceId: row.absence_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    ownerId: row.owner_id || '',
    ownerName: row.owner_name || '',
    priority: row.priority,
    status: row.status,
    lastComment: row.last_comment || '',
    derogationId: row.derogation_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at || '',
    updatedAt: row.updated_at,
  }));
}

export function mapPlanningConflictHistoryRows(rows: ConflictHistoryRow[]): PlanningConflictCaseHistoryRecord[] {
  return rows.map((row) => ({
    id: row.id,
    caseId: row.case_id,
    action: row.action,
    comment: row.comment || '',
    payload: row.payload || {},
    changedBy: row.changed_by || '',
    changedByName: row.changed_by_name,
    changedAt: row.changed_at,
  }));
}

export async function fetchPlanningP12Data(client: SupabaseClient): Promise<PlanningP12Data> {
  const [absencesResult, casesResult, historyResult, matrices] = await Promise.all([
    client.from('planning_absences').select(ABSENCE_SELECT).order('starts_at', { ascending: false }),
    client.from('planning_conflict_cases').select(CONFLICT_CASE_SELECT).order('last_seen_at', { ascending: false }),
    client.from('planning_conflict_case_history').select(CONFLICT_HISTORY_SELECT).order('changed_at', { ascending: false }),
    fetchPlanningManningMatrices(client),
  ]);
  const failed = [absencesResult, casesResult, historyResult].find((result) => result.error);
  if (failed?.error) throwPlanningDataError('load-planning-p12', 'Impossible de charger les absences et conflits.', failed.error);
  return {
    absences: mapPlanningAbsenceRows((absencesResult.data || []) as AbsenceRow[]),
    conflictCases: mapPlanningConflictCaseRows((casesResult.data || []) as ConflictCaseRow[]),
    conflictHistory: mapPlanningConflictHistoryRows((historyResult.data || []) as ConflictHistoryRow[]),
    matrices,
  };
}

async function callRpc<T>(
  client: SupabaseClient,
  operation: string,
  fallback: string,
  name: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throwPlanningDataError(operation, fallback, error);
  return data as T;
}

export function savePlanningAbsence(client: SupabaseClient, input: SavePlanningAbsenceInput): Promise<number> {
  assertPlanningDateTimeRange(input.startsAt, input.endsAt);
  const reason = input.reason.trim();
  if (reason.length > 1000) throw new Error('Le motif ne peut pas dépasser 1 000 caractères.');
  return callRpc(client, 'save-absence', 'Impossible d’enregistrer la demande d’absence.', 'save_planning_absence', {
    p_absence_id: input.id || null,
    p_person_id: planningEntityId(input.personId, 'Le marin'),
    p_absence_type: input.absenceType,
    p_starts_at: planningLocalDateTimeToUtc(input.startsAt),
    p_ends_at: planningLocalDateTimeToUtc(input.endsAt),
    p_reason: reason,
  });
}

export function reviewPlanningAbsence(
  client: SupabaseClient,
  absenceId: number,
  action: ReviewPlanningAbsenceAction,
  comment: string,
): Promise<number> {
  const normalizedComment = comment.trim();
  if (action !== 'approve' && normalizedComment.length < 3) {
    throw new Error('Un commentaire d’au moins 3 caractères est obligatoire pour refuser ou annuler.');
  }
  return callRpc(client, 'review-absence', 'Impossible de mettre à jour la demande d’absence.', 'review_planning_absence', {
    p_absence_id: planningEntityId(absenceId, 'La demande'),
    p_action: action,
    p_comment: normalizedComment || null,
  });
}

export function deletePlanningLeave(client: SupabaseClient, absenceId: number): Promise<number> {
  return callRpc(client, 'delete-leave', 'Impossible de supprimer les congés.', 'delete_planning_leave', {
    p_absence_id: planningEntityId(absenceId, 'La demande de congés'),
  });
}

export function ensurePlanningConflictCase(client: SupabaseClient, detected: PlanningDetectedConflict): Promise<number> {
  return callRpc(client, 'ensure-conflict-case', 'Impossible d’ouvrir le dossier de conflit.', 'ensure_planning_conflict_case', {
    p_conflict_key: detected.key,
    p_conflict_type: detected.type,
    p_severity: detected.severity,
    p_title: detected.title,
    p_description: detected.detail,
    p_person_id: detected.personId,
    p_vessel_id: detected.vesselId,
    p_assignment_id: detected.assignmentId,
    p_project_id: detected.projectId,
    p_handover_id: detected.handoverId,
    p_absence_id: detected.absenceId,
    p_starts_on: detected.startsOn,
    p_ends_on: detected.endsOn,
  });
}

export function updatePlanningConflictCase(client: SupabaseClient, input: UpdatePlanningConflictCaseInput): Promise<number> {
  const comment = input.comment.trim();
  if (['resolved', 'dismissed', 'derogated'].includes(input.status) && comment.length < 3) {
    throw new Error('Un commentaire d’au moins 3 caractères est obligatoire pour clore un conflit.');
  }
  if (input.status === 'derogated' && !input.derogationId) {
    throw new Error('Sélectionnez une dérogation active avant de classer le conflit en dérogation.');
  }
  return callRpc(client, 'update-conflict-case', 'Impossible de traiter le conflit.', 'update_planning_conflict_case', {
    p_case_id: planningEntityId(input.caseId, 'Le dossier de conflit'),
    p_assign_to_me: input.assignToMe,
    p_priority: input.priority,
    p_status: input.status,
    p_comment: comment || null,
    p_derogation_id: input.status === 'derogated' ? input.derogationId : null,
  });
}
