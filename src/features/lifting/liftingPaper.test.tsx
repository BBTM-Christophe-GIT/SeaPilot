import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoVessel, secondDemoVessel } from './liftingPreview';
import { fetchInspectionEntries, fetchLiftingPaperInventory, fetchLiftingRegister, saveLiftingItem, setLiftingItemActive, startLiftingInspection } from './liftingQueries';
import { buildLiftingPaperPdf } from './liftingPaperPdf';
import { saveLiftingBlob } from './liftingPdf';

vi.mock('./liftingPaperPdf', () => ({ buildLiftingPaperPdf: vi.fn() }));
vi.mock('./liftingPdf', async (importOriginal) => ({ ...await importOriginal<typeof import('./liftingPdf')>(), saveLiftingBlob: vi.fn() }));

describe('paper inspection preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildLiftingPaperPdf).mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'Fiche papier.pdf', itemCount: 3 });
  });
  it('downloads fresh active inventory despite a stale screen, an accessory filter and an existing inspection', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    const inspection = await startLiftingInspection(client, demoVessel.id, 'lifting', '2026-09-09', '2027-09-09');
    const original = await fetchInspectionEntries(client, inspection);
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.selectOptions(screen.getByLabelText('Type d’accessoire — inventaire'), 'Crocs');
    const item = original[1].item_snapshot;
    await saveLiftingItem(client, demoVessel.id, 'lifting', { ...item, description: 'MANILLE ACTUELLE', serial_number: 'SERIE-ACTUELLE' }, item.id);
    await setLiftingItemActive(client, original[0].item_id, false);
    await saveLiftingItem(client, demoVessel.id, 'lifting', { ...item, description: 'NOUVEAU MATERIEL' });
    const from = vi.spyOn(client, 'from'); const rpc = vi.spyOn(client, 'rpc');
    await user.click(screen.getByRole('button', { name: 'Fiche de contrôle papier' }));
    await user.click(screen.getByRole('button', { name: 'Télécharger la fiche PDF' }));
    await waitFor(() => expect(buildLiftingPaperPdf).toHaveBeenCalledOnce());
    const printed = vi.mocked(buildLiftingPaperPdf).mock.calls[0][2];
    expect(printed).toHaveLength(3);
    expect(printed.map((row) => row.description)).toEqual(expect.arrayContaining(['MANILLE ACTUELLE', 'NOUVEAU MATERIEL', 'CROCHET À LINGUET — 2 T']));
    expect(printed.find((row) => row.id === item.id)?.serial_number).toBe('SERIE-ACTUELLE');
    expect(printed.some((row) => row.id === original[0].item_id)).toBe(false);
    expect(from.mock.calls.map(([table]) => table)).toEqual(['lifting_inventory']);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lifting_available_vessels']);
    expect(saveLiftingBlob).toHaveBeenCalledOnce();
    expect(await fetchInspectionEntries(client, inspection)).toEqual(original);
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).inspections).toHaveLength(1);
  });
  it('selects another vessel and register, handles an empty inventory and allows omitting the notice', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    await user.click(screen.getByRole('button', { name: 'Fiche de contrôle papier' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Navire / site de la fiche'), String(secondDemoVessel.id));
    await user.selectOptions(dialog.getByLabelText('Registre à imprimer'), 'towing');
    await user.click(dialog.getByRole('button', { name: 'Télécharger la fiche PDF' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('Aucun matériel actif');
    expect(buildLiftingPaperPdf).not.toHaveBeenCalled();
    await user.selectOptions(dialog.getByLabelText('Registre à imprimer'), 'lifting');
    await user.click(dialog.getByRole('checkbox', { name: /Joindre la notice/ }));
    await user.click(dialog.getByRole('button', { name: 'Télécharger la fiche PDF' }));
    await waitFor(() => expect(buildLiftingPaperPdf).toHaveBeenCalledWith(secondDemoVessel, 'lifting', [expect.objectContaining({ description: 'MANILLE DU SECOND NAVIRE' })], { includeNotice: false }));
  });
  it('rejects an inaccessible vessel instead of falling back to another inventory', async () => {
    await expect(fetchLiftingPaperInventory(createLiftingPreviewClient(), 999999, 'lifting')).rejects.toThrow('n’est plus accessible');
  });
  it.each(['marin', 'capitaine'] as const)('exposes the read-only download to the %s profile fixture', async (role) => {
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient()} roles={[role]} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    expect(screen.getByRole('button', { name: 'Fiche de contrôle papier' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Ajouter un matériel' })).not.toBeInTheDocument();
  });
});
