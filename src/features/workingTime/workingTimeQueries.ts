import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  WorkingTimeCalculationWindow,
  WorkingTimeInterval,
  WorkingTimePeriodKind,
  WorkingTimeRegisterStatus,
  WorkingTimeViolationCode,
} from './workingTimeModel';

interface EntryContextRow {
  current_person_id?: number | string;
  readable_people?: unknown[];
  editable_people?: unknown[];
}

interface EditablePersonRow {
  person_id?: number | string;
  first_name?: string;
  last_name?: string;
  function_label?: string;
  is_self?: boolean;
}

interface RegisterRow {
  id: number | string;
  company_id: number | string;
  person_id: number | string;
  period_kind: string;
  period_start: string;
  period_end: string;
  status: string;
  work_rest_policy_id: number | string | null;
  people?: Record<string, unknown> | Array<Record<string, unknown>> | null;
}

interface IntervalRow {
  id: number | string;
  register_id: number | string;
  company_id: number | string;
  person_id: number | string;
  local_work_date: string;
  starts_at: string;
  ends_at: string;
  timezone_name: string;
  utc_offset_minutes: number | string;
  vessel_id: number | string | null;
  watch_group: string | null;
  comment: string | null;
  author_user_id: string | null;
  author_person_id: number | string | null;
  source_type: string;
  source_reference: string | null;
  source_record_key: string | null;
}

interface CalculationRow {
  id: number | string;
  company_id: number | string;
  person_id: number | string;
  window_end: string;
  local_window_end_date: string;
  timezone_name: string;
  vessel_id: number | string | null;
  work_rest_policy_id: number | string | null;
  work_24h_seconds: number | string;
  rest_24h_seconds: number | string;
  longest_rest_24h_seconds: number | string;
  rest_period_count_24h: number | string;
  work_7d_seconds: number | string;
  rest_7d_seconds: number | string;
  night_work_24h_seconds: number | string | null;
  is_compliant: boolean | null;
  violation_codes: string[] | null;
  calculation_version: number | string;
  calculated_at: string;
}

interface CommentRow {
  id: number | string;
  register_id: number | string;
  person_id: number | string;
  local_work_date: string;
  cause_category: string | null;
  operational_context: string | null;
  immediate_action: string | null;
  compensatory_rest_plan: string | null;
  comment: string;
  authored_by: string | null;
  authored_by_person_id: number | string | null;
  updated_at: string;
}

interface SignatureRow {
  id: number | string;
  person_id: number | string;
  version_number: number | string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | string;
  sha256: string;
  valid_from: string;
}

interface ValidationRow {
  id: number | string;
  register_id: number | string;
  event_type: string;
  previous_status: string;
  new_status: string;
  actor_identity_snapshot: Record<string, unknown> | null;
  signature_snapshot: Record<string, unknown> | null;
  interval_snapshot: unknown[] | null;
  non_compliance_snapshot: unknown[] | null;
  comment: string | null;
  occurred_at: string;
}

interface VesselRow {
  id: number | string;
  name: string;
  acronym: string | null;
  imo_number?: string | null;
  flag_state?: string | null;
}

export interface WorkingTimeEditablePerson {
  personId: number;
  firstName: string;
  lastName: string;
  functionLabel: string;
  isSelf: boolean;
}

export interface WorkingTimeWorkspaceRegister {
  id: number;
  companyId: number;
  personId: number;
  personName: string;
  functionLabel: string;
  periodKind: WorkingTimePeriodKind;
  periodStart: string;
  periodEnd: string;
  status: WorkingTimeRegisterStatus;
  workRestPolicyId: number | null;
}

export interface WorkingTimeDayComment {
  id: number;
  registerId: number;
  personId: number;
  localWorkDate: string;
  causeCategory: WorkingTimeNonComplianceCause | null;
  operationalContext: string;
  immediateAction: string;
  compensatoryRestPlan: string;
  comment: string;
  authoredBy: string | null;
  authoredByPersonId: number | null;
  updatedAt: string;
}

export interface WorkingTimeActiveSignature {
  id: number;
  personId: number;
  versionNumber: number;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string;
  validFrom: string;
}

