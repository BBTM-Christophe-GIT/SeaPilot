// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGmailUnreadCount, GMAIL_COUNTER_SCOPES, GmailUnreadError } from './gmailUnread';

const token = 'ya29.counter-test-token';
const email = 'alice+office@bbtm.fr';
const identity = { sub: 'google-user', email, email_verified: true };
const userInfoUrl = 'https://openidconnect.googleapis.com/v1/userinfo';
const inboxUrl = 'https://gmail.googleapis.com/gmail/v1/users/alice%2Boffice%40bbtm.fr/labels/INBOX?fields=messagesUnread';
const json = (value: unknown, status = 200) => Response.json(value, { status });

function fixture(profile: unknown = identity, count: unknown = 7) {
  const send = vi.fn().mockResolvedValueOnce(json(profile)).mockResolvedValueOnce(json({ messagesUnread: count }));
  vi.stubGlobal('fetch', send);
  return send;
}

afterEach(() => vi.unstubAllGlobals());

describe('account-verified Gmail inbox count', () => {
  it('requests label access and basic identity without message-read scopes', () => {
    expect(GMAIL_COUNTER_SCOPES).toBe('openid email https://www.googleapis.com/auth/gmail.labels');
  });

  it.each([0, 1, 99, 10_000, Number.MAX_SAFE_INTEGER])('returns the exact safe unread count %s', async (count) => {
    fixture(identity, count);
    expect(await fetchGmailUnreadCount(token, email)).toBe(count);
  });

  it('verifies Google identity before fetching only the matching inbox count', async () => {
    const send = fixture({ ...identity, email: 'ALICE+OFFICE@BBTM.FR' });
    const signal = new AbortController().signal;
    expect(await fetchGmailUnreadCount(token, ` ${email.toUpperCase()} `, signal)).toBe(7);
    expect(send).toHaveBeenNthCalledWith(1, userInfoUrl, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
    });
    expect(send).toHaveBeenNthCalledWith(2, inboxUrl, send.mock.calls[0][1]);
    expect(send.mock.calls.map(([url]) => url).every((url: string) => !url.includes(token))).toBe(true);
  });

  it.each([
    { ...identity, email: 'someone-else@bbtm.fr' },
    { ...identity, email: 'alice@bbtm.fr' },
    { ...identity, email: ' alice+office@bbtm.fr ' },
    { ...identity, email_verified: false },
    { ...identity, email_verified: 'true' },
    { ...identity, email_verified: undefined },
    { ...identity, email: undefined },
  ])('never fetches Gmail for a different or unverified account: %j', async (profile) => {
    const send = fixture(profile);
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ name: 'GmailUnreadError', code: 'wrong_account' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 1.5, '7', null, Number.MAX_SAFE_INTEGER + 1])('rejects invalid count %j without substituting zero', async (count) => {
    fixture(identity, count);
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'invalid_count' });
  });

  it('keeps an absent counter unknown instead of assuming zero', async () => {
    const send = fixture();
    send.mockReset().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({}));
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'invalid_count' });
  });

  it.each([401, 403, 429, 503])('preserves an HTTP %s failure without leaking the response body', async (status) => {
    const send = vi.fn().mockResolvedValue(json({ error: 'sensitive upstream details' }, status));
    vi.stubGlobal('fetch', send);
    const result = fetchGmailUnreadCount(token, email);
    await expect(result).rejects.toBeInstanceOf(GmailUnreadError);
    await expect(result).rejects.toMatchObject({ status, code: status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'invalid_response' });
    await expect(result).rejects.not.toThrow('sensitive upstream details');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('also rejects authorization failure from the inbox endpoint', async () => {
    const send = fixture();
    send.mockReset().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({}, 403));
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  });

  it.each([null, [], 'unexpected'])('rejects a malformed identity response %j', async (profile) => {
    const send = fixture(profile);
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')));
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('hides network exception details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`upstream detail ${token}`)));
    const result = fetchGmailUnreadCount(token, email);
    await expect(result).rejects.toMatchObject({ code: 'network_error' });
    await expect(result).rejects.not.toThrow(token);
  });

  it('does not make any request when already cancelled', async () => {
    const send = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(fetchGmailUnreadCount(token, email, controller.signal)).rejects.toMatchObject({ code: 'aborted' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not fetch Gmail after cancellation during identity verification', async () => {
    const controller = new AbortController();
    const send = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      return json(identity);
    });
    vi.stubGlobal('fetch', send);
    await expect(fetchGmailUnreadCount(token, email, controller.signal)).rejects.toMatchObject({ code: 'aborted' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports a fetch abort without converting it to a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    await expect(fetchGmailUnreadCount(token, email)).rejects.toMatchObject({ code: 'aborted' });
  });

  it.each(['', ' ', 'token with spaces', 'token\r\nInjected: header'])('rejects malformed bearer credentials before any request', async (invalidToken) => {
    const send = fixture();
    await expect(fetchGmailUnreadCount(invalidToken, email)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['', 'alice', 'alice@@bbtm.fr', 'alice@bbtm.fr\nInjected'])('rejects an unusable account email before any request', async (invalidEmail) => {
    const send = fixture();
    await expect(fetchGmailUnreadCount(token, invalidEmail)).rejects.toMatchObject({ code: 'invalid_email' });
    expect(send).not.toHaveBeenCalled();
  });
});
