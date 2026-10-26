import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLE_KEYS } from '../permissions/roles';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel, secondDemoVessel } from './liftingPreview';
import { fetchInspectionEntries, fetchLiftingRegister, saveLiftingItem, setLiftingItemActive, startLiftingInspection, transferLiftingItem } from './liftingQueries';
import { addLiftingCertificate, downloadLiftingCertificate, fetchLiftingCertificates } from './liftingCertificateQueries';
import type { LiftingItem, LiftingKind } from './liftingModel';

const kinds = ['lifting', 'towing'] as const;
const transferable = async (client: ReturnType<typeof createLiftingPreviewClient>, kind: LiftingKind) =>
  (await fetchLiftingRegister(client, demoVessel.id, kind)).items.find((item) => item.reference === (kind === 'lifting' ? '2' : '1'))!;
const transferCalls = (rpc: { mock: { calls: readonly unknown[][] } }) => rpc.mock.calls.filter(([name]) => name === 'transfer_lifting_item');
const renderInventory = (client: ReturnType<typeof createLiftingPreviewClient>, kind: LiftingKind, roles: typeof ROLE_KEYS[number][] = ['admin']) =>
  render(<MemoryRouter><LiftingPage client={client} roles={roles} section={kind} /></MemoryRouter>);
async function openTransfer(item: LiftingItem) {
  fireEvent.click(await screen.findByRole('button', { name: `Transférer ${item.reference}` }));
  return within(screen.getByRole('dialog', { name: `Transférer le matériel ${item.reference}` }));
}
const certificate = () => new File(['%PDF-1.7 isolated transfer fixture'], 'Certificat du matériel.pdf', { type: 'application/pdf' });
afterEach(() => { vi.useRealTimers(); });

