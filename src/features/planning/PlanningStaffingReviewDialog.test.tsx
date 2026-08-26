import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningStaffingReviewDialog } from './PlanningStaffingReviewDialog';
import type { PlanningStaffingBoardStatus } from './planningStaffingQueries';

const status: PlanningStaffingBoardStatus = {
  vesselId: 7,
  watchGroup: 'Bordée 1',
  workDate: '2026-08-03',
  matrixId: 12,
  matrixName: 'Situation 1',
  composition: [
    { assignmentId: 101, personId: 10, personName: 'Camille CAPITAINE', hrFunctionLabel: 'Capitaine', planningFunctionLabel: '', confirmationStatus: 'provisional', startsOn: '2026-08-03', endsOn: '2026-08-10' },
    { assignmentId: 102, personId: 11, personName: 'Morgan CAPITAINE', hrFunctionLabel: 'Capitaine', planningFunctionLabel: '', confirmationStatus: 'provisional', startsOn: '2026-08-03', endsOn: '2026-08-10' },
    { assignmentId: 103, personId: 20, personName: 'Alex MARIN', hrFunctionLabel: 'Matelot', planningFunctionLabel: 'Matelot Qualifié', confirmationStatus: 'provisional', startsOn: '2026-08-03', endsOn: '2026-08-10' },
  ],
  discrepancies: [{
    type: 'credential_missing', severity: 'blocking', message: 'Brevet Capitaine 500 manquant.',
    requirementId: 44, functionLabel: 'Capitaine', personId: 10, personName: 'Camille CAPITAINE',
    credentialLabel: 'Capitaine 500', derogation: false,
  }],
  blockingCount: 2,
  warningCount: 0,
  publishable: false,
};

describe('PlanningStaffingReviewDialog', () => {
  it('keeps the HR function read-only and confirms Planning functions for the entire joined assignments', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PlanningStaffingReviewDialog isSaving={false} onClose={vi.fn()} onSave={onSave} status={status} vesselName="SUROIT" />);

    expect(screen.getAllByRole('cell', { name: 'Capitaine' })).toHaveLength(2);
    expect(screen.getByText(/La fonction RH reste inchangée/)).toBeInTheDocument();
    expect(screen.getAllByText('2026-08-03 → 2026-08-10')).toHaveLength(3);
    expect(screen.getAllByRole('option', { name: '2nd Mécanicien' })).toHaveLength(3);

    await user.selectOptions(screen.getByLabelText('Fonction Planning de Camille CAPITAINE'), 'Capitaine');
    await user.selectOptions(screen.getByLabelText('Fonction Planning de Morgan CAPITAINE'), '2nd Capitaine');
    await user.click(screen.getByRole('button', { name: 'Confirmer les fonctions et les dérogations' }));

    expect(onSave).toHaveBeenCalledWith([
      { assignmentId: 101, functionLabel: 'Capitaine' },
      { assignmentId: 102, functionLabel: '2nd Capitaine' },
      { assignmentId: 103, functionLabel: 'Matelot Qualifié' },
    ], []);
  });

  it('requires a motivated derogation before forwarding a missing credential exception', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PlanningStaffingReviewDialog isSaving={false} onClose={vi.fn()} onSave={onSave} status={status} vesselName="SUROIT" />);

    await user.selectOptions(screen.getByLabelText('Fonction Planning de Camille CAPITAINE'), 'Capitaine');
    await user.selectOptions(screen.getByLabelText('Fonction Planning de Morgan CAPITAINE'), '2nd Capitaine');
    await user.click(screen.getByRole('checkbox', { name: 'Dérogation' }));
    expect(screen.getByRole('button', { name: 'Confirmer les fonctions et les dérogations' })).toBeDisabled();

    await user.type(screen.getByLabelText('Justification de la dérogation Capitaine 500'), 'Autorisation exceptionnelle documentée.');
    await user.click(screen.getByRole('button', { name: 'Confirmer les fonctions et les dérogations' }));

    expect(onSave).toHaveBeenCalledWith(expect.any(Array), [{
      discrepancy: status.discrepancies[0],
      reason: 'Autorisation exceptionnelle documentée.',
    }]);
  });
});
