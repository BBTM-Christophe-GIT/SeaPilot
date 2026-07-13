import type { SupabaseClient } from '@supabase/supabase-js';
import { throwPlanningDataError } from './planningErrors';
import type {
  PlanningManningMatrix,
  PlanningManningRequirement,
  PlanningP11Data,
  PlanningRotationEditScope,
  PlanningRotationOccurrence,
  PlanningRotationPattern,
  PlanningRotationSeries,
  PlanningTemplate,
  PlanningTemplateKind,
} from './planningP11';

const ROTATION_SELECT = 'id, vessel_id, crew_person_id, captain_person_id, name, pattern_key, starts_on, onboard_days, rest_days, occurrence_count, assignment_role, watch_group, handover_minutes, confirmation_status, active';
const OCCURRENCE_SELECT = 'id, series_id, assignment_id, occurrence_number, starts_on, ends_on, rest_starts_on, rest_ends_on, handover_at, is_override';
const TEMPLATE_SELECT = 'id, vessel_id, name, template_kind, description, default_duration_days, default_status, configuration, active';
const MATRIX_SELECT = 'id, vessel_id, name, effective_from, effective_to, status, notes, version';
const REQUIREMENT_SELECT = 'id, matrix_id, function_label, minimum_count, target_count, required_certificates, required_qualifications, required_authorizations, required_trainings, restrictions, display_order';

interface RotationRow {
  id: number;
  vessel_id: number;
  crew_person_id: number;
  captain_person_id: number | null;
  name: string;
  pattern_key: PlanningRotationPattern;
  starts_on: string;
  onboard_days: number;
  rest_days: number;
  occurrence_count: number;
  assignment_role: string;
  watch_group: string | null;
  handover_minutes: number;
  confirmation_status: 'provisional' | 'confirmed';
  active: boolean;
}

interface OccurrenceRow {
  id: number;
  series_id: number;
  assignment_id: number;
  occurrence_number: number;
  starts_on: string;
  ends_on: string;
  rest_starts_on: string;
  rest_ends_on: string;
  handover_at: string;
  is_override: boolean;
}

interface TemplateRow {
  id: number;
  vessel_id: number | null;
  name: string;
  template_kind: PlanningTemplateKind;
  description: string | null;
  default_duration_days: number;
  default_status: 'draft' | 'planned' | 'confirmed';
  configuration: Record<string, unknown> | null;
  active: boolean;
}

interface MatrixRow {
  id: number;
  vessel_id: number;
  name: string;
  effective_from: string;
  effective_to: string | null;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  version: number;
}

interface RequirementRow {
  id: number;
  matrix_id: number;
  function_label: string;
  minimum_count: number;
  target_count: number;
  required_certificates: string[] | null;
  required_qualifications: string[] | null;
  required_authorizations: string[] | null;
  required_trainings: string[] | null;
  restrictions: string[] | null;
  display_order: number;
}

export interface SavePlanningRotationInput {
  vesselId: number;
  crewPersonId: number;
  captainPersonId: number | null;
  name: string;
  patternKey: PlanningRotationPattern;
  startsOn: string;
  onboardDays: number;
  restDays: number;
  occurrenceCount: number;
  assignmentRole: string;
  watchGroup: string;
  handoverMinutes: number;
  confirmationStatus: 'provisional' | 'confirmed';
}

export interface UpdatePlanningRotationOccurrenceInput {
  occurrenceId: number;
  scope: PlanningRotationEditScope;
  startsOn: string;
  endsOn: string;
  vesselId: number;
  assignmentRole: string;
  watchGroup: string;
}

export interface SavePlanningTemplateInput {
  id?: number;
  vesselId: number | null;
  name: string;
  templateKind: PlanningTemplateKind;
  description: string;
  defaultDurationDays: number;
  defaultStatus: 'draft' | 'planned' | 'confirmed';
  configuration: Record<string, unknown>;
}

export interface ApplyPlanningTemplateInput {
  templateId: number;
  vesselId: number;
  startsOn: string;
  title: string;
  responsiblePersonId: number | null;
  location: string;
}

