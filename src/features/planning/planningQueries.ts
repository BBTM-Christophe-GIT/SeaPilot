import type { SupabaseClient } from '@supabase/supabase-js';
import { planningDateFromTimestamp, planningLocalDateTimeToUtc, utcToPlanningLocalDateTime } from './planningDates';
import { reportPlanningTechnicalError, throwPlanningDataError } from './planningErrors';
import {
  assertPlanningDateRange,
  assertPlanningDateTimeRange,
  assertSinglePlanningDay,
  optionalPlanningEntityId,
  planningEntityId,
  requiredPlanningText,
} from './planningValidation';

const VESSEL_SELECT = 'id, name, acronym, active';
const PLANNING_PERSON_SELECT =
  'id, first_name, last_name, function_label, grade_label, role_label, contract_type, hired_on, departed_on, deck_certificate_label, engine_certificate_label, active';
const PLANNING_ASSIGNMENT_SELECT =
  'id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, assignment_role, status_label, confirmation_status, watch_group, comments, source_label';
const PLANNING_DAY_SELECT =
  'id, person_id, vessel_id, crew_name, captain_name, vessel_name, manual_vessel_name, work_date, disembark_on, year_number, month_number, month_label, day_number, function_label, sailor_status, day_status, rhythm_label, watch_group, slot365, departure_on, worked_hours, rest_24h, cumulative_7d, comments, source_label';
const PLANNING_PERIOD_SELECT =
  'id, person_id, vessel_id, crew_name, vessel_name, manual_vessel_name, watch_group, function_label, sailor_status, starts_on, ends_on, year_number, comments, slot365_source_id, slot365_source_key, source_label';
const PLANNING_PROJECT_SELECT =
  'id, title, starts_on, ends_on, description, client_name, primary_vessel_id, primary_vessel_name, secondary_vessel_id, secondary_vessel_name, event_type, responsible_name, status, source_label';
const PLANNING_CERTIFICATE_SELECT = 'id, vessel_id, vessel_name, title, status, expires_on, file_url';
const PLANNING_HR_DOCUMENT_SELECT =
  'id, person_id, person_name, category_key, title, status, expires_on, requires_captain_validation, medical_restriction, medical_unfit, file_url';
const PLANNING_RULE_SELECT =
  'id, code, name, description, scope, control_level, active, effective_from, configuration, source_reference, version';
const PLANNING_PUBLICATION_SELECT =
  'id, vessel_id, scope_key, starts_on, ends_on, status, current_version, comment, submitted_at, validated_at, published_at, locked_at, updated_at';
const PLANNING_HANDOVER_SELECT =
  'id, vessel_id, handover_at, location, handover_duration_minutes, responsible_person_id, comments, status, created_by, updated_by, created_at, updated_at';
const PLANNING_HANDOVER_POSITION_SELECT =
  'id, handover_id, position_order, function_label, outgoing_person_id, incoming_person_id, outgoing_assignment_id, incoming_assignment_id, comments';
const PLANNING_DEROGATION_SELECT =
  'id, rule_id, assignment_id, person_id, vessel_id, reason, starts_at, ends_at, evidence_url, status, author_id, author_name, created_at, updated_at';
const PLANNING_DEROGATION_HISTORY_SELECT = 'id, entity_id, action, payload, changed_by, changed_at';

interface VesselRow {
  id: number;
  name: string;
  acronym: string | null;
  active: boolean;
}

interface PlanningPersonRow {
  id: number;
  first_name: string;
  last_name: string;
  function_label: string | null;
  grade_label?: string | null;
  role_label?: string | null;
  contract_type?: string | null;
  hired_on?: string | null;
  departed_on?: string | null;
  deck_certificate_label?: string | null;
  engine_certificate_label?: string | null;
  active: boolean;
}

export interface PlanningAssignmentRow {
  id: number;
  vessel_id: number;
  captain_person_id: number | null;
  crew_person_id: number;
  starts_on: string;
  ends_on: string;
  starts_at?: string | null;
  ends_at?: string | null;
  assignment_role: string;
  status_label?: string | null;
  confirmation_status?: string | null;
  watch_group?: string | null;
  comments?: string | null;
  source_label: string;
}

export interface PlanningAssignmentOverviewRow extends PlanningAssignmentRow {
  vessel_name: string | null;
  captain_name: string | null;
  crew_name: string | null;
}

interface PlanningDayRow {
  id: number;
  person_id?: number | null;
  vessel_id?: number | null;
  crew_name: string | null;
  captain_name: string | null;
  vessel_name: string | null;
  manual_vessel_name: string | null;
  work_date: string;
  disembark_on: string | null;
  year_number: number | null;
  month_number: number | null;
  month_label: string | null;
  day_number: number | null;
  function_label: string | null;
  sailor_status: string | null;
  day_status: string | null;
  rhythm_label: string | null;
  watch_group: string | null;
  slot365: string | null;
  departure_on: string | null;
  worked_hours: number | string | null;
  rest_24h: number | string | null;
  cumulative_7d: number | string | null;
  comments: string | null;
  source_label: string;
}

interface PlanningPeriodRow {
  id: number;
  person_id?: number | null;
  vessel_id?: number | null;
  crew_name: string | null;
  vessel_name: string | null;
  manual_vessel_name: string | null;
  watch_group: string | null;
  function_label: string | null;
  sailor_status: string | null;
  starts_on: string;
  ends_on: string;
  year_number: number | null;
  comments: string | null;
  slot365_source_id: string | null;
  slot365_source_key: string | null;
  source_label: string;
}

interface PlanningProjectRow {
  id: number;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  description: string | null;
  client_name: string | null;
  primary_vessel_id: number | null;
  primary_vessel_name: string | null;
  secondary_vessel_id: number | null;
  secondary_vessel_name: string | null;
  event_type?: string | null;
  responsible_name?: string | null;
  status: string | null;
  source_label: string;
}

interface PlanningCertificateRow {
  id: number;
  vessel_id: number | null;
  vessel_name: string | null;
  title: string;
  status: string | null;
  expires_on: string | null;
  file_url: string | null;
}

