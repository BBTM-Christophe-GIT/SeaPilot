import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ApplicationBranding } from '../branding/applicationLogo';
import { AdminApplicationLogo } from './AdminApplicationLogo';
import { AdminPage } from './AdminPage';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), prepare: vi.fn(), save: vi.fn(), reset: vi.fn(),
  apply: vi.fn(), preview: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn(),
}));

vi.mock('../branding/applicationLogo', () => ({
  DEFAULT_APPLICATION_LOGO: '/seapilot-logo.png',
  MAX_APPLICATION_LOGO_BYTES: 2 * 1024 * 1024,
  fetchApplicationBranding: mocks.fetch,
  prepareApplicationLogoFile: mocks.prepare,
  saveApplicationLogo: mocks.save,
  resetApplicationLogo: mocks.reset,
  applicationLogoUrl: (_client: unknown, branding: ApplicationBranding) => branding.logoPath ? `https://logos.example.test/${branding.logoPath}?revision=${branding.revision}` : '/seapilot-logo.png',
}));

vi.mock('../branding/ApplicationLogoProvider', () => ({
  useApplicationLogo: () => ({
    logoUrl: '/seapilot-logo.png', isCustom: false,
    applyBranding: mocks.apply, setPreviewLogo: mocks.preview,
  }),
}));

const defaultBranding: ApplicationBranding = { logoPath: null, revision: 0, canManage: true, updatedAt: null };
const customBranding: ApplicationBranding = { logoPath: 'current.png', revision: 4, canManage: true, updatedAt: '2026-10-14T09:00:00Z' };

