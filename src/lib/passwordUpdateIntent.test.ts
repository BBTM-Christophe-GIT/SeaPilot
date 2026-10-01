import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePasswordCallback, clearPasswordUpdateIntent, passwordUpdateIntentState, preparePasswordUpdateIntent, recordPasswordUpdateAuthEvent } from './passwordUpdateIntent';

const session = (userId = 'user-1', token = `token-${userId}`) => ({ user: { id: userId }, access_token: token }) as Session;
const client = () => ({}) as SupabaseClient;
const callbackUrl = (type: 'invite' | 'recovery', token = 'token-user-1') => `/auth/update-password#type=${type}&access_token=${token}&refresh_token=refresh-secret&expires_in=3600&token_type=bearer`;

beforeEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/auth/update-password');
});

describe('password update intent', () => {
  it('does not treat a normal persisted session as a password reset', () => {
    const db = client();
    recordPasswordUpdateAuthEvent(db, 'SIGNED_IN', session());
    expect(passwordUpdateIntentState(db, session())).toEqual({ requested: false, linkAttempted: false });
  });

  it.each(['invite', 'recovery'] as const)('preserves a validated %s callback after Supabase cleans its hash before mounting', (type) => {
    window.history.replaceState({}, '', callbackUrl(type));
    const captured = capturePasswordCallback();
    window.history.replaceState({}, '', '/auth/update-password');
    const db = client();
    preparePasswordUpdateIntent(db, captured);
    recordPasswordUpdateAuthEvent(db, 'INITIAL_SESSION', session());
    expect(passwordUpdateIntentState(db, session()).requested).toBe(true);
    const stored = JSON.parse(sessionStorage.getItem('seapilot:password-update-intent')!);
    expect(Object.keys(stored).sort()).toEqual(['expiresAt', 'userId']);
    expect(stored.userId).toBe('user-1');
    expect(JSON.stringify(stored)).not.toContain('secret');
    expect(JSON.stringify(stored)).not.toContain('token');
  });

  it('does not let an invalid recovery link borrow an existing ordinary session', () => {
    window.history.replaceState({}, '', callbackUrl('recovery', 'invalid-token'));
    const db = client();
    recordPasswordUpdateAuthEvent(db, 'INITIAL_SESSION', session());
    recordPasswordUpdateAuthEvent(db, 'SIGNED_IN', session());
    expect(passwordUpdateIntentState(db, session())).toEqual({ requested: false, linkAttempted: true });
  });

  it('rejects a type-only callback and an unconsumed PKCE code with a restored session', () => {
    window.history.replaceState({}, '', '/auth/update-password#type=invite');
    const incomplete = client();
    recordPasswordUpdateAuthEvent(incomplete, 'SIGNED_IN', session());
    expect(passwordUpdateIntentState(incomplete, session()).requested).toBe(false);
    window.history.replaceState({}, '', '/auth/update-password?code=invalid-code');
    const pkce = client();
    recordPasswordUpdateAuthEvent(pkce, 'SIGNED_IN', session());
    recordPasswordUpdateAuthEvent(pkce, 'INITIAL_SESSION', session());
    expect(passwordUpdateIntentState(pkce, session()).requested).toBe(false);
  });

  it('accepts PKCE only after the SDK consumes the successfully exchanged code', () => {
    window.history.replaceState({}, '', '/auth/update-password?code=fresh-code');
    const db = client();
    preparePasswordUpdateIntent(db);
    recordPasswordUpdateAuthEvent(db, 'SIGNED_IN', session());
    expect(passwordUpdateIntentState(db, session()).requested).toBe(false);
    window.history.replaceState({}, '', '/auth/update-password');
    recordPasswordUpdateAuthEvent(db, 'INITIAL_SESSION', session());
    expect(passwordUpdateIntentState(db, session()).requested).toBe(true);
  });

  it('keeps an unfinished recovery through reload and clears it permanently after success', () => {
    const original = client();
    recordPasswordUpdateAuthEvent(original, 'PASSWORD_RECOVERY', session());
    const reloaded = client();
    expect(passwordUpdateIntentState(reloaded, session()).requested).toBe(true);
    clearPasswordUpdateIntent(reloaded, session());
    recordPasswordUpdateAuthEvent(reloaded, 'PASSWORD_RECOVERY', session());
    expect(passwordUpdateIntentState(reloaded, session()).requested).toBe(false);
    expect(passwordUpdateIntentState(client(), session()).requested).toBe(false);
    expect(sessionStorage.getItem('seapilot:password-update-intent')).toBeNull();
  });

  it('expires unfinished intents and isolates them from other accounts', () => {
    const original = client();
    recordPasswordUpdateAuthEvent(original, 'PASSWORD_RECOVERY', session());
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60 * 60 * 1000 + 1);
    expect(passwordUpdateIntentState(client(), session()).requested).toBe(false);
    vi.restoreAllMocks();
    recordPasswordUpdateAuthEvent(original, 'PASSWORD_RECOVERY', session());
    recordPasswordUpdateAuthEvent(original, 'SIGNED_IN', session('user-2'));
    expect(passwordUpdateIntentState(original, session('user-2'))).toEqual({ requested: false, linkAttempted: false });
    expect(passwordUpdateIntentState(client(), session()).requested).toBe(false);
  });

  it('does not restore a saved intent for another account after a new client is created', () => {
    recordPasswordUpdateAuthEvent(client(), 'PASSWORD_RECOVERY', session());
    const reloaded = client();
    expect(passwordUpdateIntentState(reloaded, session('user-2')).requested).toBe(false);
    expect(passwordUpdateIntentState(client(), session()).requested).toBe(false);
  });

  it('keeps the current callback usable when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    const db = client();
    recordPasswordUpdateAuthEvent(db, 'PASSWORD_RECOVERY', session());
    expect(passwordUpdateIntentState(db, session()).requested).toBe(true);
    clearPasswordUpdateIntent(db, session());
    expect(passwordUpdateIntentState(db, session()).requested).toBe(false);
  });
});
