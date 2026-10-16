import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPlanningHistory, fetchPlanningOverview, type PlanningHistoryRecord, type PlanningOverview } from './planningQueries';
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

  it('reloads only history while the operational grid and selectors stay ready', async () => {
    const pending = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => {
      const data = usePlanningOverview(client, true);
      return { ...data, core: usePlanningCoreOverview(data.overview) };
    });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    const core = result.current.core;
    let request!: Promise<boolean>;
    act(() => { request = result.current.reloadHistory(); });
    expect(result.current.isHistoryLoading).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isInitialLoading).toBe(false);
    expect(fetchPlanningOverview).toHaveBeenCalledOnce();
    const history = [{ id: 42 }] as PlanningHistoryRecord[];
    await act(() => pending.resolve(history));
    expect(await request).toBe(true);
    expect(result.current.overview.history).toBe(history);
    expect(result.current.core).toBe(core);
    expect(result.current.isHistoryLoading).toBe(false);
  });

  it('ignores the initial journal when a newer history refresh is pending', async () => {
    const initial = deferred<PlanningHistoryRecord[]>();
    const refreshed = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockReturnValueOnce(initial.promise).mockReturnValueOnce(refreshed.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    let request!: Promise<boolean>;
    act(() => { request = result.current.reloadHistory(); });
    await act(() => initial.resolve([{ id: 1 }] as PlanningHistoryRecord[]));
    expect(result.current.overview.history).toEqual([]);
    expect(result.current.isHistoryLoading).toBe(true);
    const history = [{ id: 42 }] as PlanningHistoryRecord[];
    await act(() => refreshed.resolve(history));
    expect(await request).toBe(true);
    expect(result.current.overview.history).toBe(history);
  });

  it('keeps a newer history result even when it finishes before the operational load', async () => {
    const overview = deferred<PlanningOverview>();
    const initial = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningOverview).mockReturnValue(overview.promise);
    const history = [{ id: 42 }] as PlanningHistoryRecord[];
    vi.mocked(fetchPlanningHistory).mockReturnValueOnce(initial.promise).mockResolvedValueOnce(history);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await act(async () => { expect(await result.current.reloadHistory()).toBe(true); });
    await act(() => overview.resolve(EMPTY_PLANNING_OVERVIEW));
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.overview.history).toBe(history);
    expect(result.current.isHistoryLoading).toBe(false);
    await act(() => initial.resolve([]));
    expect(result.current.overview.history).toBe(history);
  });

  it('ignores an older history error after a newer refresh finishes', async () => {
    const older = deferred<PlanningHistoryRecord[]>();
    const newer = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockResolvedValueOnce([]).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    let oldRequest!: Promise<boolean>;
    let newRequest!: Promise<boolean>;
    act(() => { oldRequest = result.current.reloadHistory(); newRequest = result.current.reloadHistory(); });
    const history = [{ id: 42 }] as PlanningHistoryRecord[];
    await act(() => newer.resolve(history));
    expect(await newRequest).toBe(true);
    await act(() => older.reject(new Error('Ancien journal indisponible')));
    expect(await oldRequest).toBe(false);
    expect(result.current.overview.history).toBe(history);
    expect(result.current.loadErrorMessage).toBeNull();
    expect(result.current.isHistoryLoading).toBe(false);
  });

  it.each(['functional', 'value'] as const)('keeps history supplied by a newer %s update over a pending background response', async (update) => {
    const pending = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    let request!: Promise<boolean>;
    act(() => { request = result.current.reloadHistory(); });
    const recent = [{ id: 42 }] as PlanningHistoryRecord[];
    act(() => result.current.updateOverview(update === 'functional'
      ? (current) => ({ ...current, history: recent })
      : { ...result.current.overview, history: recent }));
    expect(result.current.isHistoryLoading).toBe(false);
    await act(() => pending.resolve([{ id: 1 }] as PlanningHistoryRecord[]));
    expect(await request).toBe(false);
    expect(result.current.overview.history).toBe(recent);
    expect(result.current.loadErrorMessage).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)('does not leave history loading when a batched journal update supersedes a refresh that will %s', async (settlement) => {
    const pending = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    const recent = [{ id: 42 }] as PlanningHistoryRecord[];
    let request!: Promise<boolean>;
    act(() => {
      result.current.updateOverview({ ...result.current.overview, history: recent });
      request = result.current.reloadHistory();
    });
    expect(result.current.isHistoryLoading).toBe(false);
    await act(() => {
      if (settlement === 'resolve') pending.resolve([{ id: 1 }] as PlanningHistoryRecord[]);
      else pending.reject(new Error('Ancien journal indisponible'));
    });
    expect(await request).toBe(false);
    expect(result.current.overview.history).toBe(recent);
    expect(result.current.isHistoryLoading).toBe(false);
    expect(result.current.loadErrorMessage).toBeNull();
  });

  it.each(['client', 'profile', 'reload'] as const)('invalidates a history refresh after an operational %s change', async (change) => {
    const pending = deferred<PlanningHistoryRecord[]>();
    vi.mocked(fetchPlanningHistory).mockResolvedValueOnce([]).mockReturnValueOnce(pending.promise);
    const client = {} as SupabaseClient;
    const { result, rerender } = renderHook((props) => usePlanningOverview(props.client, true, undefined, props.publishedOnly), {
      initialProps: { client, publishedOnly: false },
    });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    let request!: Promise<boolean>;
    act(() => { request = result.current.reloadHistory(); });
    if (change === 'reload') await act(async () => { await result.current.reload(); });
    else rerender({ client: change === 'client' ? {} as SupabaseClient : client, publishedOnly: change === 'profile' });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    await act(() => pending.resolve([{ id: 1 }] as PlanningHistoryRecord[]));
    expect(await request).toBe(false);
    expect(result.current.overview.history).toEqual([]);
    expect(result.current.isHistoryLoading).toBe(false);
    if (change === 'profile') {
      await expect(result.current.reloadHistory()).resolves.toBe(false);
      expect(fetchPlanningHistory).toHaveBeenCalledTimes(2);
    }
  });

  it('reports a background history error explicitly and clears it after a successful retry', async () => {
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    vi.mocked(fetchPlanningHistory).mockRejectedValueOnce(new Error('Journal indisponible'));
    await act(async () => { expect(await result.current.reloadHistory()).toBe(false); });
    expect(result.current.loadErrorMessage).toBe('Journal indisponible');
    expect(result.current.isHistoryLoading).toBe(false);
    expect(result.current.hasLoaded).toBe(true);
    await act(async () => { expect(await result.current.reloadHistory()).toBe(true); });
    expect(result.current.loadErrorMessage).toBeNull();
    expect(fetchPlanningOverview).toHaveBeenCalledOnce();
  });

  it('does not clear an operational refresh error when history alone succeeds', async () => {
    const client = {} as SupabaseClient;
    const { result } = renderHook(() => usePlanningOverview(client, true));
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    vi.mocked(fetchPlanningOverview).mockRejectedValueOnce(new Error('Affectations indisponibles'));
    await act(async () => { expect(await result.current.reload()).toBe(false); });
    await act(async () => { expect(await result.current.reloadHistory()).toBe(true); });
    expect(result.current.loadErrorMessage).toBe('Affectations indisponibles');
    expect(result.current.hasLoaded).toBe(true);
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
