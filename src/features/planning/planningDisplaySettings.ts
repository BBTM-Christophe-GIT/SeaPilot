import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export interface PlanningDisplaySettings {
  activeFilterEnabled: boolean;
}

const DEFAULT_SETTINGS: PlanningDisplaySettings = { activeFilterEnabled: false };

export async function fetchPlanningDisplaySettings(client: SupabaseClient, personal = false): Promise<PlanningDisplaySettings> {
  const { data, error } = await client.from('planning_display_settings')
    .select('active_filter_enabled').maybeSingle();
  if (error) throw error;
  if (personal) {
    const result = await client.from('planning_personal_display_settings').select('active_filter_enabled').maybeSingle();
    if (result.error) throw result.error;
    if (typeof result.data?.active_filter_enabled === 'boolean') return { activeFilterEnabled: result.data.active_filter_enabled };
  }
  return { activeFilterEnabled: data?.active_filter_enabled === true };
}

export async function savePlanningDisplaySettings(
  client: SupabaseClient,
  settings: PlanningDisplaySettings,
  personal = false,
): Promise<PlanningDisplaySettings> {
  const { data, error } = await client.rpc(personal ? 'planning_save_personal_display_settings' : 'planning_save_display_settings', {
    p_active_filter_enabled: settings.activeFilterEnabled,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row?.active_filter_enabled !== 'boolean') throw new Error('Réglage non confirmé par le serveur.');
  return { activeFilterEnabled: row.active_filter_enabled };
}

export function usePlanningDisplaySettings(client: SupabaseClient, enabled = true, personal = false) {
  const [result, setResult] = useState<{ client: SupabaseClient; settings: PlanningDisplaySettings; error: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    fetchPlanningDisplaySettings(client, personal).then(
      (settings) => { if (mounted) setResult({ client, settings, error: '' }); },
      () => {
        if (!mounted) return;
        setResult({ client, settings: DEFAULT_SETTINGS,
          error: 'Impossible de charger le filtre actif. Le planning conserve son affichage habituel.' });
      },
    );
    return () => { mounted = false; };
  }, [client, enabled, personal]);

  const current = result?.client === client ? result : null;
  return {
    settings: current?.settings || DEFAULT_SETTINGS,
    setSettings: (settings: PlanningDisplaySettings) => setResult({ client, settings, error: '' }),
    isLoading: enabled && !current,
    error: current?.error || '',
  };
}
