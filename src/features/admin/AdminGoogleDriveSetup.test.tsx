import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGoogleDriveSetup } from './AdminGoogleDriveSetup';
import { connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';

vi.mock('../documents/localDriveLauncher', async (original) => ({
  ...await original<typeof import('../documents/localDriveLauncher')>(),
  connectLocalDrive: vi.fn(), localDriveRequest: vi.fn(),
}));
const connection = { url: 'http://127.0.0.1:50000/test', expiresAt: Date.now() + 100000, version: '2.6.0' };
const configured = { root: 'G:\\Mon Drive\\SeaPilot', version: '2.6.0', exists: true };
const missing = { root: null, version: '2.6.0', exists: false };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(connectLocalDrive).mockResolvedValue(connection); });

describe('automatic PC Drive setup', () => {
  it('checks the actual folder automatically and displays success without manual path or verify controls', async () => {
    vi.mocked(localDriveRequest).mockResolvedValue({ ...configured, collaborators: 42 });
    const client = {} as never;
    render(<StrictMode><AdminGoogleDriveSetup client={client} /></StrictMode>);
    expect(await screen.findByText('Google Drive est bien configuré')).toBeVisible();
    expect(screen.getByText('42 dossier(s) de collaborateurs en poste préparé(s).')).toBeVisible();
    expect(localDriveRequest).toHaveBeenCalledTimes(1);
    expect(localDriveRequest).toHaveBeenCalledWith(client, connection, { action: 'status' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vérifier ce PC' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sélectionner le dossier dans Windows' })).not.toBeInTheDocument();
  });
  it('opens the native picker for a missing folder then automatically verifies the selection', async () => {
    const user = userEvent.setup();
    vi.mocked(localDriveRequest).mockResolvedValueOnce(missing).mockResolvedValueOnce({ ...configured, collaborators: 4 }).mockResolvedValueOnce(configured);
    render(<AdminGoogleDriveSetup client={{} as never} />);
    await screen.findByText('Le dossier SeaPilot est introuvable ou inaccessible sur ce PC.');
    await user.click(screen.getByRole('button', { name: 'Sélectionner le dossier dans Windows' }));
    expect(await screen.findByText('Google Drive est bien configuré')).toBeVisible();
    expect(screen.getByText('4 dossier(s) de collaborateurs en poste préparé(s).')).toBeVisible();
    expect(vi.mocked(localDriveRequest).mock.calls.map((call) => call[2])).toEqual([{ action: 'status' }, { action: 'select-root' }, { action: 'status' }]);
  });
  it('preserves cancellation without claiming success and allows another selection', async () => {
    const user = userEvent.setup();
    vi.mocked(localDriveRequest).mockResolvedValueOnce(missing).mockResolvedValueOnce({ ...missing, cancelled: true });
    render(<AdminGoogleDriveSetup client={{} as never} />);
    await screen.findByText('Le dossier SeaPilot est introuvable ou inaccessible sur ce PC.');
    await user.click(screen.getByRole('button', { name: 'Sélectionner le dossier dans Windows' }));
    expect(await screen.findByText('Sélection annulée. Aucun réglage n’a été modifié.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sélectionner le dossier dans Windows' })).toBeEnabled();
    expect(screen.queryByText('Google Drive est bien configuré')).not.toBeInTheDocument();
  });
  it('does not trust a stale registered path when the native existence check fails', async () => {
    vi.mocked(localDriveRequest).mockResolvedValue({ ...configured, exists: false });
    render(<AdminGoogleDriveSetup client={{} as never} />);
    expect(await screen.findByText('Le dossier SeaPilot est introuvable ou inaccessible sur ce PC.')).toBeVisible();
    expect(screen.queryByText('Google Drive est bien configuré')).not.toBeInTheDocument();
  });
  it('requires the new launcher and starts a fresh connection after updating', async () => {
    const user = userEvent.setup();
    vi.mocked(connectLocalDrive).mockResolvedValueOnce({ ...connection, version: '2.5.0' }).mockResolvedValue(connection);
    vi.mocked(localDriveRequest).mockResolvedValue(configured);
    render(<AdminGoogleDriveSetup client={{} as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Installez le lanceur Windows 2.6');
    expect(localDriveRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Relancer le lanceur' }));
    expect(await screen.findByText('Google Drive est bien configuré')).toBeVisible();
    expect(connectLocalDrive).toHaveBeenLastCalledWith({ fresh: true });
  });
  it('shows authentication or connection errors without a success message', async () => {
    vi.mocked(localDriveRequest).mockRejectedValue(new Error('Accès refusé'));
    render(<AdminGoogleDriveSetup client={{} as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès refusé');
    expect(screen.queryByText('Google Drive est bien configuré')).not.toBeInTheDocument();
  });
  it('ignores a result received after leaving the setup screen', async () => {
    let complete: (value: unknown) => void = () => {};
    vi.mocked(localDriveRequest).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const view = render(<AdminGoogleDriveSetup client={{} as never} />);
    await waitFor(() => expect(localDriveRequest).toHaveBeenCalledTimes(1));
    view.unmount(); complete(configured);
    expect(screen.queryByText('Google Drive est bien configuré')).not.toBeInTheDocument();
  });
  it('keeps preview data away from the real PC configuration', () => {
    render(<AdminGoogleDriveSetup client={{} as never} previewMode />);
    expect(screen.getByRole('button', { name: 'Sélectionner le dossier dans Windows' })).toBeDisabled();
    expect(connectLocalDrive).not.toHaveBeenCalled();
  });
});
