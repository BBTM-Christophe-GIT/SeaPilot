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
    await user.selectOptions(screen.getByLabelText('Type d’équipement'), LSA_CATEGORIES[2].key);
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
    await user.click(await screen.findByRole('button', { name: 'Modifier Gilet de sauvetage — DÉMO 01' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.clear(dialog.getByLabelText('Désignation'));
    await user.type(dialog.getByLabelText('Désignation'), 'Gilet contrôlé');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Matériel LSA enregistré.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Gilet contrôlé' })).toBeInTheDocument();
  });

  it.each(['capitaine', 'marin'] as const)('keeps %s read-only in the application code', async (role) => {
    render(<MemoryRouter><LsaPage client={createLsaPreviewClient()} roles={[role]} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
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
});
