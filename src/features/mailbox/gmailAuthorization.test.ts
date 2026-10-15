import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleAuthorizationApi } from './gmailAuthorization';

const scriptUrl = 'https://accounts.google.com/gsi/client';
const clientId = '123456789012-counter_client.apps.googleusercontent.com';
const api = (): GoogleAuthorizationApi => ({ initTokenClient: vi.fn(() => ({ requestAccessToken: vi.fn() })) });
const sdkScript = () => document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.querySelectorAll(`script[src="${scriptUrl}"]`).forEach(script => script.remove());
});

describe('optional Gmail public OAuth client configuration', () => {
  it('does not load Google merely by importing the module or reading configuration', async () => {
    const { getGmailClientId } = await import('./gmailAuthorization');
    expect(getGmailClientId({ VITE_GMAIL_CLIENT_ID: clientId })).toBe(clientId);
    expect(sdkScript()).toBeNull();
  });

  it('reads the configured Vite public client and trims surrounding whitespace', async () => {
    vi.stubEnv('VITE_GMAIL_CLIENT_ID', ` ${clientId} `);
    const { getGmailClientId } = await import('./gmailAuthorization');
    expect(getGmailClientId()).toBe(clientId);
  });

  it.each([
    undefined, null, 123, '', ' ', 'a-secret', 'secret.apps.googleusercontent.com',
    '123456.apps.googleusercontent.com.evil.test', `https://${clientId}`, `${clientId}\nInjected`,
    '123456789012-a/b.apps.googleusercontent.com', '123456789012-.apps.googleusercontent.com',
  ])('ignores an invalid or absent public client ID %j', async (candidate) => {
    const { getGmailClientId } = await import('./gmailAuthorization');
    expect(getGmailClientId({ VITE_GMAIL_CLIENT_ID: candidate })).toBeUndefined();
    expect(sdkScript()).toBeNull();
  });

  it('never falls back to document OAuth credentials', async () => {
    const { getGmailClientId } = await import('./gmailAuthorization');
    expect(getGmailClientId({ GOOGLE_DRIVE_CLIENT_ID: clientId, GOOGLE_DRIVE_CLIENT_SECRET: 'not-read' })).toBeUndefined();
  });
});

describe('Google authorization SDK loader', () => {
  it('reuses an already available authorization API without injecting a script', async () => {
    const existing = api();
    vi.stubGlobal('google', { accounts: { oauth2: existing } });
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    expect(await loadGmailAuthorization()).toBe(existing);
    expect(sdkScript()).toBeNull();
    expect(existing.initTokenClient).not.toHaveBeenCalled();
  });

  it('loads only the fixed Google SDK and resolves its authorization API', async () => {
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const pending = loadGmailAuthorization();
    const script = sdkScript();
    expect(script?.src).toBe(scriptUrl);
    expect(script?.async).toBe(true);
    const loaded = api();
    vi.stubGlobal('google', { accounts: { oauth2: loaded } });
    script?.dispatchEvent(new Event('load'));
    expect(await pending).toBe(loaded);
    expect(loaded.initTokenClient).not.toHaveBeenCalled();
  });

  it('shares one pending promise and one script between simultaneous callers', async () => {
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const first = loadGmailAuthorization();
    const second = loadGmailAuthorization();
    expect(first).toBe(second);
    expect(document.querySelectorAll(`script[src="${scriptUrl}"]`)).toHaveLength(1);
    const loaded = api();
    vi.stubGlobal('google', { accounts: { oauth2: loaded } });
    sdkScript()?.dispatchEvent(new Event('load'));
    expect(await first).toBe(loaded);
  });

  it('waits for a matching SDK script that another component is already loading', async () => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    document.head.appendChild(script);
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const pending = loadGmailAuthorization();
    expect(document.querySelectorAll(`script[src="${scriptUrl}"]`)).toHaveLength(1);
    const loaded = api();
    vi.stubGlobal('google', { accounts: { oauth2: loaded } });
    script.dispatchEvent(new Event('load'));
    expect(await pending).toBe(loaded);
  });

  it('removes a failed script and permits an explicit retry', async () => {
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const first = loadGmailAuthorization();
    const rejected = expect(first).rejects.toThrow('Réessayez');
    const failedScript = sdkScript();
    failedScript?.dispatchEvent(new Event('error'));
    await rejected;
    expect(sdkScript()).toBeNull();
    const retry = loadGmailAuthorization();
    expect(retry).not.toBe(first);
    expect(sdkScript()).not.toBe(failedScript);
    const loaded = api();
    vi.stubGlobal('google', { accounts: { oauth2: loaded } });
    sdkScript()?.dispatchEvent(new Event('load'));
    expect(await retry).toBe(loaded);
  });

  it('rejects a script that loaded without the required authorization API', async () => {
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const pending = loadGmailAuthorization();
    const rejected = expect(pending).rejects.toThrow('indisponible');
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient: 'not callable' } } });
    sdkScript()?.dispatchEvent(new Event('load'));
    await rejected;
    expect(sdkScript()).toBeNull();
  });

  it('times out a silent script after 12 seconds and permits a fresh attempt', async () => {
    vi.useFakeTimers();
    const { loadGmailAuthorization } = await import('./gmailAuthorization');
    const pending = loadGmailAuthorization();
    const rejected = expect(pending).rejects.toThrow('Réessayez');
    await vi.advanceTimersByTimeAsync(12_000);
    await rejected;
    expect(sdkScript()).toBeNull();
    const retry = loadGmailAuthorization();
    const loaded = api();
    vi.stubGlobal('google', { accounts: { oauth2: loaded } });
    sdkScript()?.dispatchEvent(new Event('load'));
    expect(await retry).toBe(loaded);
  });
});
