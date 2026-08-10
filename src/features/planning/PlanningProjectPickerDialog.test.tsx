import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningProjectPickerDialog } from './PlanningProjectPickerDialog';

const vessel = { id: 1, name: 'GOURY', acronym: 'GY', registrationNumber: '934968', active: true };

function createClient() {
  const rpc = vi.fn().mockImplementation((functionName: string) => {
    if (functionName === 'planning_project_catalog') {
      return Promise.resolve({
        data: [
          { id: 703, project_code: 'SP-52', title: 'Hors Projet', client_name: '', status: 'A planifier', description: '', starts_on: '', ends_on: '' },
          { id: 701, project_code: 'P267', title: 'Remorquage Cherbourg', client_name: 'Cherbourg Port', status: 'Confirmé', description: 'Mission portuaire', starts_on: '2026-07-18', ends_on: '2026-07-19' },
          { id: 702, project_code: 'P266', title: 'Assistance portuaire', client_name: 'Ports du Cotentin', status: 'A planifier', description: '', starts_on: '', ends_on: '' },
        ],
        error: null,
      });
    }
    throw new Error(`Unexpected RPC ${functionName}`);
  });
  return { client: { rpc }, rpc };
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof PlanningProjectPickerDialog>> = {}) {
  const { client } = createClient();
  const props: React.ComponentProps<typeof PlanningProjectPickerDialog> = {
    canCreateProject: true,
    client: client as never,
    date: '2026-07-18',
    editable: true,
    onClose: vi.fn(),
    onCreateProject: vi.fn(),
    onSelectProject: vi.fn(),
    vessel,
    ...overrides,
  };
  return { ...render(<PlanningProjectPickerDialog {...props} />), props };
}

describe('PlanningProjectPickerDialog', () => {
  it('shows the newest numeric project codes first and filters the catalog', async () => {
    const user = userEvent.setup();
    renderPicker();

    await screen.findByRole('option', { name: /P267.*Remorquage Cherbourg/ });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('P267'),
      expect.stringContaining('P266'),
      expect.stringContaining('SP-52'),
    ]);
    await user.type(screen.getByLabelText('Rechercher un projet par mot-clé'), 'remorquage');
    expect(screen.queryByRole('option', { name: /P266.*Assistance portuaire/ })).not.toBeInTheDocument();
  });

  it('returns the selected contract so the shared operation editor can open', async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();
    renderPicker({ onSelectProject });

    await user.click(await screen.findByRole('option', { name: /P267.*Remorquage Cherbourg/ }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith(expect.objectContaining({ id: 701, projectCode: 'P267' })));
  });

  it('routes project creation to the full Projects assistant for authorized roles', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    renderPicker({ onCreateProject });
    await screen.findByRole('option', { name: /P267/ });
    await user.click(screen.getByRole('button', { name: 'Créer un nouveau projet' }));
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it('disables project creation for Armement and all mutations in read-only mode', async () => {
    renderPicker({ canCreateProject: false, editable: false });
    expect(await screen.findByText('Mode lecture seule')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un nouveau projet' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
  });
});
