import type { SupabaseClient } from '@supabase/supabase-js';

const VESSEL_SELECT = 'id, name, acronym, active';
const PLANNING_PERSON_SELECT =
  'id, first_name, last_name, function_label, grade_label, role_label, contract_type, hired_on, departed_on, active';
const PLANNING_ASSIGNMENT_SELECT =
  'id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, assignment_role, status_label, watch_group, comments, source_label';
const PLANNING_DAY_SELECT =
  'id, person_id, vessel_id, crew_name, captain_name, vessel_name, manual_vessel_name, work_date, disembark_on, year_number, month_number, month_label, day_number, function_label, sailor_status, day_status, rhythm_label, watch_group, slot365, departure_on, worked_hours, rest_24h, cumulative_7d, comments, source_label';
const PLANNING_PERIOD_SELECT =
  'id, person_id, vessel_id, crew_name, vessel_name, manual_vessel_name, watch_group, function_label, sailor_status, starts_on, ends_on, year_number, comments, slot365_source_id, slot365_source_key, source_label';
const PLANNING_PROJECT_SELECT =
  'id, title, starts_on, ends_on, description, client_name, primary_vessel_id, primary_vessel_name, secondary_vessel_id, secondary_vessel_name, status, source_label';
const PLANNING_CERTIFICATE_SELECT = 'id, vessel_id, vessel_name, title, status, expires_on, file_url';
const PLANNING_HR_DOCUMENT_SELECT =
  'id, person_id, person_name, category_key, title, status, expires_on, requires_captain_validation, medical_restriction, medical_unfit, file_url';
const PLANNING_RULE_SELECT =
  'id, code, name, description, scope, control_level, active, effective_from, configuration, source_reference, version';
const PLANNING_PUBLICATION_SELECT =
  'id, vessel_id, scope_key, starts_on, ends_on, status, current_version, comment, submitted_at, validated_at, published_at, locked_at, updated_at';

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
  active: boolean;
}

export interface PlanningAssignmentRow {
  id: number;
  vessel_id: number;
  captain_person_id: number | null;
  crew_person_id: number;
  starts_on: string;
  ends_on: string;
  assignment_role: string;
  status_label?: string | null;
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
  assignmentRole: string;
  statusLabel: string;
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
}

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
  assignmentRole: string;
  statusLabel?: string;
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
  statusLabel: string;
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
  clientName: string;
  description: string;
}

export interface TransitionPlanningPublicationInput {
  action: PlanningPublicationAction;
  publicationId?: number | null;
  startsOn?: string;
  endsOn?: string;
  vesselId?: number | null;
  comment?: string;
}

export function formatPlanningPersonName(person: PlanningPerson): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