interface PlanningHrDocumentRow {
  id: number;
  person_id: number | null;
  person_name: string | null;
  category_key: string | null;
  title: string;
  status: string | null;
  expires_on: string | null;
  requires_captain_validation: boolean | null;
  medical_restriction: string | null;
  medical_unfit: boolean | null;
  file_url: string | null;
}

interface PlanningRuleRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  scope: string;
  control_level: string;
  active: boolean;
  effective_from: string;
  configuration: Record<string, unknown> | null;
  source_reference: string | null;
  version: number;
}

interface PlanningPublicationRow {
  id: number;
  vessel_id: number | null;
  scope_key: string;
  starts_on: string;
  ends_on: string;
  status: string;
  current_version: number;
  comment: string | null;
  submitted_at: string | null;
  validated_at: string | null;
  published_at: string | null;
  locked_at: string | null;
  updated_at: string;
}

interface PlanningHandoverRow {
  id: number;
  vessel_id: number;
  handover_at: string;
  location: string;
  handover_duration_minutes: number;
  responsible_person_id: number;
  comments: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PlanningHandoverPositionRow {
  id: number;
  handover_id: number;
  position_order: number;
  function_label: string;
  outgoing_person_id: number | null;
  incoming_person_id: number | null;
  outgoing_assignment_id: number | null;
  incoming_assignment_id: number | null;
  comments: string | null;
}

interface PlanningDerogationRow {
  id: number;
  rule_id: number;
  assignment_id: number | null;
  person_id: number;
  vessel_id: number;
  reason: string;
  starts_at: string;
  ends_at: string;
  evidence_url: string | null;
  status: string;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

interface PlanningDerogationHistoryRow {
  id: number;
  entity_id: number;
  action: string;
  payload: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export interface PlanningVessel {
  id: number;
  name: string;
  acronym: string;
  active: boolean;
}

export interface PlanningPerson {
  id: number;
  firstName: string;
  lastName: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel: string;
  contractType: string;
  hiredOn: string;
  departedOn: string;
  deckCertificateLabel?: string;
  engineCertificateLabel?: string;
  active: boolean;
}

export interface PlanningAssignmentRecord {
  id: number;
  vesselId: number;
  vesselName: string;
  captainPersonId: number | null;
  captainName: string;
  crewPersonId: number;
  crewName: string;
  startsOn: string;
  endsOn: string;
  startsAt?: string;
  endsAt?: string;
  assignmentRole: string;
  statusLabel: string;
  confirmationStatus: PlanningConfirmationStatus;
  watchGroup: string;
  comments: string;
  sourceLabel: string;
}

export interface PlanningDayRecord {
  id: number;
  personId: number | null;
  vesselId: number | null;
  crewName: string;
  captainName: string;
  vesselName: string;
  workDate: string;
  disembarkOn: string;
  yearNumber: number | null;
  monthNumber: number | null;
  monthLabel: string;
  dayNumber: number | null;
  functionLabel: string;
  sailorStatus: string;
  dayStatus: string;
  rhythmLabel: string;
  watchGroup: string;
  slot365: string;
  departureOn: string;
  workedHours: number | null;
  rest24h: number | null;
  cumulative7d: number | null;
  comments: string;
  sourceLabel: string;
}

export interface PlanningPeriodRecord {
  id: number;
  personId: number | null;
  vesselId: number | null;
  crewName: string;
  vesselName: string;
  watchGroup: string;
  functionLabel: string;
  sailorStatus: string;
  startsOn: string;
  endsOn: string;
  yearNumber: number | null;
  comments: string;
  slot365SourceId: string;
  slot365SourceKey: string;
  sourceLabel: string;
}

export interface PlanningProjectRecord {
  id: number;
  title: string;
  startsOn: string;
  endsOn: string;
  description: string;
  clientName: string;
  primaryVesselId: number | null;
  primaryVesselName: string;
  secondaryVesselId: number | null;
  secondaryVesselName: string;
  eventType: PlanningFleetEventType;
  responsibleName: string;
  status: string;
  sourceLabel: string;
}

export interface PlanningCertificateRecord {
  id: number;
  vesselId: number | null;
  vesselName: string;
  title: string;
  status: string;
  expiresOn: string;
  fileUrl: string;
}

export interface PlanningHrDocumentRecord {
  id: number;
  personId: number | null;
  personName: string;
  categoryKey: string;
  title: string;
  status: string;
  expiresOn: string;
  requiresCaptainValidation: boolean;
  medicalRestriction: string;
  medicalUnfit: boolean;
  fileUrl: string;
}

export interface PlanningRuleRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  scope: string;
  controlLevel: 'information' | 'warning' | 'blocking';
  active: boolean;
  effectiveFrom: string;
  configuration: Record<string, unknown>;
  sourceReference: string;
  version: number;
}

export type PlanningPublicationStatus =
  | 'preparation'
  | 'pending_validation'
  | 'validated'
  | 'published'
  | 'modified_after_publication'
  | 'archived';

export type PlanningPublicationAction = 'submit' | 'validate' | 'publish' | 'reopen' | 'archive';

export interface PlanningPublicationRecord {
  id: number;
  vesselId: number | null;
  scopeKey: string;
  startsOn: string;
  endsOn: string;
  status: PlanningPublicationStatus;
  currentVersion: number;
  comment: string;
  submittedAt: string;
  validatedAt: string;
  publishedAt: string;
  lockedAt: string;
  updatedAt: string;
}

export type PlanningHandoverStatus = 'draft' | 'planned' | 'confirmed' | 'completed' | 'cancelled';

export interface PlanningHandoverPositionRecord {
  id: number;
  handoverId: number;
  positionOrder: number;
  functionLabel: string;
  outgoingPersonId: number | null;
  incomingPersonId: number | null;
  outgoingAssignmentId: number | null;
  incomingAssignmentId: number | null;
  comments: string;
}

export interface PlanningHandoverRecord {
  id: number;
  vesselId: number;
  handoverAt: string;
  location: string;
  durationMinutes: number;
  responsiblePersonId: number;
  comments: string;
  status: PlanningHandoverStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  positions: PlanningHandoverPositionRecord[];
}

export type PlanningDerogationStatus = 'active' | 'revoked' | 'expired';

export interface PlanningDerogationRecord {
  id: number;
  ruleId: number;
  assignmentId: number | null;
  personId: number;
  vesselId: number;
  reason: string;
  startsAt: string;
  endsAt: string;
  evidenceUrl: string;
  status: PlanningDerogationStatus;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningDerogationHistoryRecord {
  id: number;
  derogationId: number;
  action: string;
  payload: Record<string, unknown>;
  changedBy: string;
  changedAt: string;
}

export interface PlanningOverview {
  vessels: PlanningVessel[];
  people: PlanningPerson[];
  assignments: PlanningAssignmentRecord[];
  days: PlanningDayRecord[];
  periods: PlanningPeriodRecord[];
  projects: PlanningProjectRecord[];
  certificates: PlanningCertificateRecord[];
  hrDocuments: PlanningHrDocumentRecord[];
  rules: PlanningRuleRecord[];
  publications: PlanningPublicationRecord[];
  handovers: PlanningHandoverRecord[];
  derogations: PlanningDerogationRecord[];
  derogationHistory: PlanningDerogationHistoryRecord[];
}

export type PlanningConfirmationStatus = 'provisional' | 'confirmed' | 'cancelled';
export type PlanningFleetEventType = 'operation' | 'transit' | 'maintenance' | 'unavailability';

export interface CreateVesselInput {
  name: string;
  acronym: string;
}

export interface CreatePlanningAssignmentInput {
  vesselId: string;
  captainPersonId: string;
  crewPersonId: string;
  startsOn: string;
  endsOn: string;
  startsAt?: string;
  endsAt?: string;
  assignmentRole: string;
  statusLabel?: string;
  confirmationStatus?: PlanningConfirmationStatus;
  watchGroup?: string;
  comments?: string;
}

export interface UpdatePlanningEventInput {
  id: number;
  kind: 'assignment' | 'day' | 'period';
  vesselId: number;
  vesselName: string;
  startsOn: string;
  endsOn: string;
  startsAt?: string;
  endsAt?: string;
  statusLabel: string;
  confirmationStatus?: PlanningConfirmationStatus;
  functionLabel: string;
  watchGroup: string;
  comments: string;
}

export interface UpdatePlanningProjectInput {
  id: number;
  title: string;
  startsOn: string;
  endsOn: string;
  status: string;
  vesselId: number;
  vesselName: string;
  eventType: PlanningFleetEventType;
  responsibleName: string;
  clientName: string;
  description: string;
}

export type CreatePlanningProjectInput = Omit<UpdatePlanningProjectInput, 'id'>;

export interface TransitionPlanningPublicationInput {
  action: PlanningPublicationAction;
  publicationId?: number | null;
  startsOn?: string;
  endsOn?: string;
  vesselId?: number | null;
  comment?: string;
}

export interface SavePlanningHandoverPositionInput {
  functionLabel: string;
  outgoingPersonId: string;
  incomingPersonId: string;
  outgoingAssignmentId?: string;
  incomingAssignmentId?: string;
  comments?: string;
}

export interface SavePlanningHandoverInput {
  id?: number | null;
  vesselId: string;
  handoverAt: string;
  location: string;
  durationMinutes: number;
  responsiblePersonId: string;
  comments?: string;
  status: PlanningHandoverStatus;
  positions: SavePlanningHandoverPositionInput[];
}

export interface CreatePlanningDerogationInput {
  ruleId: string;
  assignmentId?: number | null;
  personId: string;
  vesselId: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  evidenceUrl?: string;
}

export function formatPlanningPersonName(person: PlanningPerson): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

function textOrEmpty(value: string | null | undefined): string {
  return value || '';
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function planningConfirmationStatus(value: string | null | undefined): PlanningConfirmationStatus {
  return value === 'provisional' || value === 'cancelled' ? value : 'confirmed';
}

function planningFleetEventType(value: string | null | undefined): PlanningFleetEventType {
  if (value === 'transit' || value === 'maintenance' || value === 'unavailability') return value;
  return 'operation';
}

function mapImportedVesselName(vesselName: string | null, manualVesselName: string | null): string {
  return vesselName || manualVesselName || 'Navire non renseigne';
}

export function mapVesselRows(rows: VesselRow[]): PlanningVessel[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    acronym: row.acronym || '',
    active: row.active,
  }));
}

export function mapPlanningPeopleRows(rows: PlanningPersonRow[]): PlanningPerson[] {
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    functionLabel: row.function_label || '',
    gradeLabel: row.grade_label || '',
    roleLabel: row.role_label || '',
    contractType: row.contract_type || '',
    hiredOn: row.hired_on || '',
    departedOn: row.departed_on || '',
    deckCertificateLabel: row.deck_certificate_label || '',
    engineCertificateLabel: row.engine_certificate_label || '',
    active: row.active,
  }));
}

