import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseNoteForm } from './ExpenseNoteForm';
import { PAYMENT_METHODS } from './expenseNoteModel';

const vehicles = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('./expenseVehicleQueries', () => ({ PREVIEW_VEHICLES: [], fetchPersonalVehicles: vehicles.fetch, savePersonalVehicle: vehicles.save, deletePersonalVehicle: vehicles.remove }));
const diesel = { id: 'diesel-1', vehicle: 'Peugeot 308', fiscalPower: '6 CV', fuel: 'diesel', isDefault: false };
const electric = { id: 'electric-1', vehicle: 'Renault Mégane', fiscalPower: '4 CV', fuel: 'electric', isDefault: false };
const submit = vi.fn();
function show() {
  return render(<ExpenseNoteForm client={{} as never} previewMode={false} identity={{ id: 'owner', name: 'Camille Martin' }} vessels={[{ id: 1, name: 'GOURY' }]} people={[{ id: 1, name: 'Camille Martin', is_current: true }]} functionLabel="Matelot" settings={{ company_id: 1, payment_methods: PAYMENT_METHODS, default_payment_method: 'CB-Perso' }} defaultVesselId={1} onClose={vi.fn()} onSubmit={submit} />);
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function mileage() {
  fireEvent.click(screen.getByRole('button', { name: 'Indemnités kilométriques' }));
  await screen.findByRole('option', { name: 'Peugeot 308 · 6 CV · Diesel' });
  change('Mes véhicules', 'diesel-1');
  change('Objet', 'Embarquement'); change('Date ou période', 'Septembre 2026');
  change('Trajet 1', 'Cherbourg → Caen'); change('Motif 1', 'Réunion'); change('Kilomètres 1', '120');
}
beforeEach(() => {
  vi.resetAllMocks();
  vehicles.fetch.mockResolvedValue([diesel, electric]); vehicles.remove.mockResolvedValue(undefined);
  vehicles.save.mockImplementation(async (_client, draft, id) => ({ ...draft, id: id || 'new-vehicle' }));
  submit.mockResolvedValue(undefined);
});
describe('compact expense and mileage form', () => {
  it('preserves description and receipts when collapsing and changing note type', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Compléments' }));
    change('Description', 'Pièce complémentaire');
    const file = new File(['receipt'], 'ticket.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Justificatifs', { selector: 'input' }), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Compléments' }));
    expect(screen.getByLabelText('Description')).not.toBeVisible();
    await mileage();
    fireEvent.click(screen.getByRole('button', { name: 'Dépense' }));
    change('Montant TTC (€)', '25');
    fireEvent.submit(screen.getByRole('dialog'));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ amount: 25, description: 'Pièce complémentaire', receipt_count: 1, mileage: null }), [file]));
  });
  it('prefills a saved vehicle and totals multiple capped trips plus tolls', async () => {
    show(); await mileage();
    expect(screen.getByLabelText('Total de la note')).toHaveTextContent('72,72');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un déplacement' }));
    change('Trajet 2', 'Retour'); change('Motif 2', 'Retour'); change('Kilomètres 2', '200');
    change('Montant total des péages (€)', '12.3');
    expect(screen.getByLabelText('Total de la note')).toHaveTextContent('185,02');
    fireEvent.submit(screen.getByRole('dialog'));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mileage', amount: 185.02, mileage: expect.objectContaining({ vehicle: 'Peugeot 308', fiscalPower: '6 CV', fuel: 'diesel' }) }), []));
  });
  it('switches fuel rules for saved vehicles and removes a trip without stale totals', async () => {
    show(); await mileage();
    change('Mes véhicules', 'electric-1');
    change('Montant du déplacement 1', '45.5');
    expect(screen.getByLabelText('Total de la note')).toHaveTextContent('45,50');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un déplacement' }));
    change('Kilomètres 2', '30'); change('Montant du déplacement 2', '20');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le déplacement 1' }));
    expect(screen.getByLabelText('Kilomètres 1')).toHaveValue(30);
    expect(screen.getByLabelText('Total de la note')).toHaveTextContent('20,00');
    change('Mes véhicules', 'diesel-1');
    expect(screen.getByLabelText('Total de la note')).toHaveTextContent('18,18');
    change('Mes véhicules', 'electric-1');
    expect(screen.getByLabelText('Montant du déplacement 1')).toHaveValue(null);
  });
  it('creates several reusable vehicles, updates one and preserves the note when removing it', async () => {
    show(); await mileage();
    change('Mes véhicules', '');
    change('Marque / modèle du véhicule', 'Clio'); change('Puissance fiscale', '5 CV');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ce véhicule' }));
    await screen.findByText('Véhicule enregistré dans votre carnet.');
    expect(vehicles.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ vehicle: 'Clio', fiscalPower: '5 CV', fuel: 'diesel' }), undefined);
    expect(screen.getByRole('option', { name: 'Peugeot 308 · 6 CV · Diesel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le véhicule enregistré' }));
    change('Puissance fiscale', '6 CV');
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour le véhicule' }));
    await waitFor(() => expect(vehicles.save).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ fiscalPower: '6 CV' }), 'new-vehicle'));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le véhicule du carnet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
    await screen.findByText('Véhicule retiré du carnet. Les informations de cette note sont conservées.');
    expect(screen.getByLabelText('Marque / modèle du véhicule')).toHaveValue('Clio');
    expect(screen.getByLabelText('Puissance fiscale')).toHaveValue('6 CV');
    expect(vehicles.remove).toHaveBeenCalledWith(expect.anything(), 'new-vehicle');
  });
  it('keeps manual entry available after vehicle loading or saving fails', async () => {
    vehicles.fetch.mockRejectedValue(new Error('offline')); vehicles.save.mockRejectedValue(new Error('offline'));
    show(); fireEvent.click(screen.getByRole('button', { name: 'Indemnités kilométriques' }));
    await screen.findByText('Impossible de charger vos véhicules. La saisie manuelle reste disponible.');
    change('Marque / modèle du véhicule', 'Clio'); change('Puissance fiscale', '5 CV');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer ce véhicule' }));
    await screen.findByText('Enregistrement du véhicule impossible. Votre saisie est conservée, vous pouvez réessayer.');
    expect(screen.getByLabelText('Marque / modèle du véhicule')).toHaveValue('Clio');
  });
  it('locks submitted data and retries using the same note ID after a network error', async () => {
    submit.mockRejectedValueOnce(new Error('Réseau indisponible'));
    show(); change('Objet', 'Fournitures'); change('Montant TTC (€)', '25');
    fireEvent.submit(screen.getByRole('dialog'));
    await screen.findByText('Réseau indisponible');
    expect(screen.getByLabelText('Objet')).toBeDisabled();
    fireEvent.submit(screen.getByRole('dialog'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[0][0].id).toBe(submit.mock.calls[1][0].id);
  });
  it('prefills the profile default on a fresh note and keeps the chosen vehicle across note types', async () => {
    vehicles.fetch.mockResolvedValue([diesel, { ...electric, isDefault: true }]);
    show(); fireEvent.click(screen.getByRole('button', { name: 'Indemnités kilométriques' }));
    await waitFor(() => expect(screen.getByLabelText('Mes véhicules')).toHaveValue('electric-1'));
    expect(screen.getByRole('button', { name: 'Mon véhicule' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Mon véhicule' }));
    change('Mes véhicules', 'diesel-1');
    fireEvent.click(screen.getByRole('button', { name: 'Dépense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Indemnités kilométriques' }));
    await waitFor(() => expect(screen.getByLabelText('Mes véhicules')).toHaveValue('diesel-1'));
  });
  it('never replaces a vehicle being typed when a delayed default arrives', async () => {
    let resolve!: (value: unknown) => void;
    vehicles.fetch.mockReturnValue(new Promise((done) => { resolve = done; }));
    show(); fireEvent.click(screen.getByRole('button', { name: 'Indemnités kilométriques' }));
    change('Marque / modèle du véhicule', 'Mon véhicule ponctuel');
    resolve([{ ...diesel, isDefault: true }]);
    await screen.findByRole('option', { name: 'Peugeot 308 · 6 CV · Diesel' });
    expect(screen.getByLabelText('Marque / modèle du véhicule')).toHaveValue('Mon véhicule ponctuel');
    expect(screen.getByLabelText('Mes véhicules')).toHaveValue('');
  });
  it('reveals a collapsed required field on invalid submission', async () => {
    show(); fireEvent.click(screen.getByRole('button', { name: 'Informations' }));
    expect(screen.getByLabelText('Objet')).not.toBeVisible();
    fireEvent.invalid(screen.getByLabelText('Objet'));
    expect(screen.getByLabelText('Objet')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('Objet')).toHaveFocus());
    expect(submit).not.toHaveBeenCalled();
  });
});
