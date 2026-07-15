import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { PasswordUpdatePage } from './PasswordUpdatePage';

function renderPage(session: unknown) {
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser,
      signOut: vi.fn(),
    },
  };

  render(
    <AuthProvider client={client as never}>
      <MemoryRouter>
        <PasswordUpdatePage />
      </MemoryRouter>
    </AuthProvider>,
  );

  return { updateUser };
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
    expect(await screen.findByRole('status')).toHaveTextContent('Votre compte SeaPilot est prêt.');
  });

  it('reports an expired or invalid link', async () => {
    renderPage(null);

    expect(await screen.findByText('Ce lien est invalide ou expiré.')).toBeInTheDocument();
  });
});
