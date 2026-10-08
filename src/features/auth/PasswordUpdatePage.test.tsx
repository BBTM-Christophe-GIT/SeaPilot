import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider } from './AuthProvider';
import { PasswordUpdatePage } from './PasswordUpdatePage';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/auth/update-password');
});

function renderPage(session: unknown, intent: 'invite' | 'recovery' | 'normal' | 'invalid' = 'invite') {
  window.history.replaceState({}, '', '/auth/update-password');
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const loadedSession = session ? { ...(session as object), access_token: 'invitation-token' } : null;
  if (intent === 'invite' || intent === 'recovery') window.history.replaceState({}, '',
    `/auth/update-password#type=${intent}&access_token=invitation-token&refresh_token=refresh&expires_in=3600&token_type=bearer`);
  if (intent === 'invalid') window.history.replaceState({}, '', '/auth/update-password#error=access_denied&error_code=otp_expired');
  let authCallback: (event: AuthChangeEvent, session: Session | null) => void;
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: loadedSession }, error: null }),
      onAuthStateChange: vi.fn().mockImplementation((callback) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser,
      signOut: vi.fn(),
    },
  };

  const rendered = render(
    <AuthProvider client={client as never}>
      <MemoryRouter initialEntries={['/auth/update-password']}>
        <Routes>
          <Route path="/auth/update-password" element={<PasswordUpdatePage />} />
          <Route path="/" element={<div>Application SeaPilot</div>} />
          <Route path="/login" element={<div>Connexion SeaPilot</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  return { updateUser, ...rendered, emit: (event: AuthChangeEvent, nextSession: Session | null) => authCallback(event, nextSession) };
}

describe('PasswordUpdatePage', () => {
  it('rejects mismatched passwords before calling Supabase', async () => {
    const user = userEvent.setup();
    const { updateUser } = renderPage({ user: { id: 'user-1' } });

    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'mot-de-passe-solide');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'mot-de-passe-different');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));

    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('updates the password from a valid invitation session', async () => {
    const user = userEvent.setup();
    const { updateUser } = renderPage({ user: { id: 'user-1' } });

    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'mot-de-passe-solide');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'mot-de-passe-solide');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));

    expect(updateUser).toHaveBeenCalledWith({ password: 'mot-de-passe-solide' });
    expect(await screen.findByRole('status')).toHaveTextContent('Votre compte BBTM est prêt.');
  });

  it('reports an expired or invalid link', async () => {
    renderPage(null, 'invalid');

    expect(await screen.findByText('Ce lien est invalide ou expiré.')).toBeInTheDocument();
  });

  it('opens the application from an old activation shortcut with a normal session', async () => {
    const { updateUser } = renderPage({ user: { id: 'user-1' } }, 'normal');
    expect(await screen.findByText('Application SeaPilot')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('opens normal sign-in from an old shortcut without a session', async () => {
    renderPage(null, 'normal');
    expect(await screen.findByText('Connexion SeaPilot')).toBeInTheDocument();
    expect(screen.queryByText('Ce lien est invalide ou expiré.')).not.toBeInTheDocument();
  });

  it('allows a genuine recovery once, then opens the application on reopening the shortcut', async () => {
    const user = userEvent.setup();
    const session = { user: { id: 'user-1' } };
    const first = renderPage(session, 'recovery');
    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'mot-de-passe-solide');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'mot-de-passe-solide');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mot de passe enregistré.');
    first.unmount();
    renderPage(session, 'normal');
    expect(await screen.findByText('Application SeaPilot')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument();
  });

  it('keeps an expired link separate from a valid existing session and offers the application', async () => {
    const user = userEvent.setup();
    const { updateUser } = renderPage({ user: { id: 'user-1' } }, 'invalid');
    expect(await screen.findByText('Ce lien est invalide ou expiré.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nouveau mot de passe')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accéder à SeaPilot' }));
    expect(await screen.findByText('Application SeaPilot')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('keeps a failed password update retryable', async () => {
    const user = userEvent.setup();
    const { updateUser } = renderPage({ user: { id: 'user-1' } }, 'recovery');
    updateUser.mockResolvedValueOnce({ error: new Error('Network error') });
    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'mot-de-passe-solide');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'mot-de-passe-solide');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));
    expect(await screen.findByText(/n'a pas pu être enregistré/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('mot-de-passe-solide');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mot de passe enregistré.');
  });

  it('clears password fields and ignores a pending response when the account changes', async () => {
    const user = userEvent.setup();
    const { updateUser, emit } = renderPage({ user: { id: 'user-1' } }, 'recovery');
    let finishUpdate: (value: { error: null }) => void;
    updateUser.mockReturnValueOnce(new Promise((resolve) => { finishUpdate = resolve; }));
    await user.type(await screen.findByLabelText('Nouveau mot de passe'), 'mot-de-passe-solide');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'mot-de-passe-solide');
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon mot de passe' }));
    act(() => emit('PASSWORD_RECOVERY', { user: { id: 'user-2' }, access_token: 'other-recovery-token' } as Session));
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
    expect(screen.getByLabelText('Confirmer le mot de passe')).toHaveValue('');
    await act(async () => finishUpdate({ error: null }));
    expect(screen.queryByText('Mot de passe enregistré.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('');
  });
});
