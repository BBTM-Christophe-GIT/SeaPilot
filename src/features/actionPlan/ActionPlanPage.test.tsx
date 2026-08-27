import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { ActionPlanPage } from './ActionPlanPage';

const openAction = {
  id: 810,
  company_id: 1,
  vessel_id: 12,
  vessel_name: 'GOURY',
  category_key: 'audit',
  action_type_key: 'audit_internal',
  action_type: 'Audit Interne - BBTM',
  title: "Réaliser une analyse d'eau",
  status: 'Ecart Non Soldé',
  deviation_type: 'Non Conformité Majeure',
  opened_on: '2026-07-03',
  occurred_at: '2026-07-03T08:45:00+02:00',
  due_on: '2026-08-31',
  issuer_name: 'Christophe MINASSIAN',
  issuer_person_id: 1008,
  issuer_signature_snapshot: {},
  owner_name: 'Arthur MAREST',
  vessel_maneuver: 'Navire à quai',
  weather_conditions: 'Vent faible, mer belle',
  workflow_status: 'approved',
  corrective_action: 'Programmer le laboratoire',
  photo_1_path: '1/810/photo-source.jpg',
  photo_2_path: null,
  closure_photo_path: null,
  source_label: 'sharepoint',
  sharepoint_list_title: "Plan d'Action",
};

const closedAction = {
  ...openAction,
  id: 811,
  vessel_name: 'SUROIT',
  action_type_key: 'visit_hse',
  action_type: 'Visite HSE/Exploitation',
  title: 'Vérifier la filtration machine',
  status: 'Ecart Soldé',
  deviation_type: 'Remarque',
  closed_on: '2026-08-05',
  closure_photo_path: '1/811/preuve-traitement.jpg',
};

const actionTypes = [
  { type_key: 'audit_internal', label: 'Audit Interne - BBTM', family: 'audit', hse_classification: null, tracks_exposure_rate: false, sort_order: 40 },
  { type_key: 'lost_time_injury', label: 'Accident avec Arrêt de Travail (LTI)', family: 'event', hse_classification: 'LWDC', tracks_exposure_rate: true, sort_order: 210 },
  { type_key: 'first_aid_case', label: 'Accident sans arrêt de travail (FAC)', family: 'event', hse_classification: 'FAC', tracks_exposure_rate: true, sort_order: 240 },
];

function ordered(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  const chain = { order: vi.fn() } as { order: ReturnType<typeof vi.fn> };
  chain.order.mockReturnValue(Object.assign(result, chain));
  return chain;
}

