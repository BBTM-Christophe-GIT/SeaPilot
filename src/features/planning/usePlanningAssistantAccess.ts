import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { planningErrorMessage } from './planningErrors';
import type { PlanningAssistantAccess } from './planningP21';
import { fetchPlanningAssistantAccess } from './planningP21Access';

const NO_ACCESS: PlanningAssistantAccess = {
  hasAccess: false,
  accessMode: 'none',
  expiresOn: '',
  canManagePilots: false,
};

export function usePlanningAssistantAccess(client: SupabaseClient, enabled: boolean, eligible: boolean) {
  const [access, setAccess] = useState<PlanningAssistantAccess>(NO_ACCESS);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!enabled || !eligible) {
      return () => { active = false; };
    }
    void fetchPlanningAssistantAccess(client)
      .then((result) => {
        if (!active) return;
        setAccess(result);
        setErrorMessage('');
      })
      .catch((error) => {
        if (!active) return;
        setAccess(NO_ACCESS);
        setErrorMessage(planningErrorMessage(error, 'Impossible de vérifier l’accès à l’assistant.'));
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [client, enabled, eligible]);

  return enabled && eligible
    ? { access, isLoading, errorMessage }
    : { access: NO_ACCESS, isLoading: false, errorMessage: '' };
}
