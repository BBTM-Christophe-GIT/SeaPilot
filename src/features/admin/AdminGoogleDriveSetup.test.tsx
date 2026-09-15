import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGoogleDriveSetup } from './AdminGoogleDriveSetup';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';

vi.mock('../documents/localDriveLauncher', async (original) => ({
  ...await original<typeof import('../documents/localDriveLauncher')>(),
  connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(),
}));
const connection = { url: 'http://127.0.0.1:50000/test', expiresAt: Date.now() + 100000 };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(connectLocalDrive).mockResolvedValue(connection); });

describe('shared PC Drive setup', () => {
  it('sends one root and displays the folders prepared by the launcher', async () => {
    const user = userEvent.setup();
    vi.mocked(localDriveRequest).mockResolvedValue({ root: 'G:\\Mon Drive\\SeaPilot', version: '2.0.0', collaborators: 42 });
    const client = {} as never;
    render(<AdminGoogleDriveSetup client={client} />);
    await user.type(screen.getByLabelText('Chemin du dossier SeaPilot sur ce PC'), 'G:\\Mon Drive\\SeaPilot');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la racine SeaPilot' }));
    expect(await screen.findByText('42 dossier(s) de collaborateurs en poste préparé(s).')).toBeVisible();
    expect(localDriveRequest).toHaveBeenCalledWith(client, connection, { action: 'configure', root: 'G:\\Mon Drive\\SeaPilot' });
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Installer le lanceur Windows' })).toHaveAttribute('download');
  });

  it('retrieves the existing PC root and reports a failed connection without claiming success', async () => {
    const user = userEvent.setup();
    vi.mocked(localDriveRequest).mockResolvedValueOnce({ root: 'G:\\SeaPilot', version: '2.0.0' }).mockRejectedValueOnce(new Error('Accès refusé'));
    render(<AdminGoogleDriveSetup client={{} as never} />);
    await user.click(screen.getByRole('button', { name: 'Vérifier ce PC' }));
    expect(await screen.findByText('Ce PC est configuré')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('G:\\SeaPilot');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la racine SeaPilot' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé');
    expect(screen.queryByText('Ce PC est configuré')).not.toBeInTheDocument();
  });

  it('keeps preview data away from the real PC configuration', () => {
    render(<AdminGoogleDriveSetup client={{} as never} previewMode />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vérifier ce PC' })).toBeDisabled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
});