function createClient(actions: unknown[] = [openAction, closedAction]) {
  const created = {
    ...openAction,
    id: 900,
    title: 'Accident pont arrière',
    action_type_key: 'lost_time_injury',
    action_type: 'Accident avec Arrêt de Travail (LTI)',
    issuer_name: 'Christophe MINASSIAN',
    source_label: 'seapilot',
  };
  const client = {
    storage: { from: vi.fn().mockReturnValue({
      createSignedUrls: vi.fn().mockImplementation((paths: string[]) => Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: `https://evidence.example/${path}` })), error: null,
      })),
    }) },
    rpc: vi.fn().mockImplementation((functionName: string, parameters?: Record<string, unknown>) => {
      if (functionName === 'action_item_create') {
        return Promise.resolve({ data: {
          ...created,
          title: parameters?.p_title,
          vessel_id: parameters?.p_vessel_id,
          occurred_at: parameters?.p_occurred_at,
          due_on: parameters?.p_due_on,
          action_type_key: parameters?.p_action_type_key,
          deviation_type: parameters?.p_deviation_type,
          vessel_maneuver: parameters?.p_vessel_maneuver,
          weather_conditions: parameters?.p_weather_conditions,
          corrective_action: parameters?.p_corrective_action,
          lost_days: parameters?.p_lost_days,
          workflow_status: 'pending_approval',
          approver_person_id: 1008,
          status: "En attente d'approbation",
        }, error: null });
      }
      if (functionName === 'action_item_treat') {
        const action = actions.find((item) => Number((item as { id?: number }).id) === Number(parameters?.p_action_id)) as typeof openAction | undefined;
        return Promise.resolve({ data: {
          ...action,
          comments: parameters?.p_comments,
          realized_action: parameters?.p_realized_action,
          closure_photo_path: parameters?.p_closure_photo_path,
          status: parameters?.p_close_action ? 'Ecart Soldé' : action?.status,
          closed_on: parameters?.p_close_action ? '2026-08-27' : null,
        }, error: null });
      }
      if (functionName === 'action_item_approve') {
        const action = actions.find((item) => Number((item as { id?: number }).id) === Number(parameters?.p_action_id)) as typeof openAction | undefined;
        return Promise.resolve({ data: {
          ...action, anomaly_cause: parameters?.p_anomaly_cause,
          owner_name: 'Arthur MAREST, Équipage — GOURY', workflow_status: 'approved',
          status: 'Ecart Non Soldé', approved_by_person_id: 1008, approved_at: '2026-08-27T15:00:00Z',
        }, error: null });
      }
      return Promise.resolve(functionName === 'refresh_hse_exposure_hours'
        ? { data: { actual_days: 24, planning_days: 0, methodology_id: 7 }, error: null }
        : { data: {
        methodology_version: '2026-08', configuration_complete: true, exposure_hours: 124500,
        FAT: 0, LWDC: 1, LTI: 1, RWC: 0, MTC: 1, FAC: 3, near_miss: 4, safety_observation: 12, lost_days: 7,
        LTIFR: 8.03, TRIR: 16.06, FAR: 0, FAC_rate: 24.1, MTC_rate: 8.03, RWC_rate: 0,
        SOFR: 19.28, french_frequency_rate: 8.03, french_severity_rate: 0.056,
      }, error: null });
    }),
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'action_items') return { select: vi.fn().mockReturnValue(ordered(actions)) };
      if (table === 'action_documents') return { select: vi.fn().mockReturnValue(ordered([])) };
      if (table === 'action_type_catalog') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(ordered(actionTypes)) }) };
      }
      if (table === 'vessels') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(ordered([{ id: 12, name: 'GOURY' }, { id: 13, name: 'SUROIT' }])) }) };
      }
      if (table === 'people') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(ordered([
          { id: 1008, first_name: 'Christophe', last_name: 'MINASSIAN', function_label: 'Directeur QHSE' },
          { id: 1010, first_name: 'Arthur', last_name: 'MAREST', function_label: 'Chef mécanicien' },
        ])) }) };
      }
      if (table === 'action_item_assignees') return { select: vi.fn().mockReturnValue(ordered([])) };
      if (table === 'hse_exposure_methodologies') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: 7 }], error: null }) }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client };
}

