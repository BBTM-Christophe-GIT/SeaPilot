import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'seapilot:password-update-intent';
const INTENT_LIFETIME_MS = 60 * 60 * 1000;

interface PasswordCallback {
  attempted: boolean;
  accessToken: string | null;
  pkce: boolean;
}

interface PasswordUpdateIntent {
  callback: PasswordCallback;
  userId: string | null;
  expiresAt: number;
  completedAccessToken: string | null;
}

const intents = new WeakMap<SupabaseClient, PasswordUpdateIntent>();

// Capture before Supabase consumes the callback and removes its URL tokens.
// Tokens are used only in memory to match the session validated by the SDK.
export function capturePasswordCallback(): PasswordCallback {
  const url = new URL(window.location.href);
  if (url.pathname !== '/auth/update-password') return { attempted: false, accessToken: null, pkce: false };
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.slice(1)).forEach((value, key) => params.set(key, value));
  const type = params.get('type');
  const error = params.has('error') || params.has('error_code') || params.has('error_description');
  const recognizedType = type === 'recovery' || type === 'invite';
  const accessToken = recognizedType && !error && params.get('refresh_token') && params.get('expires_in') && params.get('token_type')
    ? params.get('access_token') : null;
  return { attempted: error || recognizedType || params.has('code'), accessToken,
    pkce: !error && Boolean(params.get('code')) };
}

export function preparePasswordUpdateIntent(client: SupabaseClient, callback = capturePasswordCallback()): void {
  if (!intents.has(client)) intents.set(client, { callback, userId: null, expiresAt: 0, completedAccessToken: null });
}

export function recordPasswordUpdateAuthEvent(client: SupabaseClient, event: AuthChangeEvent, session: Session | null): void {
  preparePasswordUpdateIntent(client);
  if (event === 'SIGNED_OUT') {
    clearPasswordUpdateIntent(client, session);
    return;
  }
  if (!session) return;
  const intent = intents.get(client)!;
  if (intent.completedAccessToken && intent.completedAccessToken === session.access_token) return;
  const validImplicitCallback = intent.callback.accessToken && intent.callback.accessToken === session.access_token;
  // A restored ordinary session also emits SIGNED_IN when ?code is invalid.
  // Supabase removes the code only after successfully exchanging it.
  const url = new URL(window.location.href);
  const validPkceCallback = intent.callback.pkce && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')
    && url.pathname === '/auth/update-password' && !url.searchParams.has('code');
  if (intent.userId && intent.userId !== session.user.id) clearPasswordUpdateIntent(client);
  if (event !== 'PASSWORD_RECOVERY' && !((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && validImplicitCallback)
    && !validPkceCallback) return;

  intent.callback = { attempted: true, accessToken: null, pkce: false };
  intent.userId = session.user.id;
  intent.expiresAt = Date.now() + INTENT_LIFETIME_MS;
  intent.completedAccessToken = null;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId: intent.userId, expiresAt: intent.expiresAt }));
  } catch { /* The current callback remains usable when browser storage is unavailable. */ }
}

export function passwordUpdateIntentState(client: SupabaseClient, session: Session | null): { requested: boolean; linkAttempted: boolean } {
  preparePasswordUpdateIntent(client);
  const intent = intents.get(client)!;
  let requested = Boolean(session && intent.userId === session.user.id && intent.expiresAt > Date.now());
  // A new invalid callback must not borrow a previously saved recovery intent.
  if (!requested && !intent.callback.attempted && session) {
    try {
      const saved: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object' && 'userId' in saved && 'expiresAt' in saved) {
        requested = saved.userId === session.user.id && typeof saved.expiresAt === 'number'
          && saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + INTENT_LIFETIME_MS;
        if (requested) {
          intent.userId = session.user.id;
          intent.expiresAt = saved.expiresAt as number;
        } else if (saved.userId !== session.user.id || (typeof saved.expiresAt === 'number' && saved.expiresAt <= Date.now())) {
          window.sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch { /* A missing or invalid intent is a normal sign-in. */ }
  }
  return { requested, linkAttempted: intent.callback.attempted };
}

export function clearPasswordUpdateIntent(client: SupabaseClient, session: Session | null = null): void {
  preparePasswordUpdateIntent(client);
  const intent = intents.get(client)!;
  intent.callback = { attempted: false, accessToken: null, pkce: false };
  intent.userId = null;
  intent.expiresAt = 0;
  intent.completedAccessToken = session?.access_token || null;
  try { window.sessionStorage.removeItem(STORAGE_KEY); }
  catch { /* The in-memory intent was already cleared. */ }
}
