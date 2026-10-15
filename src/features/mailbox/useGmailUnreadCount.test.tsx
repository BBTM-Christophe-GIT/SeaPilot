import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { getGmailClientId, loadGmailAuthorization, type GoogleTokenClient, type GoogleTokenClientConfig } from './gmailAuthorization';
import { fetchGmailUnreadCount, GmailUnreadError, GMAIL_COUNTER_SCOPES } from './gmailUnread';
import { useGmailUnreadCount } from './useGmailUnreadCount';

vi.mock('./gmailAuthorization', () => ({ getGmailClientId: vi.fn(), loadGmailAuthorization: vi.fn() }));
vi.mock('./gmailUnread', async (importOriginal) => ({
  ...await importOriginal<typeof import('./gmailUnread')>(), fetchGmailUnreadCount: vi.fn(),
}));

const clientId = '123456789-counter.apps.googleusercontent.com';
const tokenResponse = { access_token: 'test-google-token', expires_in: 3600, scope: GMAIL_COUNTER_SCOPES };
let requests: GoogleTokenClientConfig[];
let requestAccessToken: Mock<GoogleTokenClient['requestAccessToken']>;
let visibility: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  requests = [];
  requestAccessToken = vi.fn<GoogleTokenClient['requestAccessToken']>();
  vi.mocked(getGmailClientId).mockReturnValue(clientId);
  vi.mocked(loadGmailAuthorization).mockResolvedValue({ initTokenClient: vi.fn((config: GoogleTokenClientConfig) => {
    requests.push(config);
    return { requestAccessToken };
  }) });
  vi.mocked(fetchGmailUnreadCount).mockResolvedValue(7);
  visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderCounter(initialProps = { userId: 'marin-account' as string | undefined, email: 'marin@example.test' as string | undefined, enabled: true }) {
  const hook = renderHook(({ userId, email, enabled }) => useGmailUnreadCount(userId, email, enabled), { initialProps });
  await act(async () => {});
  return hook;
}