export interface SavePlanningManningMatrixInput {
  id?: number;
  vesselId: number;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'draft' | 'active' | 'archived';
  notes: string;
  requirements: PlanningManningRequirement[];
}

export function mapPlanningOccurrenceRows(rows: OccurrenceRow[]): PlanningRotationOccurrence[] {
  return rows.map((row) => ({
    id: row.id,
    seriesId: row.series_id,
    assignmentId: row.assignment_id,
    occurrenceNumber: row.occurrence_number,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    restStartsOn: row.rest_starts_on,
    restEndsOn: row.rest_ends_on,
    handoverAt: row.handover_at,
    isOverride: row.is_override,
  }));
}

export function mapPlanningRotationRows(rows: RotationRow[], occurrences: PlanningRotationOccurrence[]): PlanningRotationSeries[] {
  const occurrencesBySeries = new Map<number, PlanningRotationOccurrence[]>();
  for (const occurrence of occurrences) {
    const seriesOccurrences = occurrencesBySeries.get(occurrence.seriesId) || [];
    seriesOccurrences.push(occurrence);
    occurrencesBySeries.set(occurrence.seriesId, seriesOccurrences);
  }
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    crewPersonId: row.crew_person_id,
    captainPersonId: row.captain_person_id,
    name: row.name,
    patternKey: row.pattern_key,
    startsOn: row.starts_on,
    onboardDays: row.onboard_days,
    restDays: row.rest_days,
    occurrenceCount: row.occurrence_count,
    assignmentRole: row.assignment_role,
    watchGroup: row.watch_group || '',
    handoverMinutes: row.handover_minutes,
    confirmationStatus: row.confirmation_status,
    active: row.active,
    occurrences: (occurrencesBySeries.get(row.id) || []).sort((left, right) => left.occurrenceNumber - right.occurrenceNumber),
  }));
}

export function mapPlanningTemplateRows(rows: TemplateRow[]): PlanningTemplate[] {
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    name: row.name,
    templateKind: row.template_kind,
    description: row.description || '',
    defaultDurationDays: row.default_duration_days,
    defaultStatus: row.default_status,
    configuration: row.configuration || {},
    active: row.active,
  }));
}

export function mapPlanningRequirementRows(rows: RequirementRow[]): PlanningManningRequirement[] {
  return rows.map((row) => ({
    id: row.id,
    matrixId: row.matrix_id,
    functionLabel: row.function_label,
    minimumCount: row.minimum_count,
    targetCount: row.target_count,
    requiredCertificates: row.required_certificates || [],
    requiredQualifications: row.required_qualifications || [],
    requiredAuthorizations: row.required_authorizations || [],
    requiredTrainings: row.required_trainings || [],
    restrictions: row.restrictions || [],
    displayOrder: row.display_order,
  }));
}

export function mapPlanningMatrixRows(rows: MatrixRow[], requirements: PlanningManningRequirement[]): PlanningManningMatrix[] {
  const requirementsByMatrix = new Map<number, PlanningManningRequirement[]>();
  for (const requirement of requirements) {
    if (!requirement.matrixId) continue;
    const matrixRequirements = requirementsByMatrix.get(requirement.matrixId) || [];
    matrixRequirements.push(requirement);
    requirementsByMatrix.set(requirement.matrixId, matrixRequirements);
  }
  return rows.map((row) => ({
    id: row.id,
    vesselId: row.vessel_id,
    name: row.name,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to || '',
    status: row.status,
    notes: row.notes || '',
    version: row.version,
    requirements: (requirementsByMatrix.get(row.id) || []).sort((left, right) => left.displayOrder - right.displayOrder),
  }));
}

