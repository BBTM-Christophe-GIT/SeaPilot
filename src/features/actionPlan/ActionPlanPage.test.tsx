import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionPlanPage } from './ActionPlanPage';

const pontActionRow = {
  id: 810,
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_code: 'P-2026-014',
  project_title: 'Campagne Atlantique 2026',
  vessel_id: 12,
  vessel_sharepoint_item_id: '12',
  vessel_name: 'COTENTIN',
  category_key: 'audit',
  action_type: 'Audit',
  audit_type: 'Interne',
  title: 'Audit pont COTENTIN',
  status: 'Ouvert',
  priority_label: 'Haute',
  opened_on: '2026-07-03',
  due_on: '2026-07-31',
  owner_name: 'Arthur MAREST',
  auditor_name: 'Jean MARTIN',
  description: 'Controle pont',
  corrective_action: 'Remplacer garde-corps',
  source_label: 'SharePoint',
};

const machineActionRow = {
  id: 812,
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_code: 'P-2026-015',
  project_title: 'Campagne Manche 2026',
  vessel_id: 13,
  vessel_sharepoint_item_id: '13',
  vessel_name: 'SUROIT',
  category_key: 'visit',
  action_type: 'Visite HSE',
  audit_type: 'Externe',
  title: 'Visite machine SUROIT',
  status: 'Clos',
  priority_label: 'Normale',
  opened_on: '2026-08-04',
  due_on: '2026-08-20',
  owner_name: 'Julien LECOCQ',
  auditor_name: 'Claire DURAND',
  description: 'Controle machine',
  corrective_action: 'Verifier filtration',
  source_label: 'SharePoint',
};

const pontDocumentRow = {
  id: 811,
  action_item_id: 810,
  action_sharepoint_item_id: '810',
  action_title: 'Audit pont COTENTIN',
  category_key: 'progress_sheet',
  title: 'FP Audit pont COTENTIN.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '811',
  file_url: 'https://sharepoint.test/fiche-progres/audit-pont.pdf',
  notes: '/sites/QHSE/Fiche de Progres/FP Audit pont COTENTIN.pdf',
};

const machineDocumentRow = {
  id: 813,
  action_item_id: 812,
  action_sharepoint_item_id: '812',
  action_title: 'Visite machine SUROIT',
  category_key: 'progress_sheet',
  title: 'FP Visite machine SUROIT.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '813',
  file_url: 'https://sharepoint.test/fiche-progres/visite-machine.pdf',
  notes: '/sites/QHSE/Fiche de Progres/FP Visite machine SUROIT.pdf',
};

function createClient(actions: unknown[] = [pontActionRow, machineActionRow], documents: unknown[] = [pontDocumentRow, machineDocumentRow]) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: pontActionRow, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'action_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: actions, error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'action_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: documents, error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedAction(createdAction: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdAction, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'action_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'action_documents') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('ActionPlanPage', () => {
  it('filters actions and progress sheets by status, priority, vessel, project, dates and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ActionPlanPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: "Plan d'action" })).toBeInTheDocument();
    expect(screen.getAllByText('Visite machine SUROIT').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText('Filtre statut action'), 'Ouvert');
    await user.selectOptions(screen.getByLabelText('Filtre priorite action'), 'Haute');
    await user.selectOptions(screen.getByLabelText('Filtre navire action'), 'COTENTIN');
    await user.selectOptions(screen.getByLabelText('Filtre projet action'), 'P-2026-014');
    fireEvent.change(screen.getByLabelText('Action depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText("Action jusqu'au"), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText('Recherche actions'), { target: { value: 'garde-corps' } });

    expect(screen.getAllByText('Audit pont COTENTIN').length).toBeGreaterThan(0);
    expect(screen.getByText('Remplacer garde-corps')).toBeInTheDocument();
    expect(screen.getByText('FP Audit pont COTENTIN.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Visite machine SUROIT')).not.toBeInTheDocument();
    expect(screen.queryByText('FP Visite machine SUROIT.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Actions ouvertes')).toHaveTextContent('1');
    expect(screen.getByLabelText('Actions haute priorite')).toHaveTextContent('1');
    expect(screen.getByLabelText('Fiches progres')).toHaveTextContent('1');
  });

  it('creates an action item for office roles', async () => {
    const user = userEvent.setup();
    const createdAction = {
      ...pontActionRow,
      id: 820,
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      vessel_name: 'COTENTIN',
      category_key: 'action',
      action_type: 'Action corrective',
      audit_type: 'Interne',
      title: 'Remise en etat rambarde',
      status: 'Ouvert',
      priority_label: 'Haute',
      opened_on: '2026-09-02',
      due_on: '2026-09-20',
      owner_name: 'Arthur MAREST',
      auditor_name: 'Jean MARTIN',
      description: 'Rambarde deformee',
      corrective_action: 'Remplacer section tribord',
      source_label: 'seapilot',
    };
    const { client, insert } = createClientWithCreatedAction(createdAction);

    render(<ActionPlanPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: "Plan d'action" });
    fireEvent.change(screen.getByLabelText('Titre action'), { target: { value: 'Remise en etat rambarde' } });
    fireEvent.change(screen.getByLabelText('Categorie action'), { target: { value: 'action' } });
    fireEvent.change(screen.getByLabelText('Type action'), { target: { value: 'Action corrective' } });
    fireEvent.change(screen.getByLabelText('Type audit'), { target: { value: 'Interne' } });
    fireEvent.change(screen.getByLabelText('Numero projet action'), { target: { value: 'P-2026-014' } });
    fireEvent.change(screen.getByLabelText('Nom projet action'), { target: { value: 'Campagne Atlantique 2026' } });
    fireEvent.change(screen.getByLabelText('Navire action'), { target: { value: 'COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Ouverture action'), { target: { value: '2026-09-02' } });
    fireEvent.change(screen.getByLabelText('Echeance action'), { target: { value: '2026-09-20' } });
    await user.selectOptions(screen.getByLabelText('Statut action'), 'Ouvert');
    await user.selectOptions(screen.getByLabelText('Priorite action'), 'Haute');
    fireEvent.change(screen.getByLabelText('Responsable action'), { target: { value: 'Arthur MAREST' } });
    fireEvent.change(screen.getByLabelText('Auditeur action'), { target: { value: 'Jean MARTIN' } });
    fireEvent.change(screen.getByLabelText('Description action'), { target: { value: 'Rambarde deformee' } });
    fireEvent.change(screen.getByLabelText('Correctif action'), { target: { value: 'Remplacer section tribord' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter action' }));

    expect(insert).toHaveBeenCalledWith({
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      vessel_name: 'COTENTIN',
      category_key: 'action',
      action_type: 'Action corrective',
      audit_type: 'Interne',
      title: 'Remise en etat rambarde',
      status: 'Ouvert',
      priority_label: 'Haute',
      opened_on: '2026-09-02',
      due_on: '2026-09-20',
      owner_name: 'Arthur MAREST',
      auditor_name: 'Jean MARTIN',
      description: 'Rambarde deformee',
      corrective_action: 'Remplacer section tribord',
      source_label: 'seapilot',
    });
    expect(await screen.findByText('Action ajoutee.')).toBeInTheDocument();
    expect(screen.getByText('Remise en etat rambarde')).toBeInTheDocument();
  });
});
