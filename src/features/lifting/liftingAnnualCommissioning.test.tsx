import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel, secondDemoVessel } from './liftingPreview';
import { fetchInspectionEntries, fetchLiftingRegister, setLiftingItemActive, startLiftingInspection } from './liftingQueries';

describe('annual lifting commissioning dates', () => {
  it.each(['admin', 'direction', 'armement', 'capitaine'] as const)('copies the issue date to every active apparatus for authorized %s', async (role) => {
    const client = createLiftingPreviewClient({ roles: [role], inspectorGrant: role === 'capitaine' });
    const original = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items;
    const id = await startLiftingInspection(client, demoVessel.id, 'lifting', '2026-02-15', '2027-02-15');
    const current = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items;
    expect(current).toHaveLength(original.length);
    expect(current.every((item) => item.commissioned_on === '2026-02-15')).toBe(true);
    expect(current.map((item) => [item.id, item.service_version, item.inspection_due_on])).toEqual(original.map((item) => [item.id, item.service_version, item.inspection_due_on]));
    const entries = await fetchInspectionEntries(client, id);
    expect(entries.every((entry) => entry.item_snapshot.commissioned_on === '2026-02-15')).toBe(true);
    const later = await startLiftingInspection(client, demoVessel.id, 'lifting', '2026-03-16', '2027-03-16');
    expect((await fetchInspectionEntries(client, later)).every((entry) => entry.item_snapshot.commissioned_on === '2026-03-16')).toBe(true);
    expect(await fetchInspectionEntries(client, id)).toEqual(entries);
  });

  it('leaves other vessels, inactive apparatus and towing commissioning dates intact', async () => {
    const client = createLiftingPreviewClient();
    const inventory = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items;
    const towingBefore = (await fetchLiftingRegister(client, demoVessel.id, 'towing')).items;
    const otherBefore = (await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items;
    await setLiftingItemActive(client, inventory[0].id, false);
    const id = await startLiftingInspection(client, demoVessel.id, 'lifting', '2026-01-05', '2027-01-05');
    const current = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items;
    expect(current.find((item) => !item.active)?.commissioned_on).toBe(inventory[0].commissioned_on);
    expect(current.filter((item) => item.active).every((item) => item.commissioned_on === '2026-01-05')).toBe(true);
    expect(await fetchInspectionEntries(client, id)).toHaveLength(2);
    expect((await fetchLiftingRegister(client, demoVessel.id, 'towing')).items).toEqual(towingBefore);
    expect((await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items).toEqual(otherBefore);
    await startLiftingInspection(client, demoVessel.id, 'towing', '2026-02-05', '2027-02-05');
    expect((await fetchLiftingRegister(client, demoVessel.id, 'towing')).items).toEqual(towingBefore);
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items).toEqual(current);
  });

  it.each(['marin', 'capitaine'] as const)('denies creation without the existing %s authorization and preserves the inventory', async (role) => {
    const client = createLiftingPreviewClient({ roles: [role] });
    const before = await fetchLiftingRegister(client, demoVessel.id, 'lifting');
    await expect(startLiftingInspection(client, demoVessel.id, 'lifting', '2026-02-15', '2027-02-15')).rejects.toMatchObject({ message: 'Accès refusé.' });
    expect(await fetchLiftingRegister(client, demoVessel.id, 'lifting')).toEqual(before);
  });

  it('rejects invalid issue/expiry dates before changing the inventory', async () => {
    const client = createLiftingPreviewClient();
    const before = await fetchLiftingRegister(client, demoVessel.id, 'lifting');
    await expect(startLiftingInspection(client, demoVessel.id, 'lifting', '2026-02-15', '2026-02-15')).rejects.toMatchObject({ message: 'Dates du contrôle invalides.' });
    expect(await fetchLiftingRegister(client, demoVessel.id, 'lifting')).toEqual(before);
  });

  it('shows the chosen issue date on the selected vessel’s inventory immediately after creation', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.click(screen.getByRole('button', { name: 'Nouveau contrôle annuel' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/La date d’émission sera appliquée/)).toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Navire / site à contrôler'), String(secondDemoVessel.id));
    await user.clear(dialog.getByLabelText('Date d’émission'));
    await user.type(dialog.getByLabelText('Date d’émission'), '2026-03-15');
    await user.click(dialog.getByRole('button', { name: 'Démarrer le contrôle' }));
    await screen.findByRole('heading', { name: /Contrôle annuel 2026/ });
    await user.click(screen.getByRole('button', { name: 'Rapports' }));
    await user.click(await screen.findByRole('button', { name: 'Inventaire' }));
    expect(await screen.findByText('Visite annuelle · Mise en service : 15/03/2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier 1' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Date de mise en service')).toHaveValue('2026-03-15');
  });
});
