import { createPortal } from 'react-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SalaryGridDialog } from './SalaryGridDialog';
import { loadHrSalaryGrid, saveHrSalaryGrid, type HrSalaryGrid } from './salaryGridQueries';

vi.mock('./salaryGridQueries', () => ({ loadHrSalaryGrid: vi.fn(), saveHrSalaryGrid: vi.fn() }));
const client = {} as SupabaseClient;
const grid: HrSalaryGrid = { companyId: 1, revision: 7, updatedAt: '2026-11-04T08:00:00Z', rows: [{
  id: 'poste-a', positionLabel: 'Poste A', ccn: 'Officier', enimCategory: '12',
  conventionalAnnualBase: 30000, indexationPercent: 25, annualGross: 37500,
  annualPremium: 2500, totalAnnualBase: 43200, active: true,
}] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadHrSalaryGrid).mockResolvedValue(grid);
  vi.mocked(saveHrSalaryGrid).mockResolvedValue({ ...grid, revision: 8 });
});

describe('salary grid management dialog', () => {
  it('edits all source columns, previews monthly pay and saves with the loaded revision without submitting the profile', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn(), onClose = vi.fn(), profileSubmit = vi.fn();
    render(<form onSubmit={profileSubmit}>{createPortal(<SalaryGridDialog client={client} onClose={onClose} onSaved={onSaved} />, document.body)}</form>);
    const total = await screen.findByLabelText('Total annuel de base · ligne 1');
    for (const label of ['Poste', 'CCN', 'Catégorie ENIM', 'Salaire de base conventionnel', 'Taux indexation (%)', 'Annuel brut', 'Prime annuelle conventionnelle', 'Total annuel de base']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    fireEvent.change(total, { target: { value: '51 900,00' } });
    expect(screen.getByLabelText('Mensuel brut · ligne 1')).toHaveTextContent('4 325,00 €');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    await waitFor(() => expect(saveHrSalaryGrid).toHaveBeenCalledWith(client, [{ ...grid.rows[0], totalAnnualBase: 51900 }], 7));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 8 }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(profileSubmit).not.toHaveBeenCalled();
  });

  it('preserves draft edits and stays open when another administrator has updated the grid', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn(), onClose = vi.fn();
    vi.mocked(saveHrSalaryGrid).mockRejectedValue(new Error('La grille a changé. Rechargez-la avant de l’enregistrer.'));
    render(<SalaryGridDialog client={client} onSaved={onSaved} onClose={onClose} />);
    fireEvent.change(await screen.findByLabelText('Total annuel de base · ligne 1'), { target: { value: '60000' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La grille a changé.');
    expect(screen.getByLabelText('Total annuel de base · ligne 1')).toHaveValue('60000');
    expect(onSaved).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });

  it('adds and removes draft positions while preserving the original stable row identity', async () => {
    const user = userEvent.setup();
    render(<SalaryGridDialog client={client} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByLabelText('Poste · ligne 1');
    await user.click(screen.getByRole('button', { name: 'Ajouter un poste' }));
    expect(screen.getByLabelText('Poste · ligne 2')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Retirer Ligne 2' }));
    expect(screen.queryByLabelText('Poste · ligne 2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    await waitFor(() => expect(saveHrSalaryGrid).toHaveBeenCalledWith(client, grid.rows, grid.revision));
  });

  it('reloads the latest grid only after the user explicitly discards a conflicting draft', async () => {
    const user = userEvent.setup();
    vi.mocked(saveHrSalaryGrid).mockRejectedValue(new Error('La grille a changé. Rechargez-la avant de l’enregistrer.'));
    render(<SalaryGridDialog client={client} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Total annuel de base · ligne 1'), { target: { value: '60000' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Total annuel de base · ligne 1')).toHaveValue('60000');
    vi.mocked(loadHrSalaryGrid).mockResolvedValueOnce({ ...grid, revision: 9, rows: [{ ...grid.rows[0], totalAnnualBase: 55000 }] });
    await user.click(screen.getByRole('button', { name: 'Recharger la grille' }));
    await waitFor(() => expect(screen.getByLabelText('Total annuel de base · ligne 1')).toHaveValue('55000'));
    expect(loadHrSalaryGrid).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed source amounts before calling the server', async () => {
    const user = userEvent.setup();
    render(<SalaryGridDialog client={client} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Annuel brut · ligne 1'), { target: { value: '1e5' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Annuel brut');
    expect(saveHrSalaryGrid).not.toHaveBeenCalled();
  });

  it('can retry an initially failed grid load', async () => {
    const user = userEvent.setup();
    vi.mocked(loadHrSalaryGrid).mockRejectedValueOnce(new Error('Grille indisponible')).mockResolvedValueOnce(grid);
    render(<SalaryGridDialog client={client} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Grille indisponible');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByLabelText('Poste · ligne 1')).toHaveValue('Poste A');
  });
});
