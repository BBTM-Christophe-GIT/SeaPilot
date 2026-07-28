import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningProjectPickerDialog } from './PlanningProjectPickerDialog';

const vessel = { id: 1, name: 'GOURY', acronym: 'GY', registrationNumber: '934968', active: true };
const occurrence = {
  id: 801,
  catalog_project_id: 701,
  title: 'P267 - Remorquage Cherbourg',
  starts_on: '2026-07-18',
  ends_on: '2026-07-18',
  description: 'Mission portuaire',
  client_name: 'Cherbourg Port',
  primary_vessel_id: 1,
  primary_vessel_name: 'GOURY',
  secondary_vessel_id: null,
  secondary_vessel_name: null,
  event_type: 'operation',
  responsible_name: null,
  status: 'A planifier',
  source_label: 'seapilot-planning',
};

function createClient() {
  const rpc = vi.fn().mockImplementation((functionName: string, args?: Record<string, unknown>) => {
    if (functionName === 'planning_project_catalog') {
      return Promise.resolve({
        data: [
          {
            id: 701,
            project_code: 'P267',
            title: 'Remorquage Cherbourg',
            client_name: 'Cherbourg Port',
            status: 'Confirmé',
            description: 'Mission portuaire',
            starts_on: '2026-07-18',
            ends_on: '2026-07-19',
          },
          {
            id: 702,
            project_code: 'P266',
            title: 'Assistance portuaire',
            client_name: 'Ports du Cotentin',
            status: 'A planifier',
            description: '',
            starts_on: '',
            ends_on: '',
          },
        ],
        error: null,
      });
    }
    if (functionName === 'planning_project_clients') {
      return Promise.resolve({ data: [{ id: 50, name: 'Cherbourg Port', active: true }], error: null });
    }
    if (functionName === 'planning_schedule_catalog_project') {
      return Promise.resolve({ data: [{ ...occurrence, catalog_project_id: args?.target_project_id }], error: null });
    }
    if (functionName === 'planning_create_and_schedule_project') {
      return Promise.resolve({
        data: [{
          ...occurrence,
          id: 802,
          catalog_project_id: 703,
          title: `P268 - ${String(args?.target_title || '')}`,
          status: args?.target_status,
          description: args?.target_description,
        }],
        error: null,
      });
    }
    if (functionName === 'planning_create_project_client') {
      return Promise.resolve({ data: [{ id: 51, name: args?.target_name, active: true }], error: null });
    }
    throw new Error(`Unexpected RPC ${functionName}`);
  });
  return { client: { rpc }, rpc };
}

describe('PlanningProjectPickerDialog', () => {
  it('searches the catalog and schedules the selected project on the vessel cell', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    const onScheduled = vi.fn();
    render(
      <PlanningProjectPickerDialog
        client={client as never}
        date="2026-07-18"
        editable
        onClose={vi.fn()}
        onScheduled={onScheduled}
        vessel={vessel}
      />,
    );

    expect(await screen.findByRole('option', { name: /P267.*Remorquage Cherbourg/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rechercher un projet par mot-clé'), 'remorquage');
    expect(screen.queryByRole('option', { name: /P266.*Assistance portuaire/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /P267.*Remorquage Cherbourg/ }));
    await user.click(screen.getByRole('button', { name: 'Ajouter au planning' }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(expect.objectContaining({
      catalogProjectId: 701,
      primaryVesselId: 1,
      startsOn: '2026-07-18',
    })));
    expect(rpc).toHaveBeenCalledWith('planning_schedule_catalog_project', expect.objectContaining({
      target_project_id: 701,
      target_primary_vessel_id: 1,
      target_starts_on: '2026-07-18',
    }));
  });

  it('shows only the collapsible Identification card and creates the project with its first occurrence', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    const onScheduled = vi.fn();
    render(
      <PlanningProjectPickerDialog
        client={client as never}
        date="2026-07-18"
        editable
        onClose={vi.fn()}
        onScheduled={onScheduled}
        vessel={vessel}
      />,
    );

    await screen.findByRole('option', { name: /P267.*Remorquage Cherbourg/ });
    await user.click(screen.getByRole('button', { name: 'Créer un nouveau projet' }));
    const dialog = screen.getByRole('dialog', { name: 'Créer un projet' });
    expect(within(dialog).getByText('Identification')).toBeInTheDocument();
    expect(within(dialog).queryByText('Offre commerciale')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Facturation')).not.toBeInTheDocument();

    const sectionToggle = within(dialog).getByRole('button', { name: /Identification/ });
    await user.click(sectionToggle);
    expect(within(dialog).queryByLabelText('Nom du projet *')).not.toBeInTheDocument();
    await user.click(sectionToggle);
    await user.type(within(dialog).getByLabelText('Nom du projet *'), 'Inspection annuelle');
    await user.selectOptions(within(dialog).getByLabelText('Client / affréteur'), '50');
    await user.clear(within(dialog).getByLabelText('Statut'));
    await user.type(within(dialog).getByLabelText('Statut'), 'Confirmé');
    await user.type(within(dialog).getByLabelText('Description'), 'Inspection de coque');
    await user.click(within(dialog).getByRole('button', { name: 'Créer et ajouter au planning' }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(expect.objectContaining({
      catalogProjectId: 703,
      title: 'P268 - Inspection annuelle',
    })));
    expect(rpc).toHaveBeenCalledWith('planning_create_and_schedule_project', expect.objectContaining({
      target_title: 'Inspection annuelle',
      target_client_id: 50,
      target_primary_vessel_id: 1,
      target_starts_on: '2026-07-18',
    }));
  });

  it('keeps mutating actions disabled in read-only mode', async () => {
    const { client } = createClient();
    render(
      <PlanningProjectPickerDialog
        client={client as never}
        date="2026-07-18"
        editable={false}
        onClose={vi.fn()}
        onScheduled={vi.fn()}
        vessel={vessel}
      />,
    );

    expect(await screen.findByText('Mode lecture seule')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un nouveau projet' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ajouter au planning' })).toBeDisabled();
  });
});
