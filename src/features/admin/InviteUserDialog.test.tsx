import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InviteUserDialog } from './InviteUserDialog';

function createPeopleQuery() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('InviteUserDialog', () => {
  it('shows and copies a manual activation link when the email quota is reached', async () => {
    const user = userEvent.setup();
    const activationLink = 'https://project.supabase.co/auth/v1/verify?token=one-time';
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onInvited = vi.fn().mockResolvedValue(undefined);
    const invoke = vi.fn().mockResolvedValue({
      data: { delivery: 'manual_link', activationLink },
      error: null,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <InviteUserDialog
        client={{ functions: { invoke }, from: vi.fn().mockReturnValue(createPeopleQuery()) } as never}
        onClose={vi.fn()}
        onInvited={onInvited}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Nom affiché')).toBeEnabled());
    await user.type(screen.getByLabelText('Nom affiché'), 'Pierre AUGUIN');
    await user.type(screen.getByLabelText('Adresse email'), 'pierre@bbtm.fr');
    await user.click(screen.getByRole('button', { name: "Envoyer l'invitation" }));

    expect(await screen.findByText('Quota d’envoi d’emails atteint')).toBeInTheDocument();
    expect(screen.getByLabelText('Lien d’activation personnel')).toHaveValue(activationLink);
    expect(onInvited).toHaveBeenCalledWith('manual_link');

    await user.click(screen.getByRole('button', { name: 'Copier le lien d’activation' }));
    expect(writeText).toHaveBeenCalledWith(activationLink);
    expect(screen.getByRole('button', { name: 'Lien copié' })).toBeInTheDocument();
  });
});