function createClient() {
  return { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function chooseLogo(name = 'new-logo.png') {
  const file = new File(['logo'], name, { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Choisir un nouveau logo'), file);
  await screen.findByAltText('Aperçu du nouveau logo');
  return file;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetch.mockResolvedValue(defaultBranding);
  mocks.prepare.mockImplementation(async (file: File) => file);
  mocks.save.mockResolvedValue({ ...customBranding, logoPath: 'saved.png', revision: 5 });
  mocks.reset.mockResolvedValue({ ...defaultBranding, revision: 5 });
  let blobSequence = 0;
  mocks.createUrl.mockImplementation(() => `blob:logo-${++blobSequence}`);
  Object.defineProperty(URL, 'createObjectURL', { value: mocks.createUrl, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: mocks.revokeUrl, configurable: true });
});

afterEach(() => { cleanup(); });

describe('AdminApplicationLogo', () => {
  it('previews the selected file locally and publishes only after explicit save with the current revision', async () => {
    const client = createClient();
    mocks.fetch.mockResolvedValue(customBranding);
    render(<AdminApplicationLogo client={client as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'https://logos.example.test/current.png?revision=4');
    expect(mocks.apply).toHaveBeenCalledWith(customBranding);
    const file = await chooseLogo();
    expect(mocks.prepare).toHaveBeenCalledWith(file);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'https://logos.example.test/current.png?revision=4');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le logo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Logo enregistré');
    expect(mocks.save).toHaveBeenCalledWith(client, file, 4);
    expect(mocks.apply).toHaveBeenLastCalledWith({ ...customBranding, logoPath: 'saved.png', revision: 5 });
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'https://logos.example.test/saved.png?revision=5');
    expect(screen.queryByAltText('Aperçu du nouveau logo')).not.toBeInTheDocument();
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-1');
  });

  it('restores the default logo and prevents another operation during the write', async () => {
    mocks.fetch.mockResolvedValue(customBranding);
    const pending = deferred<ApplicationBranding>();
    mocks.reset.mockReturnValue(pending.promise);
    const client = createClient();
    render(<AdminApplicationLogo client={client as never} />);
    const restore = screen.getByRole('button', { name: 'Rétablir le logo par défaut' });
    await waitFor(() => expect(restore).toBeEnabled());
    await userEvent.click(restore);
    expect(screen.getByLabelText('Choisir un nouveau logo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restauration…' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Logo de l’application' }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith(client, 4);
    await act(async () => pending.resolve({ ...defaultBranding, revision: 5 }));
    expect(await screen.findByRole('status')).toHaveTextContent('Logo SeaPilot par défaut rétabli');
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', '/seapilot-logo.png');
    expect(screen.getByRole('button', { name: 'Rétablir le logo par défaut' })).toBeDisabled();
  });

  it('requires successful loading before modification and offers a working retry after a read error', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Impossible de charger les paramètres.'));
    render(<AdminApplicationLogo client={createClient() as never} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.getByLabelText('Choisir un nouveau logo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer le logo' })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer le chargement' }));
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays the logo while disabling management for an unauthorized administrator', async () => {
    mocks.fetch.mockResolvedValue({ ...customBranding, canManage: false });
    render(<AdminApplicationLogo client={createClient() as never} />);
    await screen.findByText('La modification du logo est réservée aux administrateurs autorisés.');
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'https://logos.example.test/current.png?revision=4');
    expect(screen.getByLabelText('Choisir un nouveau logo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rétablir le logo par défaut' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: 'Logo de l’application' }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('keeps the candidate after a failed save and can refresh a conflicting revision before retry', async () => {
    mocks.fetch.mockResolvedValueOnce(customBranding).mockResolvedValueOnce({ ...customBranding, revision: 6 });
    mocks.save.mockRejectedValueOnce(new Error('Le logo a été modifié par un autre administrateur.'));
    const client = createClient();
    render(<AdminApplicationLogo client={client as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    const file = await chooseLogo();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le logo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('autre administrateur');
    expect(screen.getByAltText('Aperçu du nouveau logo')).toHaveAttribute('src', 'blob:logo-1');
    expect(screen.getByText(/Le fichier sélectionné est conservé/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enregistrer le logo' })).toBeEnabled();
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser les paramètres' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer le logo' })).toBeEnabled());
    expect(screen.getByAltText('Aperçu du nouveau logo')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le logo' }));
    await screen.findByText('Logo enregistré. Il est maintenant affiché dans l’application.');
    expect(mocks.save).toHaveBeenLastCalledWith(client, file, 6);
  });

  it('leaves the current logo in place if restoration fails', async () => {
    mocks.fetch.mockResolvedValue(customBranding);
    mocks.reset.mockRejectedValue(new Error('Restauration indisponible.'));
    render(<AdminApplicationLogo client={createClient() as never} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rétablir le logo par défaut' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir le logo par défaut' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Restauration indisponible');
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'https://logos.example.test/current.png?revision=4');
    expect(screen.getByRole('button', { name: 'Rétablir le logo par défaut' })).toBeEnabled();
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });

  it('shows validation errors before preview or write and keeps a previous valid candidate', async () => {
    render(<AdminApplicationLogo client={createClient() as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    await chooseLogo('valid.png');
    mocks.prepare.mockRejectedValueOnce(new Error('Le fichier dépasse la taille maximale de 2 Mo.'));
    await userEvent.upload(screen.getByLabelText('Choisir un nouveau logo'), new File(['invalid'], 'too-large.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('2 Mo');
    expect(screen.getByText('valid.png')).toBeVisible();
    expect(mocks.createUrl).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('revokes local previews on replacement, cancellation and unmount', async () => {
    const { unmount } = render(<AdminApplicationLogo client={createClient() as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    await chooseLogo('first.png');
    await chooseLogo('second.png');
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-1');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la sélection' }));
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-2');
    expect(screen.queryByAltText('Aperçu du nouveau logo')).not.toBeInTheDocument();
    await chooseLogo('third.png');
    unmount();
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-3');
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('ignores an older validation when a newer selected file completes first', async () => {
    const older = deferred<File>();
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.png', { type: 'image/png' });
    mocks.prepare.mockReturnValueOnce(older.promise).mockResolvedValueOnce(second);
    render(<AdminApplicationLogo client={createClient() as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    await userEvent.upload(screen.getByLabelText('Choisir un nouveau logo'), first);
    expect(screen.getByRole('button', { name: 'Enregistrer le logo' })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText('Choisir un nouveau logo'), second);
    await screen.findByText('second.png');
    await act(async () => older.resolve(first));
    expect(screen.queryByText('first.png')).not.toBeInTheDocument();
    expect(mocks.createUrl).toHaveBeenCalledExactlyOnceWith(second);
  });

  it('does not revive a canceled validation or commit settings after unmount', async () => {
    const validation = deferred<File>();
    mocks.prepare.mockReturnValueOnce(validation.promise);
    const { unmount } = render(<AdminApplicationLogo client={createClient() as never} />);
    await waitFor(() => expect(screen.getByLabelText('Choisir un nouveau logo')).toBeEnabled());
    const file = new File(['logo'], 'pending.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Choisir un nouveau logo'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la sélection' }));
    await act(async () => validation.resolve(file));
    expect(mocks.createUrl).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Aperçu du nouveau logo')).not.toBeInTheDocument();
    await chooseLogo();
    const pending = deferred<ApplicationBranding>();
    mocks.save.mockReturnValueOnce(pending.promise);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le logo' }));
    unmount();
    await act(async () => pending.resolve(customBranding));
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-1');
  });

  it('applies and restores a local demo logo without any backend calls or publishing', async () => {
    const client = createClient();
    const { unmount } = render(<AdminApplicationLogo client={client as never} previewMode />);
    expect(screen.getByText(/Mode démonstration/)).toHaveTextContent('ne sont pas publiés');
    const file = await chooseLogo();
    expect(mocks.preview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le logo' }));
    expect(await screen.findByRole('status')).toHaveTextContent('cette démonstration uniquement');
    expect(mocks.preview).toHaveBeenCalledWith(file);
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', 'blob:logo-2');
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-1');
    await userEvent.click(screen.getByRole('button', { name: 'Rétablir le logo par défaut' }));
    expect(screen.getByAltText('Logo actuel de l’application')).toHaveAttribute('src', '/seapilot-logo.png');
    expect(mocks.preview).toHaveBeenLastCalledWith(null);
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:logo-2');
    for (const backendCall of [mocks.fetch, mocks.save, mocks.reset, mocks.apply, client.from, client.rpc, client.storage.from]) expect(backendCall).not.toHaveBeenCalled();
    unmount();
  });

  it('exposes the logo administration menu and avoids unrelated directory calls on its demo route', () => {
    const client = createClient();
    render(<MemoryRouter initialEntries={['/modules/admin?preview=1&section=branding']}><AdminPage client={client as never} previewMode /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Logo de l’application' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('form', { name: 'Logo de l’application' })).toBeVisible();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