export function mapPlanningAssignmentRows(
  rows: PlanningAssignmentRow[],
  people: PlanningPerson[],
  vessels: PlanningVessel[],
): PlanningAssignmentRecord[] {
  const personById = new Map(people.map((person) => [person.id, person]));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));

  return rows.map((row) => {
    const vessel = vesselById.get(row.vessel_id);
    const captain = row.captain_person_id ? personById.get(row.captain_person_id) : undefined;
    const crew = personById.get(row.crew_person_id);

    return {
      id: row.id,
      vesselId: row.vessel_id,
      vesselName: vessel?.name || `Navire #${row.vessel_id}`,
      captainPersonId: row.captain_person_id,
      captainName: captain
        ? formatPlanningPersonName(captain)
        : row.captain_person_id
          ? `Capitaine #${row.captain_person_id}`
          : '-',
      crewPersonId: row.crew_person_id,
      crewName: crew ? formatPlanningPersonName(crew) : `Marin #${row.crew_person_id}`,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      startsAt: row.starts_at || planningLocalDateTimeToUtc(`${row.starts_on}T00:00`),
      endsAt: row.ends_at || planningLocalDateTimeToUtc(`${row.ends_on}T23:59`),
      assignmentRole: row.assignment_role,
      statusLabel: row.status_label || 'En Mer',
      confirmationStatus: planningConfirmationStatus(row.confirmation_status),
      watchGroup: row.watch_group || 'Affectation',
      comments: row.comments || '',
      sourceLabel: row.source_label,
    };
  });
}

