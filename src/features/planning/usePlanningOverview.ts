import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planningErrorMessage } from './planningErrors';
import { fetchPlanningHistory, fetchPlanningOverview, type PlanningOverview } from './planningQueries';

export const EMPTY_PLANNING_OVERVIEW: PlanningOverview = {
  vessels: [],
  people: [],
  boardRows: [],
  assignments: [],
  days: [],
  periods: [],
  projects: [],
  certificates: [],
  hrDocuments: [],
  annualReviews: [],
  rules: [],
  publications: [],
  versions: [],
  history: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

type PlanningLoadPhase = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';

// Audit/version metadata changes independently of the operational data. Keep
// the latter stable so a completed history request does not rebuild every lane.
export function usePlanningCoreOverview(overview: PlanningOverview): PlanningOverview {
  const { vessels, people, boardRows, assignments, days, periods, projects, certificates,
    hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications } = overview;
  return useMemo(() => ({
    ...EMPTY_PLANNING_OVERVIEW, vessels, people, boardRows, assignments, days, periods, projects,
    certificates, hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications,
  }), [vessels, people, boardRows, assignments, days, periods, projects, certificates,
    hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications]);
}

interface PlanningLoadState {
  overview: PlanningOverview;
  phase: PlanningLoadPhase;
  hasLoaded: boolean;
  errorMessage: string | null;
  historyLoading: boolean;
}

export function usePlanningOverview(
  client: SupabaseClient,
  enabled: boolean,
  previewOverview?: PlanningOverview,
  publishedOnly = false,
) {
  const requestIdRef = useRef(0);
  const [state, setState] = useState<PlanningLoadState>({
    overview: previewOverview || EMPTY_PLANNING_OVERVIEW,
    phase: previewOverview ? 'ready' : enabled ? 'loading' : 'idle',
    hasLoaded: Boolean(previewOverview),
    errorMessage: null,
    historyLoading: false,
  });

  const reload = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    if (previewOverview) {
      setState({ overview: previewOverview, phase: 'ready', hasLoaded: true, errorMessage: null, historyLoading: false });
      return true;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({
      ...current,
      phase: current.hasLoaded ? 'refreshing' : 'loading',
      errorMessage: null,
      historyLoading: !publishedOnly,
    }));

    // The audit feed must not hold the operational grid hostage. Catch at once
    // so a fast history failure never becomes an unhandled rejection.
    const historyRequest = publishedOnly ? null : fetchPlanningHistory(client).then(
      (history) => ({ history, error: null }),
      (error: unknown) => ({ history: null, error }),
    );

    try {
      const overview = await fetchPlanningOverview(client, { publishedOnly, includeHistory: false, cachedPeriods: true });
      if (requestId !== requestIdRef.current) return false;
      setState({
        overview,
        phase: 'ready', hasLoaded: true, errorMessage: null, historyLoading: Boolean(historyRequest),
      });
      if (historyRequest) void historyRequest.then(({ history, error }) => {
        if (requestId !== requestIdRef.current) return;
        setState((current) => ({
          ...current,
          overview: history && current.overview.history === overview.history
            ? { ...current.overview, history }
            : current.overview,
          historyLoading: false,
          errorMessage: error && current.overview.history === overview.history
            ? planningErrorMessage(error, 'Impossible de charger l’historique du Planning.') : current.errorMessage,
        }));
      });
      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current) return false;
      setState((current) => ({
        ...current,
        phase: current.hasLoaded ? 'ready' : 'error',
        errorMessage: planningErrorMessage(error, 'Impossible de charger le planning.'),
        historyLoading: false,
      }));
      return false;
    }
  }, [client, enabled, previewOverview, publishedOnly]);

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
    isHistoryLoading: state.historyLoading,
  };
}
