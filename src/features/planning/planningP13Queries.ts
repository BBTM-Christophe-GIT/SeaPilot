import type { SupabaseClient } from '@supabase/supabase-js';
import { throwPlanningDataError } from './planningErrors';
import { fetchPlanningP12Data } from './planningP12Queries';
import type {
  PlanningDependencyEntityKind,
  PlanningDependencyRecord,
  PlanningDependencyType,
  PlanningNotificationRecord,
  PlanningP13Data,
  PlanningWorkRestPolicy,
  PlanningWorkRestScope,
} from './planningP13';
import { planningEntityId, requiredPlanningText } from './planningValidation';

const POLICY_SELECT = 'id, name, scope, vessel_id, effective_from, effective_to, max_work_24h, min_rest_24h, max_work_7d, min_rest_7d, min_consecutive_rest_hours, max_rest_periods_24h, night_starts_at, night_ends_at, max_night_work_24h, include_handover, active, notes, updated_at';
const NOTIFICATION_SELECT = 'id, notification_type, severity, title, body, entity_kind, entity_id, person_id, vessel_id, due_on, created_at, read_at';
const DEPENDENCY_SELECT = 'id, dependency_type, predecessor_kind, predecessor_id, successor_kind, successor_id, lag_minutes, vessel_id, person_id, notes, active, created_at, updated_at';

interface PolicyRow {
  id: number;
  name: string;
  scope: PlanningWorkRestScope;
  vessel_id: number | null;
  effective_from: string;
  effective_to: string | null;
  max_work_24h: number | string;
  min_rest_24h: number | string;
  max_work_7d: number | string;
  min_rest_7d: number | string;
  min_consecutive_rest_hours: number | string;
  max_rest_periods_24h: number | string;
  night_starts_at: string;
  night_ends_at: string;
  max_night_work_24h: number | string;
  include_handover: boolean;
  active: boolean;
  notes: string | null;
  updated_at: string;
}

interface NotificationRow {
  id: number;
  notification_type: PlanningNotificationRecord['notificationType'];
  severity: PlanningNotificationRecord['severity'];
  title: string;
  body: string;
  entity_kind: string;
  entity_id: number | null;
  person_id: number | null;
  vessel_id: number | null;
  due_on: string | null;
  created_at: string;
  read_at: string | null;
}

interface DependencyRow {
  id: number;
  dependency_type: PlanningDependencyType;
  predecessor_kind: PlanningDependencyEntityKind;
  predecessor_id: number;
  successor_kind: PlanningDependencyEntityKind;
  successor_id: number;
  lag_minutes: number;
  vessel_id: number | null;
  person_id: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavePlanningWorkRestPolicyInput {
  id?: number;
  name: string;
  scope: PlanningWorkRestScope;
  vesselId: number | null;
  effectiveFrom: string;
  effectiveTo: string;
  maxWork24h: number;
  minRest24h: number;
  maxWork7d: number;
  minRest7d: number;
  minConsecutiveRestHours: number;
  maxRestPeriods24h: number;
  nightStartsAt: string;
  nightEndsAt: string;
  maxNightWork24h: number;
  includeHandover: boolean;
  active: boolean;
  notes: string;
}

export interface SavePlanningDependencyInput {
  id?: number;
  dependencyType: PlanningDependencyType;
  predecessorKind: PlanningDependencyEntityKind;
  predecessorId: number;
  successorKind: PlanningDependencyEntityKind;
  successorId: number;
  lagMinutes: number;
  notes: string;
  active: boolean;
}

function numeric(value: number | string): number {
  return Number(value);
}

export function mapPlanningWorkRestPolicies(rows: PolicyRow[]): PlanningWorkRestPolicy[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope,
    vesselId: row.vessel_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to || '',
    maxWork24h: numeric(row.max_work_24h),
    minRest24h: numeric(row.min_rest_24h),
    maxWork7d: numeric(row.max_work_7d),
    minRest7d: numeric(row.min_rest_7d),
    minConsecutiveRestHours: numeric(row.min_consecutive_rest_hours),
    maxRestPeriods24h: numeric(row.max_rest_periods_24h),
    nightStartsAt: row.night_starts_at.slice(0, 5),
    nightEndsAt: row.night_ends_at.slice(0, 5),
    maxNightWork24h: numeric(row.max_night_work_24h),
    includeHandover: row.include_handover,
    active: row.active,
    notes: row.notes || '',
    updatedAt: row.updated_at,
  }));
}

export function mapPlanningNotifications(rows: NotificationRow[]): PlanningNotificationRecord[] {
  return rows.map((row) => ({
    id: row.id,
    notificationType: row.notification_type,
    severity: row.severity,
    title: row.title,
    body: row.body,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    personId: row.person_id,
    vesselId: row.vessel_id,
    dueOn: row.due_on || '',
    createdAt: row.created_at,
    readAt: row.read_at || '',
  }));
}