describe('equipment transfers in isolated preview and client UI fixtures', () => {
  it.each(kinds)('moves %s equipment to the selected vessel without recreating identity, certificates or previous inspection entries', async (kind) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00.000Z'));
    const client = createLiftingPreviewClient();
    const inspectionId = await startLiftingInspection(client, demoVessel.id, kind, '2026-10-01', '2027-10-01');
    const original = await transferable(client, kind);
    const sourceBefore = await fetchLiftingRegister(client, demoVessel.id, kind);
    const previousEntries = await fetchInspectionEntries(client, inspectionId);
    await addLiftingCertificate(client, original, certificate());
    const files = await fetchLiftingCertificates(client, original.id);
    const rpc = vi.spyOn(client, 'rpc');
    renderInventory(client, kind);
    const dialog = await openTransfer(original);
    expect(dialog.queryByRole('button', { name: demoVessel.name })).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    expect(dialog.getByRole('button', { name: secondDemoVessel.name })).toHaveAttribute('aria-pressed', 'true');
    vi.setSystemTime(new Date('2026-10-26T10:00:01.000Z'));
    fireEvent.click(dialog.getByRole('button', { name: 'Transférer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('heading', { name: original.description })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: demoVessel.name })).toHaveAttribute('aria-pressed', 'true');
    expect(transferCalls(rpc)).toEqual([['transfer_lifting_item', {
      p_id: original.id, p_source_vessel_id: demoVessel.id, p_target_vessel_id: secondDemoVessel.id, p_updated_at: original.updated_at,
    }]]);
    const sourceAfter = await fetchLiftingRegister(client, demoVessel.id, kind);
    expect(sourceAfter.items).toEqual(sourceBefore.items.filter((item) => item.id !== original.id));
    expect(sourceAfter.inspections).toEqual(sourceBefore.inspections);
    const destination = await fetchLiftingRegister(client, secondDemoVessel.id, kind);
    expect(destination.items.find((item) => item.id === original.id)).toEqual({ ...original, vessel_id: secondDemoVessel.id, assignment_version: (original.assignment_version ?? 1) + 1, updated_at: expect.any(String) });
    expect(destination.items.find((item) => item.id === original.id)?.updated_at).not.toBe(original.updated_at);
    expect(await fetchInspectionEntries(client, inspectionId)).toEqual(previousEntries);
    expect(await fetchLiftingCertificates(client, original.id)).toEqual(files);
    expect(files[0].storage_path).toMatch(new RegExp(`^1/${demoVessel.id}/${original.id}/1/`));
    expect((await downloadLiftingCertificate(client, files[0])).size).toBe(certificate().size);
    fireEvent.click(screen.getByRole('button', { name: secondDemoVessel.name }));
    const heading = await screen.findByRole('heading', { name: original.description });
    const card = within(heading.closest('article')!);
    fireEvent.click(card.getByText('Certificat', { exact: true }));
    expect(await card.findByRole('button', { name: 'Télécharger Certificat du matériel.pdf' })).toBeEnabled();
    expect((await fetchLiftingRegister(client, demoVessel.id, kind)).items).toEqual(sourceAfter.items);
  });

  it.each(kinds)('cancels a selected %s destination without calling the transfer RPC or changing either inventory', async (kind) => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, kind);
    const before = await Promise.all([fetchLiftingRegister(client, demoVessel.id, kind), fetchLiftingRegister(client, secondDemoVessel.id, kind)]);
    const rpc = vi.spyOn(client, 'rpc');
    renderInventory(client, kind);
    const dialog = await openTransfer(original);
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    fireEvent.click(dialog.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: original.description })).toBeVisible();
    expect(transferCalls(rpc)).toHaveLength(0);
    expect(await Promise.all([fetchLiftingRegister(client, demoVessel.id, kind), fetchLiftingRegister(client, secondDemoVessel.id, kind)])).toEqual(before);
  });

  it.each(kinds)('keeps %s equipment and the selected destination when the server refuses its transfer', async (kind) => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, kind);
    const sourceBefore = await fetchLiftingRegister(client, demoVessel.id, kind);
    const destinationBefore = await fetchLiftingRegister(client, secondDemoVessel.id, kind);
    const originalRpc = client.rpc.bind(client);
    vi.spyOn(client, 'rpc').mockImplementation((name, args) => name === 'transfer_lifting_item'
      ? Promise.resolve({ data: null, error: { message: 'Transfert refusé par le serveur.' } }) as unknown as ReturnType<typeof client.rpc>
      : originalRpc(name, args));
    renderInventory(client, kind);
    const dialog = await openTransfer(original);
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    fireEvent.click(dialog.getByRole('button', { name: 'Transférer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Transfert refusé par le serveur.');
    expect(dialog.getByRole('button', { name: secondDemoVessel.name })).toHaveAttribute('aria-pressed', 'true');
    expect(dialog.getByRole('button', { name: 'Transférer' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: original.description })).toBeVisible();
    expect(await fetchLiftingRegister(client, demoVessel.id, kind)).toEqual(sourceBefore);
    expect(await fetchLiftingRegister(client, secondDemoVessel.id, kind)).toEqual(destinationBefore);
  });

  it('rejects a destination reference collision atomically without renumbering or replacing equipment', async () => {
    const client = createLiftingPreviewClient();
    const original = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    const before = await Promise.all([fetchLiftingRegister(client, demoVessel.id, 'lifting'), fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')]);
    renderInventory(client, 'lifting');
    const dialog = await openTransfer(original);
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    fireEvent.click(dialog.getByRole('button', { name: 'Transférer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(/référence.*déjà/i);
    expect(await Promise.all([fetchLiftingRegister(client, demoVessel.id, 'lifting'), fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')])).toEqual(before);
  });

  it('submits only one transfer when confirmation is activated twice before the first response', async () => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, 'lifting');
    const originalRpc = client.rpc.bind(client);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const rpc = vi.spyOn(client, 'rpc').mockImplementation((name, args) => name === 'transfer_lifting_item'
      ? pending.then(() => originalRpc(name, args)) as unknown as ReturnType<typeof client.rpc>
      : originalRpc(name, args));
    renderInventory(client, 'lifting');
    const dialog = await openTransfer(original);
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    const confirm = dialog.getByRole('button', { name: 'Transférer' });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(transferCalls(rpc)).toHaveLength(1);
    expect(confirm).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items.filter((item) => item.id === original.id)).toHaveLength(1);
  });

  it('refuses a stale source confirmation after another device has already moved the equipment', async () => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, 'lifting');
    renderInventory(client, 'lifting');
    const dialog = await openTransfer(original);
    fireEvent.click(dialog.getByRole('button', { name: secondDemoVessel.name }));
    await transferLiftingItem(client, original, secondDemoVessel.id);
    fireEvent.click(dialog.getByRole('button', { name: 'Transférer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(/modifié ou transféré/);
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items.some((item) => item.id === original.id)).toBe(false);
    expect((await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items.filter((item) => item.id === original.id)).toHaveLength(1);
  });

  it.each(kinds)('rejects a stale %s timestamp without losing newer equipment edits', async (kind) => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, kind);
    await saveLiftingItem(client, demoVessel.id, kind, { ...original, notes: 'Modification conservée depuis un autre poste.' }, original.id);
    const updated = await transferable(client, kind);
    expect(updated.updated_at).not.toBe(original.updated_at);
    await expect(transferLiftingItem(client, original, secondDemoVessel.id)).rejects.toMatchObject({ message: expect.stringContaining('modifié ou transféré') });
    expect(await transferable(client, kind)).toEqual(updated);
  });

  it('keeps previous inspection snapshots and service dates unchanged through a vessel round trip', async () => {
    const client = createLiftingPreviewClient();
    const inspectionId = await startLiftingInspection(client, demoVessel.id, 'lifting', '2026-10-01', '2027-10-01');
    const original = await transferable(client, 'lifting');
    const entries = await fetchInspectionEntries(client, inspectionId);
    await transferLiftingItem(client, original, secondDemoVessel.id);
    const outbound = (await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items.find((item) => item.id === original.id)!;
    await transferLiftingItem(client, outbound, demoVessel.id);
    expect(await transferable(client, 'lifting')).toEqual({ ...original, assignment_version: 3, updated_at: expect.any(String) });
    expect(await fetchInspectionEntries(client, inspectionId)).toEqual(entries);
    expect(entries.find((entry) => entry.item_id === original.id)?.item_snapshot.assignment_version).toBe(1);
    await expect(transferLiftingItem(client, original, secondDemoVessel.id)).rejects.toMatchObject({ message: expect.stringContaining('modifié ou transféré') });
  });

  // These are client-side affordance fixtures, not evidence of production RLS;
  // the SQL transfer tests exercise the corresponding authenticated accounts.
  it.each(ROLE_KEYS.flatMap((role) => kinds.map((kind) => ({ role, kind }))))('shows $kind transfer commands only for office UI profile $role', async ({ role, kind }) => {
    const client = createLiftingPreviewClient({ roles: [role] });
    const original = await transferable(client, kind);
    renderInventory(client, kind, [role]);
    await screen.findByRole('heading', { name: original.description });
    const commands = screen.queryAllByRole('button', { name: /^Transférer \d+$/ });
    if (role === 'capitaine' || role === 'marin') {
      expect(commands).toHaveLength(0);
      await expect(transferLiftingItem(client, original, secondDemoVessel.id)).rejects.toMatchObject({ message: 'Accès refusé.' });
    } else expect(commands).toHaveLength((await fetchLiftingRegister(client, demoVessel.id, kind)).items.filter((item) => item.active).length);
    expect(await transferable(client, kind)).toEqual(original);
  });

  it('does not offer a transfer for inactive equipment and refuses a forged preview request', async () => {
    const client = createLiftingPreviewClient();
    const original = await transferable(client, 'lifting');
    await setLiftingItemActive(client, original.id, false);
    renderInventory(client, 'lifting');
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await userEvent.click(screen.getByRole('checkbox', { name: /supprimés/ }));
    await screen.findByRole('heading', { name: original.description });
    expect(screen.queryByRole('button', { name: `Transférer ${original.reference}` })).not.toBeInTheDocument();
    await expect(transferLiftingItem(client, original, secondDemoVessel.id)).rejects.toMatchObject({ message: 'Accès refusé.' });
  });
});
