import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingRawLines } from './ProjectBillingRawLines';
import type { BillingRawLineDraft, ProjectBillingRawLine, ProjectServiceCatalogEntry } from './projectBilling';

const catalog: ProjectServiceCatalogEntry[] = [{
  id: 7, companyId: 1, category: 'Spread Antipollution', unitAmountHt: 92.58,
  descriptionHtml: '', active: true, createdAt: '', updatedAt: '',
}];
const savedLine: ProjectBillingRawLine = {
  id: 10, billingPeriodId: 2, serviceCatalogId: null, serviceDate: '2026-10-05',
  designation: 'Assistance', unitAmountHt: 100, quantity: 2, includeInPdf: true,
};
const onSave = vi.fn<(draft: BillingRawLineDraft, id?: number) => Promise<ProjectBillingRawLine>>();
const onDelete = vi.fn<(id: number) => Promise<void>>();
const onCatalogOpen = vi.fn();
const onDirtyChange = vi.fn();

function props(lines: ProjectBillingRawLine[] = []) {
  return { lines, catalog, isManager: true, initialDate: '2026-10-01', onSave, onDelete, onCatalogOpen, onDirtyChange };
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockImplementation(async (draft, id) => ({ ...draft, id: id ?? 20, billingPeriodId: 2 }));
  onDelete.mockResolvedValue(undefined);
});