export type WorkingTimeNonComplianceCause =
  | 'unexpected_operation'
  | 'safety_emergency'
  | 'weather'
  | 'handover'
  | 'breakdown_maintenance'
  | 'understaffing'
  | 'other';

export interface WorkingTimeSignatureSnapshot {
  signatureId: number;
  signerPersonId: number;
  signerName: string;
  signerRoles: string[];
  signedAt: string;
  versionNumber: number;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string;
}

export interface WorkingTimeValidationEvent {
  id: number;
  registerId: number;
  eventType: string;
  previousStatus: string;
  newStatus: string;
  actorName: string;
  actorRoles: string[];
  signatureSnapshot: WorkingTimeSignatureSnapshot | null;
  intervalSnapshot: unknown[];
  nonComplianceSnapshot: unknown[];
  comment: string;
  occurredAt: string;
}

export interface WorkingTimeVesselOption {
  id: number;
  name: string;
  acronym: string;
  imoNumber?: string;
  flagState?: string;
}

export interface WorkingTimeWorkspace {
  currentPersonId: number;
  readablePeople: WorkingTimeEditablePerson[];
  editablePeople: WorkingTimeEditablePerson[];
  registers: WorkingTimeWorkspaceRegister[];
  intervals: WorkingTimeInterval[];
  calculations: WorkingTimeCalculationWindow[];
  dayComments: WorkingTimeDayComment[];
  signatures: WorkingTimeActiveSignature[];
  validations: WorkingTimeValidationEvent[];
  vessels: WorkingTimeVesselOption[];
}

export interface WorkingTimeRange {
  start: string;
  end: string;
}

export interface SaveWorkingTimeIntervalInput {
  registerId: number;
  startsAt: string;
  endsAt: string;
  timezoneName: string;
  vesselId: number | null;
  watchGroup: string | null;
  comment: string | null;
  intervalId?: number | null;
}

export interface SaveWorkingTimeDayCommentInput {
  registerId: number;
  localWorkDate: string;
  causeCategory: WorkingTimeNonComplianceCause;
  operationalContext: string;
  immediateAction: string;
  compensatoryRestPlan: string;
  comment: string;
}

export type WorkingTimeRecommendationStatus = 'conforme' | 'alerte' | 'non_conforme' | 'sans_politique';

export interface WorkingTimeEntryRecommendation {
  status: WorkingTimeRecommendationStatus;
  policyId: number | null;
  policyName: string | null;
  alreadyNonCompliant: boolean;
  available24hSeconds: number;
  available7dSeconds: number;
  work24hSeconds: number;
  work7dSeconds: number;
  rest24hSeconds: number;
  longestRest24hSeconds: number;
  restImpactSeconds: number;
  consecutiveRestImpactSeconds: number;
  maxAdditionalSeconds: number;
  latestEndAt: string | null;
  nextResumeAt: string | null;
  violationCodes: string[];
}

export interface WorkingTimeRecommendationInput {
  personId: number;
  proposedStart: string;
  proposedEnd: string;
  timezoneName: string;
  vesselId: number | null;
  watchGroup: string | null;
  excludeIntervalId?: number | null;
}

export interface WorkingTimePhaseInput {
  startsAt: string;
  endsAt: string;
}

export interface WorkingTimePhasesRecommendationInput {
  personId: number;
  phases: WorkingTimePhaseInput[];
  timezoneName: string;
  vesselId: number | null;
  watchGroup: string | null;
  excludeIntervalId?: number | null;
}

export interface SaveWorkingTimePhasesInput {
  registerId: number;
  phases: WorkingTimePhaseInput[];
  timezoneName: string;
  vesselId: number | null;
  watchGroup: string | null;
  comment: string | null;
}

