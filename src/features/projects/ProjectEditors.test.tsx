import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectEditor, ProjectPlanningEditor } from './ProjectEditors';

const mutationMocks = vi.hoisted(() => ({
  saveProject: vi.fn(),
  saveProjectContractHirePeriods: vi.fn(),
}));

vi.mock('./projectMutations', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectMutations')>(),
  saveProject: mutationMocks.saveProject,
  saveProjectContractHirePeriods: mutationMocks.saveProjectContractHirePeriods,
}));

const project = {
  id: 145,
  projectCode: 'P145',
  title: 'OIL SPILL SAIPEM COU',
  description: 'Contrat antipollution',
  startsOn: '2026-08-10',
  endsOn: '2026-08-12',
};
const vessels = [
  { id: 1, name: 'LE ROZEL', acronym: 'LRZ', active: true, fleetExitOn: '', sharePointItemId: '' },
  { id: 2, name: 'SUROIT', acronym: 'SRT', active: true, fleetExitOn: '', sharePointItemId: '' },
];

function renderEditor(canViewCharterHire: boolean) {
  return render(
    <ProjectPlanningEditor
      canViewCharterHire={canViewCharterHire}
      client={{ rpc: vi.fn() } as never}
      initialVesselIds={[1]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      project={project}
      vessels={vessels}
    />,
  );
}

describe('ProjectPlanningEditor permissions', () => {
  it('never renders charter-hire controls for non Admin/Direction profiles', () => {
    renderEditor(false);
    expect(screen.queryByLabelText('Loyer d’affrètement')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un navire' })).toBeInTheDocument();
  });

  it('renders charter-hire controls for Admin/Direction profiles', () => {
    renderEditor(true);
    expect(screen.getByLabelText('Loyer d’affrètement')).toBeInTheDocument();
    expect(screen.getByLabelText('Devise')).toBeInTheDocument();
  });
});

describe('ProjectEditor contract hire periods', () => {
  it('does not rewrite an unchanged historical project while its contract snapshot is missing', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <ProjectEditor
        client={{ rpc: vi.fn() } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        project={{
          ...project,
          id: 60,
          clientId: null,
          projectCode: 'P268',
          status: 'Non validé',
          updatedAt: '2026-08-07T08:05:49Z',
        } as never}
        statuses={['Non validé']}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }));

    expect(mutationMocks.saveProject).not.toHaveBeenCalled();
    expect(mutationMocks.saveProjectContractHirePeriods).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 60, projectCode: 'P268' }));
  });

  it('saves a changed hire schedule without rewriting an unchanged project', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mutationMocks.saveProjectContractHirePeriods.mockResolvedValue(undefined);

    render(
      <ProjectEditor
        client={{ rpc: vi.fn() } as never}
        clients={[]}
        contract={{
          charterHire: 4450,
          hireCurrency: 'EUR',
          hirePeriods: [{
            charterHire: 4450,
            contractId: 3,
            endsOn: '2025-06-20',
            hireCurrency: 'EUR',
            hireUnit: 'Journalier',
            id: 1,
            projectId: 2,
            startsOn: '2024-05-31',
          }],
          hireUnit: 'Journalier',
        } as never}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        project={{
          ...project,
          clientId: null,
          projectCode: 'P144',
          status: 'Non validé',
          updatedAt: '2026-08-10T10:00:00Z',
        } as never}
        statuses={['Non validé']}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Offre commerciale/ }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une période' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }));

    await waitFor(() => {
      expect(mutationMocks.saveProjectContractHirePeriods).toHaveBeenCalledWith(
        expect.anything(),
        145,
        expect.arrayContaining([
          expect.objectContaining({ startsOn: '2024-05-31', charterHire: 4450 }),
          expect.objectContaining({ startsOn: '2025-06-21', charterHire: 4450 }),
        ]),
      );
    });
    expect(mutationMocks.saveProject).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 145, projectCode: 'P144' }));
  });
});
