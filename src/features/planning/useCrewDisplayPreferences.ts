import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { DEFAULT_CREW_PREFERENCES, fetchCrewDisplayPreferences, type CrewDisplayPreferences } from './planningCrewPreferences';

export function useCrewDisplayPreferences(client: SupabaseClient, enabled: boolean) {
  const [result, setResult] = useState<{ client: SupabaseClient; preferences: CrewDisplayPreferences; error: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchCrewDisplayPreferences(client).then((preferences) => {
      if (active) setResult({ client, preferences, error: '' });
    }).catch(() => {
      if (active) setResult({ client, preferences: DEFAULT_CREW_PREFERENCES, error: 'Vos préférences Équipages n’ont pas pu être chargées. L’affichage par défaut est utilisé.' });
    });
    return () => { active = false; };
  }, [client, enabled]);
  return enabled && result?.client === client ? result : { preferences: DEFAULT_CREW_PREFERENCES, error: '' };
}
