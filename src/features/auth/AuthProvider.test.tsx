import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/auth/update-password');
});

function authClient(session: Session | null = null) {
  let callback: (event: AuthChangeEvent, session: Session | null) => void;
  const client = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    onAuthStateChange: vi.fn().mockImplementation((nextCallback) => {
      callback = nextCallback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  } };
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider client={client as never}>{children}</AuthProvider>;
  return { client, wrapper, emit: (event: AuthChangeEvent, nextSession: Session | null) => callback(event, nextSession) };
}

const recoverySession = { user: { id: 'user-1' }, access_token: 'recovery-token' } as Session;

describe('AuthProvider', () => {
  it('exposes the loaded session state', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        signInWithPassword: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        signOut: vi.fn(),
      },
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider client={client as never}>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('renders a configuration message when Supabase env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_APP_BASE_URL', '');

    render(
      <AuthProvider>
        <div>Private app</div>
      </AuthProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Configuration Supabase incomplete');
    expect(screen.getByText('Missing required environment variable: VITE_SUPABASE_URL')).toBeInTheDocument();

    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('VITE_APP_BASE_URL', 'http://localhost:5173');
  });

  it('does not let a delayed getSession overwrite a newer password recovery event', async () => {
    const { client, wrapper, emit } = authClient();
    let finishSession: (value: { data: { session: null }; error: null }) => void;
    client.auth.getSession.mockReturnValueOnce(new Promise((resolve) => { finishSession = resolve; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit('PASSWORD_RECOVERY', recoverySession));
    await act(async () => finishSession({ data: { session: null }, error: null }));
    expect(result.current.session).toBe(recoverySession);
    expect(result.current.passwordUpdateRequested).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('does not let a delayed getSession restore a signed-out session', async () => {
    const { client, wrapper, emit } = authClient();
    let finishSession: (value: { data: { session: Session }; error: null }) => void;
    client.auth.getSession.mockReturnValueOnce(new Promise((resolve) => { finishSession = resolve; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit('SIGNED_OUT', null));
    await act(async () => finishSession({ data: { session: recoverySession }, error: null }));
    expect(result.current.session).toBeNull();
    expect(result.current.passwordUpdateRequested).toBe(false);
  });

  it('keeps an auth event delivered while registering the subscription', async () => {
    const { client, wrapper } = authClient();
    client.auth.onAuthStateChange.mockImplementationOnce((callback) => {
      callback('PASSWORD_RECOVERY', recoverySession);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBe(recoverySession);
    expect(result.current.passwordUpdateRequested).toBe(true);
  });

  it('clears a recovery intent after password update and after ordinary password sign-in', async () => {
    const { wrapper, emit } = authClient(recoverySession);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => emit('PASSWORD_RECOVERY', recoverySession));
    expect(result.current.passwordUpdateRequested).toBe(true);
    await act(async () => result.current.updatePassword('mot-de-passe-solide'));
    expect(result.current.passwordUpdateRequested).toBe(false);
    expect(sessionStorage.getItem('seapilot:password-update-intent')).toBeNull();
    act(() => emit('PASSWORD_RECOVERY', { ...recoverySession, access_token: 'new-recovery-token' }));
    expect(result.current.passwordUpdateRequested).toBe(true);
    await act(async () => result.current.signIn('user@example.test', 'mot-de-passe-solide'));
    expect(result.current.passwordUpdateRequested).toBe(false);
    expect(sessionStorage.getItem('seapilot:password-update-intent')).toBeNull();
    act(() => emit('PASSWORD_RECOVERY', { ...recoverySession, access_token: 'third-recovery-token' }));
    await act(async () => result.current.signOut());
    expect(result.current.passwordUpdateRequested).toBe(false);
    expect(sessionStorage.getItem('seapilot:password-update-intent')).toBeNull();
  });

  it('does not clear another account’s recovery when a previous password update finishes', async () => {
    const { client, wrapper, emit } = authClient(recoverySession);
    let finishUpdate: (value: { error: null }) => void;
    client.auth.updateUser.mockReturnValueOnce(new Promise((resolve) => { finishUpdate = resolve; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => emit('PASSWORD_RECOVERY', recoverySession));
    const outcome = result.current.updatePassword('mot-de-passe-solide').catch((error: unknown) => error);
    act(() => emit('PASSWORD_RECOVERY', { user: { id: 'user-2' }, access_token: 'other-user-token' } as Session));
    await act(async () => finishUpdate({ error: null }));
    expect(await outcome).toBeInstanceOf(Error);
    expect(result.current.session?.user.id).toBe('user-2');
    expect(result.current.passwordUpdateRequested).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('seapilot:password-update-intent')!).userId).toBe('user-2');
  });

  it('finishes loading when getSession fails', async () => {
    const { client, wrapper } = authClient();
    client.auth.getSession.mockRejectedValueOnce(new Error('Session unavailable'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });
});