export function mapPlanningAssignmentOverviewRows(rows: PlanningAssignmentOverviewRow[]): PlanningAssignmentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    vesselName: row.vessel_name || `Navire #${row.vessel_id}`,
    captainPersonId: row.captain_person_id,
    captainName: row.captain_name || (row.captain_person_id ? `Capitaine #${row.captain_person_id}` : '-'),
    crewPersonId: row.crew_person_id,
    crewName: row.crew_name || `Marin #${row.crew_person_id}`,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    startsAt: row.starts_at || planningLocalDateTimeToUtc(`${row.starts_on}T00:00`),
    endsAt: row.ends_at || planningLocalDateTimeToUtc(`${row.ends_on}T23:59`),
    assignmentRole: row.assignment_role,
    statusLabel: row.status_label || 'En Mer',
    confirmationStatus: planningConfirmationStatus(row.confirmation_status),
    watchGroup: row.watch_group || 'Affectation',
    comments: row.comments || '',
    sourceLabel: row.source_label,
  }));
}

export function mapPlanningDayRows(rows: PlanningDayRow[]): PlanningDayRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id ?? null,
    vesselId: row.vessel_id ?? null,
    crewName: row.crew_name || 'Marin non renseigne',
    captainName: textOrEmpty(row.captain_name),
    vesselName: mapImportedVesselName(row.vessel_name, row.manual_vessel_name),
    workDate: row.work_date,
    disembarkOn: textOrEmpty(row.disembark_on),
    yearNumber: row.year_number,
    monthNumber: row.month_number,
    monthLabel: textOrEmpty(row.month_label),
    dayNumber: row.day_number,
    functionLabel: textOrEmpty(row.function_label),
    sailorStatus: textOrEmpty(row.sailor_status),
    dayStatus: textOrEmpty(row.day_status),
    rhythmLabel: textOrEmpty(row.rhythm_label),
    watchGroup: textOrEmpty(row.watch_group),
    slot365: textOrEmpty(row.slot365),
    departureOn: textOrEmpty(row.departure_on),
    workedHours: numberOrNull(row.worked_hours),
    rest24h: numberOrNull(row.rest_24h),
    cumulative7d: numberOrNull(row.cumulative_7d),
    comments: textOrEmpty(row.comments),
    sourceLabel: row.source_label,
  }));
}

export function mapPlanningPeriodRows(rows: PlanningPeriodRow[]): PlanningPeriodRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id ?? null,
    vesselId: row.vessel_id ?? null,
    crewName: row.crew_name || 'Marin non renseigne',
    vesselName: mapImportedVesselName(row.vessel_name, row.manual_vessel_name),
    watchGroup: textOrEmpty(row.watch_group),
    functionLabel: textOrEmpty(row.function_label),
    sailorStatus: textOrEmpty(row.sailor_status),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    yearNumber: row.year_number,
    comments: textOrEmpty(row.comments),
    slot365SourceId: textOrEmpty(row.slot365_source_id),
    slot365SourceKey: textOrEmpty(row.slot365_source_key),
    sourceLabel: row.source_label,
  }));
}

export function mapPlanningProjectRows(rows: PlanningProjectRow[]): PlanningProjectRecord[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    startsOn: textOrEmpty(row.starts_on),
    endsOn: textOrEmpty(row.ends_on || row.starts_on),
    description: textOrEmpty(row.description),
    clientName: textOrEmpty(row.client_name),
    primaryVesselId: row.primary_vessel_id,
    primaryVesselName: textOrEmpty(row.primary_vessel_name),
    secondaryVesselId: row.secondary_vessel_id,
    secondaryVesselName: textOrEmpty(row.secondary_vessel_name),
    eventType: planningFleetEventType(row.event_type),
    responsibleName: textOrEmpty(row.responsible_name),
    status: textOrEmpty(row.status) || 'A planifier',
    sourceLabel: row.source_label,
  }));
}

export function mapPlanningCertificateRows(rows: PlanningCertificateRow[]): PlanningCertificateRecord[] {
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    vesselName: textOrEmpty(row.vessel_name) || 'Navire non renseigné',
    title: row.title,
    status: textOrEmpty(row.status),
    expiresOn: textOrEmpty(row.expires_on),
    fileUrl: textOrEmpty(row.file_url),
  }));
}

export function mapPlanningHrDocumentRows(rows: PlanningHrDocumentRow[]): PlanningHrDocumentRecord[] {
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    personName: textOrEmpty(row.person_name),
    categoryKey: textOrEmpty(row.category_key) || 'administrative',
    title: row.title,
    status: textOrEmpty(row.status),
    expiresOn: textOrEmpty(row.expires_on),
    requiresCaptainValidation: Boolean(row.requires_captain_validation),
    medicalRestriction: textOrEmpty(row.medical_restriction),
    medicalUnfit: Boolean(row.medical_unfit),
    fileUrl: textOrEmpty(row.file_url),
  }));
}

export function mapPlanningRuleRows(rows: PlanningRuleRow[]): PlanningRuleRecord[] {
  return rows.flatMap((row) => {
    if (!['information', 'warning', 'blocking'].includes(row.control_level)) return [];
    return [{
      id: row.id,
      code: row.code,
      name: row.name,
      description: textOrEmpty(row.description),
      scope: row.scope,
      controlLevel: row.control_level as PlanningRuleRecord['controlLevel'],
      active: row.active,
      effectiveFrom: row.effective_from,
      configuration: row.configuration || {},
      sourceReference: textOrEmpty(row.source_reference),
      version: row.version,
    }];
  });
}

export function mapPlanningPublicationRows(rows: PlanningPublicationRow[]): PlanningPublicationRecord[] {
  const validStatuses: PlanningPublicationStatus[] = [
    'preparation',
    'pending_validation',
    'validated',
    'published',
    'modified_after_publication',
    'archived',
  ];

  return rows.flatMap((row) => {
    if (!validStatuses.includes(row.status as PlanningPublicationStatus)) return [];
    return [{
      id: row.id,
      vesselId: row.vessel_id,
      scopeKey: row.scope_key,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      status: row.status as PlanningPublicationStatus,
      currentVersion: row.current_version,
      comment: textOrEmpty(row.comment),
      submittedAt: textOrEmpty(row.submitted_at),
      validatedAt: textOrEmpty(row.validated_at),
      publishedAt: textOrEmpty(row.published_at),
      lockedAt: textOrEmpty(row.locked_at),
      updatedAt: row.updated_at,
    }];
  });
}

