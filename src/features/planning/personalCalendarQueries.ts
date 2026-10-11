import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAppEnv } from '../../lib/env';
import { serializePlanningCalendar, type PlanningCalendarFeed } from '../../../supabase/functions/planning-calendar/ics.ts';

export interface PlanningCalendarSubscription {
  active: boolean;
  eligible: boolean;
  created_at: string | null;
}

export async function fetchPlanningCalendarSubscription(client: SupabaseClient): Promise<PlanningCalendarSubscription> {
  const { data, error } = await client.rpc('get_planning_calendar_subscription');
  if (error || !data) throw new Error('Impossible de charger votre calendrier personnel. Réessayez.');
  return data as PlanningCalendarSubscription;
}

export function buildPlanningCalendarUrl(token: string, baseUrl = loadAppEnv().supabaseUrl): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Le lien d’abonnement reçu est invalide.');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('L’adresse du calendrier est invalide.');
  }
  return new URL(`/functions/v1/planning-calendar/${token}/planning.ics`, base.origin).href;
}

export async function createPlanningCalendarSubscription(client: SupabaseClient): Promise<{ url: string; createdAt: string }> {
  const { data, error } = await client.rpc('create_planning_calendar_subscription');
  if (error || !data?.token) throw new Error('Impossible de créer votre lien d’abonnement. Réessayez.');
  return { url: buildPlanningCalendarUrl(String(data.token)), createdAt: String(data.created_at) };
}

export async function revokePlanningCalendarSubscription(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('revoke_planning_calendar_subscription');
  if (error) throw new Error('Impossible de désactiver votre abonnement. Réessayez.');
}

export async function fetchPersonalPlanningIcs(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.rpc('personal_planning_calendar');
  if (error || !data) throw new Error('Impossible de télécharger votre planning. Réessayez.');
  try { return serializePlanningCalendar(data as PlanningCalendarFeed); }
  catch { throw new Error('Impossible de télécharger votre planning. Réessayez.'); }
}
