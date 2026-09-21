import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsefulLinksPage } from './UsefulLinksPage';
import { deleteDirectoryItem, fetchLinksDirectory, saveLinkCategory, saveUsefulLink } from './usefulLinks';

vi.mock('./usefulLinks', async (original) => ({ ...await original<typeof import('./usefulLinks')>(), fetchLinksDirectory: vi.fn(), saveUsefulLink: vi.fn(), saveLinkCategory: vi.fn(), deleteDirectoryItem: vi.fn() }));
const link = { id: 'l1', title: 'DNV', url: 'https://example.com/private?token=123', category_id: 'c1' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchLinksDirectory).mockResolvedValue({ canManage: true, links: [link], categories: [{ id: 'c1', name: 'Conformité' }] });
});

describe('useful links page', () => {
  it('shows the title, opens a separate tab, filters and falls back when the favicon fails', async () => {
    const user = userEvent.setup(); render(<UsefulLinksPage />);
    const anchor = await screen.findByRole('link', { name: 'DNV (nouvel onglet)' });
    expect(anchor).toHaveAttribute('href', link.url); expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText(link.url)).not.toBeInTheDocument();
    fireEvent.error(anchor.querySelector('img')!); expect(within(anchor).getByText('DN')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un lien' }), 'conformite');
    expect(screen.getByRole('link', { name: 'DNV (nouvel onglet)' })).toBeVisible();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un lien' }), 'absent');
    expect(screen.getByText('Aucun lien trouvé')).toBeVisible();
  });
  it('adds and edits a link with category, and confirms deletion', async () => {
    const user = userEvent.setup(); render(<UsefulLinksPage />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un lien' }));
    await user.type(screen.getByLabelText('Titre'), 'Portail');
    await user.type(screen.getByLabelText('Adresse du lien'), 'https://example.org/');
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'c1');
    vi.mocked(saveUsefulLink).mockResolvedValue({ id: 'l2', title: 'Portail', url: 'https://example.org/', category_id: 'c1' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('link', { name: 'Portail (nouvel onglet)' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modifier Portail' }));
    await user.clear(screen.getByLabelText('Titre')); await user.type(screen.getByLabelText('Titre'), 'Portail renommé');
    vi.mocked(saveUsefulLink).mockResolvedValue({ id: 'l2', title: 'Portail renommé', url: 'https://example.org/', category_id: 'c1' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('link', { name: 'Portail renommé (nouvel onglet)' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Supprimer Portail renommé' }));
    expect(deleteDirectoryItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    expect(await screen.findByText('Lien supprimé.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Portail renommé (nouvel onglet)' })).not.toBeInTheDocument();
  });
  it('renames a category and preserves its links on deletion', async () => {
    const user = userEvent.setup(); render(<UsefulLinksPage />);
    await user.click(await screen.findByRole('button', { name: 'Catégories' }));
    await user.click(screen.getByRole('button', { name: 'Renommer Conformité' }));
    await user.clear(screen.getByLabelText('Nom de la catégorie')); await user.type(screen.getByLabelText('Nom de la catégorie'), 'Classe');
    vi.mocked(saveLinkCategory).mockResolvedValue({ id: 'c1', name: 'Classe' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la catégorie' }));
    await user.click(await screen.findByRole('button', { name: 'Supprimer la catégorie Classe' }));
    await user.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    await screen.findByText('Catégorie supprimée. Ses liens sont conservés sans catégorie.');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(within(screen.getByRole('region', { name: 'Sans catégorie' })).getByRole('link', { name: 'DNV (nouvel onglet)' })).toBeVisible();
  });
  it.each(['Marin', 'Capitaine', 'Armement'])('uses the server permission for a real %s fixture, without a simulated admin role', async () => {
    vi.mocked(fetchLinksDirectory).mockResolvedValue({ canManage: false, links: [link], categories: [] });
    render(<UsefulLinksPage />);
    await screen.findByRole('textbox', { name: 'Rechercher un lien' });
    expect(screen.queryByRole('button', { name: 'Ajouter un lien' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier DNV' })).not.toBeInTheDocument();
  });
  it('keeps the form open and the entered values after a save error', async () => {
    const user = userEvent.setup(); render(<UsefulLinksPage />);
    await user.click(await screen.findByRole('button', { name: 'Modifier DNV' }));
    vi.mocked(saveUsefulLink).mockRejectedValue(new Error('Accès révoqué'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès révoqué');
    expect(screen.getByLabelText('Titre')).toHaveValue('DNV');
  });
});
