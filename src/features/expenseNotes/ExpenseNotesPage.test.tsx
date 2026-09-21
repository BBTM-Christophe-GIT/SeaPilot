import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseNotesPage } from './ExpenseNotesPage';
import { EXPENSE_NOTE_PREVIEW } from './expenseNotePreview';
import { PAYMENT_METHODS } from './expenseNoteModel';
import type { RoleKey } from '../permissions/roles';

const queries = vi.hoisted(() => ({ notes: vi.fn(), identity: vi.fn(), vessels: vi.fn(), people: vi.fn(), settings: vi.fn(), save: vi.fn(), submit: vi.fn(), send: vi.fn(), download: vi.fn(), assignment: vi.fn() }));
vi.mock('./expenseNoteQueries', () => ({ fetchExpenseNotes: queries.notes, fetchExpenseIdentity: queries.identity, fetchExpenseVessels: queries.vessels, fetchExpensePeople: queries.people, fetchExpenseSettings: queries.settings, saveExpenseSettings: queries.save, submitExpenseNote: queries.submit, transmitExpenseNote: queries.send, downloadExpenseNote: queries.download }));
vi.mock('../purchaseRequests/purchaseRequestQueries', () => ({ fetchCurrentAssignedVessel: queries.assignment }));

function show(role: RoleKey) {
  render(<MemoryRouter><Routes><Route element={<Outlet context={{ client: {}, roles: [role], previewMode: false, currentPerson: { id: 1, functionLabel: 'Matelot' } }} />}><Route index element={<ExpenseNotesPage />} /></Route></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.resetAllMocks();
  queries.assignment.mockResolvedValue({ id: 2, name: 'SUROIT' });
  queries.notes.mockResolvedValue(EXPENSE_NOTE_PREVIEW);
  queries.identity.mockResolvedValue({ id: 'demo-1', name: 'Camille Martin' });
  queries.vessels.mockResolvedValue([{ id: 1, name: 'GOURY' }, { id: 2, name: 'SUROIT' }]);
  queries.people.mockResolvedValue([{ id: 1, name: 'Camille Martin', is_current: true }, { id: 2, name: 'Alex Bernard', is_current: false }]);
  queries.settings.mockResolvedValue({ company_id: 1, payment_methods: PAYMENT_METHODS, default_payment_method: 'CB-SUROIT' });
  queries.save.mockResolvedValue(undefined);
});
describe('NDF profile fixtures', () => {
  it.each(['marin', 'capitaine', 'armement'] as const)('%s shows only notes created from their account', async (role) => {
    show(role);
    expect(await screen.findByText('Fournitures pour la passerelle')).toBeInTheDocument();
    expect(screen.queryByText('Petit matériel de pont')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Émetteur')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paramétrage' })).not.toBeInTheDocument();
  });
  it.each(['admin', 'direction'] as const)('%s combines vessel and issuer filters and resets them', async (role) => {
    show(role); await screen.findByText('Petit matériel de pont');
    fireEvent.change(screen.getByLabelText('Navire'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Émetteur'), { target: { value: 'person:2' } });
    expect(screen.getByText('Petit matériel de pont')).toBeInTheDocument();
    expect(screen.queryByText('Fournitures pour la passerelle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(screen.getByText('Fournitures de bureau — armement')).toBeInTheDocument();
    expect(!!screen.queryByRole('button', { name: 'Paramétrage' })).toBe(role === 'admin');
  });
  it('prefills editable issuer, assigned vessel and administrator-selected card', async () => {
    show('marin'); await screen.findByText('Fournitures pour la passerelle');
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle note' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Émetteur')).toHaveValue('1');
    expect(dialog.getByLabelText('Navire')).toHaveValue('2');
    expect(dialog.getByLabelText('Mode de paiement')).toHaveValue('CB-SUROIT');
    fireEvent.change(dialog.getByLabelText('Émetteur'), { target: { value: '2' } });
    fireEvent.change(dialog.getByLabelText('Navire'), { target: { value: '1' } });
    expect(dialog.getByLabelText('Émetteur')).toHaveValue('2');
    expect(dialog.getByLabelText('Navire')).toHaveValue('1');
  });
  it('lets the administrator change a dropdown default', async () => {
    show('admin'); await screen.findByText('Petit matériel de pont');
    fireEvent.click(screen.getByRole('button', { name: 'Paramétrage' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Par défaut : CB-GOURY' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
    await screen.findByText('Paramètres enregistrés.');
    expect(queries.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ default_payment_method: 'CB-GOURY' }));
  });
  it.each(['admin', 'direction'] as const)('%s only lists employed issuers while retaining historical notes', async (role) => {
    show(role); await screen.findByText('Fournitures de bureau — armement');
    const filter = within(screen.getByLabelText('Émetteur'));
    expect(filter.getByRole('option', { name: 'Camille Martin' })).toBeInTheDocument();
    expect(filter.getByRole('option', { name: 'Alex Bernard' })).toBeInTheDocument();
    expect(filter.queryByRole('option', { name: 'Louise Robert' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Objet, navire, émetteur…'), { target: { value: 'Louise Robert' } });
    expect(screen.getByText('Fournitures de bureau — armement')).toBeInTheDocument();
    expect(screen.queryByText('Petit matériel de pont')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle note' }));
    const issuer = within(within(screen.getByRole('dialog')).getByLabelText('Émetteur'));
    expect(issuer.getByRole('option', { name: 'Alex Bernard' })).toBeInTheDocument();
    expect(issuer.queryByRole('option', { name: 'Louise Robert' })).not.toBeInTheDocument();
  });
  it('clears a stale issuer filter when the person leaves the current directory', async () => {
    show('admin'); await screen.findByText('Petit matériel de pont');
    fireEvent.change(screen.getByLabelText('Émetteur'), { target: { value: 'person:2' } });
    queries.people.mockResolvedValue([{ id: 1, name: 'Camille Martin', is_current: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await screen.findByText('Fournitures pour la passerelle');
    expect(screen.getByLabelText('Émetteur')).toHaveValue('all');
    expect(within(screen.getByLabelText('Émetteur')).queryByRole('option', { name: 'Alex Bernard' })).not.toBeInTheDocument();
  });
  it('keeps a successfully issued note visible when email delivery fails', async () => {
    queries.submit.mockResolvedValue({ ...EXPENSE_NOTE_PREVIEW[0], id: 'created', title: 'Nouvelle dépense', delivery_status: 'pending' });
    queries.send.mockRejectedValue(new Error('Transmission à reprendre'));
    queries.notes.mockResolvedValueOnce(EXPENSE_NOTE_PREVIEW).mockRejectedValue(new Error('offline'));
    show('marin'); await screen.findByText('Fournitures pour la passerelle');
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle note' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Objet'), { target: { value: 'Nouvelle dépense' } });
    fireEvent.change(within(dialog).getByLabelText('Montant TTC (€)'), { target: { value: '25' } });
    fireEvent.submit(dialog);
    expect(await screen.findByText('Transmission à reprendre', { selector: '[role="alert"]' })).toBeInTheDocument();
    expect(screen.getByText('Nouvelle dépense')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(queries.submit).toHaveBeenCalledTimes(1);
  });
});
