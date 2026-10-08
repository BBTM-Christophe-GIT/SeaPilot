import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LsaPage } from './LsaPage';
import { createLsaPreviewClient } from './lsaPreview';
import { fetchLsaRegister } from './lsaQueries';
import { LSA_CATEGORIES } from './lsaModel';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { getFleetCertificateCategoryOptions } from '../fleetCertificates/fleetCertificateCategories';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';

function renderLsaProfile(roles: RoleKey[], client = createLsaPreviewClient()) {
  // Synthetic data only; each profile uses its own non-preview role context without a session override.
  const context = { roles, client, previewMode: false, currentPerson: null } satisfies AppShellOutletContext;
  return render(<MemoryRouter><Routes><Route element={<Outlet context={context} />}><Route index element={<LsaPage />} /></Route></Routes></MemoryRouter>);
}

describe('Registre LSA', () => {
  it.each(['capitaine', 'marin'] as const)('opens the linked vessel and exact item history read-only for %s', async (role) => {
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels[1];
    const register = await fetchLsaRegister(client, vessel.id);
    const item = register.items[1];
    render(<MemoryRouter initialEntries={[`/modules/lsa?vessel=${vessel.id}&item=${item.id}`]}><LsaPage client={client} roles={[role]} /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: vessel.name })).toHaveAttribute('aria-pressed', 'true'), { timeout: 5000 });
    await waitFor(() => expect(document.getElementById(`lsa-item-${item.id}`)?.querySelector('details')).toHaveAttribute('open'), { timeout: 5000 });
    expect(document.querySelectorAll('.lsa-details[open]')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
  });

  it('follows another item link in the mounted register without opening an edit dialog', async () => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels[1];
    const register = await fetchLsaRegister(client, vessel.id);
    const [first, second] = register.items;
    render(<MemoryRouter initialEntries={[`/modules/lsa?vessel=${vessel.id}&item=${first.id}`]}><Link to={`?vessel=${vessel.id}&item=${second.id}`}>Ouvrir un autre matériel</Link><LsaPage client={client} roles={['admin']} /></MemoryRouter>);

    await waitFor(() => expect(document.getElementById(`lsa-item-${first.id}`)?.querySelector('details')).toHaveAttribute('open'), { timeout: 5000 });
    await user.click(screen.getByRole('link', { name: 'Ouvrir un autre matériel' }));
    await waitFor(() => expect(document.getElementById(`lsa-item-${second.id}`)?.querySelector('details')).toHaveAttribute('open'));
    expect(document.getElementById(`lsa-item-${first.id}`)?.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for a newly linked vessel register before resolving its item', async () => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels[1];
    const targetRegister = await fetchLsaRegister(client, vessel.id);
    const item = targetRegister.items[1];
    const originalFrom = client.from.bind(client);
    let releaseTarget!: () => void;
    const targetItems = new Promise((resolve) => {
      releaseTarget = () => resolve({ data: targetRegister.items, error: null });
    });
    vi.spyOn(client, 'from').mockImplementation((table: string) => table === 'lsa_items'
      ? { select: () => ({ eq: (key: string, value: number) => ({ order: () => value === vessel.id ? targetItems : originalFrom(table).select('*').eq(key, value).order('id') }) }) } as never
      : originalFrom(table));
    render(<MemoryRouter initialEntries={['/modules/lsa']}><Link to={`?vessel=${vessel.id}&item=${item.id}`}>Ouvrir le matériel d’un autre navire</Link><LsaPage client={client} roles={['marin']} /></MemoryRouter>);

    await screen.findByText('4 / 4 matériels affichés');
    await user.click(screen.getByRole('link', { name: 'Ouvrir le matériel d’un autre navire' }));
    await screen.findByText('Chargement du registre…');
    expect(document.querySelectorAll('.lsa-details[open]')).toHaveLength(0);
    await act(async () => releaseTarget());
    await waitFor(() => expect(document.getElementById(`lsa-item-${item.id}`)?.querySelector('details')).toHaveAttribute('open'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open an item belonging to another vessel', async () => {
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels[1];
    const otherRegister = await fetchLsaRegister(client, demoFleetVessels[0].id);
    render(<MemoryRouter initialEntries={[`/modules/lsa?vessel=${vessel.id}&item=${otherRegister.items[0].id}`]}><LsaPage client={client} roles={['marin']} /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: vessel.name })).toHaveAttribute('aria-pressed', 'true'));
    await screen.findByText('4 / 4 matériels affichés');
    expect(document.querySelectorAll('.lsa-details[open]')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

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

  it.each(['capitaine', 'marin'] as const)('allows the %s profile to create a numbered item while keeping existing items read-only', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const rpc = vi.spyOn(client, 'rpc');
    renderLsaProfile([role], client);
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Fiche matériel LSA' }));
    await user.selectOptions(dialog.getByLabelText('Désignation'), '13');
    expect(await dialog.findByText('Feu à main - 02')).toBeInTheDocument();
    const vesselId = demoFleetVessels.find((vessel) => vessel.acronym === 'SUR')!.id;
    expect(rpc).toHaveBeenCalledWith('lsa_next_item_number', { p_vessel_id: vesselId, p_designation_id: 13 });
    await user.type(dialog.getByLabelText('Marque'), `Marque ${role}`);
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Matériel LSA enregistré.')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('save_lsa_item', {
      p_vessel_id: vesselId,
      p_item: expect.objectContaining({ designation_id: 13, brand: `Marque ${role}` }),
      p_id: null,
      p_expected_updated_at: null,
    });
    expect(await screen.findByRole('heading', { name: 'Feu à main - 02' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
    const register = await fetchLsaRegister(client, vesselId);
    expect(register.items.find((item) => item.document_title === 'Feu à main - 02')?.brand).toBe(`Marque ${role}`);
  });

  it.each(['capitaine', 'marin'] as const)('keeps historical inventory readable and denies creation according to server access for %s', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const currentVessel = demoFleetVessels.find((vessel) => vessel.acronym === 'SUR')!;
    const historicalVessel = demoFleetVessels.find((vessel) => vessel.id !== currentVessel.id && !vessel.name.startsWith('YARD'))!;
    const historicalRegister = await fetchLsaRegister(client, historicalVessel.id);
    const originalRpc = client.rpc.bind(client);
    let releaseHistoricalAccess!: () => void;
    const historicalAccess = new Promise((resolve) => {
      releaseHistoricalAccess = () => resolve({ data: false, error: null });
    });
    const rpc = vi.spyOn(client, 'rpc').mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name === 'lsa_can_add_item') {
        return (args?.p_vessel_id === historicalVessel.id ? historicalAccess : Promise.resolve({ data: true, error: null })) as never;
      }
      return originalRpc(name, args);
    });
    renderLsaProfile([role], client);
    await screen.findByText('4 / 4 matériels affichés');
    const addButton = screen.getByRole('button', { name: 'Ajouter un matériel' });
    expect(addButton).toBeEnabled();
    expect(rpc).toHaveBeenCalledWith('lsa_can_add_item', { p_vessel_id: currentVessel.id });

    await user.click(screen.getByRole('button', { name: historicalVessel.name }));
    await screen.findByText('Chargement du registre…');
    // A true result for the preceding vessel must not enable creation while the new scope is pending.
    expect(addButton).toBeDisabled();
    await user.click(addButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('lsa_can_add_item', { p_vessel_id: historicalVessel.id });

    await act(async () => releaseHistoricalAccess());
    await screen.findByText('4 / 4 matériels affichés');
    expect(document.getElementById(`lsa-item-${historicalRegister.items[0].id}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: historicalVessel.name })).toHaveAttribute('aria-pressed', 'true');
    expect(addButton).toBeDisabled();
    await user.click(addButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rpc.mock.calls.some(([name]) => name === 'lsa_next_item_number' || name === 'save_lsa_item')).toBe(false);
    expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: currentVessel.name }));
    await waitFor(() => expect(addButton).toBeEnabled());
  });

  it.each([
    { profile: 'marin', roles: ['marin'] },
    { profile: 'direction', roles: ['direction'] },
    { profile: 'armement', roles: ['armement'] },
    { profile: 'without a role', roles: [] },
  ] satisfies Array<{ profile: string; roles: RoleKey[] }>)('does not offer designation management to the profile $profile', async ({ roles }) => {
    renderLsaProfile(roles);
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.queryByRole('button', { name: 'Gérer les désignations' })).not.toBeInTheDocument();
    if (!roles.length) {
      expect(screen.queryByRole('button', { name: 'Ajouter un matériel' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
    }
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

  it.each(['admin', 'capitaine'] as const)('allows the %s profile to rename, move and archive designations', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const rpc = vi.spyOn(client, 'rpc');
    renderLsaProfile([role], client);
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
    expect(rpc).toHaveBeenCalledWith('save_lsa_catalog_entry', {
      p_kind: 'designation',
      p_entry: expect.objectContaining({ id: 13, name: 'Feu modifié', equipment_type_id: 3, active: false }),
    });
    await user.click(catalog.getByRole('button', { name: 'Terminer' }));
    expect(await screen.findByRole('heading', { name: 'Feu modifié - 01' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    expect(within(screen.getByRole('dialog')).queryByRole('option', { name: /Feu modifié/ })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));
    if (role === 'admin') {
      await user.click(screen.getByRole('button', { name: 'Modifier Feu modifié - 01' }));
      expect(within(screen.getByRole('dialog')).getByRole('option', { name: 'Feu modifié (archivé)' })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: /^Modifier/ })).not.toBeInTheDocument();
    }
  });

});
