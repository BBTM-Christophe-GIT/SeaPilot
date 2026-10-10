import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectPreview } from './ProjectPreview';
import * as projectBilling from '../projectBilling';

beforeEach(() => {
  // Keep userEvent timers real while making the current billing month deterministic.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-10T12:00:00'));
  window.history.replaceState({}, '', '/preview/projects/index.html');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderCustomBillingPreview() {
  render(<ProjectPreview />);
  // Existing billing assertions use the same four DPR days as the original demo.
  fireEvent.change(screen.getByLabelText('Période'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-10-05' } });
  fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-08' } });
}

describe('interactive project billing preview', () => {
  it('opens the current calendar month and replaces the global editing bar with section commands', () => {
    render(<ProjectPreview />);
    expect(screen.getByLabelText('Mois de facturation')).toHaveValue('2026-10');
    expect(screen.getByLabelText('Période')).toHaveValue('calendar-month');
    expect(screen.getByLabelText('Début')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Fin')).toHaveValue('2026-10-31');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/16\s*005,00\s*€/);
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    expect(screen.queryByRole('button', { name: 'Choisir une période' })).not.toBeInTheDocument();
    for (const label of ['Ajouter', 'Modifier', 'Enregistrer']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
  });

  it('uses the date of opening rather than the fixed demonstration month', () => {
    vi.setSystemTime(new Date('2027-01-05T12:00:00'));
    render(<ProjectPreview />);
    expect(screen.getByLabelText('Mois de facturation')).toHaveValue('2027-01');
    expect(screen.getByLabelText('Début')).toHaveValue('2027-01-01');
    expect(screen.getByLabelText('Fin')).toHaveValue('2027-01-31');
    expect(within(screen.getByRole('complementary', { name: 'Relevé du mois' })).getByText('janvier 2027')).toBeInTheDocument();
  });

  it('applies a period selected in the three-month calendar to the fields and billing totals', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    await user.click(within(calendar).getByRole('button', { name: 'lundi 5 octobre 2026' }));
    await user.click(within(calendar).getByRole('button', { name: 'jeudi 8 octobre 2026' }));
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(4);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Période')).toHaveValue('custom');
    expect(screen.getByLabelText('Début')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('Fin')).toHaveValue('2026-10-08');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
  });

  it('completes missing hire days at their applicable rate while retaining existing DPR exclusions', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-13' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/4\s*005,00\s*€/);
    await user.click(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-12' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/1\s*355,00\s*€/);
    const complete = screen.getByRole('button', { name: /^Compléter les 1 jours sans DPR/ });
    expect(complete).toHaveAttribute('aria-pressed', 'false');
    await user.click(complete);
    const generated = screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-13' });
    expect(generated).toBeChecked();
    const generatedRow = generated.closest('tr')!;
    expect(within(generatedRow).getByText('24/24 Operation')).toBeInTheDocument();
    expect(within(generatedRow).getByText('2 650,00 €')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-12' })).not.toBeChecked();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/4\s*005,00\s*€/);
    const remove = screen.getByRole('button', { name: 'Retirer les journées complétées' });
    expect(remove).toHaveAttribute('aria-pressed', 'true');
    await user.click(remove);
    expect(screen.queryByRole('checkbox', { name: 'Inclure la journée du 2026-10-13' })).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/1\s*355,00\s*€/);
  });

  it('selects the four PDF sections from the statement while keeping all screen sections accessible', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    const statement = screen.getByRole('complementary', { name: 'Relevé du mois' });
    const selection = within(statement).getByRole('group', { name: 'Contenu du PDF' });
    expect(within(selection).getAllByRole('checkbox')).toHaveLength(4);
    expect(within(statement).getByText('octobre 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Loyers & journées DPR/ })).not.toBeInTheDocument();

    for (const [label, total] of [
      ['Loyers D’affrètement', /1\s*355,00\s*€/],
      ['Services refacturables', /340,00\s*€/],
      ['Prestation BBTM', /0,00\s*€/],
      ['Saisie brute', /0,00\s*€/],
    ] as const) {
      await user.click(within(selection).getByRole('checkbox', { name: `Inclure ${label} dans le PDF` }));
      expect(screen.getByTestId('billing-total')).toHaveTextContent(total);
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' })).toBeChecked();
    await user.click(within(selection).getByRole('checkbox', { name: 'Inclure Loyers D’affrètement dans le PDF' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/9\s*600,00\s*€/);
  });

  it('keeps a reference when empty raw inclusion changes and resolves references when raw lines leave the date range', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    const reference = screen.getByLabelText('Référence client');
    await user.clear(reference);
    await user.type(reference, 'SANS-BRUTE');
    await user.tab();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure Saisie brute dans le PDF' }));
    expect(reference).toHaveValue('SANS-BRUTE');
    await user.click(screen.getByRole('checkbox', { name: 'Inclure Saisie brute dans le PDF' }));
    expect(reference).toHaveValue('SANS-BRUTE');

    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    const editor = screen.getByRole('dialog', { name: 'Ajouter une ligne brute' });
    await user.type(within(editor).getByLabelText('Désignation libre'), 'Prestation du 8 octobre');
    fireEvent.change(within(editor).getByLabelText('Date'), { target: { value: '2026-10-08' } });
    await user.clear(within(editor).getByLabelText('Prix unitaire HT'));
    await user.type(within(editor).getByLabelText('Prix unitaire HT'), '125');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    // A newly selected PDF content has no saved reference yet.
    expect(reference).toHaveValue('');
    await user.clear(reference);
    await user.type(reference, 'AVEC-BRUTE');
    await user.tab();
    await user.selectOptions(screen.getByLabelText('Période'), 'custom');
    fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-07' } });
    expect(reference).toHaveValue('SANS-BRUTE');
    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-08' } });
    expect(reference).toHaveValue('AVEC-BRUTE');
  });

  it('opens each reference directly from the shared module ribbon and restores keyboard focus', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    const ribbon = screen.getByRole('navigation', { name: 'Menu des projets' });
    const references = within(ribbon).getByRole('group', { name: 'Catalogue' });

    for (const label of ['Clients', 'Remorqués', 'Prestations']) {
      const command = within(references).getByRole('button', { name: label });
      await user.click(command);
      expect(screen.getByRole('dialog', { name: `Référentiel — ${label}` })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(command).toHaveFocus();
    }
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
  });

  it('preserves project editing, archive confirmation and reset from direct ribbon commands', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    const ribbon = screen.getByRole('navigation', { name: 'Menu des projets' });
    const projects = within(ribbon).getByRole('group', { name: 'Projet' });
    await user.click(within(projects).getByRole('button', { name: 'Nouveau projet' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Nouveau projet' })).getByRole('button', { name: 'Annuler' }));
    await user.click(within(projects).getByRole('button', { name: 'Modifier le projet' }));
    const editor = screen.getByRole('dialog', { name: 'Modifier le projet' });
    expect(within(editor).getByLabelText('Nom du projet')).toHaveValue('Assistance offshore');
    await user.click(within(editor).getByRole('button', { name: 'Annuler' }));
    await user.click(within(projects).getByRole('button', { name: 'Archiver le projet' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Archiver le projet' })).getByRole('button', { name: 'Annuler' }));
    expect(within(projects).getByRole('button', { name: 'Modifier le projet' })).toBeEnabled();

    await user.click(within(projects).getByRole('button', { name: 'Archiver le projet' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Archiver le projet' })).getByRole('button', { name: 'Confirmer' }));
    expect(within(projects).getByRole('button', { name: 'Modifier le projet' })).toBeDisabled();
    expect(within(projects).getByRole('button', { name: 'Archiver le projet' })).toBeDisabled();
    expect(within(projects).getByRole('button', { name: 'Nouveau projet' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
    await user.click(within(projects).getByRole('button', { name: 'Actualiser' }));
    expect(screen.getByRole('status')).toHaveTextContent('Données de démonstration actualisées.');
    await user.click(within(projects).getByRole('button', { name: 'Réinitialiser la démonstration' }));
    expect(within(projects).getByRole('button', { name: 'Modifier le projet' })).toBeEnabled();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/16\s*005,00\s*€/);
  });

  it('updates the export total when a DPR day and a full billing section are excluded', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);

    await user.click(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/8\s*555,00\s*€/);
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestation BBTM dans le PDF' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/8\s*215,00\s*€/);
    expect(screen.getByRole('heading', { name: /^P264 — Assistance offshore/ })).toHaveTextContent('Validé');
  });

  it('enables modification after choosing a supplier and applies the edited amount', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    expect(screen.getByRole('button', { name: 'Actions du frais sélectionné' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Fournisseur Démonstration' }));
    expect(screen.getByRole('button', { name: 'Actions du frais sélectionné' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Actions du frais sélectionné' }));
    await user.click(screen.getByRole('menuitem', { name: 'Modifier la ligne sélectionnée' }));

    const dialog = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(dialog).getByLabelText('Fournisseur')).toHaveValue('Fournisseur Démonstration');
    const amount = within(dialog).getByLabelText('Montant HT', { exact: true });
    await user.clear(amount);
    await user.type(amount, '700');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*980,00\s*€/);
  });

  it('keeps each project billing selection when navigating and leaves operation statuses independent', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' }));
    await user.click(screen.getByRole('button', { name: /^P263 — Remorquage côtier/ }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/3\s*600,00\s*€/);
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' })).toBeChecked();
    expect(screen.getByRole('heading', { name: /^P263 — Remorquage côtier/ })).toHaveTextContent('Non validé');

    await user.click(screen.getByRole('tab', { name: 'Opérations' }));
    const towingRow = screen.getByRole('row', { name: /Remorquage côtier.*GOURY/ });
    expect(within(towingRow).getByText('Non validé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^P264 — Assistance offshore/ }));
    const firstOperation = screen.getByRole('row', { name: /Assistance offshore.*GOURY/ });
    expect(within(firstOperation).getByText('Validé')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Relève d’équipe.*GOURY/ })).getByText('Non validé')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Facturation' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/8\s*555,00\s*€/);
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' })).not.toBeChecked();
  });

  it('creates a month on the first addition and keeps references scoped to the project and PDF selection', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    expect(screen.getByRole('button', { name: 'Ajouter un frais' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Prévisualiser le PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.type(within(dialog).getByLabelText('Fournisseur'), 'Fournisseur novembre');
    await user.type(within(dialog).getByLabelText('Montant HT', { exact: true }), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Moving to November selects its entire calendar month, with no October DPR.
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/125,00\s*€/);

    await user.clear(screen.getByLabelText('Référence client'));
    await user.type(screen.getByLabelText('Référence client'), 'DEMO-NOVEMBRE');
    await user.tab();
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-10' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/16\s*005,00\s*€/);
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    await user.click(screen.getByRole('button', { name: /^P263 — Remorquage côtier/ }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-P263-2026');
    await user.click(screen.getByRole('button', { name: /^P264 — Assistance offshore/ }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestation BBTM dans le PDF' }));
    await user.clear(screen.getByLabelText('Référence client'));
    await user.type(screen.getByLabelText('Référence client'), 'DEMO-SANS-BBTM');
    await user.tab();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestation BBTM dans le PDF' }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    expect(screen.getByRole('button', { name: 'Ajouter un frais' })).toBeEnabled();
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/125,00\s*€/);
  });

  it('adds an expense from its own section and exposes its supplier and new total', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.type(within(dialog).getByLabelText('Fournisseur'), 'Fournisseur test local');
    await user.type(within(dialog).getByLabelText('Spécialité'), 'Assistance technique');
    await user.type(within(dialog).getByLabelText('N° facture'), 'TEST-125');
    await user.type(within(dialog).getByLabelText('Montant HT', { exact: true }), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fournisseur / spécialité' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Fournisseur test local.*TEST-125/ });
    expect(within(row).getByText('125,00 €')).toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: 'Sélectionner Fournisseur test local' })).toBeChecked();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*080,00\s*€/);
  });

  it('adds a raw billing line from its own section and includes its amount in the total', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une ligne brute' });
    await user.type(within(dialog).getByLabelText('Désignation libre'), 'Assistance brute locale');
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-10-08' } });
    await user.selectOptions(within(dialog).getByLabelText('Navire'), 'GOURY');
    const quantity = within(dialog).getByLabelText('Quantité');
    await user.clear(quantity);
    await user.type(quantity, '2');
    const unitAmount = within(dialog).getByLabelText('Prix unitaire HT');
    await user.clear(unitAmount);
    await user.type(unitAmount, '62.5');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const rawSection = screen.getByRole('button', { name: /^Saisie brute/ });
    if (rawSection.getAttribute('aria-expanded') !== 'true') await user.click(rawSection);
    const row = screen.getByRole('row', { name: /Assistance brute locale/ });
    expect(within(row).getByText('GOURY')).toBeInTheDocument();
    expect(within(row).getByText('125,00 €')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*080,00\s*€/);
  });

  it('duplicates the preceding raw line identically even when an earlier line is selected', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    const addLine = async (designation: string, date: string, vessel: string, quantity: string, price: string) => {
      await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
      const dialog = screen.getByRole('dialog', { name: 'Ajouter une ligne brute' });
      await user.type(within(dialog).getByLabelText('Désignation libre'), designation);
      fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: date } });
      await user.selectOptions(within(dialog).getByLabelText('Navire'), vessel);
      await user.clear(within(dialog).getByLabelText('Quantité'));
      await user.type(within(dialog).getByLabelText('Quantité'), quantity);
      await user.clear(within(dialog).getByLabelText('Prix unitaire HT'));
      await user.type(within(dialog).getByLabelText('Prix unitaire HT'), price);
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    };
    await addLine('Première saisie', '2026-10-06', 'GOURY', '1', '50');
    await addLine('Dernière saisie', '2026-10-07', 'JERSEY', '2', '62.5');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*130,00\s*€/);
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Première saisie' }));
    await user.click(screen.getByRole('button', { name: 'Dupliquer la ligne' }));

    const copies = screen.getAllByRole('row', { name: /Dernière saisie/ });
    expect(copies).toHaveLength(2);
    const businessCells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(businessCells(copies[1])).toEqual(businessCells(copies[0]));
    expect(within(copies[0]).getByRole('radio')).not.toBeChecked();
    expect(within(copies[1]).getByRole('radio')).toBeChecked();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*255,00\s*€/);

    await user.click(screen.getByRole('button', { name: 'Actions de la ligne brute sélectionnée' }));
    await user.click(screen.getByRole('menuitem', { name: 'Modifier la ligne sélectionnée' }));
    const editor = screen.getByRole('dialog', { name: 'Modifier la ligne brute' });
    expect(within(editor).getByLabelText('Désignation libre')).toHaveValue('Dernière saisie');
    expect(within(editor).getByLabelText('Date')).toHaveValue('2026-10-07');
    expect(within(editor).getByLabelText('Navire')).toHaveValue('JERSEY');
    expect(within(editor).getByLabelText('Quantité')).toHaveValue(2);
    expect(within(editor).getByLabelText('Prix unitaire HT')).toHaveValue(62.5);
    await user.click(within(editor).getByRole('button', { name: 'Annuler' }));

    await user.click(screen.getByRole('button', { name: 'Archiver le projet' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Archiver le projet' })).getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
  });

  it('blocks raw additions and duplication while a PDF is being generated', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    const editor = screen.getByRole('dialog', { name: 'Ajouter une ligne brute' });
    await user.type(within(editor).getByLabelText('Désignation libre'), 'Saisie avant export');
    await user.clear(within(editor).getByLabelText('Prix unitaire HT'));
    await user.type(within(editor).getByLabelText('Prix unitaire HT'), '125');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeEnabled();

    let rejectExport!: (error: Error) => void;
    const pending = new Promise<Awaited<ReturnType<typeof projectBilling.generateBillingExportPackage>>>((_resolve, reject) => { rejectExport = reject; });
    vi.spyOn(projectBilling, 'generateBillingExportPackage').mockReturnValueOnce(pending);
    await user.click(screen.getByRole('button', { name: 'Prévisualiser le PDF' }));
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
    await act(async () => { rejectExport(new Error('Export interrompu pour le test')); });
    expect(screen.getByRole('status')).toHaveTextContent('Export interrompu pour le test');
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeEnabled();
  });
});