const REGISTER_SELECT = 'id,company_id,person_id,period_kind,period_start,period_end,status,work_rest_policy_id,people!working_time_registers_person_id_fkey(first_name,last_name,function_label)';
const INTERVAL_SELECT = 'id,register_id,company_id,person_id,local_work_date,starts_at,ends_at,timezone_name,utc_offset_minutes,vessel_id,watch_group,comment,author_user_id,author_person_id,source_type,source_reference,source_record_key';
const CALCULATION_SELECT = 'id,company_id,person_id,window_end,local_window_end_date,timezone_name,vessel_id,work_rest_policy_id,work_24h_seconds,rest_24h_seconds,longest_rest_24h_seconds,rest_period_count_24h,work_7d_seconds,rest_7d_seconds,night_work_24h_seconds,is_compliant,violation_codes,calculation_version,calculated_at';
const VALIDATION_SELECT = 'id,register_id,event_type,previous_status,new_status,actor_identity_snapshot,signature_snapshot,interval_snapshot,non_compliance_snapshot,comment,occurred_at';

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function personRelation(row: RegisterRow): Record<string, unknown> {
  if (Array.isArray(row.people)) return row.people[0] || {};
  return row.people || {};
}

function assertResult(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function mapRegister(row: RegisterRow): WorkingTimeWorkspaceRegister {
  const person = personRelation(row);
  const firstName = String(person.first_name || '');
  const lastName = String(person.last_name || '');
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    personId: Number(row.person_id),
    personName: `${firstName} ${lastName}`.trim() || `Personne ${row.person_id}`,
    functionLabel: String(person.function_label || ''),
    periodKind: row.period_kind as WorkingTimePeriodKind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status as WorkingTimeRegisterStatus,
    workRestPolicyId: numberOrNull(row.work_rest_policy_id),
  };
}

function mapInterval(row: IntervalRow): WorkingTimeInterval {
  return {
    id: Number(row.id),
    registerId: Number(row.register_id),
    companyId: Number(row.company_id),
    personId: Number(row.person_id),
    localWorkDate: row.local_work_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezoneName: row.timezone_name,
    utcOffsetMinutes: Number(row.utc_offset_minutes),
    vesselId: numberOrNull(row.vessel_id),
    watchGroup: row.watch_group,
    comment: row.comment,
    authorUserId: row.author_user_id,
    authorPersonId: numberOrNull(row.author_person_id),
    sourceType: row.source_type as WorkingTimeInterval['sourceType'],
    sourceReference: row.source_reference,
    sourceRecordKey: row.source_record_key,
  };
}

function mapCalculation(row: CalculationRow): WorkingTimeCalculationWindow {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    personId: Number(row.person_id),
    windowEnd: row.window_end,
    localWindowEndDate: row.local_window_end_date,
    timezoneName: row.timezone_name,
    vesselId: numberOrNull(row.vessel_id),
    workRestPolicyId: numberOrNull(row.work_rest_policy_id),
    work24hSeconds: Number(row.work_24h_seconds),
    rest24hSeconds: Number(row.rest_24h_seconds),
    longestRest24hSeconds: Number(row.longest_rest_24h_seconds),
    restPeriodCount24h: Number(row.rest_period_count_24h),
    work7dSeconds: Number(row.work_7d_seconds),
    rest7dSeconds: Number(row.rest_7d_seconds),
    nightWork24hSeconds: numberOrNull(row.night_work_24h_seconds),
    isCompliant: row.is_compliant,
    violationCodes: (row.violation_codes || []) as WorkingTimeViolationCode[],
    calculationVersion: Number(row.calculation_version),
    calculatedAt: row.calculated_at,
  };
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapSignatureSnapshot(value: Record<string, unknown> | null): WorkingTimeSignatureSnapshot | null {
  if (!value || !value.storage_path || !value.sha256) return null;
  return {
    signatureId: Number(value.signature_id || 0),
    signerPersonId: Number(value.signer_person_id || 0),
    signerName: String(value.signer_name || ''),
    signerRoles: textArray(value.signer_roles),
    signedAt: String(value.signed_at || ''),
    versionNumber: Number(value.version_number || 0),
    storageBucket: String(value.storage_bucket || ''),
    storagePath: String(value.storage_path || ''),
    mimeType: String(value.mime_type || ''),
    fileSizeBytes: Number(value.file_size_bytes || 0),
    sha256: String(value.sha256 || ''),
  };
}

