import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBillingRawLines } from './ProjectBillingRawLines';
import { AppDialog } from '../../components/AppDialog';
import type { BillingRawLineDraft, ProjectBillingRawLine, ProjectServiceCatalogDraft, ProjectServiceCatalogEntry } from './projectBilling';
import type { VesselRecord } from './projectQueries';

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
const onCatalogCreate = vi.fn<(draft: ProjectServiceCatalogDraft) => Promise<ProjectServiceCatalogEntry>>();
const onDirtyChange = vi.fn();
const vessels: VesselRecord[] = [
  { id: 101, name: 'COURT', acronym: '', active: true, fleetExitOn: '', sharePointItemId: '', assetKind: 'vessel', lengthOverall: '8' },
  { id: 102, name: 'LONG', acronym: '', active: true, fleetExitOn: '', sharePointItemId: '', assetKind: 'vessel', lengthOverall: '40' },
  { id: 103, name: 'ARCHIVÉ', acronym: '', active: false, fleetExitOn: '', sharePointItemId: '', assetKind: 'vessel', lengthOverall: '45' },
  { id: 104, name: 'QUAI', acronym: '', active: true, fleetExitOn: '', sharePointItemId: '', assetKind: 'quay', lengthOverall: '50' },
  { id: 105, name: 'BUREAU', acronym: '', active: true, fleetExitOn: '', sharePointItemId: '', assetKind: 'office', lengthOverall: '60' },
  { id: 106, name: 'SANS DIMENSION', acronym: '', active: true, fleetExitOn: '', sharePointItemId: '' },
];

function props(lines: ProjectBillingRawLine[] = []) {
  return { lines, catalog, vessels, isManager: true, initialDate: '2026-10-01', onSave, onDelete, onCatalogOpen, onCatalogCreate, onDirtyChange };
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function startCreation(user: ReturnType<typeof userEvent.setup>, line = 1) {
  await user.click(screen.getByRole('button', { name: `Choisir dans le catalogue, ligne ${line}` }));
  await user.click(screen.getByRole('button', { name: 'Nouvelle prestation' }));
  return screen.getByRole('dialog', { name: 'Nouvelle prestation' });
}

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockImplementation(async (draft, id) => ({ ...draft, id: id ?? 20, billingPeriodId: 2 }));
  onDelete.mockResolvedValue(undefined);
  onCatalogCreate.mockImplementation(async (draft) => ({
    ...catalog[0], id: 99, category: draft.category, unitAmountHt: draft.unitAmountHt,
    vesselId: draft.vesselId ?? null, vesselName: draft.vesselName || '',
  }));
});

