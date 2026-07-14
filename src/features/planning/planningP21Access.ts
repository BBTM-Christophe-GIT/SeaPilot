import type { SupabaseClient } from '@supabase/supabase-js';
import { throwPlanningDataError } from './planningErrors';
import type { PlanningAssistantAccess } from './planningP21';

interface AccessRow {
  has_access: boolean;
  access_mode: 'administrator' | 'pilot' | 'none';
  expires_on: string | null;
  can_manage_pilots: boolean;
}

export function mapPlanningAssistantAccess(rows: AccessRow[]): PlanningAssistantAccess {
  const row = rows[0];
  return row ? {
    hasAccess: Boolean(row.has_access),
    accessMode: row.access_mode,
    expiresOn: row.expires_on || '',
    canManagePilots: Boolean(row.can_manage_pilots),
  } : { hasAccess: false, accessMode: 'none', expiresOn: '', canManagePilots: false };
}

export async function fetchPlanningAssistantAccess(client: SupabaseClient): Promise<PlanningAssistantAccess> {
  const { data, error } = await client.rpc('get_planning_assistant_access');
  if (error) throwPlanningDataError('load-assistant-access', 'Impossible de vérifier l’accès pilote à l’assistant.', error);
  return mapPlanningAssistantAccess((data || []) as AccessRow[]);
}
