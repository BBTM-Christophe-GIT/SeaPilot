import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPlanningHistory, fetchPlanningOverview, type PlanningHistoryRecord } from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW, usePlanningCoreOverview, usePlanningOverview } from './usePlanningOverview';

vi.mock('./planningQueries', async (original) => ({
  ...await original<typeof import('./planningQueries')>(),
  fetchPlanningOverview: vi.fn(), fetchPlanningHistory: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchPlanningOverview).mockResolvedValue(EMPTY_PLANNING_OVERVIEW);
  vi.mocked(fetchPlanningHistory).mockResolvedValue([]);
});

describe('independent Planning history loading', () => {
  it('makes the grid ready while the audit feed is still pending', async () => {
    const history = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockReturnValue(history.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isHistoryLoading).toBe(true);
    await act(() => history.resolve([]));
    expect(result.current.isHistoryLoading).toBe(false);
  });

  it('reports a history failure without hiding the loaded grid', async () => {
    vi.mocked(fetchPlanningHistory).mockRejectedValue(new Error('Historique indisponible'));
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.loadErrorMessage).toBe('Historique indisponible'));
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.isInitialLoading).toBe(false);
  });

  it('does not replace a more recent journal with an older in-flight response', async () => {
    const history = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockReturnValue(history.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    const recent = [{ id: 42 }] as PlanningHistoryRecord[];
    act(() => result.current.updateOverview((current) => ({ ...current, history: recent })));
    await act(() => history.resolve([]));
    expect(result.current.overview.history).toBe(recent);
  });

  it('keeps Marin and Capitaine on published data without querying the live journal', async () => {
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true, undefined, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(fetchPlanningOverview).toHaveBeenCalledWith(client, { publishedOnly: true, includeHistory: false, cachedPeriods: true });
    expect(fetchPlanningHistory).not.toHaveBeenCalled();
  });

  it('still loads the journal when a daily edit only updates operational data', async () => {
    const history = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockReturnValue(history.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    act(() => result.current.updateOverview((current) => ({ ...current, days: [] })));
    const rows = [{ id: 41 }] as PlanningHistoryRecord[];
    await act(() => history.resolve(rows));
    expect(result.current.overview.history).toBe(rows);
    expect(result.current.isHistoryLoading).toBe(false);
  });

  it('keeps operational selectors stable when only history or versions change', () => {
    const { result, rerender } = renderHook(({ overview }) => usePlanningCoreOverview(overview), {
      initialProps: { overview: EMPTY_PLANNING_OVERVIEW },
    });
    const initial = result.current;
    rerender({ overview: { ...EMPTY_PLANNING_OVERVIEW, history: [{ id: 42 }] as PlanningHistoryRecord[] } });
    expect(result.current).toBe(initial);
    rerender({ overview: { ...EMPTY_PLANNING_OVERVIEW, periods: [] } });
    expect(result.current).not.toBe(initial);
  });
});
