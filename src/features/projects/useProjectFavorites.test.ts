import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useProjectFavorites } from './useProjectFavorites';

describe('personal project favorites', () => {
  it('discards an old account mutation after signing into another account', async () => {
    let authChanged: (event: string, session: { user: { id: string } }) => void = () => undefined;
    let finishSave: (result: { error: null }) => void = () => undefined;
    const select = vi.fn().mockResolvedValueOnce({ data: [{ project_id: 10 }], error: null }).mockResolvedValue({ data: [{ project_id: 20 }], error: null });
    const unsubscribe = vi.fn();
    const client = {
      from: vi.fn(() => ({ select })),
      rpc: vi.fn(() => new Promise<{ error: null }>((resolve) => { finishSave = resolve; })),
      auth: { onAuthStateChange: vi.fn((callback) => {
        authChanged = callback;
        callback('INITIAL_SESSION', { user: { id: 'user-A' } });
        return { data: { subscription: { unsubscribe } } };
      }) },
    };
    const { result, unmount } = renderHook(() => useProjectFavorites(client as never));
    await waitFor(() => expect([...result.current.ids]).toEqual([10]));
    let save: Promise<void>;
    act(() => { save = result.current.toggle(30); });
    expect(result.current.pending.has(30)).toBe(true);
    act(() => authChanged('SIGNED_IN', { user: { id: 'user-B' } }));
    await waitFor(() => expect([...result.current.ids]).toEqual([20]));
    await act(async () => { finishSave({ error: null }); await save; });
    expect([...result.current.ids]).toEqual([20]);
    expect(result.current.pending.size).toBe(0);
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('reports a loading failure and restores persisted favorites on retry', async () => {
    const select = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'offline' } }).mockResolvedValue({ data: [{ project_id: 5 }], error: null });
    const client = { from: vi.fn(() => ({ select })) };
    const { result } = renderHook(() => useProjectFavorites(client as never));
    await waitFor(() => expect(result.current.error).toContain('chargés'));
    act(() => result.current.retry());
    await waitFor(() => expect([...result.current.ids]).toEqual([5]));
    expect(result.current.error).toBe('');
  });
});