export function mapPlanningHandoverRows(
  rows: PlanningHandoverRow[],
  positionRows: PlanningHandoverPositionRow[],
): PlanningHandoverRecord[] {
  const validStatuses: PlanningHandoverStatus[] = ['draft', 'planned', 'confirmed', 'completed', 'cancelled'];
  const positionsByHandover = new Map<number, PlanningHandoverPositionRecord[]>();
  positionRows.forEach((row) => {
    const positions = positionsByHandover.get(row.handover_id) || [];
    positions.push({
      id: row.id,
      handoverId: row.handover_id,
      positionOrder: row.position_order,
      functionLabel: row.function_label,
      outgoingPersonId: row.outgoing_person_id,
      incomingPersonId: row.incoming_person_id,
      outgoingAssignmentId: row.outgoing_assignment_id,
      incomingAssignmentId: row.incoming_assignment_id,
      comments: textOrEmpty(row.comments),
    });
    positionsByHandover.set(row.handover_id, positions);
  });
  return rows.flatMap((row) => {
    if (!validStatuses.includes(row.status as PlanningHandoverStatus)) return [];
    return [{
      id: row.id,
      vesselId: row.vessel_id,
      handoverAt: row.handover_at,
      location: row.location,
      durationMinutes: row.handover_duration_minutes,
      responsiblePersonId: row.responsible_person_id,
      comments: textOrEmpty(row.comments),
      status: row.status as PlanningHandoverStatus,
      createdBy: textOrEmpty(row.created_by),
      updatedBy: textOrEmpty(row.updated_by),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      positions: (positionsByHandover.get(row.id) || []).sort((left, right) => left.positionOrder - right.positionOrder || left.id - right.id),
    }];
  });
}

export function mapPlanningDerogationRows(rows: PlanningDerogationRow[]): PlanningDerogationRecord[] {
  const validStatuses: PlanningDerogationStatus[] = ['active', 'revoked', 'expired'];
  return rows.flatMap((row) => {
    if (!validStatuses.includes(row.status as PlanningDerogationStatus)) return [];
    return [{
      id: row.id,
      ruleId: row.rule_id,
      assignmentId: row.assignment_id,
      personId: row.person_id,
      vesselId: row.vessel_id,
      reason: row.reason,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      evidenceUrl: textOrEmpty(row.evidence_url),
      status: row.status as PlanningDerogationStatus,
      authorId: row.author_id,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }];
  });
}

export function mapPlanningDerogationHistoryRows(rows: PlanningDerogationHistoryRow[]): PlanningDerogationHistoryRecord[] {
  return rows.map((row) => ({
    id: row.id,
    derogationId: row.entity_id,
    action: row.action,
    payload: row.payload || {},
    changedBy: textOrEmpty(row.changed_by),
    changedAt: row.changed_at,
  }));
}

export async function fetchVessels(client: SupabaseClient): Promise<PlanningVessel[]> {
  const { data, error } = await client.from('vessels').select(VESSEL_SELECT).order('name', { ascending: true });

  if (error) throwPlanningDataError('load-vessels', 'Impossible de charger les navires.', error);

  return mapVesselRows((data || []) as VesselRow[]);
}

export async function fetchPlanningPeople(client: SupabaseClient): Promise<PlanningPerson[]> {
  const { data, error } = await client
    .from('people')
    .select(PLANNING_PERSON_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) throwPlanningDataError('load-people', 'Impossible de charger les marins.', error);

  return mapPlanningPeopleRows((data || []) as PlanningPersonRow[]);
}

export async function fetchPlanningAssignmentOverviewRows(
  client: SupabaseClient,
): Promise<PlanningAssignmentOverviewRow[]> {
  const { data, error } = await client.rpc('planning_assignment_overview');

  if (error) throwPlanningDataError('load-assignments', 'Impossible de charger les affectations.', error);

  return (data || []) as PlanningAssignmentOverviewRow[];
}

export async function fetchPlanningDays(client: SupabaseClient): Promise<PlanningDayRecord[]> {
  const { data, error } = await client
    .from('planning_days')
    .select(PLANNING_DAY_SELECT)
    .order('work_date', { ascending: true })
    .order('crew_name', { ascending: true });

  if (error) throwPlanningDataError('load-days', 'Impossible de charger les journées du planning.', error);

  return mapPlanningDayRows((data || []) as PlanningDayRow[]);
}

export async function fetchPlanningPeriods(client: SupabaseClient): Promise<PlanningPeriodRecord[]> {
  const { data, error } = await client
    .from('planning_periods')
    .select(PLANNING_PERIOD_SELECT)
    .order('starts_on', { ascending: true })
    .order('crew_name', { ascending: true });

  if (error) throwPlanningDataError('load-periods', 'Impossible de charger les périodes du planning.', error);

  return mapPlanningPeriodRows((data || []) as PlanningPeriodRow[]);
}

export async function fetchPlanningProjects(client: SupabaseClient): Promise<PlanningProjectRecord[]> {
  const { data, error } = await client
    .from('planning_projects')
    .select(PLANNING_PROJECT_SELECT)
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });
  if (error) throwPlanningDataError('load-projects', 'Impossible de charger les projets du planning.', error);
  return mapPlanningProjectRows((data || []) as unknown as PlanningProjectRow[]);
}

export async function fetchPlanningCertificates(client: SupabaseClient): Promise<PlanningCertificateRecord[]> {
  const { data, error } = await client
    .from('fleet_certificates')
    .select(PLANNING_CERTIFICATE_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false });
  if (error) throwPlanningDataError('load-certificates', 'Impossible de charger les certificats de la flotte.', error);
  return mapPlanningCertificateRows((data || []) as unknown as PlanningCertificateRow[]);
}

export async function fetchPlanningHrDocuments(client: SupabaseClient): Promise<PlanningHrDocumentRecord[]> {
  const { data, error } = await client
    .from('hr_documents')
    .select(PLANNING_HR_DOCUMENT_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false });
  if (error) throwPlanningDataError('load-hr-documents', 'Impossible de charger les documents des marins.', error);
  return mapPlanningHrDocumentRows((data || []) as unknown as PlanningHrDocumentRow[]);
}

