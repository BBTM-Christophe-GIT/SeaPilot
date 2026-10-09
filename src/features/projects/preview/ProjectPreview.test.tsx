import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectPreview } from './ProjectPreview';

beforeEach(() => {
  window.history.replaceState({}, '', '/preview/projects/index.html');
});
afterEach(cleanup);

describe('interactive project billing preview', () => {
  it('opens each reference directly from the shared module ribbon and restores keyboard focus', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
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
    render(<ProjectPreview />);
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
    await user.click(within(projects).getByRole('button', { name: 'Actualiser' }));
    expect(screen.getByRole('status')).toHaveTextContent('Données de démonstration actualisées.');
    await user.click(within(projects).getByRole('button', { name: 'Réinitialiser la démonstration' }));
    expect(within(projects).getByRole('button', { name: 'Modifier le projet' })).toBeEnabled();
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
  });

  it('updates the export total when a DPR day and a full billing section are excluded', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);

    await user.click(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/8\s*555,00\s*€/);
    expect(screen.getByRole('checkbox', { name: 'Inclure la journée du 2026-10-05' })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestations BBTM dans le PDF' }));
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/8\s*215,00\s*€/);
    expect(screen.getByRole('heading', { name: /^P264 — Assistance offshore/ })).toHaveTextContent('Validé');
  });

  it('enables modification after choosing a supplier and applies the edited amount', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^Services refacturables/ }));
    await user.click(screen.getByRole('radio', { name: 'Sélectionner Fournisseur Démonstration' }));
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
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
    render(<ProjectPreview />);
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
    render(<ProjectPreview />);
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ajouter un frais' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un frais imputable' });
    await user.type(within(dialog).getByLabelText('Fournisseur'), 'Fournisseur novembre');
    await user.type(within(dialog).getByLabelText('Montant HT', { exact: true }), '125');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Custom DPR dates remain in October; the expense belongs to November.
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/9\s*725,00\s*€/);

    await user.clear(screen.getByLabelText('Référence client'));
    await user.type(screen.getByLabelText('Référence client'), 'DEMO-NOVEMBRE');
    await user.tab();
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-10' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    await user.click(screen.getByRole('button', { name: /^P263 — Remorquage côtier/ }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-P263-2026');
    await user.click(screen.getByRole('button', { name: /^P264 — Assistance offshore/ }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestations BBTM dans le PDF' }));
    await user.clear(screen.getByLabelText('Référence client'));
    await user.type(screen.getByLabelText('Référence client'), 'DEMO-SANS-BBTM');
    await user.tab();
    await user.click(screen.getByRole('checkbox', { name: 'Inclure Prestations BBTM dans le PDF' }));
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/9\s*725,00\s*€/);
  });

  it('adds an expense through the command bar and exposes its supplier and new total', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ajouter un frais' }));
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

  it('adds a raw billing line through the command bar and includes its amount in the total', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ajouter une ligne brute' }));
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
});
