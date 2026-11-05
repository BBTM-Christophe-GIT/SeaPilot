import type { SupabaseClient } from '@supabase/supabase-js';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHARMACY_ALERT_FOCUS_MS, PHARMACY_ALERT_REFRESH_MS, PHARMACY_NOTIFICATIONS_CHANGED, usePharmacyAlertPolling } from './usePharmacyAlertPolling';

const client = {} as SupabaseClient;

describe('Pharmacy alert polling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces focus and visibility, then polls only while visible', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const load = vi.fn().mockResolvedValue([]);
    const { unmount } = renderHook(() => usePharmacyAlertPolling(client, 'marin', load));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(PHARMACY_ALERT_FOCUS_MS);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(load).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(PHARMACY_ALERT_REFRESH_MS));
    expect(load).toHaveBeenCalledTimes(3);

    visibility.mockReturnValue('hidden');
    await act(async () => vi.advanceTimersByTimeAsync(PHARMACY_ALERT_REFRESH_MS * 2));
    expect(load).toHaveBeenCalledTimes(3);
    visibility.mockReturnValue('visible');
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(load).toHaveBeenCalledTimes(4);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(PHARMACY_ALERT_REFRESH_MS));
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('waits for the current request and refreshes once after concurrent changes', async () => {
    let finish!: (rows: string[]) => void;
    const pending = new Promise<string[]>(resolve => { finish = resolve; });
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(['updated']);
    const { result } = renderHook(() => usePharmacyAlertPolling(client, 'capitaine', load));

    act(() => {
      window.dispatchEvent(new Event(PHARMACY_NOTIFICATIONS_CHANGED));
      window.dispatchEvent(new Event(PHARMACY_NOTIFICATIONS_CHANGED));
      result.current.refresh();
    });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => finish(['stale']));
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(['updated']);
  });

  it('ignores a late response from a prior account or role scope', async () => {
    let finish!: (rows: string[]) => void;
    const pending = new Promise<string[]>(resolve => { finish = resolve; });
    const load = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(['new scope']);
    const initialProps: { scope: string | undefined } = { scope: 'first:admin' };
    const { result, rerender } = renderHook(
      ({ scope }) => usePharmacyAlertPolling(client, scope, load),
      { initialProps },
    );
    rerender({ scope: 'second:marin' });
    await act(async () => finish(['prior scope']));
    expect(result.current.data).toEqual(['new scope']);
    rerender({ scope: undefined });
    expect(result.current.data).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