function mapValidation(row: ValidationRow): WorkingTimeValidationEvent {
  const actor = row.actor_identity_snapshot || {};
  return {
    id: Number(row.id),
    registerId: Number(row.register_id),
    eventType: row.event_type,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    actorName: `${String(actor.first_name || '')} ${String(actor.last_name || '')}`.trim(),
    actorRoles: textArray(actor.roles),
    signatureSnapshot: mapSignatureSnapshot(row.signature_snapshot),
    intervalSnapshot: Array.isArray(row.interval_snapshot) ? row.interval_snapshot : [],
    nonComplianceSnapshot: Array.isArray(row.non_compliance_snapshot) ? row.non_compliance_snapshot : [],
    comment: row.comment || '',
    occurredAt: row.occurred_at,
  };
}

export async function fetchWorkingTimeWorkspace(
  client: SupabaseClient,
  range: WorkingTimeRange,
): Promise<WorkingTimeWorkspace> {
  const [contextResult, registerResult, intervalResult, calculationResult, commentResult, signatureResult, validationResult, vesselResult] = await Promise.all([
    client.rpc('working_time_entry_context', { p_starts_on: range.start, p_ends_on: range.end }),
    client.from('working_time_registers').select(REGISTER_SELECT)
      .is('discarded_at', null)
      .lte('period_start', range.end).gte('period_end', range.start).order('period_start', { ascending: false }),
    client.from('working_time_intervals').select(INTERVAL_SELECT)
      .gte('local_work_date', range.start).lte('local_work_date', range.end).is('voided_at', null).order('starts_at'),
    client.from('working_time_calculation_windows').select(CALCULATION_SELECT)
      .gte('local_window_end_date', range.start).lte('local_window_end_date', range.end).order('window_end'),
    client.from('working_time_day_comments').select('id,register_id,person_id,local_work_date,cause_category,operational_context,immediate_action,compensatory_rest_plan,comment,authored_by,authored_by_person_id,updated_at')
      .gte('local_work_date', range.start).lte('local_work_date', range.end).order('local_work_date'),
    client.from('working_time_profile_signatures').select('id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,valid_from')
      .is('valid_to', null).order('version_number', { ascending: false }),
    client.from('working_time_validations').select(VALIDATION_SELECT).order('occurred_at', { ascending: false }).limit(1000),
    client.from('vessels').select('id,name,acronym,imo_number,flag_state').eq('active', true).order('name'),
  ]);

  assertResult(contextResult.error, 'Impossible de déterminer le périmètre de saisie.');
  assertResult(registerResult.error, 'Impossible de charger les registres.');
  assertResult(intervalResult.error, 'Impossible de charger les heures.');
  assertResult(calculationResult.error, 'Impossible de charger les calculs serveur.');
  assertResult(commentResult.error, 'Impossible de charger les commentaires.');
  assertResult(signatureResult.error, 'Impossible de charger les signatures.');
  assertResult(validationResult.error, 'Impossible de charger les instantanés de validation.');
  assertResult(vesselResult.error, 'Impossible de charger les navires.');

  const context = (contextResult.data || {}) as EntryContextRow;
  const mapPeople = (rows: unknown[]) => (rows as EditablePersonRow[]).map((person) => ({
    personId: Number(person.person_id),
    firstName: String(person.first_name || ''),
    lastName: String(person.last_name || ''),
    functionLabel: String(person.function_label || ''),
    isSelf: Boolean(person.is_self),
  }));
  const editablePeople = mapPeople(context.editable_people || []);
  const readablePeople = mapPeople(context.readable_people || context.editable_people || []);

  return {
    currentPersonId: Number(context.current_person_id || 0),
    readablePeople,
    editablePeople,
    registers: ((registerResult.data || []) as RegisterRow[]).map(mapRegister)
      .filter((register) => register.periodStart <= range.end && register.periodEnd >= range.start),
    intervals: ((intervalResult.data || []) as IntervalRow[]).map(mapInterval)
      .filter((interval) => interval.localWorkDate >= range.start && interval.localWorkDate <= range.end),
    calculations: ((calculationResult.data || []) as CalculationRow[]).map(mapCalculation)
      .filter((calculation) => calculation.localWindowEndDate >= range.start && calculation.localWindowEndDate <= range.end),
    dayComments: ((commentResult.data || []) as CommentRow[]).map((comment) => ({
      id: Number(comment.id),
      registerId: Number(comment.register_id),
      personId: Number(comment.person_id),
      localWorkDate: comment.local_work_date,
      causeCategory: (comment.cause_category || null) as WorkingTimeNonComplianceCause | null,
      operationalContext: comment.operational_context || '',
      immediateAction: comment.immediate_action || '',
      compensatoryRestPlan: comment.compensatory_rest_plan || '',
      comment: comment.comment,
      authoredBy: comment.authored_by,
      authoredByPersonId: numberOrNull(comment.authored_by_person_id),
      updatedAt: comment.updated_at,
    })).filter((comment) => comment.localWorkDate >= range.start && comment.localWorkDate <= range.end),
    signatures: ((signatureResult.data || []) as SignatureRow[]).map((signature) => ({
      id: Number(signature.id),
      personId: Number(signature.person_id),
      versionNumber: Number(signature.version_number),
      storageBucket: signature.storage_bucket,
      storagePath: signature.storage_path,
      mimeType: signature.mime_type,
      fileSizeBytes: Number(signature.file_size_bytes),
      sha256: signature.sha256,
      validFrom: signature.valid_from,
    })),
    validations: ((validationResult.data || []) as ValidationRow[]).map(mapValidation),
    vessels: ((vesselResult.data || []) as VesselRow[]).map((vessel) => ({
      id: Number(vessel.id),
      name: vessel.name,
      acronym: vessel.acronym || '',
      imoNumber: vessel.imo_number || '',
      flagState: vessel.flag_state || '',
    })),
  };
}

