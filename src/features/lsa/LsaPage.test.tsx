import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LsaPage } from './LsaPage';
import { createLsaPreviewClient } from './lsaPreview';
import { fetchLsaRegister } from './lsaQueries';
import { LSA_CATEGORIES } from './lsaModel';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { getFleetCertificateCategoryOptions } from '../fleetCertificates/fleetCertificateCategories';

describe('Registre LSA', () => {
  it('combines vessel, category and text filters and resets the selection', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={createLsaPreviewClient()} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    await user.selectOptions(screen.getByLabelText('Type d’équipement'), 'lsa-type-2');
    expect(screen.getByText('1 / 4 matériels affichés')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un matériel' }), 'inexistant');
    expect(screen.getByText('Aucun matériel ne correspond aux filtres.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByText('4 / 4 matériels affichés')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: demoFleetVessels[1].name }));
    await waitFor(() => expect(screen.getByRole('button', { name: demoFleetVessels[1].name })).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: 'Documents de contrôle' }));
    expect(await screen.findByLabelText('Année')).toHaveValue('');
    expect(screen.getByText('Aucun document de contrôle pour cette sélection.')).toBeInTheDocument();
  });

  it('persists an edited item in the selected vessel and keeps it after reloading', async () => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    render(<MemoryRouter><LsaPage client={client} roles={['armement']} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Modifier EPIRB - 01' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.clear(dialog.getByLabelText('Marque'));
    await user.type(dialog.getByLabelText('Marque'), 'Ocean Signal');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Matériel LSA enregistré.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'EPIRB - 01' })).toBeInTheDocument();
    expect(screen.getAllByText('Ocean Signal').length).toBeGreaterThan(0);
    const register = await fetchLsaRegister(client, demoFleetVessels.find((vessel) => vessel.acronym === 'SUR')!.id);
    expect(register.items.find((item) => item.document_title === 'EPIRB - 01')?.brand).toBe('Ocean Signal');
  });

  it.each(['capitaine', 'marin'] as const)('keeps %s read-only in the application code', async (role) => {
    render(<MemoryRouter><LsaPage client={createLsaPreviewClient()} roles={[role]} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.queryByRole('button', { name: 'Gérer les désignations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un matériel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
  });

  it('does not offer transferred categories in fleet certificates, even from stale data', () => {
    const options = getFleetCertificateCategoryOptions(LSA_CATEGORIES.map((category) => ({ categoryKey: category.key, categoryLabel: category.label })));
    expect(options.some((option) => LSA_CATEGORIES.some((category) => category.key === option.key))).toBe(false);
    expect(options.some((option) => option.key === '07-1-radeaux-hru')).toBe(true);
  });

  it('does not silently hide failures loading transferred versions', async () => {
    const client = createLsaPreviewClient();
    const from = client.from.bind(client);
    vi.spyOn(client, 'from').mockImplementation((table: string) => table === 'lsa_versions'
      ? { select: () => ({ in: () => ({ order: () => Promise.resolve({ data: null, error: new Error('Documents indisponibles') }) }) }) } as never
      : from(table));
    await expect(fetchLsaRegister(client, demoFleetVessels[0].id)).rejects.toThrow('Documents indisponibles');
  });
  it('sorts the grouped catalog, removes obsolete fields and assigns consecutive numbers per vessel', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={createLsaPreviewClient()} roles={['armement']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.queryByRole('button', { name: 'Gérer les désignations' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    let dialog = within(screen.getByRole('dialog'));
    const select = dialog.getByLabelText('Désignation');
    const groups = Array.from(select.querySelectorAll('optgroup'));
    expect(groups.map((group) => group.label)).toEqual(['Gilets de Sauvetage', 'GMDSS', 'Navigation', 'Pyrotechnie', 'Survie']);
    expect(Array.from(groups[3].children).map((option) => option.textContent)).toEqual(['Feu à main', 'Fumigène flottant', 'Fusée à parachute', 'Fusée du lance amarre']);
    for (const field of ['Type d’équipement', 'Lieu du contrôle', 'Contrôle prévu', 'Date d’émission', 'Suivi du renouvellement', 'Prestataire']) {
      expect(dialog.queryByLabelText(field)).not.toBeInTheDocument();
    }
    await user.selectOptions(select, '13');
    expect(await dialog.findByText('Feu à main - 02')).toBeInTheDocument();
    await user.type(dialog.getByLabelText('Marque'), 'Marque test');
    await user.type(dialog.getByLabelText('Modèle'), 'Modèle test');
    await user.type(dialog.getByLabelText('Numéro de série'), '00042');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Feu à main - 02' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Désignation'), '13');
    expect(await dialog.findByText('Feu à main - 03')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Annuler' }));
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un matériel' }), 'marque modele 00042');
    expect(screen.getByText('1 / 5 matériels affichés')).toBeInTheDocument();
  });

  it('allows administrators to rename, move and archive designations', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={createLsaPreviewClient()} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    await user.click(screen.getByRole('button', { name: 'Gérer les désignations' }));
    const catalog = within(screen.getByRole('dialog'));
    await user.click(catalog.getByRole('button', { name: 'Modifier la désignation Feu à main' }));
    await user.clear(catalog.getByLabelText('Libellé'));
    await user.type(catalog.getByLabelText('Libellé'), 'Feu modifié');
    await user.selectOptions(catalog.getByLabelText('Type d’équipement'), '3');
    await user.click(catalog.getByRole('checkbox', { name: 'Disponible pour les nouvelles fiches' }));
    await user.click(catalog.getByRole('button', { name: 'Enregistrer l’arborescence' }));
    expect(await catalog.findByText('Arborescence enregistrée.')).toBeInTheDocument();
    await user.click(catalog.getByRole('button', { name: 'Terminer' }));
    expect(await screen.findByRole('heading', { name: 'Feu modifié - 01' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    expect(within(screen.getByRole('dialog')).queryByRole('option', { name: /Feu modifié/ })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Modifier Feu modifié - 01' }));
    expect(within(screen.getByRole('dialog')).getByRole('option', { name: 'Feu modifié (archivé)' })).toBeInTheDocument();
  });

});
