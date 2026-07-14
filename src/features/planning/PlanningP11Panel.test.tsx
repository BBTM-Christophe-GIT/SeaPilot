import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningP11Panel } from './PlanningP11Panel';
import type { PlanningOverview } from './planningQueries';
import {
  applyPlanningTemplate,
  fetchPlanningP11Data,
  savePlanningManningMatrix,
  savePlanningRotation,
  savePlanningTemplate,
  updatePlanningRotationOccurrence,
} from './planningP11Queries';

vi.mock('./planningP11Queries', () => ({
  applyPlanningTemplate: vi.fn(),
  fetchPlanningP11Data: vi.fn(),
  savePlanningManningMatrix: vi.fn(),
  savePlanningRotation: vi.fn(),
  savePlanningTemplate: vi.fn(),
  updatePlanningRotationOccurrence: vi.fn(),
}));

const client = {} as SupabaseClient;
const overview: PlanningOverview = {
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  assignments: [], days: [], periods: [], projects: [], certificates: [], hrDocuments: [], rules: [],
  publications: [], versions: [], history: [], handovers: [], derogations: [], derogationHistory: [],
};

describe('Planning P1.1 panel', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningP11Data).mockResolvedValue({ rotations: [], templates: [], matrices: [], certificates: [] });
    vi.mocked(savePlanningRotation).mockResolvedValue(5);
    vi.mocked(savePlanningTemplate).mockResolvedValue(6);
    vi.mocked(savePlanningManningMatrix).mockResolvedValue(7);
    vi.mocked(updatePlanningRotationOccurrence).mockResolvedValue(1);
    vi.mocked(applyPlanningTemplate).mockResolvedValue({ entityKind: 'project', entityId: 8 });
  });

  it('generates a 14/14 rotation and refreshes only assignments', async () => {
    const user = userEvent.setup();
    const onOperationalChange = vi.fn().mockResolvedValue(undefined);
    render(<PlanningP11Panel canManageManning canManageRotations canManageTemplates client={client} onClose={vi.fn()} onOperationalChange={onOperationalChange} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle rotation' }));
    const form = screen.getByRole('button', { name: 'Générer la série' }).closest('form')!;
    expect(within(form).getByLabelText('Rythme')).toHaveValue('14_14');
    expect(within(form).getByLabelText('Période embarquée')).toHaveValue(14);
    expect(within(form).getByLabelText('Période de repos')).toHaveValue(14);
    await user.click(within(form).getByRole('button', { name: 'Générer la série' }));
    await waitFor(() => expect(savePlanningRotation).toHaveBeenCalledWith(client, expect.objectContaining({ patternKey: '14_14', onboardDays: 14, restDays: 14, occurrenceCount: 6 })));
    expect(onOperationalChange).toHaveBeenCalledWith('assignments');
    expect(await screen.findByText('6 occurrence(s) générée(s) dans les affectations.')).toBeInTheDocument();
  });

  it('confirms the saved rotation when the operational refresh fails', async () => {
    const user = userEvent.setup();
    const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onOperationalChange = vi.fn().mockRejectedValue(new Error('refresh failed'));
    render(<PlanningP11Panel canManageManning canManageRotations canManageTemplates client={client} onClose={vi.fn()} onOperationalChange={onOperationalChange} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle rotation' }));
    await user.click(screen.getByRole('button', { name: 'Générer la série' }));

    expect(await screen.findByText('La rotation et ses 6 occurrence(s) sont enregistrées, mais l’affichage n’a pas pu être actualisé. Utilisez le bouton Actualiser.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Générer la série' })).not.toBeInTheDocument();
    expect(screen.queryByText('Impossible d’enregistrer la rotation.')).not.toBeInTheDocument();
    expect(consoleWarning).toHaveBeenCalledWith('[Planning]', expect.objectContaining({ operation: 'refresh-after-save-rotation' }));
    consoleWarning.mockRestore();
  });

  it('shows vacancies in read-only mode and does not expose matrix editing', async () => {
    vi.mocked(fetchPlanningP11Data).mockResolvedValue({
      rotations: [], templates: [], certificates: [], matrices: [{
        id: 2, vesselId: 1, name: 'Armement COTENTIN', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', version: 1,
        requirements: [{ id: 3, matrixId: 2, functionLabel: 'Capitaine', minimumCount: 1, targetCount: 1, requiredCertificates: [], requiredQualifications: [], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }],
      }],
    });
    const user = userEvent.setup();
    render(<PlanningP11Panel canManageManning={false} canManageRotations={false} canManageTemplates={false} client={client} onClose={vi.fn()} onOperationalChange={vi.fn()} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    await user.click(screen.getByRole('tab', { name: 'Décision d’effectif' }));
    expect(await screen.findByRole('heading', { name: 'Armement COTENTIN' })).toBeInTheDocument();
    const row = screen.getByRole('cell', { name: 'Capitaine' }).closest('tr')!;
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: 'Configurer' })).not.toBeInTheDocument();
  });

  it('uses a Situation selector and a STCW multi-select without the removed matrix fields', async () => {
    vi.mocked(fetchPlanningP11Data).mockResolvedValue({
      rotations: [], templates: [], matrices: [],
      certificates: [{ id: 1, sourceItemId: 34, name: 'Chef de Quart 500', category: 'Pont', stcwRules: ['II/3'] }],
    });
    const user = userEvent.setup();
    render(<PlanningP11Panel canManageManning canManageRotations canManageTemplates client={client} onClose={vi.fn()} onOperationalChange={vi.fn()} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    await user.click(screen.getByRole('tab', { name: 'Décision d’effectif' }));
    await user.click(screen.getByRole('button', { name: 'Nouvelle décision' }));

    expect(screen.getByLabelText('Situation')).toHaveValue('Situation 1');
    expect(screen.getAllByRole('option', { name: /Situation/ })).toHaveLength(6);
    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cible')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Qualifications')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Formations')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Restrictions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Applicable à partir du')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Fonction'), 'Capitaine');
    await user.click(screen.getByRole('checkbox', { name: /Chef de Quart 500/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la décision' }));

    await waitFor(() => expect(savePlanningManningMatrix).toHaveBeenCalledWith(client, expect.objectContaining({
      name: 'Situation 1',
      status: 'active',
      requirements: [expect.objectContaining({ minimumCount: 1, targetCount: 1, requiredCertificates: ['Chef de Quart 500'], requiredQualifications: [], requiredTrainings: [], restrictions: [] })],
    })));
  });
});
