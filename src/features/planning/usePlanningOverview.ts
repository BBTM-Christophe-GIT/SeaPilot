import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planningErrorMessage } from './planningErrors';
import { fetchPlanningOverview, type PlanningOverview } from './planningQueries';

export const EMPTY_PLANNING_OVERVIEW: PlanningOverview = {
  vessels: [],
  people: [],
  assignments: [],
  days: [],
  periods: [],
  projects: [],
  certificates: [],
  hrDocuments: [],
  rules: [],
  publications: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

type PlanningLoadPhase = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';

interface PlanningLoadState {
  overview: PlanningOverview;
  phase: PlanningLoadPhase;
  hasLoaded: boolean;
  errorMessage: string | null;
}

export function usePlanningOverview(client: SupabaseClient, enabled: boolean) {
  const requestIdRef = useRef(0);
  const [state, setState] = useState<PlanningLoadState>({
    overview: EMPTY_PLANNING_OVERVIEW,
    phase: enabled ? 'loading' : 'idle',
    hasLoaded: false,
    errorMessage: null,
  });

  const reload = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({
      ...current,
      phase: current.hasLoaded ? 'refreshing' : 'loading',
      errorMessage: null,
    }));

    try {
      const overview = await fetchPlanningOverview(client);
      if (requestId !== requestIdRef.current) return false;
      setState({ overview, phase: 'ready', hasLoaded: true, errorMessage: null });
      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current) return false;
      setState((current) => ({
        ...current,
        phase: current.hasLoaded ? 'ready' : 'error',
        errorMessage: planningErrorMessage(error, 'Impossible de charger le planning.'),
      }));
      return false;
    }
  }, [client, enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      return;
    }
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, reload]);

  const updateOverview = useCallback((action: SetStateAction<PlanningOverview>) => {
    setState((current) => ({
      ...current,
      overview: typeof action === 'function' ? action(current.overview) : action,
      hasLoaded: true,
      phase: 'ready',
    }));
  }, []);

  return {
    overview: state.overview,
    updateOverview,
    reload,
    hasLoaded: state.hasLoaded,
    isInitialLoading: state.phase === 'loading' && !state.hasLoaded,
    isRefreshing: state.phase === 'refreshing',
    loadErrorMessage: state.errorMessage,
  };
}
