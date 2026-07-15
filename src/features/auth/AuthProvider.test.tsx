import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

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
});