export async function getOrCreateWorkingTimeRegister(
  client: SupabaseClient,
  input: { personId: number; periodKind: WorkingTimePeriodKind; periodStart: string },
): Promise<number> {
  const { data, error } = await client.rpc('get_or_create_working_time_register', {
    p_person_id: input.personId,
    p_period_kind: input.periodKind,
    p_period_start: input.periodStart,
  });
  assertResult(error, 'Impossible de créer le registre.');
  return Number(data);
}

export async function saveWorkingTimeInterval(
  client: SupabaseClient,
  input: SaveWorkingTimeIntervalInput,
): Promise<number> {
  const { data, error } = await client.rpc('save_working_time_interval', {
    p_register_id: input.registerId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_timezone_name: input.timezoneName,
    p_vessel_id: input.vesselId,
    p_watch_group: input.watchGroup,
    p_comment: input.comment,
    p_interval_id: input.intervalId ?? null,
  });
  assertResult(error, 'Impossible d’enregistrer les heures.');
  return Number(data);
}

export async function fetchWorkingTimeEntryRecommendation(
  client: SupabaseClient,
  input: WorkingTimeRecommendationInput,
): Promise<WorkingTimeEntryRecommendation> {
  const { data, error } = await client.rpc('working_time_interval_recommendation', {
    p_person_id: input.personId,
    p_proposed_start: input.proposedStart,
    p_proposed_end: input.proposedEnd,
    p_timezone_name: input.timezoneName,
    p_vessel_id: input.vesselId,
    p_watch_group: input.watchGroup,
    p_exclude_interval_id: input.excludeIntervalId ?? null,
  });
  assertResult(error, 'Impossible de calculer la recommandation de saisie.');
  const value = (data || {}) as Record<string, unknown>;
  return {
    status: String(value.status || 'sans_politique') as WorkingTimeRecommendationStatus,
    policyId: numberOrNull(value.policy_id as number | string | null),
    policyName: value.policy_name ? String(value.policy_name) : null,
    alreadyNonCompliant: Boolean(value.already_non_compliant),
    available24hSeconds: Number(value.available_24h_seconds || 0),
    available7dSeconds: Number(value.available_7d_seconds || 0),
    work24hSeconds: Number(value.work_24h_seconds || 0),
    work7dSeconds: Number(value.work_7d_seconds || 0),
    rest24hSeconds: Number(value.rest_24h_seconds || 0),
    longestRest24hSeconds: Number(value.longest_rest_24h_seconds || 0),
    restImpactSeconds: Number(value.rest_impact_seconds || 0),
    consecutiveRestImpactSeconds: Number(value.consecutive_rest_impact_seconds || 0),
    maxAdditionalSeconds: Number(value.max_additional_seconds || 0),
    latestEndAt: value.latest_end_at ? String(value.latest_end_at) : null,
    nextResumeAt: value.next_resume_at ? String(value.next_resume_at) : null,
    violationCodes: textArray(value.violation_codes),
  };
}