describe('raw project billing lines', () => {
  it.each(['vessel', 'office'] as const)('keeps the saved vessel name visible after a fleet rename or reclassification to %s', async (assetKind) => {
    const user = userEvent.setup();
    const line = { ...savedLine, vesselId: 102, vesselName: 'NOM HISTORIQUE' };
    render(<ProjectBillingRawLines {...props([line])} vessels={vessels.map((vessel) => vessel.id === 102 ? { ...vessel, name: 'NOM ACTUEL', assetKind } : vessel)} />);
    expect(screen.getByLabelText('Navire, ligne 1')).toHaveDisplayValue('NOM HISTORIQUE');
    change('Prix unitaire HT, ligne 1', '110');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ vesselId: 102, vesselName: 'NOM HISTORIQUE', unitAmountHt: 110 }), savedLine.id));
  });

  it('adds several independent rows with the requested columns and opens the catalogue', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props()} />);
    expect(screen.getByText('Aucune ligne de saisie brute pour cette période.')).toBeVisible();
    for (const column of ['Date', 'Navire', 'Désignation', 'Prix unitaire HT', 'Quantité', 'Prix Total HT']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeVisible();
    }
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    expect(screen.getAllByLabelText(/^Date, ligne/)).toHaveLength(4);
    expect(screen.getByLabelText('Date, ligne 4')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Quantité, ligne 4')).toHaveValue(1);
    expect(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 4' })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('combobox', { name: /Prestation du catalogue/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Saisie manuelle')).not.toBeInTheDocument();
    const add = screen.getByRole('button', { name: 'Ajouter une ligne' });
    const lastRow = screen.getByLabelText('Désignation, ligne 4').closest('tr')!;
    expect(lastRow.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.compareDocumentPosition(screen.getByText(/Total des lignes HT/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(screen.getByRole('button', { name: 'Choisir Spread Antipollution' }));
    expect(screen.queryByRole('dialog', { name: 'Choisir une prestation' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.click(screen.getByRole('button', { name: 'Choisir Spread Antipollution' }));
    await user.clear(screen.getByLabelText('Désignation, ligne 1'));
    await user.type(screen.getByLabelText('Désignation, ligne 1'), 'Spread Antipollution');
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
    expect(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' })).toBeDisabled();
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

  it('disables every mutation for a read-only profile without any per-line PDF control', () => {
    render(<ProjectBillingRawLines {...props([savedLine])} isManager={false} />);
    for (const field of ['Date, ligne 1', 'Navire, ligne 1', 'Désignation, ligne 1', 'Prix unitaire HT, ligne 1', 'Quantité, ligne 1']) {
      expect(screen.getByLabelText(field)).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ajouter une ligne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer la ligne 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la ligne 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Prix Total HT, ligne 1')).toHaveTextContent(/200,00\s*€/);
  });

  it('normalizes legacy per-line PDF exclusions when saving a changed line', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([{ ...savedLine, includeInPdf: false }])} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    change('Quantité, ligne 1', '3');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3, includeInPdf: true }), 10));
  });

  it('searches catalogue prices and fills only the second row through its plus button', async () => {
    const user = userEvent.setup();
    const second = { ...savedLine, id: 11, serviceDate: '2026-10-12', designation: 'Manutention', quantity: 2.5 };
    const other = { ...catalog[0], id: 8, category: 'Assistance', unitAmountHt: 125 };
    const archived = { ...catalog[0], id: 9, category: 'Ancienne prestation', active: false };
    render(<ProjectBillingRawLines {...props([savedLine, second])} catalog={[...catalog, other, archived]} />);
    const plus = screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 2' });
    expect(plus.nextElementSibling).toBe(screen.getByLabelText('Désignation, ligne 2'));
    await user.click(plus);
    const dialog = screen.getByRole('dialog', { name: 'Choisir une prestation' });
    expect(dialog).toHaveTextContent('Ligne 2');
    expect(within(dialog).getByRole('button', { name: 'Choisir Assistance' })).toHaveTextContent(/125,00\s*€ HT/);
    expect(within(dialog).queryByRole('button', { name: 'Choisir Ancienne prestation' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Rechercher une prestation'), 'spread');
    expect(within(dialog).queryByRole('button', { name: 'Choisir Assistance' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Choisir Spread Antipollution' }));
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(100);
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('Spread Antipollution');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 2')).toHaveValue(92.58);
    expect(screen.getByLabelText('Date, ligne 2')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Quantité, ligne 2')).toHaveValue(2.5);
    await waitFor(() => expect(plus).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 2' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ serviceCatalogId: 7, serviceDate: '2026-10-12', quantity: 2.5 }), 11));
  });

  it('closes the catalogue with Escape and restores focus without closing an ancestor dialog', async () => {
    const user = userEvent.setup();
    const closeProject = vi.fn();
    render(<AppDialog onClose={closeProject} title="Dossier projet"><ProjectBillingRawLines {...props([savedLine])} /></AppDialog>);
    const plus = screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' });
    await user.click(plus);
    const dialog = screen.getByRole('dialog', { name: 'Choisir une prestation' });
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    await user.type(within(dialog).getByLabelText('Rechercher une prestation'), 'Introuvable');
    expect(within(dialog).getByText('Aucune prestation ne correspond à votre recherche.')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choisir une prestation' })).not.toBeInTheDocument();
    expect(closeProject).not.toHaveBeenCalled();
    expect(plus).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(plus).toHaveFocus());
    await user.click(plus);
    expect(screen.getByLabelText('Rechercher une prestation')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Choisir Spread Antipollution' })).toBeVisible();
  });

  it('keeps the catalogue chooser disabled during global work and blocks selection if permissions change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProjectBillingRawLines {...props([savedLine])} disabled />);
    const plus = screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' });
    expect(plus).toBeDisabled();
    await user.click(plus);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<ProjectBillingRawLines {...props([savedLine])} />);
    await user.click(plus);
    rerender(<ProjectBillingRawLines {...props([savedLine])} isManager={false} />);
    expect(screen.getByRole('button', { name: 'Choisir Spread Antipollution' })).toBeDisabled();
    expect(screen.getByLabelText('Rechercher une prestation')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Choisir Spread Antipollution' }));
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(onSave).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog', { name: 'Choisir une prestation' })).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty catalogue without replacing the manually entered designation', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([savedLine])} catalog={[]} />);
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    expect(screen.getByRole('dialog', { name: 'Choisir une prestation' })).toHaveTextContent('Aucune prestation disponible dans le catalogue.');
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('orders real vessel options by length, keeps the current archived vessel and changes only vessel metadata', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([{ ...savedLine, vesselId: 103, vesselName: 'ARCHIVÉ' }])} />);
    const select = screen.getByRole('combobox', { name: 'Navire, ligne 1' });
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Sans navire', 'ARCHIVÉ', 'LONG', 'COURT', 'SANS DIMENSION']);
    await user.selectOptions(select, '102');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(100);
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 1' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ vesselId: 102, vesselName: 'LONG', designation: 'Assistance', unitAmountHt: 100 }), 10));
  });

  it('distinguishes equal catalogue designations by vessel and copies only the chosen line', async () => {
    const user = userEvent.setup();
    const second = { ...savedLine, id: 11, serviceDate: '2026-10-12', quantity: 2.5 };
    const longService = { ...catalog[0], vesselId: 102 };
    const shortService = { ...catalog[0], id: 8, vesselId: 101, vesselName: 'COURT', unitAmountHt: 35 };
    render(<ProjectBillingRawLines {...props([savedLine, second])} catalog={[longService, shortService]} />);
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 2' }));
    expect(screen.getByRole('button', { name: 'Choisir Spread Antipollution — LONG' })).toHaveTextContent(/LONG.*92,58/);
    expect(screen.getByRole('button', { name: 'Choisir Spread Antipollution — COURT' })).toHaveTextContent(/COURT.*35,00/);
    await user.type(screen.getByLabelText('Rechercher une prestation'), 'LONG');
    expect(screen.queryByRole('button', { name: 'Choisir Spread Antipollution — COURT' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choisir Spread Antipollution — LONG' }));
    expect(screen.getByLabelText('Navire, ligne 1')).toHaveValue('');
    expect(screen.getByLabelText('Navire, ligne 2')).toHaveValue('102');
    expect(screen.getByLabelText('Date, ligne 2')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Quantité, ligne 2')).toHaveValue(2.5);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('creates a catalogue service without a quantity and fills the second row without autosaving it', async () => {
    const user = userEvent.setup();
    const second = { ...savedLine, id: 11, serviceDate: '2026-10-12', quantity: 2.5 };
    render(<ProjectBillingRawLines {...props([savedLine, second])} />);
    const dialog = await startCreation(user, 2);
    expect(within(dialog).queryByLabelText(/Quantité/)).not.toBeInTheDocument();
    const vesselSelect = within(dialog).getByLabelText('Navire de la nouvelle prestation');
    expect(within(vesselSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['Sans navire', 'LONG', 'COURT', 'SANS DIMENSION']);
    await user.selectOptions(vesselSelect, '102');
    await user.type(within(dialog).getByLabelText('Désignation de la nouvelle prestation'), '  Forfait portuaire  ');
    await user.type(within(dialog).getByLabelText('Prix unitaire HT de la nouvelle prestation'), '125.5');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la prestation' }));
    await waitFor(() => expect(onCatalogCreate).toHaveBeenCalledWith({ category: 'Forfait portuaire', unitAmountHt: 125.5, vesselId: 102, vesselName: 'LONG', descriptionHtml: '', active: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Navire, ligne 1')).toHaveValue('');
    expect(screen.getByLabelText('Désignation, ligne 2')).toHaveValue('Forfait portuaire');
    expect(screen.getByLabelText('Navire, ligne 2')).toHaveValue('102');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 2')).toHaveValue(125.5);
    expect(screen.getByLabelText('Date, ligne 2')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Quantité, ligne 2')).toHaveValue(2.5);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Enregistrer la ligne 2' })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 2' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Enregistrer la ligne 2' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ serviceCatalogId: 99, vesselId: 102, vesselName: 'LONG', serviceDate: '2026-10-12', quantity: 2.5 }), 11));
  });

  it('offers creation in an empty catalogue and accepts a zero price without a vessel', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([savedLine])} catalog={[]} />);
    const dialog = await startCreation(user);
    await user.type(within(dialog).getByLabelText('Désignation de la nouvelle prestation'), 'Prestation gratuite');
    await user.type(within(dialog).getByLabelText('Prix unitaire HT de la nouvelle prestation'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la prestation' }));
    await waitFor(() => expect(onCatalogCreate).toHaveBeenCalledWith({ category: 'Prestation gratuite', unitAmountHt: 0, vesselId: null, vesselName: '', descriptionHtml: '', active: true }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(0);
  });

  it('returns to the picker on cancellation or Escape without changing the originating row', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    await user.click(screen.getByRole('button', { name: 'Choisir dans le catalogue, ligne 1' }));
    await user.type(screen.getByLabelText('Rechercher une prestation'), 'spread');
    await user.click(screen.getByRole('button', { name: 'Nouvelle prestation' }));
    expect(screen.getByLabelText('Désignation de la nouvelle prestation')).toHaveFocus();
    await user.type(screen.getByLabelText('Désignation de la nouvelle prestation'), 'Annulée');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('dialog', { name: 'Choisir une prestation' })).toBeVisible();
    expect(screen.getByLabelText('Rechercher une prestation')).toHaveValue('spread');
    await user.click(screen.getByRole('button', { name: 'Nouvelle prestation' }));
    await user.type(screen.getByLabelText('Désignation de la nouvelle prestation'), 'Abandonnée');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Choisir une prestation' })).toBeVisible();
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Assistance');
    expect(screen.getByLabelText('Prix unitaire HT, ligne 1')).toHaveValue(100);
    expect(onCatalogCreate).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('retains the creation fields after an API failure and retries without creating a raw invoice line', async () => {
    const user = userEvent.setup();
    onCatalogCreate.mockRejectedValueOnce(new Error('Catalogue indisponible'));
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    const dialog = await startCreation(user);
    await user.selectOptions(within(dialog).getByLabelText('Navire de la nouvelle prestation'), '102');
    await user.type(within(dialog).getByLabelText('Désignation de la nouvelle prestation'), 'Transport');
    await user.type(within(dialog).getByLabelText('Prix unitaire HT de la nouvelle prestation'), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la prestation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogue indisponible');
    expect(screen.getByLabelText('Désignation de la nouvelle prestation')).toHaveValue('Transport');
    expect(screen.getByLabelText('Prix unitaire HT de la nouvelle prestation')).toHaveValue(125);
    expect(screen.getByLabelText('Navire de la nouvelle prestation')).toHaveValue('102');
    expect(screen.getByRole('button', { name: 'Créer la prestation' })).toBeEnabled();
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Créer la prestation' }));
    await waitFor(() => expect(onCatalogCreate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks closing, editing and double submission while catalogue creation is pending', async () => {
    const user = userEvent.setup();
    let resolveCreate!: (entry: ProjectServiceCatalogEntry) => void;
    onCatalogCreate.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    const dialog = await startCreation(user);
    await user.type(within(dialog).getByLabelText('Désignation de la nouvelle prestation'), 'Transport');
    await user.type(within(dialog).getByLabelText('Prix unitaire HT de la nouvelle prestation'), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la prestation' }));
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    for (const label of ['Désignation de la nouvelle prestation', 'Prix unitaire HT de la nouvelle prestation', 'Navire de la nouvelle prestation']) expect(screen.getByLabelText(label)).toBeDisabled();
    for (const label of ['Créer la prestation', 'Annuler', 'Fermer']) expect(within(dialog).getByRole('button', { name: label })).toBeDisabled();
    fireEvent.submit(dialog);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Nouvelle prestation' })).toBeVisible();
    expect(onCatalogCreate).toHaveBeenCalledOnce();
    resolveCreate({ ...catalog[0], id: 99, category: 'Transport', unitAmountHt: 125 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Désignation, ligne 1')).toHaveValue('Transport');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('validates a trimmed designation and a finite nonnegative required catalogue price', async () => {
    const user = userEvent.setup();
    render(<ProjectBillingRawLines {...props([savedLine])} />);
    const dialog = await startCreation(user);
    change('Désignation de la nouvelle prestation', '   ');
    change('Prix unitaire HT de la nouvelle prestation', '1');
    fireEvent.submit(dialog);
    expect(screen.getByRole('alert')).toHaveTextContent('Renseignez la désignation');
    change('Désignation de la nouvelle prestation', 'Transport');
    change('Prix unitaire HT de la nouvelle prestation', '');
    fireEvent.submit(dialog);
    expect(screen.getByRole('alert')).toHaveTextContent('prix unitaire HT positif ou nul');
    change('Prix unitaire HT de la nouvelle prestation', '-1');
    fireEvent.submit(dialog);
    expect(screen.getByRole('alert')).toHaveTextContent('prix unitaire HT positif ou nul');
    change('Prix unitaire HT de la nouvelle prestation', '1e309');
    fireEvent.submit(dialog);
    expect(screen.getByRole('alert')).toHaveTextContent('prix unitaire HT positif ou nul');
    expect(onCatalogCreate).not.toHaveBeenCalled();
  });

  it('prevents catalogue creation when the disabled state or editing permissions change', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProjectBillingRawLines {...props([savedLine])} />);
    const dialog = await startCreation(user);
    change('Désignation de la nouvelle prestation', 'Transport');
    change('Prix unitaire HT de la nouvelle prestation', '125');
    rerender(<ProjectBillingRawLines {...props([savedLine])} disabled />);
    expect(screen.getByRole('button', { name: 'Créer la prestation' })).toBeDisabled();
    fireEvent.submit(dialog);
    expect(onCatalogCreate).not.toHaveBeenCalled();
    rerender(<ProjectBillingRawLines {...props([savedLine])} isManager={false} />);
    expect(screen.getByLabelText('Désignation de la nouvelle prestation')).toBeDisabled();
    expect(screen.getByLabelText('Navire de la nouvelle prestation')).toBeDisabled();
    fireEvent.submit(dialog);
    expect(onCatalogCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Nouvelle prestation' })).toBeDisabled();
  });
});
