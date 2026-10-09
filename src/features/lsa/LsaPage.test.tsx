import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LsaPage } from './LsaPage';
import { createLsaPreviewClient } from './lsaPreview';
import { fetchLsaRegister } from './lsaQueries';
import { LSA_CATEGORIES } from './lsaModel';
import { demoFleetVessels } from '../lifting/liftingPreview';
import { annualExpiry, todayLocal } from '../lifting/liftingModel';
import { getFleetCertificateCategoryOptions } from '../fleetCertificates/fleetCertificateCategories';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';

function renderLsaProfile(roles: RoleKey[], client = createLsaPreviewClient(), initialEntries = ['/modules/lsa']) {
  // Synthetic data only; each profile uses its own non-preview role context without a session override.
  const context = { roles, client, previewMode: false, currentPerson: null } satisfies AppShellOutletContext;
  return render(<MemoryRouter initialEntries={initialEntries}><Routes><Route element={<Outlet context={context} />}><Route path="/modules/lsa" element={<LsaPage />} /></Route></Routes></MemoryRouter>);
}

describe('Registre LSA', () => {
  it.each(['capitaine', 'marin'] as const)('opens the linked vessel and exact item history without opening an edit dialog for %s', async (role) => {
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels[1];
    const register = await fetchLsaRegister(client, vessel.id);
    const item = register.items[1];
    renderLsaProfile([role], client, [`/modules/lsa?vessel=${vessel.id}&item=${item.id}`]);

    await waitFor(() => expect(screen.getByRole('button', { name: vessel.name })).toHaveAttribute('aria-pressed', 'true'), { timeout: 5000 });
    await waitFor(() => expect(document.getElementById(`lsa-item-${item.id}`)?.querySelector('details')).toHaveAttribute('open'), { timeout: 5000 });
    expect(document.querySelectorAll('.lsa-details[open]')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Modifier ${item.document_title}` })).toBeEnabled();
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

  it.each(ROLE_KEYS)('persists an edited item in the selected vessel and keeps it after reloading for %s', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    renderLsaProfile([role], client);
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

  it.each(ROLE_KEYS)('offers all actions on every card and updates only the selected expiry for %s', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels.find((entry) => entry.acronym === 'SUR')!;
    const original = (await fetchLsaRegister(client, vessel.id)).items;
    const item = original.find((entry) => entry.document_title === 'EPIRB - 01')!;
    const rpc = vi.spyOn(client, 'rpc');
    renderLsaProfile([role], client);
    await screen.findByText('4 / 4 matériels affichés');

    for (const entry of original) {
      const card = within(document.getElementById(`lsa-item-${entry.id}`)!);
      for (const action of ['Mettre à jour', 'Modifier', 'Supprimer']) {
        expect(card.getByRole('button', { name: `${action} ${entry.document_title}` })).toBeEnabled();
      }
    }
    await user.click(screen.getByRole('button', { name: `Mettre à jour ${item.document_title}` }));
    const dialogElement = screen.getByRole('dialog', { name: 'Mettre à jour l’échéance' });
    const dialog = within(dialogElement);
    const date = dialog.getByLabelText('Date d’échéance');
    expect(date).toHaveValue(annualExpiry(todayLocal()));
    expect(date).toBeRequired();
    expect(dialogElement.querySelectorAll('input, select, textarea')).toHaveLength(1);
    expect(dialog.getByText(item.document_title)).toBeInTheDocument();
    fireEvent.change(date, { target: { value: '2028-02-12' } });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));

    await screen.findByText('Échéance LSA mise à jour.');
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('update_lsa_item_expiry', {
      p_id: item.id, p_expires_on: '2028-02-12', p_expected_updated_at: item.updated_at,
    });
    expect(rpc).not.toHaveBeenCalledWith('save_lsa_item', expect.anything());
    const saved = (await fetchLsaRegister(client, vessel.id)).items;
    const savedItem = saved.find((entry) => entry.id === item.id)!;
    expect(savedItem).toEqual({ ...item, expires_on: '2028-02-12', updated_at: savedItem.updated_at });
    expect(saved.filter((entry) => entry.id !== item.id)).toEqual(original.filter((entry) => entry.id !== item.id));
    const card = within(document.getElementById(`lsa-item-${item.id}`)!);
    expect(card.getByText(/12\/02\/2028/)).toBeInTheDocument();
  });

  it('recomputes the expiry from the current Paris date whenever the update dialog opens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-09T21:30:00Z'));
      const user = userEvent.setup();
      const client = createLsaPreviewClient();
      const rpc = vi.spyOn(client, 'rpc');
      renderLsaProfile(['marin'], client);
      await user.click(await screen.findByRole('button', { name: 'Mettre à jour EPIRB - 01' }));
      let dialog = within(screen.getByRole('dialog', { name: 'Mettre à jour l’échéance' }));
      expect(dialog.getByLabelText('Date d’échéance')).toHaveValue('2027-10-09');
      fireEvent.change(dialog.getByLabelText('Date d’échéance'), { target: { value: '2029-03-15' } });
      await user.click(dialog.getByRole('button', { name: 'Annuler' }));
      expect(rpc).not.toHaveBeenCalledWith('update_lsa_item_expiry', expect.anything());

      // Paris has crossed midnight although the UTC calendar date is still October 9.
      vi.setSystemTime(new Date('2026-10-09T22:30:00Z'));
      await user.click(screen.getByRole('button', { name: 'Mettre à jour EPIRB - 01' }));
      dialog = within(screen.getByRole('dialog', { name: 'Mettre à jour l’échéance' }));
      expect(dialog.getByLabelText('Date d’échéance')).toHaveValue('2027-10-10');
      fireEvent.change(dialog.getByLabelText('Date d’échéance'), { target: { value: '' } });
      await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
      expect(rpc).not.toHaveBeenCalledWith('update_lsa_item_expiry', expect.anything());
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(ROLE_KEYS)('deletes the selected item only after confirmation for %s', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vessel = demoFleetVessels.find((entry) => entry.acronym === 'SUR')!;
    const original = (await fetchLsaRegister(client, vessel.id)).items;
    const item = original.find((entry) => entry.document_title === 'EPIRB - 01')!;
    const rpc = vi.spyOn(client, 'rpc');
    renderLsaProfile([role], client);
    await user.click(await screen.findByRole('button', { name: `Supprimer ${item.document_title}` }));
    let dialog = within(screen.getByRole('dialog', { name: 'Supprimer le matériel LSA' }));
    expect(dialog.getByText(item.document_title)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Annuler' }));
    expect(rpc).not.toHaveBeenCalledWith('delete_lsa_item', expect.anything());
    expect((await fetchLsaRegister(client, vessel.id)).items).toEqual(original);

    await user.click(screen.getByRole('button', { name: `Supprimer ${item.document_title}` }));
    dialog = within(screen.getByRole('dialog', { name: 'Supprimer le matériel LSA' }));
    await user.click(dialog.getByRole('button', { name: 'Supprimer' }));
    await screen.findByText('Matériel LSA supprimé.');
    await screen.findByText('3 / 3 matériels affichés');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: item.document_title })).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('delete_lsa_item', { p_id: item.id, p_expected_updated_at: item.updated_at });
    expect((await fetchLsaRegister(client, vessel.id)).items).toEqual(original.filter((entry) => entry.id !== item.id));
  });

  it('preserves the proposed expiry and original record after a refused update and allows retry', async () => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vesselId = demoFleetVessels.find((entry) => entry.acronym === 'SUR')!.id;
    const original = (await fetchLsaRegister(client, vesselId)).items;
    const originalRpc = client.rpc.bind(client);
    let attempts = 0;
    vi.spyOn(client, 'rpc').mockImplementation((name, args) => name === 'update_lsa_item_expiry' && ++attempts === 1
      ? Promise.resolve({ data: null, error: { message: 'Échéance non enregistrée. Réessayez.' } }) as unknown as ReturnType<typeof client.rpc>
      : originalRpc(name, args));
    renderLsaProfile(['marin'], client);
    await user.click(await screen.findByRole('button', { name: 'Mettre à jour EPIRB - 01' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Mettre à jour l’échéance' }));
    fireEvent.change(dialog.getByLabelText('Date d’échéance'), { target: { value: '2028-06-05' } });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Échéance non enregistrée. Réessayez.');
    expect(dialog.getByLabelText('Date d’échéance')).toHaveValue('2028-06-05');
    expect(dialog.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    expect((await fetchLsaRegister(client, vesselId)).items).toEqual(original);

    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Échéance LSA mise à jour.');
    expect(attempts).toBe(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await fetchLsaRegister(client, vesselId)).items.find((entry) => entry.document_title === 'EPIRB - 01')?.expires_on).toBe('2028-06-05');
  });

  it('keeps the record and deletion confirmation after a refused deletion and allows retry', async () => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const vesselId = demoFleetVessels.find((entry) => entry.acronym === 'SUR')!.id;
    const original = (await fetchLsaRegister(client, vesselId)).items;
    const originalRpc = client.rpc.bind(client);
    let attempts = 0;
    vi.spyOn(client, 'rpc').mockImplementation((name, args) => name === 'delete_lsa_item' && ++attempts === 1
      ? Promise.resolve({ data: null, error: { message: 'Suppression refusée. Réessayez.' } }) as unknown as ReturnType<typeof client.rpc>
      : originalRpc(name, args));
    renderLsaProfile(['capitaine'], client);
    await user.click(await screen.findByRole('button', { name: 'Supprimer EPIRB - 01' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Supprimer le matériel LSA' }));
    await user.click(dialog.getByRole('button', { name: 'Supprimer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Suppression refusée. Réessayez.');
    expect(dialog.getByRole('button', { name: 'Supprimer' })).toBeEnabled();
    expect((await fetchLsaRegister(client, vesselId)).items).toEqual(original);

    await user.click(dialog.getByRole('button', { name: 'Supprimer' }));
    await screen.findByText('Matériel LSA supprimé.');
    expect(attempts).toBe(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await fetchLsaRegister(client, vesselId)).items).toHaveLength(original.length - 1);
  });

  it.each(['capitaine', 'marin'] as const)('allows the %s profile to create a numbered item and act on existing items', async (role) => {
    const user = userEvent.setup();
    const client = createLsaPreviewClient();
    const rpc = vi.spyOn(client, 'rpc');
    renderLsaProfile([role], client);
    await screen.findByText('4 / 4 matériels affichés');
    expect(screen.getAllByRole('button', { name: /^Modifier / })).toHaveLength(4);
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
    expect(screen.getByRole('button', { name: 'Modifier Feu à main - 02' })).toBeEnabled();
    const register = await fetchLsaRegister(client, vesselId);
    expect(register.items.find((item) => item.document_title === 'Feu à main - 02')?.brand).toBe(`Marque ${role}`);
  });

  it.each(['capitaine', 'marin'] as const)('keeps historical inventory readable and denies all mutations according to server access for %s', async (role) => {
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
    // A true result for the preceding vessel must not enable mutations while the new scope is pending.
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
    for (const action of ['Mettre à jour', 'Modifier', 'Supprimer']) {
      const buttons = screen.getAllByRole('button', { name: new RegExp(`^${action} `) });
      expect(buttons).toHaveLength(historicalRegister.items.length);
      for (const button of buttons) {
        expect(button).toBeDisabled();
        await user.click(button);
      }
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(rpc.mock.calls.some(([name]) => ['lsa_next_item_number', 'save_lsa_item', 'update_lsa_item_expiry', 'delete_lsa_item'].includes(name))).toBe(false);

    await user.click(screen.getByRole('button', { name: currentVessel.name }));
    await waitFor(() => expect(addButton).toBeEnabled());
    for (const action of ['Mettre à jour', 'Modifier', 'Supprimer']) {
      expect(screen.getByRole('button', { name: `${action} EPIRB - 01` })).toBeEnabled();
    }
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
      expect(screen.queryByRole('button', { name: /^Mettre à jour/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Modifier Feu modifié - 01' }));
    expect(within(screen.getByRole('dialog')).getByRole('option', { name: 'Feu modifié (archivé)' })).toBeInTheDocument();
  });

});