export async function fetchPlanningRules(client: SupabaseClient): Promise<PlanningRuleRecord[]> {
  const { data, error } = await client
    .from('planning_rules')
    .select(PLANNING_RULE_SELECT)
    .order('code', { ascending: true });
  if (error) throwPlanningDataError('load-rules', 'Impossible de charger les règles du planning.', error);
  return mapPlanningRuleRows((data || []) as unknown as PlanningRuleRow[]);
}

export async function fetchPlanningPublications(client: SupabaseClient): Promise<PlanningPublicationRecord[]> {
  const { data, error } = await client
    .from('planning_publications')
    .select(PLANNING_PUBLICATION_SELECT)
    .order('updated_at', { ascending: false });
  if (error) throwPlanningDataError('load-publications', 'Impossible de charger les états de publication.', error);
  return mapPlanningPublicationRows((data || []) as unknown as PlanningPublicationRow[]);
}

export async function fetchPlanningHandovers(client: SupabaseClient): Promise<PlanningHandoverRecord[]> {
  const [handoverResult, positionResult] = await Promise.all([
    client.from('planning_handovers').select(PLANNING_HANDOVER_SELECT).order('handover_at', { ascending: false }),
    client.from('planning_handover_positions').select(PLANNING_HANDOVER_POSITION_SELECT).order('position_order', { ascending: true }),
  ]);
  if (handoverResult.error) throwPlanningDataError('load-handovers', 'Impossible de charger les relèves.', handoverResult.error);
  if (positionResult.error) throwPlanningDataError('load-handover-positions', 'Impossible de charger les bordées des relèves.', positionResult.error);
  return mapPlanningHandoverRows(
    (handoverResult.data || []) as unknown as PlanningHandoverRow[],
    (positionResult.data || []) as unknown as PlanningHandoverPositionRow[],
  );
}

export async function fetchPlanningDerogations(client: SupabaseClient): Promise<{
  derogations: PlanningDerogationRecord[];
  history: PlanningDerogationHistoryRecord[];
}> {
  const [derogationResult, historyResult] = await Promise.all([
    client.from('planning_derogations').select(PLANNING_DEROGATION_SELECT).order('created_at', { ascending: false }),
    client
      .from('planning_change_log')
      .select(PLANNING_DEROGATION_HISTORY_SELECT)
      .eq('entity_kind', 'derogation')
      .order('changed_at', { ascending: false }),
  ]);
  if (derogationResult.error) throwPlanningDataError('load-derogations', 'Impossible de charger les dérogations.', derogationResult.error);
  if (historyResult.error) throwPlanningDataError('load-derogation-history', 'Impossible de charger l’historique des dérogations.', historyResult.error);
  return {
    derogations: mapPlanningDerogationRows((derogationResult.data || []) as unknown as PlanningDerogationRow[]),
    history: mapPlanningDerogationHistoryRows((historyResult.data || []) as unknown as PlanningDerogationHistoryRow[]),
  };
}

export async function fetchPlanningOverview(client: SupabaseClient): Promise<PlanningOverview> {
  const [vessels, people, assignmentRows, days, periods, projects, certificates, hrDocuments, rules, publications, handovers, derogationData] = await Promise.all([
    fetchVessels(client),
    fetchPlanningPeople(client),
    fetchPlanningAssignmentOverviewRows(client),
    fetchPlanningDays(client),
    fetchPlanningPeriods(client),
    fetchPlanningProjects(client),
    fetchPlanningCertificates(client),
    fetchPlanningHrDocuments(client),
    fetchPlanningRules(client),
    fetchPlanningPublications(client),
    fetchPlanningHandovers(client),
    fetchPlanningDerogations(client),
  ]);

  return {
    vessels,
    people,
    assignments: mapPlanningAssignmentOverviewRows(assignmentRows),
    days,
    periods,
    projects,
    certificates,
    hrDocuments,
    rules,
    publications,
    handovers,
    derogations: derogationData.derogations,
    derogationHistory: derogationData.history,
  };
}

export async function transitionPlanningPublication(
  client: SupabaseClient,
  input: TransitionPlanningPublicationInput,
): Promise<PlanningPublicationRecord> {
  if (input.action === 'submit') {
    assertPlanningDateRange(input.startsOn || '', input.endsOn || '');
    optionalPlanningEntityId(input.vesselId, 'Le navire');
  } else {
    planningEntityId(input.publicationId, 'La publication');
  }

  const { data, error } = await client.rpc('transition_planning_publication', {
    p_action: input.action,
    p_publication_id: input.publicationId ?? null,
    p_starts_on: input.startsOn || null,
    p_ends_on: input.endsOn || null,
    p_vessel_id: input.vesselId ?? null,
    p_comment: input.comment?.trim() || null,
  });

  if (error) throwPlanningDataError('transition-publication', 'Impossible de mettre à jour la publication du planning.', error);
  const row = (Array.isArray(data) ? data[0] : data) as PlanningPublicationRow | null;
  const publication = row ? mapPlanningPublicationRows([row])[0] : undefined;
  if (!publication) throw new Error('La publication du planning n’a pas renvoyé de résultat valide.');
  return publication;
}

export async function createVessel(client: SupabaseClient, input: CreateVesselInput): Promise<PlanningVessel> {
  const vesselName = requiredPlanningText(input.name, 'Le nom du navire');

  const payload = {
    name: vesselName,
    acronym: input.acronym.trim() || null,
  };
  const { data, error } = await client.from('vessels').insert(payload).select(VESSEL_SELECT).single();

  if (error) throwPlanningDataError('create-vessel', "Impossible d'ajouter ce navire.", error);

  const vessel = mapVesselRows([data as VesselRow])[0];
  await writeVesselChangeLog(client, vessel.id, 'create', { name: vessel.name, acronym: vessel.acronym });
  return vessel;
}