function renderWithProfile(client: unknown) {
  const context = {
    client,
    roles: ['armement'],
    currentPerson: {
      id: 1008,
      firstName: 'Christophe',
      lastName: 'MINASSIAN',
      functionLabel: 'Directeur QHSE',
      gradeLabel: '',
    },
  };
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<ActionPlanPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ActionPlanPage', () => {
  it('shows the SharePoint hierarchy and filters without an HSE indicators tab', async () => {
    const { client } = createClient();
    render(<ActionPlanPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: "Plan d'action" })).toBeInTheDocument();
    expect(screen.getByLabelText('Actions non soldées')).toHaveTextContent('1');
    expect(screen.getByLabelText('Non-conformités majeures')).toHaveTextContent('1');
    expect(screen.getByLabelText('Heures travaillées')).toHaveTextContent('124 500 h');
    expect(screen.queryByRole('button', { name: 'Sources importées' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Indicateurs HSE' })).not.toBeInTheDocument();
    expect(screen.queryByText('Date - titre')).not.toBeInTheDocument();
    expect(screen.getAllByText('GOURY').length).toBeGreaterThan(0);

    const openRow = screen.getByText("Réaliser une analyse d'eau").closest('article');
    expect(openRow).not.toBeNull();
    expect(within(openRow!).getByText("Réaliser une analyse d'eau").parentElement).toHaveTextContent("31/08/2026 - Réaliser une analyse d'eau");
    expect(within(openRow!).getByRole('button', { name: 'Traiter' })).toBeInTheDocument();
    expect(within(openRow!).getByRole('img', { name: /Photo jointe/ })).toHaveAttribute('src', 'https://evidence.example/1/810/photo-source.jpg');

    const closedRow = screen.getByText('Vérifier la filtration machine').closest('article');
    expect(closedRow).not.toBeNull();
    expect(within(closedRow!).queryByRole('button', { name: 'Traiter' })).not.toBeInTheDocument();
    expect(within(closedRow!).getByRole('img', { name: /Preuve de traitement/ })).toHaveAttribute('src', 'https://evidence.example/1/811/preuve-traitement.jpg');

    fireEvent.change(screen.getByLabelText("Type d'évènement"), { target: { value: 'Audit Interne - BBTM' } });
    expect(screen.getByText("Réaliser une analyse d'eau")).toBeInTheDocument();
    expect(screen.queryByText('Vérifier la filtration machine')).not.toBeInTheDocument();

  });

  it("defaults the issuer to the current profile and creates an exposure-linked action", async () => {
    const user = userEvent.setup();
    const { client } = createClient([]);
    renderWithProfile(client);

    await screen.findByRole('heading', { name: "Plan d'action" });
    await user.click(screen.getByRole('button', { name: 'Nouveau rapport' }));
    const dialog = within(screen.getByRole('dialog', { name: "Nouveau rapport d'évènement" }));
    fireEvent.change(dialog.getByLabelText('Constat *'), { target: { value: 'Accident pont arrière' } });
    expect(dialog.getByLabelText('Émetteur *')).toHaveValue('Christophe MINASSIAN');
    await user.selectOptions(dialog.getByLabelText('Navire / lieu *'), '12');
    fireEvent.change(dialog.getByLabelText("Manœuvre du navire au moment de l'évènement *"), { target: { value: 'Navire à quai' } });
    fireEvent.change(dialog.getByLabelText('Conditions météo *'), { target: { value: 'Vent faible, mer belle' } });
    fireEvent.change(dialog.getByLabelText('À traiter avant *'), { target: { value: '2026-09-30' } });
    await user.selectOptions(dialog.getByLabelText("Type d'évènement *"), 'lost_time_injury');
    expect(dialog.queryByLabelText("Type d'écart *")).not.toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Jours d'arrêt"), { target: { value: '10' } });
    fireEvent.change(dialog.getByLabelText('Action proposée *'), { target: { value: 'Sécuriser la zone et analyser la cause.' } });
    await user.click(dialog.getByRole('button', { name: 'Créer et soumettre' }));

    expect(client.rpc).toHaveBeenCalledWith('action_item_create', expect.objectContaining({
      p_title: 'Accident pont arrière', p_vessel_id: 12,
      p_action_type_key: 'lost_time_injury', p_lost_days: 10,
      p_vessel_maneuver: 'Navire à quai', p_weather_conditions: 'Vent faible, mer belle',
    }));
    expect(await screen.findByText('Rapport créé et soumis à Christophe MINASSIAN.')).toBeInTheDocument();
  });

  it('lets a Capitaine treat an open action without exposing action creation', async () => {
    const user = userEvent.setup();
    const { client } = createClient([openAction]);
    render(<ActionPlanPage client={client as never} roles={['capitaine']} />);

    await screen.findByRole('heading', { name: "Plan d'action" });
    expect(screen.queryByRole('button', { name: 'Nouveau rapport' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Traiter' }));
    const dialog = within(screen.getByRole('dialog', { name: openAction.title }));
    fireEvent.change(dialog.getByLabelText('Action réalisée'), { target: { value: 'Filtre remplacé' } });
    fireEvent.change(dialog.getByLabelText('Commentaire'), { target: { value: 'Contrôle terminé' } });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));

    expect(client.rpc).toHaveBeenCalledWith('action_item_treat', {
      p_action_id: openAction.id,
      p_comments: 'Contrôle terminé',
      p_realized_action: 'Filtre remplacé',
      p_close_action: false,
      p_closure_photo_path: null,
    });
    expect(await screen.findByText('Action mise à jour.')).toBeInTheDocument();
  });

  it('lets Christophe approve a pending report and assign people and a vessel crew', async () => {
    const user = userEvent.setup();
    const pendingAction = {
      ...openAction, id: 812, status: "En attente d'approbation", owner_name: null,
      anomaly_cause: null, workflow_status: 'pending_approval', approver_person_id: 1008,
      source_label: 'seapilot',
    };
    const { client } = createClient([pendingAction]);
    renderWithProfile(client);

    await screen.findByRole('heading', { name: "Plan d'action" });
    await user.click(screen.getByRole('button', { name: 'Approuver' }));
    const dialog = within(screen.getByRole('dialog', { name: pendingAction.title }));
    await user.selectOptions(dialog.getByLabelText("Cause de l'anomalie *"), 'Panne Equipement');
    await user.click(dialog.getByRole('checkbox', { name: /Arthur MAREST/ }));
    await user.click(dialog.getByRole('checkbox', { name: /Équipage — GOURY/ }));
    await user.click(dialog.getByRole('button', { name: 'Approuver et affecter' }));

    expect(client.rpc).toHaveBeenCalledWith('action_item_approve', {
      p_action_id: 812, p_anomaly_cause: 'Panne Equipement', p_person_ids: [1010], p_vessel_ids: [12],
    });
    expect(await screen.findByText('Rapport approuvé et responsables affectés.')).toBeInTheDocument();
  });
});
