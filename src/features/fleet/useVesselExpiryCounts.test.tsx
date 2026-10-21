import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVesselExpiryCounts } from './useVesselExpiryCounts';
import type { VesselExpiryCounts } from './vesselExpiryAlerts';

type Counts = Record<number, VesselExpiryCounts>;
function deferred() {
  let resolve!: (value: Counts) => void;
  const promise = new Promise<Counts>((done) => { resolve = done; });
  return { promise, resolve };
}
describe('vessel expiry refresh', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T21:59:00Z')); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('distinguishes failed counts from zero and refreshes on retry keys', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('Lecture refusée')).mockResolvedValue({});
    const { result, rerender } = renderHook(({ key }) => useVesselExpiryCounts(loader, key), { initialProps: { key: 0 } });
    await act(async () => {});
    expect(result.current).toMatchObject({ counts: null, loading: false, error: 'Lecture refusée' });
    rerender({ key: 1 });
    await act(async () => {});
    expect(result.current).toMatchObject({ counts: {}, loading: false, error: '' });
  });

  it('ignores a slower response from a previous register or client', async () => {
    const first = deferred(); const next = deferred();
    const original = vi.fn(() => first.promise); const replacement = vi.fn(() => next.promise);
    const { result, rerender } = renderHook(({ loader }) => useVesselExpiryCounts(loader), { initialProps: { loader: original } });
    rerender({ loader: replacement });
    await act(async () => { next.resolve({ 2: { due: 4, expired: 1 } }); });
    await act(async () => { first.resolve({ 1: { due: 99, expired: 99 } }); });
    expect(result.current.counts).toEqual({ 2: { due: 4, expired: 1 } });
  });

  it('lets a slow read finish instead of superseding it on every polling interval', async () => {
    const read = deferred(); const loader = vi.fn(() => read.promise);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { result } = renderHook(() => useVesselExpiryCounts(loader));
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(loader).toHaveBeenCalledTimes(1);
    await act(async () => { read.resolve({ 1: { due: 2, expired: 1 } }); });
    expect(result.current.counts).toEqual({ 1: { due: 2, expired: 1 } });
  });

  it('refreshes visible pages, skips hidden polling, and recalculates the Paris date on focus', async () => {
    const loader = vi.fn().mockResolvedValue({});
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { unmount } = renderHook(() => useVesselExpiryCounts(loader));
    await act(async () => {});
    expect(loader).toHaveBeenLastCalledWith('2026-10-20');
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(loader).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(loader).toHaveBeenCalledTimes(2);
    vi.setSystemTime(new Date('2026-10-20T22:01:00Z'));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(loader).toHaveBeenLastCalledWith('2026-10-21');
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(loader).toHaveBeenCalledTimes(4);
    unmount();
    await act(async () => { window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(60_000); });
    expect(loader).toHaveBeenCalledTimes(4);
  });
});