export async function createPlanningAssignment(
  client: SupabaseClient,
  input: CreatePlanningAssignmentInput,
): Promise<PlanningAssignmentRow> {
  const vesselId = planningEntityId(input.vesselId, 'Le navire');
  const captainPersonId = optionalPlanningEntityId(input.captainPersonId, 'Le capitaine');
  const crewPersonId = planningEntityId(input.crewPersonId, 'Le marin');
  const hasTimes = Boolean(input.startsAt || input.endsAt);
  if (hasTimes) assertPlanningDateTimeRange(input.startsAt || '', input.endsAt || '');
  else assertPlanningDateRange(input.startsOn, input.endsOn);
  const startsAt = hasTimes ? planningLocalDateTimeToUtc(input.startsAt || '') : undefined;
  const endsAt = hasTimes ? planningLocalDateTimeToUtc(input.endsAt || '') : undefined;
  const startsOn = startsAt ? planningDateFromTimestamp(startsAt) : input.startsOn;
  const endsOn = endsAt ? planningDateFromTimestamp(endsAt) : input.endsOn;

  const payload = {
    vessel_id: vesselId,
    captain_person_id: captainPersonId,
    crew_person_id: crewPersonId,
    starts_on: startsOn,
    ends_on: endsOn,
    ...(startsAt && endsAt ? { starts_at: startsAt, ends_at: endsAt } : {}),
    assignment_role: input.assignmentRole.trim() || 'crew',
    status_label: requiredPlanningText(input.statusLabel || 'En Mer', 'Le statut'),
    confirmation_status: input.confirmationStatus || 'confirmed',
    watch_group: input.watchGroup?.trim() || 'Affectation',
    comments: input.comments?.trim() || null,
    source_label: 'seapilot',
  };
  const { data, error } = await client
    .from('planning_assignments')
    .insert(payload)
    .select(PLANNING_ASSIGNMENT_SELECT)
    .single();

  if (error) throwPlanningDataError('create-assignment', "Impossible d'ajouter cette affectation.", error);

  return data as PlanningAssignmentRow;
}

async function writeVesselChangeLog(
  client: SupabaseClient,
  vesselId: number,
  action: 'create' | 'archive',
  payload: Record<string, unknown>,
) {
  try {
    const { error } = await client.from('planning_change_log').insert({
      entity_kind: 'vessel',
      entity_id: vesselId,
      action,
      payload,
    });
    if (error) reportPlanningTechnicalError('audit-vessel', error, 'warning');
  } catch (error) {
    // Vessel writes predate the transactional event triggers; keep the successful business write visible.
    reportPlanningTechnicalError('audit-vessel', error, 'warning');
  }
}

