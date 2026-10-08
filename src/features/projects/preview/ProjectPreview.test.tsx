import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectPreview } from './ProjectPreview';

beforeEach(() => {
  window.history.replaceState({}, '', '/preview/projects/index.html');
});
afterEach(cleanup);

describe('interactive project billing preview', () => {
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

  it('requires saving a new monthly sheet before adding lines or exporting', async () => {
    const user = userEvent.setup();
    render(<ProjectPreview />);
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled();
    expect(screen.getByText('Enregistrez la fiche du mois avant d’ajouter des frais ou d’exporter.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Référence client'), 'DEMO-NOVEMBRE');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await user.click(screen.getByRole('menuitem', { name: 'Enregistrer les paramètres' }));
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-10' } });
    expect(screen.getByTestId('billing-total')).toHaveTextContent(/10\s*955,00\s*€/);
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-P264-2026');
    fireEvent.change(screen.getByLabelText('Mois de facturation'), { target: { value: '2026-11' } });
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeEnabled();
    expect(screen.getByLabelText('Référence client')).toHaveValue('DEMO-NOVEMBRE');
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
});