describe('raw project billing lines', () => {
  it('adds several independent rows with the requested columns and opens the catalogue', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    expect(screen.getByText('Aucune ligne de saisie brute pour cette période.')).toBeVisible();
    for (const column of ['Date', 'Désignation', 'Prix unitaire HT', 'Quantité', 'Prix Total HT']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeVisible();
    }
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getAllByLabelText(/^Date, ligne/)).toHaveLength(4);
    expect(screen.getByLabelText('Date, ligne 4')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Quantité, ligne 4')).toHaveValue(1);
    expect(screen.getByLabelText('Prestation du catalogue, ligne 4')).toHaveValue('');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Catalogue de prestations' }));
    expect(onCatalogOpen).toHaveBeenCalledOnce();
  });

  it('prefills a catalogue choice while preserving date and manual quantity', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    change('Date, ligne 1', '2026-10-07');
    change('Quantité, ligne 1', '7');
    await user.selectOptions(screen.getByLabelText('Prestation du catalogue, ligne 1'), '7');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Spread Antipollution');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(92.58);
    expect(screen.getByLabelText('Date, ligne 1')).toHaveValue('2026-10-07');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(7);
    expect(screen.getByLabelText('Quantité, ligne 1')).not.toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      serviceCatalogId: 7, designation: 'Spread Antipollution', serviceDate: '2026-10-07', quantity: 7, unitAmountHt: 92.58,
    }), undefined));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  });

  it('saves a manually typed identical designation without linking it to the catalogue', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.type(screen.getByLabelText('Désignation, ligne 1'), 'Spread Antipollution');
    change('Prix unitaire HT, ligne 1', '12.5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      serviceCatalogId: null, designation: 'Spread Antipollution', unitAmountHt: 12.5, quantity: 1,
    }), undefined));
  });

  it('detaches a selected catalogue entry when its designation is edited back to the same name', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.selectOptions(screen.getByLabelText('Prestation du catalogue, ligne 1'), '7');
    await user.clear(screen.getByLabelText('Désignation, ligne 1'));
    await user.type(screen.getByLabelText('Désignation, ligne 1'), 'Spread Antipollution');
    expect(screen.getByLabelText('Prestation du catalogue, ligne 1')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ serviceCatalogId: null, unitAmountHt: 92.58 }), undefined));
  });

  it('calculates and rounds fractional totals immediately while preserving decimal input', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.clear(screen.getByLabelText('Prix unitaire HT, ligne 1'));
    await user.type(screen.getByLabelText('Prix unitaire HT, ligne 1'), '1.25');
    await user.clear(screen.getByLabelText('Quantité, ligne 1'));
    await user.type(screen.getByLabelText('Quantité, ligne 1'), '2.5');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(1.25);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(2.5);
    expect(screen.getByLabelText('Prix Total HT, ligne 1')).toHaveTextContent(/3,13\s*€/);
    change('Prix unitaire HT, ligne 1', '0.01');
    change('Quantité, ligne 1', '0.5');
    expect(screen.getByLabelText('Prix Total HT, ligne 1')).toHaveTextContent(/0,01\s*€/);
  });

  it('retains edited drafts when another parent refresh arrives and includes saved ids when updating', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProjectBillingRawLines {...props([savedLine])} />);
    change('Quantité, ligne 1', '4');
    rerender(<ProjectBillingRawLines {...props([{ ...savedLine, quantity: 3 }])} />);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(4);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 4 }), 10));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    rerender(<ProjectBillingRawLines {...props([{ ...savedLine, quantity: 3 }])} />);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(4);
    rerender(<ProjectBillingRawLines {...props([{ ...savedLine, quantity: 4 }])} />);
    rerender(<ProjectBillingRawLines {...props([{ ...savedLine, quantity: 5 }])} />);
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(5);
  });

  it('keeps one row when the parent acknowledges a newly saved row before its promise resolves', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProjectBillingRawLines {...props()} />);
    let resolveSave!: (line: ProjectBillingRawLine) => void;
    onSave.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    change('Désignation, ligne 1', 'Manutention');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(screen.getByLabelText('Désignation, ligne 1')).toBeDisabled();
    const acknowledged = { ...savedLine, id: 20, serviceDate: '2026-10-01', designation: 'Manutention', unitAmountHt: 0, quantity: 1 };
    rerender(<ProjectBillingRawLines {...props([acknowledged])} />);
    resolveSave(acknowledged);
    await waitFor(() => expect(screen.getAllByLabelText(/^Désignation, ligne/)).toHaveLength(1));
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Manutention');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('preserves values after a save failure and lets the user retry', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    onSave.mockRejectedValueOnce(new Error('Connexion indisponible'));
    change('Quantité, ligne 1', '2.5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion indisponible');
    expect(screen.getByLabelText('Quantité, ligne 1')).toHaveValue(2.5);
    expect(screen.getByRole('button', { name: 'Enregistrer la ligne 1' })).toBeEnabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('validates required date, designation and numeric values before saving', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Renseignez la désignation');
    change('Désignation, ligne 1', 'Assistance');
    change('Date, ligne 1', '');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Renseignez la date');
    change('Date, ligne 1', '2026-10-01');
    change('Prix unitaire HT, ligne 1', '');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('prix unitaire HT');
    change('Prix unitaire HT, ligne 1', '1');
    change('Quantité, ligne 1', '-1');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent('quantité positive');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('removes draft rows directly and asks confirmation before deleting saved rows', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { rerender } = render(<ProjectBillingRawLines {...props([savedLine])} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 2' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(10));
    expect(screen.queryByLabelText('Désignation, ligne 1')).not.toBeInTheDocument();
    rerender(<ProjectBillingRawLines {...props([{ ...savedLine }])} />);
    expect(screen.queryByLabelText('Désignation, ligne 1')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('retains a saved row and shows an error when deletion fails', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    onDelete.mockRejectedValueOnce(new Error('Suppression impossible'));
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    await user.click(screen.getByRole('button', { name: 'Supprimer la ligne 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Suppression impossible');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByRole('button', { name: 'Supprimer la ligne 1' })).toBeEnabled();
    confirm.mockRestore();
  });

  it('saves per-line PDF selection and disables every mutation for a read-only profile', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProjectBillingRawLines {...props([savedLine])} />);
    await user.click(screen.getByLabelText('Inclure dans le PDF la ligne 1'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ includeInPdf: false }), 10));
    rerender(<ProjectBillingRawLines {...props([savedLine])} isManager={false} />);
    for (const field of ['Date, ligne 1', 'Désignation, ligne 1', 'Prix unitaire HT, ligne 1', 'Quantité, ligne 1', 'Prestation du catalogue, ligne 1', 'Inclure dans le PDF la ligne 1']) {
      expect(screen.getByLabelText(field)).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: 'Ajouter une ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer la ligne 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la ligne 1' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Prix Total HT, ligne 1')).toHaveTextContent(/200,00\s*€/);
  });
});