export function mapPlanningDependencies(rows: DependencyRow[]): PlanningDependencyRecord[] {
  return rows.map((row) => ({
    id: row.id,
    dependencyType: row.dependency_type,
    predecessorKind: row.predecessor_kind,
    predecessorId: row.predecessor_id,
    successorKind: row.successor_kind,
    successorId: row.successor_id,
    lagMinutes: row.lag_minutes,
    vesselId: row.vessel_id,
    personId: row.person_id,
    notes: row.notes || '',
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function fetchPlanningP13Data(client: SupabaseClient): Promise<PlanningP13Data> {
  const [policiesResult, notificationsResult, dependenciesResult, p12] = await Promise.all([
    client.from('planning_work_rest_policies').select(POLICY_SELECT).order('effective_from', { ascending: false }),
    client.from('planning_notifications').select(NOTIFICATION_SELECT).order('created_at', { ascending: false }).limit(200),
    client.from('planning_dependencies').select(DEPENDENCY_SELECT).order('updated_at', { ascending: false }),
    fetchPlanningP12Data(client),
  ]);
  const failed = [policiesResult, notificationsResult, dependenciesResult].find((result) => result.error);
  if (failed?.error) throwPlanningDataError('load-planning-p13', 'Impossible de charger les contrôles métier P1.3.', failed.error);
  return {
    policies: mapPlanningWorkRestPolicies((policiesResult.data || []) as PolicyRow[]),
    notifications: mapPlanningNotifications((notificationsResult.data || []) as NotificationRow[]),
    dependencies: mapPlanningDependencies((dependenciesResult.data || []) as DependencyRow[]),
    p12,
  };
}

async function callRpc<T>(client: SupabaseClient, operation: string, fallback: string, name: string, parameters: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throwPlanningDataError(operation, fallback, error);
  return data as T;
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} doit être compris entre ${minimum} et ${maximum}.`);
  }
  return value;
}

export function savePlanningWorkRestPolicy(client: SupabaseClient, input: SavePlanningWorkRestPolicyInput): Promise<number> {
  const name = requiredPlanningText(input.name, 'Le nom de la politique');
  if (!/^\d{2}:\d{2}$/.test(input.nightStartsAt) || !/^\d{2}:\d{2}$/.test(input.nightEndsAt)) {
    throw new Error('La fenêtre de nuit doit utiliser le format HH:mm.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || (input.effectiveTo && input.effectiveTo < input.effectiveFrom)) {
    throw new Error('La période d’application de la politique est incohérente.');
  }
  if (input.scope === 'vessel') planningEntityId(input.vesselId, 'Le navire');
  return callRpc(client, 'save-work-rest-policy', 'Impossible d’enregistrer les seuils de travail et repos.', 'save_planning_work_rest_policy', {
    p_policy_id: input.id || null,
    p_name: name,
    p_scope: input.scope,
    p_vessel_id: input.scope === 'vessel' ? input.vesselId : null,
    p_effective_from: input.effectiveFrom,
    p_effective_to: input.effectiveTo || null,
    p_max_work_24h: bounded(input.maxWork24h, 0, 24, 'Le maximum de travail sur 24 h'),
    p_min_rest_24h: bounded(input.minRest24h, 0, 24, 'Le minimum de repos sur 24 h'),
    p_max_work_7d: bounded(input.maxWork7d, 0, 168, 'Le maximum de travail sur 7 jours'),
    p_min_rest_7d: bounded(input.minRest7d, 0, 168, 'Le minimum de repos sur 7 jours'),
    p_min_consecutive_rest_hours: bounded(input.minConsecutiveRestHours, 0, 24, 'Le repos consécutif'),
    p_max_rest_periods_24h: bounded(input.maxRestPeriods24h, 1, 24, 'Le nombre de périodes de repos'),
    p_night_starts_at: input.nightStartsAt,
    p_night_ends_at: input.nightEndsAt,
    p_max_night_work_24h: bounded(input.maxNightWork24h, 0, 24, 'Le travail de nuit'),
    p_include_handover: input.includeHandover,
    p_active: input.active,
    p_notes: input.notes.trim() || null,
  });
}

export function savePlanningDependency(client: SupabaseClient, input: SavePlanningDependencyInput): Promise<number> {
  if (input.predecessorKind === input.successorKind && input.predecessorId === input.successorId) {
    throw new Error('Un élément ne peut pas dépendre de lui-même.');
  }
  return callRpc(client, 'save-planning-dependency', 'Impossible d’enregistrer la dépendance.', 'save_planning_dependency', {
    p_dependency_id: input.id || null,
    p_dependency_type: input.dependencyType,
    p_predecessor_kind: input.predecessorKind,
    p_predecessor_id: planningEntityId(input.predecessorId, 'La source'),
    p_successor_kind: input.successorKind,
    p_successor_id: planningEntityId(input.successorId, 'La cible'),
    p_lag_minutes: bounded(input.lagMinutes, 0, 525_600, 'Le délai'),
    p_notes: input.notes.trim() || null,
    p_active: input.active,
  });
}

export function deletePlanningDependency(client: SupabaseClient, dependencyId: number): Promise<number> {
  return callRpc(client, 'delete-planning-dependency', 'Impossible de supprimer la dépendance.', 'delete_planning_dependency', {
    p_dependency_id: planningEntityId(dependencyId, 'La dépendance'),
  });
}

export function markPlanningNotificationRead(client: SupabaseClient, notificationId: number, read: boolean): Promise<number> {
  return callRpc(client, 'mark-planning-notification', 'Impossible de mettre à jour la notification.', 'mark_planning_notification_read', {
    p_notification_id: planningEntityId(notificationId, 'La notification'),
    p_read: read,
  });
}

export function refreshPlanningNotifications(client: SupabaseClient, referenceDate: string): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error('La date de référence est invalide.');
  return callRpc(client, 'refresh-planning-notifications', 'Impossible d’actualiser les notifications.', 'refresh_planning_notifications', {
    p_reference_date: referenceDate,
  });
}
