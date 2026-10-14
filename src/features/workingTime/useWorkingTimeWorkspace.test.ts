import { deferred } from './workingTimeTestHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeWorkspace, type WorkingTimeWorkspace } from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';

vi.mock('./workingTimeQueries', async (original) => ({ ...await original<typeof import('./workingTimeQueries')>(), fetchWorkingTimeWorkspace: vi.fn() }));
const client = {} as SupabaseClient;
const august = { start: '2026-08-01', end: '2026-08-31' };
const data = { currentPersonId: 1 } as WorkingTimeWorkspace;
beforeEach(() => vi.clearAllMocks());
describe('working-time workspace request ownership', () => {
  it('removes the previous range immediately and ignores its delayed response', async () => {
    const old = deferred<WorkingTimeWorkspace>();
    const latest = deferred<WorkingTimeWorkspace>();
    vi.mocked(fetchWorkingTimeWorkspace).mockResolvedValueOnce(data).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const hook = renderHook(({ range }) => useWorkingTimeWorkspace(client, true, range), { initialProps: { range: august } });
    await waitFor(() => expect(hook.result.current.workspace).toBe(data));
    let oldReload!: Promise<boolean>;
    act(() => { oldReload = hook.result.current.reload(); });
    hook.rerender({ range: { start: '2026-09-01', end: '2026-09-30' } });
    expect(hook.result.current.workspace).toBeNull();
    await act(async () => { old.resolve(data); await oldReload; });
    expect(hook.result.current.workspace).toBeNull();
    const next = { currentPersonId: 2 } as WorkingTimeWorkspace;
    await act(async () => { latest.resolve(next); await latest.promise; });
    expect(hook.result.current.workspace).toBe(next);
  });
  it('clears loaded records when the client changes and the new load fails', async () => {
    vi.mocked(fetchWorkingTimeWorkspace).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('session denied'));
    const hook = renderHook(({ activeClient }) => useWorkingTimeWorkspace(activeClient, true, august), { initialProps: { activeClient: client } });
    await waitFor(() => expect(hook.result.current.workspace).toBe(data));
    hook.rerender({ activeClient: {} as SupabaseClient });
    await waitFor(() => expect(hook.result.current.errorMessage).toBe('session denied'));
    expect(hook.result.current.workspace).toBeNull();
  });
  it('ends loading when access is disabled while a request remains pending', async () => {
    const load = deferred<WorkingTimeWorkspace>();
    vi.mocked(fetchWorkingTimeWorkspace).mockReturnValue(load.promise);
    const hook = renderHook(({ enabled }) => useWorkingTimeWorkspace(client, enabled, august), { initialProps: { enabled: true } });
    expect(hook.result.current.isLoading).toBe(true);
    hook.rerender({ enabled: false });
    expect(hook.result.current.isLoading).toBe(false);
    await act(async () => { load.resolve(data); await load.promise; });
    expect(hook.result.current.workspace).toBeNull();
  });
  it('does not let an obsolete reload callback cancel a new period’s request', async () => {
    const latest = deferred<WorkingTimeWorkspace>();
    vi.mocked(fetchWorkingTimeWorkspace).mockResolvedValueOnce(data).mockReturnValueOnce(latest.promise);
    const hook = renderHook(({ range }) => useWorkingTimeWorkspace(client, true, range), { initialProps: { range: august } });
    await waitFor(() => expect(hook.result.current.workspace).toBe(data));
    const oldReload = hook.result.current.reload;
    hook.rerender({ range: { start: '2026-09-01', end: '2026-09-30' } });
    await act(async () => { expect(await oldReload()).toBe(false); });
    expect(fetchWorkingTimeWorkspace).toHaveBeenCalledTimes(2);
    const next = { currentPersonId: 2 } as WorkingTimeWorkspace;
    await act(async () => { latest.resolve(next); await latest.promise; });
    expect(hook.result.current.workspace).toBe(next);
  });
});