export async function updatePlanningEvent(client: SupabaseClient, input: UpdatePlanningEventInput): Promise<void> {
  const eventId = planningEntityId(input.id, "L'événement");
  const vesselId = planningEntityId(input.vesselId, 'Le navire');
  const vesselName = input.kind === 'assignment' ? input.vesselName.trim() : requiredPlanningText(input.vesselName, 'Le nom du navire');
  const statusLabel = requiredPlanningText(input.statusLabel, 'Le statut');
  const hasTimes = input.kind === 'assignment' && Boolean(input.startsAt || input.endsAt);
  if (hasTimes) assertPlanningDateTimeRange(input.startsAt || '', input.endsAt || '');
  else if (input.kind === 'day') assertSinglePlanningDay(input.startsOn, input.endsOn);
  else assertPlanningDateRange(input.startsOn, input.endsOn);
  const startsAt = hasTimes ? planningLocalDateTimeToUtc(input.startsAt || '') : undefined;
  const endsAt = hasTimes ? planningLocalDateTimeToUtc(input.endsAt || '') : undefined;
  const startsOn = startsAt ? planningDateFromTimestamp(startsAt) : input.startsOn;
  const endsOn = endsAt ? planningDateFromTimestamp(endsAt) : input.endsOn;

  let error: unknown;
  if (input.kind === 'assignment') {
    ({ error } = await client
      .from('planning_assignments')
      .update({
        vessel_id: vesselId,
        starts_on: startsOn,
        ends_on: endsOn,
        starts_at: startsAt,
        ends_at: endsAt,
        assignment_role: input.functionLabel.trim() || 'Équipage',
        status_label: statusLabel,
        confirmation_status: input.confirmationStatus || 'confirmed',
        watch_group: input.watchGroup.trim() || 'Affectation',
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId));
  } else if (input.kind === 'period') {
    ({ error } = await client
      .from('planning_periods')
      .update({
        vessel_id: vesselId,
        vessel_name: vesselName,
        manual_vessel_name: null,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        year_number: Number(input.startsOn.slice(0, 4)),
        sailor_status: statusLabel,
        function_label: input.functionLabel.trim() || null,
        watch_group: input.watchGroup.trim() || null,
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId));
  } else {
    ({ error } = await client
      .from('planning_days')
      .update({
        vessel_id: vesselId,
        vessel_name: vesselName,
        manual_vessel_name: null,
        work_date: input.startsOn,
        departure_on: input.startsOn,
        disembark_on: input.endsOn,
        sailor_status: statusLabel,
        function_label: input.functionLabel.trim() || null,
        watch_group: input.watchGroup.trim() || null,
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId));
  }

  if (error) throwPlanningDataError('update-event', 'Impossible de modifier cet événement du planning.', error);
}

export async function deletePlanningEvent(
  client: SupabaseClient,
  event: { id: number; kind: 'assignment' | 'day' | 'period' },
): Promise<void> {
  const eventId = planningEntityId(event.id, "L'événement");
  const table = event.kind === 'assignment' ? 'planning_assignments' : event.kind === 'period' ? 'planning_periods' : 'planning_days';
  const { error } = await client.from(table).delete().eq('id', eventId);
  if (error) throwPlanningDataError('delete-event', 'Impossible de supprimer cet événement du planning.', error);
}

function planningProjectPayload(input: CreatePlanningProjectInput) {
  const vesselId = planningEntityId(input.vesselId, 'Le navire');
  const title = requiredPlanningText(input.title, 'Le titre de l’événement');
  const vesselName = requiredPlanningText(input.vesselName, 'Le nom du navire');
  assertPlanningDateRange(input.startsOn, input.endsOn);
  return {
    title,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    status: input.status.trim() || 'A planifier',
    event_type: input.eventType,
    responsible_name: input.responsibleName.trim() || null,
    primary_vessel_id: vesselId,
    primary_vessel_name: vesselName,
    client_name: input.clientName.trim() || null,
    description: input.description.trim() || null,
    source_label: 'seapilot-admin',
    updated_at: new Date().toISOString(),
  };
}

export async function createPlanningProject(
  client: SupabaseClient,
  input: CreatePlanningProjectInput,
): Promise<PlanningProjectRecord> {
  const payload = planningProjectPayload(input);
  const { data, error } = await client
    .from('planning_projects')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select(PLANNING_PROJECT_SELECT)
    .single();
  if (error) throwPlanningDataError('create-project', 'Impossible de créer cet événement flotte.', error);
  const project = mapPlanningProjectRows([data as unknown as PlanningProjectRow])[0];
  if (!project) throw new Error('L’événement flotte créé n’a pas pu être relu.');
  return project;
}

export async function updatePlanningProject(client: SupabaseClient, input: UpdatePlanningProjectInput): Promise<PlanningProjectRecord> {
  const projectId = planningEntityId(input.id, 'Le projet');
  const payload = planningProjectPayload(input);
  const { data, error } = await client
    .from('planning_projects')
    .update(payload)
    .eq('id', projectId)
    .select(PLANNING_PROJECT_SELECT)
    .single();
  if (error) throwPlanningDataError('update-project', 'Impossible de modifier ce projet.', error);
  const project = mapPlanningProjectRows([data as unknown as PlanningProjectRow])[0];
  if (!project) throw new Error('L’événement flotte modifié n’a pas pu être relu.');
  return project;
}

export async function savePlanningHandover(client: SupabaseClient, input: SavePlanningHandoverInput): Promise<number> {
  const vesselId = planningEntityId(input.vesselId, 'Le navire');
  const responsiblePersonId = planningEntityId(input.responsiblePersonId, 'Le responsable');
  const location = requiredPlanningText(input.location, 'Le lieu de relève');
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 0 || input.durationMinutes > 1440) {
    throw new Error('La durée de passation doit être comprise entre 0 et 1 440 minutes.');
  }
  const handoverEnd = new Date(planningLocalDateTimeToUtc(input.handoverAt));
  handoverEnd.setMinutes(handoverEnd.getMinutes() + Math.max(1, input.durationMinutes));
  assertPlanningDateTimeRange(input.handoverAt, utcToPlanningLocalDateTime(handoverEnd.toISOString()));
  if (!input.positions.length) throw new Error('Au moins un poste de relève est obligatoire.');

  const positions = input.positions.map((position, index) => {
    const outgoingPersonId = optionalPlanningEntityId(position.outgoingPersonId, `Le marin sortant du poste ${index + 1}`);
    const incomingPersonId = optionalPlanningEntityId(position.incomingPersonId, `Le marin entrant du poste ${index + 1}`);
    if (outgoingPersonId === null && incomingPersonId === null) {
      throw new Error(`Le poste ${index + 1} doit contenir un marin entrant ou sortant.`);
    }
    return {
      function_label: requiredPlanningText(position.functionLabel, `La fonction du poste ${index + 1}`),
      outgoing_person_id: outgoingPersonId,
      incoming_person_id: incomingPersonId,
      outgoing_assignment_id: optionalPlanningEntityId(position.outgoingAssignmentId, `L’affectation sortante du poste ${index + 1}`),
      incoming_assignment_id: optionalPlanningEntityId(position.incomingAssignmentId, `L’affectation entrante du poste ${index + 1}`),
      comments: position.comments?.trim() || null,
    };
  });

  const { data, error } = await client.rpc('save_planning_handover', {
    p_handover_id: input.id ?? null,
    p_vessel_id: vesselId,
    p_handover_at: planningLocalDateTimeToUtc(input.handoverAt),
    p_location: location,
    p_duration_minutes: input.durationMinutes,
    p_responsible_person_id: responsiblePersonId,
    p_comments: input.comments?.trim() || null,
    p_status: input.status,
    p_positions: positions,
  });
  if (error) throwPlanningDataError('save-handover', 'Impossible d’enregistrer cette relève.', error);
  const id = Number(data);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('La relève enregistrée n’a pas renvoyé un identifiant valide.');
  return id;
}

export async function createPlanningDerogation(
  client: SupabaseClient,
  input: CreatePlanningDerogationInput,
): Promise<PlanningDerogationRecord> {
  const ruleId = planningEntityId(input.ruleId, 'La règle');
  const personId = planningEntityId(input.personId, 'Le marin');
  const vesselId = planningEntityId(input.vesselId, 'Le navire');
  const reason = requiredPlanningText(input.reason, 'Le motif');
  if (reason.length < 10) throw new Error('Le motif de dérogation doit contenir au moins 10 caractères.');
  assertPlanningDateTimeRange(input.startsAt, input.endsAt);
  const { data, error } = await client
    .from('planning_derogations')
    .insert({
      rule_id: ruleId,
      assignment_id: input.assignmentId ?? null,
      person_id: personId,
      vessel_id: vesselId,
      reason,
      starts_at: planningLocalDateTimeToUtc(input.startsAt),
      ends_at: planningLocalDateTimeToUtc(input.endsAt),
      evidence_url: input.evidenceUrl?.trim() || null,
      status: 'active',
    })
    .select(PLANNING_DEROGATION_SELECT)
    .single();
  if (error) throwPlanningDataError('create-derogation', 'Impossible d’enregistrer cette dérogation.', error);
  const derogation = mapPlanningDerogationRows([data as unknown as PlanningDerogationRow])[0];
  if (!derogation) throw new Error('La dérogation enregistrée n’a pas pu être relue.');
  return derogation;
}

export async function revokePlanningDerogation(client: SupabaseClient, derogationId: number): Promise<void> {
  const id = planningEntityId(derogationId, 'La dérogation');
  const { error } = await client
    .from('planning_derogations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throwPlanningDataError('revoke-derogation', 'Impossible de révoquer cette dérogation.', error);
}

export async function archivePlanningVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const validVesselId = planningEntityId(vesselId, 'Le navire');
  const { error } = await client.from('vessels').update({ active: false, updated_at: new Date().toISOString() }).eq('id', validVesselId);
  if (error) throwPlanningDataError('archive-vessel', 'Impossible de retirer ce navire du planning.', error);
  await writeVesselChangeLog(client, validVesselId, 'archive', {});
}
