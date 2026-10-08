import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="route">{location.pathname}{location.search}{location.hash}</div>;
}

function renderLoginPage(from?: { pathname?: string; search?: string; hash?: string }) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword,
      resetPasswordForEmail,
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  };

  render(
    <AuthProvider client={client as never}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
        <LoginPage />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  );

  return { resetPasswordForEmail, signInWithPassword };
}

describe('LoginPage', () => {
  it('provides browser autocomplete hints for credentials', async () => {
    renderLoginPage();

    expect(await screen.findByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('offers administrator-led activation without public signup', async () => {
    const user = userEvent.setup();
    const { resetPasswordForEmail } = renderLoginPage();

    await user.click(await screen.findByRole('button', { name: 'Première connexion / Activer mon compte' }));
    expect(screen.getByRole('heading', { name: 'Activer mon compte' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email'), 'nouveau@example.test');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien sécurisé' }));

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'nouveau@example.test',
      expect.objectContaining({ redirectTo: expect.stringContaining('/auth/update-password') }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Consultez votre messagerie.');
    expect(screen.queryByText(/comptes sont créés sur invitation/i)).not.toBeInTheDocument();
  });

  it.each([null, new Error('Recovery failed')])('ignores a late recovery response after returning to sign-in (%s)', async (error) => {
    const user = userEvent.setup();
    const { resetPasswordForEmail } = renderLoginPage();
    let complete!: (result: { error: Error | null }) => void;
    resetPasswordForEmail.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await user.click(await screen.findByRole('button', { name: 'Mot de passe oublié' }));
    await user.type(screen.getByLabelText('Email'), 'mobile@example.test');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien sécurisé' }));
    await user.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    await act(async () => { complete({ error }); });
    expect(screen.getByRole('heading', { name: 'Connexion à SeaPilot' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText("Le lien n'a pas pu être envoyé. Réessayez dans quelques instants.")).not.toBeInTheDocument();
  });

  it('keeps a newer recovery request pending when the previous mode response arrives', async () => {
    const user = userEvent.setup();
    const { resetPasswordForEmail } = renderLoginPage();
    let completeFirst!: (result: { error: Error | null }) => void;
    let completeSecond!: (result: { error: Error | null }) => void;
    resetPasswordForEmail
      .mockImplementationOnce(() => new Promise((resolve) => { completeFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { completeSecond = resolve; }));
    await user.click(await screen.findByRole('button', { name: 'Mot de passe oublié' }));
    await user.type(screen.getByLabelText('Email'), 'mobile@example.test');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien sécurisé' }));
    await user.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié' }));
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien sécurisé' }));
    await act(async () => { completeFirst({ error: null }); });
    expect(screen.getByRole('button', { name: 'Envoi en cours…' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () => { completeSecond({ error: new Error('Second request failed') }); });
    expect(screen.getByText("Le lien n'a pas pu être envoyé. Réessayez dans quelques instants.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Envoyer le lien sécurisé' })).toBeEnabled();
  });

  it.each([
    [{ pathname: '/auth/update-password', hash: '#access_token=fake&type=recovery' }, '/'],
    [{ pathname: '/login' }, '/'],
    [{ pathname: '/modules/planning', search: '?month=2026-10', hash: '#access_token=fake&refresh_token=fake&type=recovery' }, '/modules/planning?month=2026-10'],
    [{ pathname: '/modules/projects', search: '?project=42&code=fake', hash: '#document-123' }, '/modules/projects?project=42#document-123'],
    [{ pathname: '/modules/planning', search: '?month=2026-10&type=vessel', hash: '#crew-123' }, '/modules/planning?month=2026-10&type=vessel#crew-123'],
  ])('returns to a normal destination after sign-in (%j)', async (from, destination) => {
    const user = userEvent.setup();
    renderLoginPage(from);
    await user.type(await screen.findByLabelText('Email'), 'mobile@example.test');
    await user.type(screen.getByLabelText('Mot de passe'), 'valid-test-password');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByTestId('route')).toHaveTextContent(destination);
  });
});