export async function fetchWorkingTimePhasesRecommendation(
  client: SupabaseClient,
  input: WorkingTimePhasesRecommendationInput,
): Promise<WorkingTimeEntryRecommendation> {
  const { data, error } = await client.rpc('working_time_phases_recommendation', {
    p_person_id: input.personId,
    p_phases: input.phases.map((phase) => ({ starts_at: phase.startsAt, ends_at: phase.endsAt })),
    p_timezone_name: input.timezoneName,
    p_vessel_id: input.vesselId,
    p_watch_group: input.watchGroup,
    p_exclude_interval_id: input.excludeIntervalId ?? null,
  });
  assertResult(error, 'Impossible de calculer la recommandation des phases de travail.');
  const value = (data || {}) as Record<string, unknown>;
  return {
    status: String(value.status || 'sans_politique') as WorkingTimeRecommendationStatus,
    policyId: numberOrNull(value.policy_id as number | string | null),
    policyName: value.policy_name ? String(value.policy_name) : null,
    alreadyNonCompliant: Boolean(value.already_non_compliant),
    available24hSeconds: Number(value.available_24h_seconds || 0),
    available7dSeconds: Number(value.available_7d_seconds || 0),
    work24hSeconds: Number(value.work_24h_seconds || 0),
    work7dSeconds: Number(value.work_7d_seconds || 0),
    rest24hSeconds: Number(value.rest_24h_seconds || 0),
    longestRest24hSeconds: Number(value.longest_rest_24h_seconds || 0),
    restImpactSeconds: Number(value.rest_impact_seconds || 0),
    consecutiveRestImpactSeconds: Number(value.consecutive_rest_impact_seconds || 0),
    maxAdditionalSeconds: Number(value.max_additional_seconds || 0),
    latestEndAt: value.latest_end_at ? String(value.latest_end_at) : null,
    nextResumeAt: value.next_resume_at ? String(value.next_resume_at) : null,
    violationCodes: textArray(value.violation_codes),
  };
}

export async function saveWorkingTimePhases(
  client: SupabaseClient,
  input: SaveWorkingTimePhasesInput,
): Promise<number[]> {
  const { data, error } = await client.rpc('save_working_time_phases', {
    p_register_id: input.registerId,
    p_phases: input.phases.map((phase) => ({ starts_at: phase.startsAt, ends_at: phase.endsAt })),
    p_timezone_name: input.timezoneName,
    p_vessel_id: input.vesselId,
    p_watch_group: input.watchGroup,
    p_comment: input.comment,
  });
  assertResult(error, 'Impossible d’enregistrer les phases de travail.');
  return Array.isArray(data) ? data.map(Number) : [];
}

export async function voidWorkingTimeInterval(
  client: SupabaseClient,
  intervalId: number,
  reason: string,
): Promise<number> {
  const { data, error } = await client.rpc('void_working_time_interval', {
    p_interval_id: intervalId,
    p_reason: reason,
  });
  assertResult(error, 'Impossible de retirer le créneau.');
  return Number(data);
}

export async function discardWorkingTimeDraft(
  client: SupabaseClient,
  registerId: number,
): Promise<number> {
  const { data, error } = await client.rpc('discard_working_time_draft', {
    p_register_id: registerId,
  });
  assertResult(error, 'Impossible de supprimer le brouillon.');
  return Number(data);
}

export async function saveWorkingTimeDayComment(
  client: SupabaseClient,
  input: SaveWorkingTimeDayCommentInput,
): Promise<number> {
  const { data, error } = await client.rpc('save_working_time_day_comment', {
    p_register_id: input.registerId,
    p_local_work_date: input.localWorkDate,
    p_cause_category: input.causeCategory,
    p_operational_context: input.operationalContext,
    p_immediate_action: input.immediateAction,
    p_compensatory_rest_plan: input.compensatoryRestPlan,
    p_comment: input.comment,
  });
  assertResult(error, 'Impossible d’enregistrer le commentaire capitaine.');
  return Number(data);
}

