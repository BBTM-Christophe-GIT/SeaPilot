import type { SupabaseClient } from '@supabase/supabase-js';
import { throwPlanningDataError } from './planningErrors';
import {
  planningAssistantSuggestionSnapshot,
  type PlanningAssistantData,
  type PlanningAssistantDecision,
  type PlanningAssistantPilot,
  type PlanningAssistantReview,
  type PlanningAssistantSuggestion,
  type PlanningAssistantSuggestionType,
} from './planningP21';
import { fetchPlanningP13Data } from './planningP13Queries';

const REVIEW_SELECT = 'id, suggestion_key, suggestion_type, decision, comment, vessel_id, person_id, generated_for_start, generated_for_end, reviewed_by, reviewed_by_name, reviewed_at';

interface ReviewRow {
  id: number;
  suggestion_key: string;
  suggestion_type: PlanningAssistantSuggestionType;
  decision: PlanningAssistantDecision;
  comment: string;
  vessel_id: number | null;
  person_id: number | null;
  generated_for_start: string;
  generated_for_end: string;
  reviewed_by: string;
  reviewed_by_name: string;
  reviewed_at: string;
}

interface PilotRow {
  pilot_id: number | null;
  user_id: string;
  display_name: string;
  email: string;
  role_keys: string[] | null;
  enabled: boolean;
  valid_until: string | null;
  reason: string | null;
  updated_at: string | null;
}

export interface RecordPlanningAssistantReviewInput {
  suggestion: PlanningAssistantSuggestion;
  decision: PlanningAssistantDecision;
  comment: string;
  range: { start: string; end: string };
}

export interface SetPlanningAssistantPilotInput {
  userId: string;
  enabled: boolean;
  validUntil: string;
  reason: string;
}

export function mapPlanningAssistantReviews(rows: ReviewRow[]): PlanningAssistantReview[] {
  return rows.map((row) => ({
    id: row.id,
    suggestionKey: row.suggestion_key,
    suggestionType: row.suggestion_type,
    decision: row.decision,
    comment: row.comment,
    vesselId: row.vessel_id,
    personId: row.person_id,
    generatedForStart: row.generated_for_start,
    generatedForEnd: row.generated_for_end,
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
  }));
}

export function mapPlanningAssistantPilots(rows: PilotRow[]): PlanningAssistantPilot[] {
  return rows.map((row) => ({
    pilotId: row.pilot_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    roleKeys: row.role_keys || [],
    enabled: Boolean(row.enabled),
    validUntil: row.valid_until || '',
    reason: row.reason || '',
    updatedAt: row.updated_at || '',
  }));
}

async function callRpc<T>(
  client: SupabaseClient,
  operation: string,
  fallback: string,
  name: string,
  parameters?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, parameters);
  if (error) throwPlanningDataError(operation, fallback, error);
  return data as T;
}

export async function fetchPlanningAssistantReviews(client: SupabaseClient): Promise<PlanningAssistantReview[]> {
  const { data, error } = await client.from('planning_assistant_reviews')
    .select(REVIEW_SELECT)
    .order('reviewed_at', { ascending: false })
    .limit(250);
  if (error) throwPlanningDataError('load-assistant-reviews', 'Impossible de charger le journal de l’assistant.', error);
  return mapPlanningAssistantReviews((data || []) as ReviewRow[]);
}

export async function fetchPlanningAssistantPilots(client: SupabaseClient): Promise<PlanningAssistantPilot[]> {
  const rows = await callRpc<PilotRow[]>(
    client,
    'load-assistant-pilots',
    'Impossible de charger les accès pilote.',
    'list_planning_assistant_pilots',
  );
  return mapPlanningAssistantPilots(rows || []);
}

export async function fetchPlanningAssistantData(
  client: SupabaseClient,
  canManagePilots: boolean,
): Promise<PlanningAssistantData> {
  const [p13, reviews, pilots] = await Promise.all([
    fetchPlanningP13Data(client),
    fetchPlanningAssistantReviews(client),
    canManagePilots ? fetchPlanningAssistantPilots(client) : Promise.resolve([]),
  ]);
  return { p13, reviews, pilots };
}

export function recordPlanningAssistantReview(
  client: SupabaseClient,
  input: RecordPlanningAssistantReviewInput,
): Promise<number> {
  const comment = input.comment.trim();
  if (comment.length < 3) throw new Error('Le commentaire de décision doit contenir au moins 3 caractères.');
  if (!input.range.start || !input.range.end || input.range.end < input.range.start) throw new Error('La période de suggestion est invalide.');
  return callRpc(client, 'record-assistant-review', 'Impossible d’enregistrer la décision.', 'record_planning_assistant_review', {
    p_suggestion_key: input.suggestion.key,
    p_suggestion_type: input.suggestion.type,
    p_suggestion_snapshot: planningAssistantSuggestionSnapshot(input.suggestion),
    p_decision: input.decision,
    p_comment: comment,
    p_vessel_id: input.suggestion.vesselId,
    p_person_id: input.suggestion.personId,
    p_generated_for_start: input.range.start,
    p_generated_for_end: input.range.end,
  });
}

export function setPlanningAssistantPilot(client: SupabaseClient, input: SetPlanningAssistantPilotInput): Promise<number> {
  const reason = input.reason.trim();
  if (reason.length < 10) throw new Error('Le motif doit contenir au moins 10 caractères.');
  return callRpc(client, 'set-assistant-pilot', 'Impossible de modifier l’accès pilote.', 'set_planning_assistant_pilot', {
    p_user_id: input.userId,
    p_enabled: input.enabled,
    p_valid_until: input.enabled && input.validUntil ? input.validUntil : null,
    p_reason: reason,
  });
}
