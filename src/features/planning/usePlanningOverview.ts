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
  const { vessels, people, boardRows, genericCrewRows, assignments, fleetFunctionOrder, days, periods, projects, certificates,
    hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications } = overview;
  return useMemo(() => ({
    ...EMPTY_PLANNING_OVERVIEW, vessels, people, boardRows, genericCrewRows, assignments, fleetFunctionOrder, days, periods, projects,
    certificates, hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications,
  }), [vessels, people, boardRows, genericCrewRows, assignments, fleetFunctionOrder, days, periods, projects, certificates,
    hrDocuments, annualReviews, rules, handovers, derogations, derogationHistory, publications]);
}

interface PlanningLoadState {
  overview: PlanningOverview;
  phase: PlanningLoadPhase;
  hasLoaded: boolean;
  errorMessage: string | null;
  historyErrorMessage: string | null;
  historyLoading: boolean;
}

export function usePlanningOverview(
  client: SupabaseClient,
  enabled: boolean,
  previewOverview?: PlanningOverview,
  publishedOnly = false,
) {
  const requestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
  const [state, setState] = useState<PlanningLoadState>({
    overview: previewOverview || EMPTY_PLANNING_OVERVIEW,
    phase: previewOverview ? 'ready' : enabled ? 'loading' : 'idle',
    hasLoaded: Boolean(previewOverview),
    errorMessage: null,
    historyErrorMessage: null,
    historyLoading: false,
  });

  const reload = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    const requestId = ++requestIdRef.current;
    const historyRequestId = ++historyRequestIdRef.current;
    if (previewOverview) {
      setState({ overview: previewOverview, phase: 'ready', hasLoaded: true, errorMessage: null, historyErrorMessage: null, historyLoading: false });
      return true;
    }
    setState((current) => ({
      ...current,
      phase: current.hasLoaded ? 'refreshing' : 'loading',
      errorMessage: null,
      historyErrorMessage: null,
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
      setState((current) => {
        if (requestId !== requestIdRef.current) return current;
        const ownsHistory = historyRequestId === historyRequestIdRef.current;
        return {
          overview: ownsHistory ? overview : { ...overview, history: current.overview.history },
          phase: 'ready', hasLoaded: true,
          errorMessage: null,
          historyErrorMessage: ownsHistory ? null : current.historyErrorMessage,
          historyLoading: ownsHistory ? Boolean(historyRequest) : current.historyLoading,
        };
      });
      if (historyRequest) void historyRequest.then(({ history, error }) => {
        if (requestId !== requestIdRef.current || historyRequestId !== historyRequestIdRef.current) return;
        setState((current) => requestId !== requestIdRef.current || historyRequestId !== historyRequestIdRef.current ? current : ({
          ...current,
          overview: history && current.overview.history === overview.history
            ? { ...current.overview, history }
            : current.overview,
          historyLoading: false,
          historyErrorMessage: error && current.overview.history === overview.history
            ? planningErrorMessage(error, 'Impossible de charger l’historique du Planning.') : current.historyErrorMessage,
        }));
      });
      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current) return false;
      setState((current) => ({
        ...current,
        phase: current.hasLoaded ? 'ready' : 'error',
        errorMessage: planningErrorMessage(error, 'Impossible de charger le planning.'),
        historyLoading: historyRequestId === historyRequestIdRef.current ? false : current.historyLoading,
      }));
      return false;
    }
  }, [client, enabled, previewOverview, publishedOnly]);

  const reloadHistory = useCallback(async (): Promise<boolean> => {
    if (!enabled || previewOverview || publishedOnly) return false;
    const requestId = requestIdRef.current;
    const historyRequestId = ++historyRequestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current && historyRequestId === historyRequestIdRef.current;
    setState((current) => ({ ...current, historyLoading: true, historyErrorMessage: null }));
    try {
      const history = await fetchPlanningHistory(client);
      if (!isCurrent()) return false;
      setState((current) => isCurrent() ? {
        ...current, overview: { ...current.overview, history }, historyLoading: false,
      } : current);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setState((current) => isCurrent() ? {
        ...current, historyLoading: false,
        historyErrorMessage: planningErrorMessage(error, 'Impossible de charger l’historique du Planning.'),
      } : current);
      return false;
    }
  }, [client, enabled, previewOverview, publishedOnly]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      historyRequestIdRef.current += 1;
      return;
    }
    void reload();
    return () => {
      requestIdRef.current += 1;
      historyRequestIdRef.current += 1;
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
    reloadHistory,
    hasLoaded: state.hasLoaded,
    isInitialLoading: state.phase === 'loading' && !state.hasLoaded,
    isRefreshing: state.phase === 'refreshing',
    loadErrorMessage: state.errorMessage || state.historyErrorMessage,
    isHistoryLoading: state.historyLoading,
  };
}
