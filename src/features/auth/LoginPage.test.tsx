import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { LoginPage } from './LoginPage';

function renderLoginPage() {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail,
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  };

  render(
    <AuthProvider client={client as never}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>,
  );

  return { resetPasswordForEmail };
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
});
