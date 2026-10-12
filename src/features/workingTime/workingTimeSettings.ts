import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkingTimeEditSettings {
  unrestrictedEditingEnabled: boolean;
  canUseUnrestrictedEditing: boolean;
}

export async function fetchWorkingTimeEditSettings(client: SupabaseClient): Promise<WorkingTimeEditSettings> {
  const { data, error } = await client.rpc('working_time_get_edit_settings');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    unrestricted_editing_enabled?: unknown;
    can_use_unrestricted_editing?: unknown;
  } | null;
  return {
    unrestrictedEditingEnabled: row?.unrestricted_editing_enabled === true,
    canUseUnrestrictedEditing: row?.can_use_unrestricted_editing === true,
  };
}

export async function saveWorkingTimeEditSettings(
  client: SupabaseClient,
  settings: Pick<WorkingTimeEditSettings, 'unrestrictedEditingEnabled'>,
): Promise<WorkingTimeEditSettings> {
  const { data, error } = await client.rpc('working_time_save_edit_settings', {
    p_unrestricted_editing_enabled: settings.unrestrictedEditingEnabled,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as {
    unrestricted_editing_enabled?: unknown;
    can_use_unrestricted_editing?: unknown;
  } | null;
  if (typeof row?.unrestricted_editing_enabled !== 'boolean'
    || typeof row.can_use_unrestricted_editing !== 'boolean') {
    throw new Error('Le réglage du suivi du temps de travail n’a pas été confirmé.');
  }
  return {
    unrestrictedEditingEnabled: row.unrestricted_editing_enabled,
    canUseUnrestrictedEditing: row.can_use_unrestricted_editing,
  };
}
