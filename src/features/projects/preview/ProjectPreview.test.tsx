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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function selectBillingPeriod(startDate: string, endDate: string) {
  const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
  const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  fireEvent.click(within(calendar).getByRole('button', { name: dayLabel(startDate) }));
  fireEvent.click(within(calendar).getByRole('button', { name: dayLabel(endDate) }));
}

function renderCustomBillingPreview() {
  render(<ProjectPreview />);
  // Existing billing assertions use the same four DPR days as the original demo.
  selectBillingPeriod('2026-10-05', '2026-10-08');
}

describe('interactive project billing preview', () => {
  it('opens the current calendar month and replaces the global editing bar with section commands', () => {
    render(<ProjectPreview />);
    expect(screen.getByLabelText('Mois de facturation')).toHaveValue('2026-10');
    for (const label of ['Période', 'Début', 'Fin']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/16\s*005,00\s*€/);
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    expect(within(calendar).getByText('Du 1 octobre 2026 au 31 octobre 2026')).toBeInTheDocument();
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
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    expect(within(calendar).getByText('Du 1 janvier 2027 au 31 janvier 2027')).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: 'Relevé du mois' })).getByText('janvier 2027')).toBeInTheDocument();
  });

  it('applies a period selected in the three-month calendar to the displayed range and billing totals', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    await user.click(within(calendar).getByRole('button', { name: 'lundi 5 octobre 2026' }));
    await user.click(within(calendar).getByRole('button', { name: 'jeudi 8 octobre 2026' }));
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(4);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(calendar).getByText('Du 5 octobre 2026 au 8 octobre 2026')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
  });

  it('completes missing hire days at their applicable rate while retaining existing DPR exclusions', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    selectBillingPeriod('2026-10-12', '2026-10-13');
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
    const editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });
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
    selectBillingPeriod('2026-10-05', '2026-10-07');
    expect(reference).toHaveValue('SANS-BRUTE');
    selectBillingPeriod('2026-10-05', '2026-10-08');
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

  it('edits and deletes the expense whose row action is used rather than the selected supplier', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    expect(screen.queryByRole('button', { name: 'Actions du frais sélectionné' })).not.toBeInTheDocument();
    const supplierRow = screen.getByRole('row', { name: /Fournisseur Démonstration.*DEMO-068/ });
    expect(within(supplierRow).getByRole('radio')).not.toBeChecked();
    await user.click(within(supplierRow).getByRole('button', { name: 'Modifier le frais Fournisseur Démonstration' }));

    const dialog = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(dialog).getByLabelText('Fournisseur')).toHaveValue('Fournisseur Démonstration');
    const amount = within(dialog).getByLabelText('Montant HT', { exact: true });
    await user.clear(amount);
    await user.type(amount, '700');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*980,00\s*€/);

    await user.click(screen.getByRole('radio', { name: 'Sélectionner Port Démonstration' }));
    await user.click(within(supplierRow).getByRole('button', { name: 'Supprimer le frais Fournisseur Démonstration' }));
    let confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    expect(within(confirmation).getByText('Supprimer « Fournisseur Démonstration » de la démonstration ?')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(supplierRow).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*980,00\s*€/);
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Port Démonstration' }));
    await user.click(within(supplierRow).getByRole('button', { name: 'Supprimer le frais Fournisseur Démonstration' }));
    confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    await user.click(within(confirmation).getByRole('button', { name: 'Confirmer' }));
    expect(screen.queryByRole('row', { name: /Fournisseur Démonstration.*DEMO-068/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Port Démonstration.*DEMO-104/ })).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*280,00\s*€/);
  });

  it('edits a BBTM service directly and confirms deletion of that service even when another one is selected', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: /^Prestation BBTM/ }));
    const initialRow = screen.getByRole('row', { name: /Suivi opérationnel/ });
    expect(within(initialRow).getByRole('radio')).not.toBeChecked();
    await user.click(within(initialRow).getByRole('button', { name: 'Modifier la prestation Suivi opérationnel' }));
    let editor = screen.getByRole('dialog', { name: 'Modifier la prestation BBTM' });
    expect(within(editor).getByLabelText('Montant unitaire HT')).toHaveValue(85);
    expect(within(editor).getByLabelText('Nombre d’unités')).toHaveValue(4);
    await user.selectOptions(within(editor).getByLabelText('Catégorie du catalogue'), 'Services portuaires');
    await user.clear(within(editor).getByLabelText('Montant unitaire HT'));
    await user.type(within(editor).getByLabelText('Montant unitaire HT'), '90');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    const serviceRow = screen.getByRole('row', { name: /Services portuaires/ });
    expect(within(serviceRow).getByText('360,00 €')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*975,00\s*€/);

    await user.click(screen.getByRole('button', { name: 'Ajouter une prestation BBTM' }));
    editor = screen.getByRole('dialog', { name: 'Ajouter une prestation BBTM' });
    await user.selectOptions(within(editor).getByLabelText('Catégorie du catalogue'), 'Assistance technique');
    await user.clear(within(editor).getByLabelText('Montant unitaire HT'));
    await user.type(within(editor).getByLabelText('Montant unitaire HT'), '50');
    await user.clear(within(editor).getByLabelText('Nombre d’unités'));
    await user.type(within(editor).getByLabelText('Nombre d’unités'), '1');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('radio', { name: 'Sélectionner Assistance technique' })).toBeChecked();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*025,00\s*€/);

    await user.click(within(serviceRow).getByRole('button', { name: 'Supprimer la prestation Services portuaires' }));
    let confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    expect(within(confirmation).getByText('Supprimer « Services portuaires » de la démonstration ?')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(serviceRow).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*025,00\s*€/);
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Assistance technique' }));
    await user.click(within(serviceRow).getByRole('button', { name: 'Supprimer la prestation Services portuaires' }));
    confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    await user.click(within(confirmation).getByRole('button', { name: 'Confirmer' }));
    expect(screen.queryByRole('row', { name: /Services portuaires/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Assistance technique/ })).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*665,00\s*€/);
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

  it('adds several expense attachments cumulatively and preserves saved files when editing or cancelling', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:expense-attachment-test');
      static revokeObjectURL = vi.fn();
    });
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.type(within(dialog).getByLabelText('Fournisseur'), 'Fournisseur test local');
    await user.type(within(dialog).getByLabelText('Spécialité'), 'Assistance technique');
    await user.type(within(dialog).getByLabelText('N° facture'), 'TEST-125');
    await user.type(within(dialog).getByLabelText('Montant HT', { exact: true }), '125');
    const invoice = new File(['facture de test'], 'facture-test.pdf', { type: 'application/pdf' });
    const photo = new File(['photo de test'], 'photo-test.png', { type: 'image/png' });
    const details = new File(['détail de test'], 'detail-test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const attachmentInput = within(dialog).getByLabelText('Pièces jointes');
    expect(attachmentInput).toHaveAttribute('multiple');
    await user.upload(attachmentInput, [invoice, photo]);
    await user.upload(attachmentInput, details);
    const attachmentList = within(dialog).getByRole('list', { name: 'Pièces jointes du frais' });
    expect(within(attachmentList).getAllByRole('listitem')).toHaveLength(3);
    expect(within(attachmentList).getByText('facture-test.pdf')).toBeInTheDocument();
    expect(within(attachmentList).getByText('detail-test.xlsx')).toBeInTheDocument();
    await user.click(within(attachmentList).getByRole('button', { name: 'Retirer photo-test.png' }));
    expect(attachmentInput).toHaveFocus();
    expect(within(attachmentList).queryByText('photo-test.png')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fournisseur / spécialité' })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Fournisseur test local.*TEST-125/ });
    expect(within(row).getByText('125,00 €')).toBeInTheDocument();
    expect(within(row).getByRole('radio', { name: 'Sélectionner Fournisseur test local' })).toBeChecked();
    expect(within(row).getByText('2 fichiers')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*080,00\s*€/);

    const showAttachments = within(row).getByRole('button', { name: 'Voir les 2 pièces de Fournisseur test local' });
    await user.click(showAttachments);
    const listDialog = screen.getByRole('dialog', { name: 'Pièces jointes — Fournisseur test local' });
    await user.click(within(listDialog).getByRole('button', { name: 'Ouvrir detail-test.xlsx' }));
    const preview = await screen.findByRole('dialog', { name: 'detail-test.xlsx' });
    expect(within(preview).getAllByRole('button', { name: 'Fermer' })[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(showAttachments).toHaveFocus();

    await user.click(within(row).getByRole('button', { name: 'Modifier le frais Fournisseur test local' }));
    let editor = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(editor).getByText('facture-test.pdf')).toBeInTheDocument();
    expect(within(editor).getByText('detail-test.xlsx')).toBeInTheDocument();
    const unsaved = new File(['pièce annulée'], 'piece-annulee.pdf', { type: 'application/pdf' });
    await user.upload(within(editor).getByLabelText('Pièces jointes'), unsaved);
    expect(within(editor).getByText('piece-annulee.pdf')).toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: 'Retirer facture-test.pdf' }));
    expect(within(editor).getByLabelText('Pièces jointes')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row).getByText('2 fichiers')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Modifier le frais Fournisseur test local' }));
    editor = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(editor).queryByText('piece-annulee.pdf')).not.toBeInTheDocument();
    expect(within(editor).getByText('facture-test.pdf')).toBeInTheDocument();
    expect(within(editor).getByText('detail-test.xlsx')).toBeInTheDocument();
    await user.clear(within(editor).getByLabelText('Montant HT', { exact: true }));
    await user.type(within(editor).getByLabelText('Montant HT', { exact: true }), '150');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    expect(within(row).getByText('2 fichiers')).toBeInTheDocument();
    expect(within(row).getByText('150,00 €')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*105,00\s*€/);
  });

  it('exports every saved attachment with its own blob and respects expense and PDF section exclusions', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
    const editor = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.type(within(editor).getByLabelText('Fournisseur'), 'Fournisseur pièces export');
    await user.type(within(editor).getByLabelText('Montant HT', { exact: true }), '125');
    const files = [
      new File(['facture export'], 'facture-export.pdf', { type: 'application/pdf' }),
      new File(['photo export'], 'photo-export.png', { type: 'image/png' }),
    ];
    await user.upload(within(editor).getByLabelText('Pièces jointes'), files);
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    const exportPackage = vi.spyOn(projectBilling, 'generateBillingExportPackage').mockRejectedValue(new Error('Export capturé pour le test'));
    await user.selectOptions(screen.getByLabelText('Fichier'), 'zip');
    await user.click(screen.getByRole('button', { name: 'Exporter le ZIP' }));
    expect(exportPackage).toHaveBeenCalledOnce();
    const [client, input, documents, format] = exportPackage.mock.calls[0];
    expect(format).toBe('zip');
    const expense = input.expenses.find((item) => item.supplier === 'Fournisseur pièces export');
    expect(expense).toBeDefined();
    const expenseDocuments = documents.filter((document) => document.chargeableExpenseId === expense!.id);
    expect(expenseDocuments).toHaveLength(2);
    expect(new Set(expenseDocuments.map((document) => document.objectPath)).size).toBe(2);
    for (const file of files) {
      const document = expenseDocuments.find((item) => item.fileName === file.name)!;
      expect(document.mimeType).toBe(file.type);
      expect(document.fileSizeBytes).toBe(file.size);
      const downloaded = await client.storage.from(document.bucketName).download(document.objectPath);
      expect(downloaded.error).toBeNull();
      expect(downloaded.data).toBe(file);
    }

    await user.click(screen.getByRole('checkbox', { name: 'Inclure le frais Fournisseur pièces export' }));
    await user.click(screen.getByRole('button', { name: 'Exporter le ZIP' }));
    expect(exportPackage).toHaveBeenCalledTimes(2);
    const [, excludedInput, excludedDocuments] = exportPackage.mock.calls[1];
    expect(excludedInput.expenses.find((item) => item.id === expense!.id)?.includeInPdf).toBe(false);
    expect(excludedDocuments.some((document) => document.chargeableExpenseId === expense!.id)).toBe(false);
    expect(excludedDocuments).toHaveLength(2);

    await user.click(screen.getByRole('checkbox', { name: 'Inclure le frais Fournisseur pièces export' }));
    await user.click(screen.getByRole('checkbox', { name: 'Inclure Services refacturables dans le PDF' }));
    await user.click(screen.getByRole('button', { name: 'Exporter le ZIP' }));
    expect(exportPackage).toHaveBeenCalledTimes(3);
    expect(exportPackage.mock.calls[2][1].period.includeExpensesInPdf).toBe(false);
    expect(exportPackage.mock.calls[2][2]).toEqual([]);
  });

  it('keeps attachments and amounts independent when expenses are created in different empty months at the same time', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    const januaryFile = new File(['pièce de janvier'], 'janvier.pdf', { type: 'application/pdf' });
    const februaryFile = new File(['pièce de février'], 'fevrier.pdf', { type: 'application/pdf' });
    const addExpense = async (month: string, supplier: string, amount: string, file: File) => {
      fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: month } });
      await user.click(screen.getByRole('button', { name: 'Ajouter un frais' }));
      const editor = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
      fireEvent.change(within(editor).getByLabelText('Fournisseur'), { target: { value: supplier } });
      fireEvent.change(within(editor).getByLabelText('Montant HT', { exact: true }), { target: { value: amount } });
      await user.upload(within(editor).getByLabelText('Pièces jointes'), file);
      await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    };
    await addExpense('2027-01', 'Fournisseur janvier', '125', januaryFile);
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/125,00\s*€/);
    await addExpense('2027-02', 'Fournisseur février', '250', februaryFile);
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/250,00\s*€/);

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2027-01' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/125,00\s*€/);
    await user.click(screen.getByRole('button', { name: 'Modifier le frais Fournisseur janvier' }));
    let editor = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(editor).getByText('janvier.pdf')).toBeInTheDocument();
    expect(within(editor).queryByText('fevrier.pdf')).not.toBeInTheDocument();
    fireEvent.change(within(editor).getByLabelText('Montant HT', { exact: true }), { target: { value: '135' } });
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/135,00\s*€/);

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2027-02' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/250,00\s*€/);
    await user.click(screen.getByRole('button', { name: 'Modifier le frais Fournisseur février' }));
    editor = screen.getByRole('dialog', { name: 'Modifier le frais imputable' });
    expect(within(editor).getByText('fevrier.pdf')).toBeInTheDocument();
    expect(within(editor).queryByText('janvier.pdf')).not.toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: 'Annuler' }));

    const exportPackage = vi.spyOn(projectBilling, 'generateBillingExportPackage').mockRejectedValue(new Error('Export capturé pour le test'));
    await user.selectOptions(screen.getByLabelText('Fichier'), 'zip');
    for (const [month, file, total] of [
      ['2027-01', januaryFile, /135,00\s*€/],
      ['2027-02', februaryFile, /250,00\s*€/],
    ] as const) {
      fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: month } });
      expect(screen.getByTestId('billing-total')).toHaveTextContent(total);
      await user.click(screen.getByRole('button', { name: 'Exporter le ZIP' }));
      const [client, , documents] = exportPackage.mock.calls.at(-1)!;
      expect(documents).toHaveLength(1);
      expect(documents[0].fileName).toBe(file.name);
      const downloaded = await client.storage.from(documents[0].bucketName).download(documents[0].objectPath);
      expect(downloaded.data).toBe(file);
    }
    expect(exportPackage).toHaveBeenCalledTimes(2);
  });

  it('edits a new raw line inside the table and includes its amount only once saved', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    let editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });
    expect(within(editor).getByRole('row', { name: 'Nouvelle ligne brute' })).toBeInTheDocument();
    expect(within(editor).getByLabelText('Désignation libre')).toHaveValue('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' })).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    await user.click(within(editor).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('rowgroup', { name: 'Saisie de la ligne brute' })).not.toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });

    await user.type(within(editor).getByLabelText('Désignation libre'), 'Assistance brute locale');
    fireEvent.change(within(editor).getByLabelText('Date'), { target: { value: '2026-10-08' } });
    await user.selectOptions(within(editor).getByLabelText('Navire'), 'GOURY');
    const quantity = within(editor).getByLabelText('Quantité');
    await user.clear(quantity);
    await user.type(quantity, '2');
    const unitAmount = within(editor).getByLabelText('Prix unitaire HT');
    await user.clear(unitAmount);
    await user.type(unitAmount, '62.5');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('rowgroup', { name: 'Saisie de la ligne brute' })).not.toBeInTheDocument();
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
      const editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });
      await user.type(within(editor).getByLabelText('Désignation libre'), designation);
      fireEvent.change(within(editor).getByLabelText('Date'), { target: { value: date } });
      await user.selectOptions(within(editor).getByLabelText('Navire'), vessel);
      await user.clear(within(editor).getByLabelText('Quantité'));
      await user.type(within(editor).getByLabelText('Quantité'), quantity);
      await user.clear(within(editor).getByLabelText('Prix unitaire HT'));
      await user.type(within(editor).getByLabelText('Prix unitaire HT'), price);
      await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
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

    expect(screen.queryByRole('button', { name: 'Actions de la ligne brute sélectionnée' })).not.toBeInTheDocument();
    await user.click(within(copies[0]).getByRole('button', { name: 'Modifier la ligne brute Dernière saisie' }));
    const editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });
    expect(within(editor).getByRole('row', { name: 'Modifier la ligne brute' })).toBeInTheDocument();
    expect(within(editor).getByLabelText('Désignation libre')).toHaveValue('Dernière saisie');
    expect(within(editor).getByLabelText('Date')).toHaveValue('2026-10-07');
    expect(within(editor).getByLabelText('Navire')).toHaveValue('JERSEY');
    expect(within(editor).getByLabelText('Quantité')).toHaveValue(2);
    expect(within(editor).getByLabelText('Prix unitaire HT')).toHaveValue(62.5);
    await user.clear(within(editor).getByLabelText('Désignation libre'));
    await user.type(within(editor).getByLabelText('Désignation libre'), 'Dernière saisie modifiée');
    await user.clear(within(editor).getByLabelText('Prix unitaire HT'));
    await user.type(within(editor).getByLabelText('Prix unitaire HT'), '70');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer' }));
    const modified = screen.getByRole('row', { name: /Dernière saisie modifiée/ });
    expect(within(modified).getByText('140,00 €')).toBeInTheDocument();
    expect(within(copies[1]).getByText('125,00 €')).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*270,00\s*€/);

    await user.click(screen.getByRole('radio', { name: 'Sélectionner Première saisie' }));
    await user.click(within(modified).getByRole('button', { name: 'Supprimer la ligne brute Dernière saisie modifiée' }));
    let confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    expect(within(confirmation).getByText('Supprimer « Dernière saisie modifiée » de la démonstration ?')).toBeInTheDocument();
    await user.click(within(confirmation).getByRole('button', { name: 'Annuler' }));
    expect(modified).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*270,00\s*€/);
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Première saisie' }));
    await user.click(within(modified).getByRole('button', { name: 'Supprimer la ligne brute Dernière saisie modifiée' }));
    confirmation = screen.getByRole('dialog', { name: 'Confirmer la suppression' });
    await user.click(within(confirmation).getByRole('button', { name: 'Confirmer' }));
    expect(screen.queryByRole('row', { name: /Dernière saisie modifiée/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Première saisie/ })).toBeInTheDocument();
    expect(copies[1]).toBeInTheDocument();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/11\s*130,00\s*€/);

    await user.click(screen.getByRole('button', { name: 'Archiver le projet' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Archiver le projet' })).getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('button', { name: 'Ajouter une ligne' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dupliquer la ligne' })).toBeDisabled();
  });

  it('blocks raw additions and duplication while a PDF is being generated', async () => {
    const user = userEvent.setup();
    renderCustomBillingPreview();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
    const editor = screen.getByRole('rowgroup', { name: 'Saisie de la ligne brute' });
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
