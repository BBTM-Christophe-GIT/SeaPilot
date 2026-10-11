import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeWorkspace, type WorkingTimeWorkspace } from './workingTimeQueries';
import { useWorkingTimeWorkspace } from './useWorkingTimeWorkspace';

vi.mock('./workingTimeQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./workingTimeQueries')>();
  return { ...original, fetchWorkingTimeWorkspace: vi.fn() };
});

describe('working-time workspace loading', () => {
  it('keeps the loaded month distinguishable while another month is loading', async () => {
    const client = {} as SupabaseClient;
    const august = { currentPersonId: 10 } as WorkingTimeWorkspace;
    const september = { currentPersonId: 20 } as WorkingTimeWorkspace;
    const augustRange = { start: '2026-08-01', end: '2026-08-31' };
    const septemberRange = { start: '2026-09-01', end: '2026-09-30' };
    let finishSeptember!: (workspace: WorkingTimeWorkspace) => void;
    vi.mocked(fetchWorkingTimeWorkspace).mockResolvedValueOnce(august)
      .mockReturnValueOnce(new Promise(resolve => { finishSeptember = resolve; }));
    const hook = renderHook(({ range }) => useWorkingTimeWorkspace(client, true, range), {
      initialProps: { range: augustRange },
    });
    await waitFor(() => expect(hook.result.current.loadedRange).toEqual(augustRange));

    hook.rerender({ range: septemberRange });
    expect(hook.result.current.isLoading).toBe(true);
    expect(hook.result.current.workspace).toBe(august);
    expect(hook.result.current.loadedRange).toEqual(augustRange);

    await act(async () => { finishSeptember(september); });
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.workspace).toBe(september);
    expect(hook.result.current.loadedRange).toEqual(septemberRange);
  });
});