export async function fetchPlanningP11Data(client: SupabaseClient): Promise<PlanningP11Data> {
  const [rotationsResult, occurrencesResult, templatesResult, matricesResult, requirementsResult] = await Promise.all([
    client.from('planning_rotation_series').select(ROTATION_SELECT).eq('active', true).order('starts_on'),
    client.from('planning_rotation_occurrences').select(OCCURRENCE_SELECT).order('occurrence_number'),
    client.from('planning_templates').select(TEMPLATE_SELECT).eq('active', true).order('name'),
    client.from('planning_manning_matrices').select(MATRIX_SELECT).order('effective_from', { ascending: false }),
    client.from('planning_manning_requirements').select(REQUIREMENT_SELECT).order('display_order'),
  ]);
  const failed = [rotationsResult, occurrencesResult, templatesResult, matricesResult, requirementsResult].find((result) => result.error);
  if (failed?.error) throwPlanningDataError('load-planning-p11', 'Impossible de charger la planification structurée.', failed.error);
  const occurrences = mapPlanningOccurrenceRows((occurrencesResult.data || []) as OccurrenceRow[]);
  const requirements = mapPlanningRequirementRows((requirementsResult.data || []) as RequirementRow[]);
  return {
    rotations: mapPlanningRotationRows((rotationsResult.data || []) as RotationRow[], occurrences),
    templates: mapPlanningTemplateRows((templatesResult.data || []) as TemplateRow[]),
    matrices: mapPlanningMatrixRows((matricesResult.data || []) as MatrixRow[], requirements),
  };
}

async function callRpc<T>(client: SupabaseClient, operation: string, fallback: string, name: string, parameters: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throwPlanningDataError(operation, fallback, error);
  return data as T;
}

export function savePlanningRotation(client: SupabaseClient, input: SavePlanningRotationInput): Promise<number> {
  return callRpc(client, 'save-rotation', 'Impossible d’enregistrer la rotation.', 'save_planning_rotation_series', {
    p_vessel_id: input.vesselId,
    p_crew_person_id: input.crewPersonId,
    p_captain_person_id: input.captainPersonId,
    p_name: input.name,
    p_pattern_key: input.patternKey,
    p_starts_on: input.startsOn,
    p_onboard_days: input.onboardDays,
    p_rest_days: input.restDays,
    p_occurrence_count: input.occurrenceCount,
    p_assignment_role: input.assignmentRole,
    p_watch_group: input.watchGroup || null,
    p_handover_minutes: input.handoverMinutes,
    p_confirmation_status: input.confirmationStatus,
  });
}

export function updatePlanningRotationOccurrence(client: SupabaseClient, input: UpdatePlanningRotationOccurrenceInput): Promise<number> {
  return callRpc(client, 'update-rotation', 'Impossible de modifier la rotation.', 'update_planning_rotation_occurrence', {
    p_occurrence_id: input.occurrenceId,
    p_scope: input.scope,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_vessel_id: input.vesselId,
    p_assignment_role: input.assignmentRole,
    p_watch_group: input.watchGroup || null,
  });
}

export function savePlanningTemplate(client: SupabaseClient, input: SavePlanningTemplateInput): Promise<number> {
  return callRpc(client, 'save-template', 'Impossible d’enregistrer le modèle.', 'save_planning_template', {
    p_template_id: input.id || null,
    p_vessel_id: input.vesselId,
    p_name: input.name,
    p_template_kind: input.templateKind,
    p_description: input.description || null,
    p_default_duration_days: input.defaultDurationDays,
    p_default_status: input.defaultStatus,
    p_configuration: input.configuration,
  });
}

export function applyPlanningTemplate(client: SupabaseClient, input: ApplyPlanningTemplateInput): Promise<{ entityKind: 'project' | 'handover'; entityId: number }> {
  return callRpc(client, 'apply-template', 'Impossible d’appliquer le modèle.', 'apply_planning_template', {
    p_template_id: input.templateId,
    p_vessel_id: input.vesselId,
    p_starts_on: input.startsOn,
    p_title: input.title,
    p_responsible_person_id: input.responsiblePersonId,
    p_location: input.location || null,
  });
}

export function savePlanningManningMatrix(client: SupabaseClient, input: SavePlanningManningMatrixInput): Promise<number> {
  return callRpc(client, 'save-manning-matrix', 'Impossible d’enregistrer la matrice d’armement.', 'save_planning_manning_matrix', {
    p_matrix_id: input.id || null,
    p_vessel_id: input.vesselId,
    p_name: input.name,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo || null,
    p_status: input.status,
    p_notes: input.notes || null,
    p_requirements: input.requirements,
  });
}