describe('useGmailUnreadCount', () => {
  it('does nothing without a configured client ID', async () => {
    vi.mocked(getGmailClientId).mockReturnValue(undefined);
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); window.dispatchEvent(new Event('focus')); });
    await act(async () => { vi.advanceTimersByTime(120_000); });

    expect(hook.result.current).toMatchObject({ available: false, unreadCount: null, canActivate: false });
    expect(loadGmailAuthorization).not.toHaveBeenCalled();
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
  });

  it.each([
    { userId: undefined, email: 'marin@example.test', enabled: true },
    { userId: 'marin-account', email: undefined, enabled: true },
    { userId: 'marin-account', email: 'marin@example.test', enabled: false },
  ])('does not load Google for an inactive identity (%j)', async (props) => {
    const hook = await renderCounter(props);
    expect(hook.result.current.available).toBe(false);
    expect(loadGmailAuthorization).not.toHaveBeenCalled();
  });

  it('preloads only the SDK and authorizes synchronously on the explicit action', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const hook = await renderCounter();
    expect(hook.result.current).toMatchObject({ status: 'ready', unreadCount: null, canActivate: true });
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
    act(() => { hook.result.current.action(); });

    expect(requestAccessToken).toHaveBeenCalledExactlyOnceWith({ prompt: 'consent', login_hint: 'marin@example.test', include_granted_scopes: false });
    expect(requests[0]).toMatchObject({ client_id: clientId, scope: GMAIL_COUNTER_SCOPES, login_hint: 'marin@example.test', include_granted_scopes: false });
    expect(hook.result.current.status).toBe('authorizing');
    await act(async () => { requests[0].callback(tokenResponse); });

    expect(fetchGmailUnreadCount).toHaveBeenCalledWith('test-google-token', 'marin@example.test', expect.any(AbortSignal));
    expect(hook.result.current).toMatchObject({ status: 'connected', unreadCount: 7 });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('accepts the canonical email scope Google can return', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback({ ...tokenResponse, scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.labels' }); });
    expect(hook.result.current.unreadCount).toBe(7);
  });

  it.each(['email https://www.googleapis.com/auth/gmail.labels', 'openid email', 'openid not-email https://www.googleapis.com/auth/gmail.labels'])('refuses missing or misleading granted scopes (%s)', async (scope) => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback({ ...tokenResponse, scope }); });
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ status: 'error', unreadCount: null, actionLabel: 'Reconnecter le compteur Gmail' });
  });

  it.each([0, -1, 'invalid', 86_401])('refuses an invalid token lifetime (%s)', async (expires_in) => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback({ ...tokenResponse, expires_in }); });
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
    expect(hook.result.current.unreadCount).toBeNull();
  });

  it('refreshes every minute and on focus only while visible, without opening consent again', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback(tokenResponse); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledTimes(2);

    visibility.mockReturnValue('hidden');
    await act(async () => { vi.advanceTimersByTime(60_000); window.dispatchEvent(new Event('focus')); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledTimes(3);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledTimes(4);
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('expires the token and count even while hidden and requires another click', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback({ ...tokenResponse, expires_in: 2 }); });
    expect(hook.result.current.unreadCount).toBe(7);
    visibility.mockReturnValue('hidden');
    await act(async () => { vi.advanceTimersByTime(2_000); window.dispatchEvent(new Event('focus')); });
    expect(hook.result.current).toMatchObject({ status: 'expired', unreadCount: null, actionLabel: 'Reconnecter le compteur Gmail' });
    expect(requestAccessToken).toHaveBeenCalledOnce();
    act(() => { hook.result.current.action(); });
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
  });

  it.each(['wrong_account', 'forbidden', 'network_error', 'unauthorized'] as const)('clears the count and requires reconnection after %s', async (code) => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback(tokenResponse); });
    vi.mocked(fetchGmailUnreadCount).mockRejectedValueOnce(new GmailUnreadError(code));
    await act(async () => { hook.result.current.action(); });
    expect(hook.result.current.unreadCount).toBeNull();
    expect(hook.result.current.message).toContain(new GmailUnreadError(code).message);
    await act(async () => { vi.advanceTimersByTime(60_000); window.dispatchEvent(new Event('focus')); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledTimes(2);
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('aborts a timed-out read and ignores its late result', async () => {
    let resolveRead!: (count: number) => void;
    vi.mocked(fetchGmailUnreadCount).mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); requests[0].callback(tokenResponse); });
    const signal = vi.mocked(fetchGmailUnreadCount).mock.calls[0][2]!;
    await act(async () => { vi.advanceTimersByTime(12_000); });

    expect(signal.aborted).toBe(true);
    expect(hook.result.current).toMatchObject({ status: 'error', unreadCount: null });
    await act(async () => { resolveRead(99); });
    expect(hook.result.current.unreadCount).toBeNull();
  });

  it.each([
    { userId: 'capitaine-account', email: 'capitaine@example.test', enabled: true },
    { userId: 'second-marin-account', email: 'marin@example.test', enabled: true },
    { userId: 'marin-account', email: 'marin@example.test', enabled: false },
    { userId: undefined, email: undefined, enabled: true },
  ])('drops credentials and ignores pending old callbacks when identity changes (%j)', async (nextIdentity) => {
    let resolveOldRead!: (count: number) => void;
    vi.mocked(fetchGmailUnreadCount).mockReturnValueOnce(new Promise((resolve) => { resolveOldRead = resolve; }));
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); requests[0].callback(tokenResponse); });
    const oldCallback = requests[0].callback;
    const signal = vi.mocked(fetchGmailUnreadCount).mock.calls[0][2]!;
    hook.rerender(nextIdentity);

    expect(hook.result.current.unreadCount).toBeNull();
    expect(signal.aborted).toBe(true);
    await act(async () => { oldCallback(tokenResponse); resolveOldRead(99); });
    expect(hook.result.current.unreadCount).toBeNull();
    expect(fetchGmailUnreadCount).toHaveBeenCalledOnce();
  });

  it('ignores an authorization result from a previous account even after switching back', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    const oldCallback = requests[0].callback;
    hook.rerender({ userId: 'second-account', email: 'second@example.test', enabled: true });
    hook.rerender({ userId: 'marin-account', email: 'marin@example.test', enabled: true });
    await act(async () => { oldCallback(tokenResponse); });
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
    expect(hook.result.current.unreadCount).toBeNull();
  });

  it('handles denial and popup closure without creating a zero count or retrying automatically', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); requests[0].callback({ ...tokenResponse, error: 'access_denied' }); });
    expect(hook.result.current).toMatchObject({ status: 'error', unreadCount: null });
    expect(hook.result.current.message).toContain('refusée');
    act(() => { hook.result.current.action(); requests[1].error_callback({ type: 'popup_closed' }); });
    expect(hook.result.current.message).toContain('fermée');
    await act(async () => { vi.advanceTimersByTime(180_000); });
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
  });

  it('retries a failed SDK load without requesting a token asynchronously', async () => {
    vi.mocked(loadGmailAuthorization).mockRejectedValueOnce(new Error('unavailable'));
    const hook = await renderCounter();
    expect(hook.result.current).toMatchObject({ status: 'sdk_error', actionLabel: 'Réessayer le chargement Gmail' });
    await act(async () => { hook.result.current.action(); });
    expect(hook.result.current).toMatchObject({ status: 'ready', actionLabel: 'Activer le compteur Gmail' });
    expect(requestAccessToken).not.toHaveBeenCalled();
    act(() => { hook.result.current.action(); });
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('consumes a successful authorization callback only once', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); });
    await act(async () => { requests[0].callback(tokenResponse); requests[0].callback(tokenResponse); });
    expect(fetchGmailUnreadCount).toHaveBeenCalledOnce();
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, undefined, [], { access_token: 'test-google-token', expires_in: Symbol('invalid'), scope: GMAIL_COUNTER_SCOPES }])('handles a malformed token callback safely (%s)', async (response) => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); requests[0].callback(response as never); });
    expect(hook.result.current).toMatchObject({ status: 'error', unreadCount: null, canActivate: true });
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
  });

  it('handles a malformed popup error callback safely', async () => {
    const hook = await renderCounter();
    act(() => { hook.result.current.action(); requests[0].error_callback(null as never); });
    expect(hook.result.current).toMatchObject({ status: 'error', unreadCount: null, canActivate: true });
  });
});
