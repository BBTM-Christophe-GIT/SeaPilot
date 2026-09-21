import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseVehiclesDialog } from './ExpenseVehiclesDialog';

const queries = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), remove: vi.fn(), default: vi.fn() }));
vi.mock('./expenseVehicleQueries', () => ({ fetchPersonalVehicles: queries.fetch, savePersonalVehicle: queries.save, deletePersonalVehicle: queries.remove, setDefaultPersonalVehicle: queries.default }));
const vehicles = [{ id: 'car-1', vehicle: 'Peugeot 308', fiscalPower: '6 CV', fuel: 'diesel', isDefault: true }, { id: 'car-2', vehicle: 'Clio', fiscalPower: '5 CV', fuel: 'essence', isDefault: false }];
const previewVehicles: never[] = [];
function show() { render(<ExpenseVehiclesDialog client={{} as never} previewMode={false} previewVehicles={previewVehicles} onPreviewChange={vi.fn()} onClose={vi.fn()} />); }
beforeEach(() => { vi.resetAllMocks(); queries.fetch.mockResolvedValue(vehicles); queries.default.mockResolvedValue(undefined); queries.remove.mockResolvedValue(undefined); });
describe('vehicle book menu dialog', () => {
  it('selects and clears a default after successful persistence', async () => {
    show(); await screen.findByText('Peugeot 308');
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser Clio par défaut' }));
    await screen.findByText('Ce véhicule sera proposé pour vos prochaines notes kilométriques.');
    expect(queries.default).toHaveBeenCalledWith(expect.anything(), 'car-2');
    expect(within(screen.getByText('Clio').closest('article')!).getByText('Véhicule par défaut')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ne pas présélectionner de véhicule' }));
    await screen.findByText('Aucun véhicule ne sera présélectionné.');
    expect(screen.queryByText('Véhicule par défaut')).not.toBeInTheDocument();
    expect(queries.default).toHaveBeenLastCalledWith(expect.anything(), null);
  });
  it('keeps the original default when the server rejects a change', async () => {
    queries.default.mockRejectedValue(new Error('Denied')); show(); await screen.findByText('Clio');
    fireEvent.click(screen.getByRole('button', { name: 'Utiliser Clio par défaut' }));
    await screen.findByRole('alert');
    expect(within(screen.getByText('Peugeot 308').closest('article')!).getByText('Véhicule par défaut')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Utiliser Clio par défaut' })).toBeEnabled();
  });
  it('creates, edits and confirms removal without changing the default implicitly', async () => {
    queries.save.mockImplementation(async (_client, draft, id) => ({ ...draft, id: id || 'new-car', isDefault: false }));
    show(); await screen.findByText('Clio');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un véhicule' }));
    fireEvent.change(screen.getByLabelText('Marque / modèle du véhicule'), { target: { value: 'Golf' } });
    fireEvent.change(screen.getByLabelText('Puissance fiscale'), { target: { value: '6 CV' } });
    fireEvent.submit(screen.getByRole('dialog'));
    await screen.findByText('Golf');
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Golf' }));
    fireEvent.change(screen.getByLabelText('Puissance fiscale'), { target: { value: '7 CV' } });
    fireEvent.submit(screen.getByRole('dialog'));
    await screen.findByText('7 CV · Diesel');
    expect(queries.save).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ fiscalPower: '7 CV' }), 'new-car');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Golf' }));
    expect(queries.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
    await waitFor(() => expect(screen.queryByText('Golf')).not.toBeInTheDocument());
    expect(queries.default).not.toHaveBeenCalled();
  });
});