export async function transitionWorkingTimeRegister(
  client: SupabaseClient,
  input: { registerId: number; action: string; comment?: string | null },
): Promise<number> {
  const { data, error } = await client.rpc('transition_working_time_register', {
    p_register_id: input.registerId,
    p_action: input.action,
    p_comment: input.comment || null,
  });
  assertResult(error, 'Impossible de mettre à jour le registre.');
  return Number(data);
}

const WORKING_TIME_ERROR_MESSAGES: Array<[string, string]> = [
  ['WORKING_TIME_IMPORT_PERMISSION_DENIED', 'Seuls l’administrateur et l’armement peuvent importer un registre XLSM.'],
  ['WORKING_TIME_IMPORT_XLSM_REQUIRED', 'Le fichier source doit être un classeur annuel XLSM.'],
  ['WORKING_TIME_IMPORT_MIME_INVALID', 'Le type du fichier XLSM n’est pas valide.'],
  ['WORKING_TIME_IMPORT_FILE_SIZE_INVALID', 'Le classeur XLSM doit peser 20 Mo maximum.'],
  ['WORKING_TIME_IMPORT_SOURCE_NOT_UPLOADED', 'Le fichier source n’a pas été retrouvé dans l’espace privé.'],
  ['WORKING_TIME_IMPORT_BATCH_LOCKED', 'Cet import a déjà été validé ou annulé.'],
  ['WORKING_TIME_IMPORT_DUPLICATE_SOURCE_DATES', 'Le classeur contient plusieurs lignes pour une même date.'],
  ['WORKING_TIME_IMPORT_NO_READY_ROWS', 'Aucune journée contrôlée ne peut être importée.'],
  ['WORKING_TIME_SELF_VALIDATION_FORBIDDEN', 'Un capitaine ne peut pas valider son propre registre.'],
  ['WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED', 'Chaque journée non conforme exige une cause, un contexte, une action immédiate, un repos compensateur et un commentaire capitaine.'],
  ['WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED', 'Une signature de profil active est obligatoire.'],
  ['WORKING_TIME_REGISTER_LOCKED', 'Ce registre validé est verrouillé. Réouvrez-le avec un motif pour le corriger.'],
  ['WORKING_TIME_REGISTER_NOT_EDITABLE', 'Ce registre doit être rouvert avant toute correction.'],
  ['WORKING_TIME_DRAFT_DISCARD_FORBIDDEN', 'Seul un brouillon non signé peut être supprimé.'],
  ['WORKING_TIME_REOPEN_COMMENT_REQUIRED', 'Le motif de réouverture est obligatoire.'],
  ['WORKING_TIME_PERMISSION_DENIED', 'Cette action n’est pas autorisée pour votre profil ou votre bordée publiée.'],
  ['WORKING_TIME_POLICY_NOT_FOUND', 'Aucune politique de travail et repos datée ne couvre ce créneau.'],
  ['WORKING_TIME_INVALID_INTERVAL', 'La fin doit être postérieure au début, dans une limite de 24 heures.'],
  ['WORKING_TIME_PHASES_INVALID', 'Les phases doivent être valides, disjointes et rattachées à la même journée.'],
  ['WORKING_TIME_PHASES_OVERLAP', 'Deux phases de travail se chevauchent.'],
  ['WORKING_TIME_PHASES_EXISTING_OVERLAP', 'Une phase recouvre un créneau déjà enregistré.'],
  ['HSE_EXPOSURE_METHODOLOGY_REQUIRED', 'Sélectionnez une méthodologie HSE datée.'],
  ['HSE_EXPOSURE_FORBIDDEN', 'Votre rôle ne permet pas de recalculer les heures d’exposition.'],
  ['HSE_KPI_FORBIDDEN', 'Votre rôle ne permet pas de consulter ces indicateurs HSE.'],
];

export function workingTimeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  return WORKING_TIME_ERROR_MESSAGES.find(([code]) => message.includes(code))?.[1]
    || message
    || 'Une erreur est survenue dans le suivi du temps de travail.';
}