function textOrEmpty(value: string | null | undefined): string {
  return value || '';
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  return Number(value);
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
      assignmentRole: row.assignment_role,
      statusLabel: row.status_label || 'En Mer',
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
    assignmentRole: row.assignment_role,
    statusLabel: row.status_label || 'En Mer',
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

export async function fetchVessels(client: SupabaseClient): Promise<PlanningVessel[]> {
  const { data, error } = await client.from('vessels').select(VESSEL_SELECT).order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapVesselRows((data || []) as VesselRow[]);
}

export async function fetchPlanningPeople(client: SupabaseClient): Promise<PlanningPerson[]> {
  const { data, error } = await client
    .from('people')
    .select(PLANNING_PERSON_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPlanningPeopleRows((data || []) as PlanningPersonRow[]);
}

export async function fetchPlanningAssignmentOverviewRows(
  client: SupabaseClient,
): Promise<PlanningAssignmentOverviewRow[]> {
  const { data, error } = await client.rpc('planning_assignment_overview');

  if (error) {
    throw error;
  }

  return (data || []) as PlanningAssignmentOverviewRow[];
}

export async function fetchPlanningDays(client: SupabaseClient): Promise<PlanningDayRecord[]> {
  const { data, error } = await client
    .from('planning_days')
    .select(PLANNING_DAY_SELECT)
    .order('work_date', { ascending: true })
    .order('crew_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPlanningDayRows((data || []) as PlanningDayRow[]);
}

export async function fetchPlanningPeriods(client: SupabaseClient): Promise<PlanningPeriodRecord[]> {
  const { data, error } = await client
    .from('planning_periods')
    .select(PLANNING_PERIOD_SELECT)
    .order('starts_on', { ascending: true })
    .order('crew_name', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPlanningPeriodRows((data || []) as PlanningPeriodRow[]);
}

export async function fetchPlanningProjects(client: SupabaseClient): Promise<PlanningProjectRecord[]> {
  const { data, error } = await client
    .from('planning_projects')
    .select(PLANNING_PROJECT_SELECT)
    .order('starts_on', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });
  if (error) throw error;
  return mapPlanningProjectRows((data || []) as unknown as PlanningProjectRow[]);
}

export async function fetchPlanningCertificates(client: SupabaseClient): Promise<PlanningCertificateRecord[]> {
  const { data, error } = await client
    .from('fleet_certificates')
    .select(PLANNING_CERTIFICATE_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return mapPlanningCertificateRows((data || []) as unknown as PlanningCertificateRow[]);
}

export async function fetchPlanningHrDocuments(client: SupabaseClient): Promise<PlanningHrDocumentRecord[]> {
  const { data, error } = await client
    .from('hr_documents')
    .select(PLANNING_HR_DOCUMENT_SELECT)
    .order('expires_on', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return mapPlanningHrDocumentRows((data || []) as unknown as PlanningHrDocumentRow[]);
}

export async function fetchPlanningRules(client: SupabaseClient): Promise<PlanningRuleRecord[]> {
  const { data, error } = await client
    .from('planning_rules')
    .select(PLANNING_RULE_SELECT)
    .order('code', { ascending: true });
  if (error) throw error;
  return mapPlanningRuleRows((data || []) as unknown as PlanningRuleRow[]);
}

export async function fetchPlanningPublications(client: SupabaseClient): Promise<PlanningPublicationRecord[]> {
  const { data, error } = await client
    .from('planning_publications')
    .select(PLANNING_PUBLICATION_SELECT)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return mapPlanningPublicationRows((data || []) as unknown as PlanningPublicationRow[]);
}

export async function fetchPlanningOverview(client: SupabaseClient): Promise<PlanningOverview> {
  const [vessels, people, assignmentRows, days, periods, projects, certificates, hrDocuments, rules, publications] = await Promise.all([
    fetchVessels(client),
    fetchPlanningPeople(client),
    fetchPlanningAssignmentOverviewRows(client),
    fetchPlanningDays(client),
    fetchPlanningPeriods(client),
    fetchPlanningProjects(client).catch(() => []),
    fetchPlanningCertificates(client).catch(() => []),
    fetchPlanningHrDocuments(client),
    fetchPlanningRules(client).catch(() => []),
    fetchPlanningPublications(client),
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
  };
}

function throwPlanningMutationError(error: unknown): never {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'La mise à jour du planning a échoué.';

  if (message.includes('PLANNING_LOCKED')) {
    throw new Error('Cette période est verrouillée. Réouvrez-la avec un motif avant de modifier le planning.');
  }

  throw new Error(message);
}

export async function transitionPlanningPublication(
  client: SupabaseClient,
  input: TransitionPlanningPublicationInput,
): Promise<PlanningPublicationRecord> {
  const { data, error } = await client.rpc('transition_planning_publication', {
    p_action: input.action,
    p_publication_id: input.publicationId ?? null,
    p_starts_on: input.startsOn || null,
    p_ends_on: input.endsOn || null,
    p_vessel_id: input.vesselId ?? null,
    p_comment: input.comment?.trim() || null,
  });

  if (error) throwPlanningMutationError(error);
  const row = (Array.isArray(data) ? data[0] : data) as PlanningPublicationRow | null;
  const publication = row ? mapPlanningPublicationRows([row])[0] : undefined;
  if (!publication) throw new Error('La publication du planning n’a pas renvoyé de résultat valide.');
  return publication;
}

export async function createVessel(client: SupabaseClient, input: CreateVesselInput): Promise<PlanningVessel> {
  const vesselName = input.name.trim();

  if (!vesselName) {
    throw new Error('Le nom du navire est obligatoire.');
  }

  const payload = {
    name: vesselName,
    acronym: input.acronym.trim() || null,
  };
  const { data, error } = await client.from('vessels').insert(payload).select(VESSEL_SELECT).single();

  if (error) {
    throwPlanningMutationError(error);
  }

  const vessel = mapVesselRows([data as VesselRow])[0];
  await writeVesselChangeLog(client, vessel.id, 'create', { name: vessel.name, acronym: vessel.acronym });
  return vessel;
}

export async function createPlanningAssignment(
  client: SupabaseClient,
  input: CreatePlanningAssignmentInput,
): Promise<PlanningAssignmentRow> {
  if (!input.vesselId || !input.crewPersonId || !input.startsOn || !input.endsOn || input.endsOn < input.startsOn) {
    throw new Error("Les informations de l'affectation sont invalides.");
  }

  const payload = {
    vessel_id: Number(input.vesselId),
    captain_person_id: input.captainPersonId ? Number(input.captainPersonId) : null,
    crew_person_id: Number(input.crewPersonId),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    assignment_role: input.assignmentRole.trim() || 'crew',
    status_label: input.statusLabel || 'En Mer',
    watch_group: input.watchGroup || 'Affectation',
    comments: input.comments?.trim() || null,
    source_label: 'seapilot',
  };
  const { data, error } = await client
    .from('planning_assignments')
    .insert(payload)
    .select(PLANNING_ASSIGNMENT_SELECT)
    .single();

  if (error) {
    throwPlanningMutationError(error);
  }

  return data as PlanningAssignmentRow;
}

async function writeVesselChangeLog(
  client: SupabaseClient,
  vesselId: number,
  action: 'create' | 'archive',
  payload: Record<string, unknown>,
) {
  try {
    await client.from('planning_change_log').insert({
      entity_kind: 'vessel',
      entity_id: vesselId,
      action,
      payload,
    });
  } catch {
    // Vessel writes predate the transactional event triggers; keep the successful business write visible.
  }
}

export async function updatePlanningEvent(client: SupabaseClient, input: UpdatePlanningEventInput): Promise<void> {
  if (!input.startsOn || !input.endsOn || input.endsOn < input.startsOn) {
    throw new Error('La période de planning est invalide.');
  }

  let error: unknown = null;
  if (input.kind === 'assignment') {
    ({ error } = await client
      .from('planning_assignments')
      .update({
        vessel_id: input.vesselId,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        assignment_role: input.functionLabel.trim() || 'Équipage',
        status_label: input.statusLabel,
        watch_group: input.watchGroup.trim() || 'Affectation',
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id));
  } else if (input.kind === 'period') {
    ({ error } = await client
      .from('planning_periods')
      .update({
        vessel_id: input.vesselId,
        vessel_name: input.vesselName,
        manual_vessel_name: null,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        year_number: Number(input.startsOn.slice(0, 4)),
        sailor_status: input.statusLabel,
        function_label: input.functionLabel.trim() || null,
        watch_group: input.watchGroup.trim() || null,
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id));
  } else {
    if (input.startsOn !== input.endsOn) {
      throw new Error('Une journée isolée ne peut pas être étendue. Créez une affectation pour une période.');
    }
    ({ error } = await client
      .from('planning_days')
      .update({
        vessel_id: input.vesselId,
        vessel_name: input.vesselName,
        manual_vessel_name: null,
        work_date: input.startsOn,
        sailor_status: input.statusLabel,
        function_label: input.functionLabel.trim() || null,
        watch_group: input.watchGroup.trim() || null,
        comments: input.comments.trim() || null,
        source_label: 'seapilot-admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id));
  }

  if (error) throwPlanningMutationError(error);
}

export async function deletePlanningEvent(
  client: SupabaseClient,
  event: { id: number; kind: 'assignment' | 'day' | 'period' },
): Promise<void> {
  const table = event.kind === 'assignment' ? 'planning_assignments' : event.kind === 'period' ? 'planning_periods' : 'planning_days';
  const { error } = await client.from(table).delete().eq('id', event.id);
  if (error) throwPlanningMutationError(error);
}

export async function updatePlanningProject(client: SupabaseClient, input: UpdatePlanningProjectInput): Promise<void> {
  if (!input.title.trim() || !input.startsOn || !input.endsOn || input.endsOn < input.startsOn) {
    throw new Error('Les informations du projet sont invalides.');
  }
  const { error } = await client
    .from('planning_projects')
    .update({
      title: input.title.trim(),
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status,
      primary_vessel_id: input.vesselId,
      primary_vessel_name: input.vesselName,
      client_name: input.clientName.trim() || null,
      description: input.description.trim() || null,
      source_label: 'seapilot-admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id);
  if (error) throwPlanningMutationError(error);
}

export async function archivePlanningVessel(client: SupabaseClient, vesselId: number): Promise<void> {
  const { error } = await client.from('vessels').update({ active: false, updated_at: new Date().toISOString() }).eq('id', vesselId);
  if (error) throwPlanningMutationError(error);
  await writeVesselChangeLog(client, vesselId, 'archive', {});
}
