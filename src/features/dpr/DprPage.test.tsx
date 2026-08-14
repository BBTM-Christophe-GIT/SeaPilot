import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DPR_PAYLOAD } from './dprFormModel.ts';
import type { DprDashboardData, DprReportRecord } from './dprQueries.ts';

const mocks = vi.hoisted(() => ({
  fetchDashboard: vi.fn(), fetchDetail: vi.fn(), fetchDiagnostic: vi.fn(), fetchEntryContext: vi.fn(),
  save: vi.fn(), transition: vi.fn(), upload: vi.fn(), remove: vi.fn(), signedUrl: vi.fn(),
  generatePdf: vi.fn(),
}));

vi.mock('./dprQueries.ts', () => ({
  fetchDprDashboard: mocks.fetchDashboard,
  fetchDprDetail: mocks.fetchDetail,
  fetchDprDiagnostic: mocks.fetchDiagnostic,
  fetchDprEntryContext: mocks.fetchEntryContext,
  saveDprPayload: mocks.save,
  runDprTransition: mocks.transition,
  uploadDprFile: mocks.upload,
  removeDprFile: mocks.remove,
  createDprSignedUrl: mocks.signedUrl,
}));

vi.mock('./dprPdf.ts', () => ({
  generateDprPdf: mocks.generatePdf,
}));

import { DprPage } from './DprPage';

const report: DprReportRecord = {
  id: 1056, number: 1056, status: 'validated', reportDate: '2026-07-21', projectId: 144,
  projectCode: 'P144', projectTitle: 'Guard Vessel EMDT', unlistedProjectName: '', vesselId: 3,
  vesselName: 'GOURY', issuerName: 'Pierre LEPRETRE', description: 'Transit et mesures', qhseNote: 'RAS',
  validatorPersonId: 12, validatorName: 'Pierre LEPRETRE',
  createdBy: 'user-1', updatedAt: '2026-07-21T18:00:00Z', fuelConsumedLiters: 650,
  incidentCount: 0, files: [],
};

const submittedReport: DprReportRecord = { ...report, id: 1057, number: 1057, status: 'submitted', files: [] };

const dashboard: DprDashboardData = {
  currentUserId: 'user-1', currentUserName: 'Camille Marin', currentPersonId: 12, reports: [report, submittedReport],
  references: {
    projects: [{ id: 144, code: 'P144', title: 'Guard Vessel EMDT' }],
    vessels: [{ id: 3, name: 'GOURY' }],
    people: [{ id: 12, firstName: 'Pierre', lastName: 'LEPRETRE', name: 'Pierre LEPRETRE', functionLabel: 'Capitaine', gradeLabel: 'Capitaine', roleLabel: 'Navigant', crewFunction: 'captain', isSedentary: false, isDprValidator: true }],
    planningCrewPersonIds: [12],
    exerciseTypes: [{ key: 'fire-protection', label: "Protection contre l'incendie" }],
    portReasons: [{ key: 'crew-change', label: 'Crew Change' }],
  },
};

describe('DprPage Phase 7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:dpr-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.fetchDashboard.mockResolvedValue(dashboard);
    mocks.fetchDetail.mockImplementation((_client, target: DprReportRecord) => Promise.resolve({ report: target, payload: { ...structuredClone(EMPTY_DPR_PAYLOAD), reportDate: target.reportDate, projectId: 144, vesselId: 3, description: target.description }, files: target.files }));
    mocks.fetchDiagnostic.mockResolvedValue({ reports: 2, orphan_files: 0 });
    mocks.save.mockResolvedValue(42);
    mocks.transition.mockResolvedValue(undefined);
    mocks.fetchEntryContext.mockResolvedValue({
      issuerPersonId: 12, issuerName: 'Pierre LEPRETRE', vesselId: 3, projectId: 144, watchGroup: 'Bordée A',
      project: { id: 144, code: 'P144', title: 'Guard Vessel EMDT' },
    people: [
        dashboard.references.people[0],
        { id: 13, firstName: 'Alice', lastName: 'MARTIN', name: 'Alice MARTIN', functionLabel: 'Direction', gradeLabel: '', roleLabel: 'Sédentaire', crewFunction: 'execution', isSedentary: true, isDprValidator: false },
        { id: 14, firstName: 'Bob', lastName: 'VACANCES', name: 'Bob VACANCES', functionLabel: 'Matelot', gradeLabel: '', roleLabel: 'Navigant', crewFunction: 'execution', isSedentary: false, isDprValidator: false },
    ],
      crewPersonIds: [12, 13],
      defaultValidatorPersonId: 12,
    });
    mocks.signedUrl.mockResolvedValue('https://signed.test/dpr.pdf');
    mocks.generatePdf.mockResolvedValue({ blob: new Blob(['pdf'], { type: 'application/pdf' }), filename: 'DPR-1056.pdf' });
  });

  it('renders Supabase DPR grouped by vessel and project with filters', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Daily Progress Report' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu Daily Progress Report' }))
      .toContainElement(screen.getByRole('button', { name: 'Saisir un DPR' }));
    expect(screen.getAllByText('GOURY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P144').length).toBeGreaterThan(0);
    expect(screen.getByText('DPR-1056')).toBeInTheDocument();
    expect(screen.getByText('2 DPR affiché(s)')).toBeInTheDocument();

    await user.selectOptions(screen.getByText('NAVIRE').closest('label')!.querySelector('select')!, '3');
    fireEvent.change(screen.getByPlaceholderText('DPR, navire, auteur…'), { target: { value: 'introuvable' } });
    expect(screen.getByText('Aucun rapport ne correspond aux filtres.')).toBeInTheDocument();
  });

  it('selects a whole project, previews on demand, and removes hidden selections after filtering', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });

    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les DPR du projet P144' }));
    expect(screen.getByText('2 DPR sélectionné(s)')).toBeInTheDocument();
    await waitFor(() => expect(mocks.generatePdf).toHaveBeenCalledTimes(1));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(await screen.findByTitle('Aperçu DPR-1056')).toHaveAttribute('src', 'blob:dpr-preview');

    await user.type(screen.getByPlaceholderText('DPR, navire, auteur…'), 'DPR-1056');
    await waitFor(() => expect(screen.getByText('1 DPR sélectionné(s)')).toBeInTheDocument());
  });

  it('reconstructs the six-step form and marks unsaved changes', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['marin']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    expect(screen.queryByRole('button', { name: /Diagnostic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Produire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exports ZIP' })).not.toBeInTheDocument();
    expect(screen.queryByText('APERÇU AVANT PRODUCTION')).not.toBeInTheDocument();
    expect(screen.getByText(/L’historique reste réservé/)).toBeInTheDocument();
    expect(screen.queryByText('DPR-1056')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Informations Projet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Informations Journalière/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indicateurs QHSE/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^4Escale/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^5Photos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter un fichier/ })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Pierre LEPRETRE').some((element) => element.hasAttribute('disabled'))).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Capitaine valideur' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Pierre LEPRETRE' })).toBeChecked();
    expect(screen.queryByText('PROJET NON RÉFÉRENCÉ')).not.toBeInTheDocument();

    const currentDate = new Date().toISOString().slice(0, 10);
    const changedDate = currentDate === '2026-07-23' ? '2026-07-24' : '2026-07-23';
    fireEvent.change(screen.getByDisplayValue(currentDate), { target: { value: changedDate } });
    await waitFor(() => expect(mocks.fetchEntryContext).toHaveBeenLastCalledWith(expect.anything(), changedDate, 3));
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
  });

  it('defaults to Navire à quai when Planning has a vessel without an active project', async () => {
    const user = userEvent.setup();
    mocks.fetchEntryContext.mockResolvedValueOnce({
      issuerPersonId: 12,
      issuerName: 'Pierre LEPRETRE',
      vesselId: 3,
      projectId: null,
      project: null,
      watchGroup: 'Bordée A',
      people: dashboard.references.people,
      crewPersonIds: [12],
    });
    render(<DprPage client={{} as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });

    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));

    const projectSelect = screen.getAllByLabelText('PROJET').at(-1) as HTMLSelectElement;
    expect(projectSelect.selectedOptions[0]).toHaveTextContent('Navire à quai');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ projectId: null, unlistedProjectName: 'Navire à quai', vesselId: 3 }),
    ));
  });

  it('shows the Planning project to a field profile even when the project catalog is hidden by RLS', async () => {
    const user = userEvent.setup();
    mocks.fetchDashboard.mockResolvedValueOnce({
      ...dashboard,
      references: { ...dashboard.references, projects: [] },
    });
    mocks.fetchEntryContext.mockResolvedValue({
      issuerPersonId: 12,
      issuerName: 'Gary LEFEVRE',
      vesselId: 3,
      projectId: 60,
      project: { id: 60, code: 'P268', title: 'ETPO FORT BOYARD' },
      watchGroup: 'Bordée 1',
      people: dashboard.references.people,
      crewPersonIds: [12],
    });
    render(<DprPage client={{} as never} roles={['marin']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });

    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));

    const projectSelect = screen.getAllByLabelText('PROJET').at(-1) as HTMLSelectElement;
    expect(projectSelect).toHaveValue('60');
    expect(projectSelect.selectedOptions[0]).toHaveTextContent('P268 — ETPO FORT BOYARD');
  });

  it('searches and selects Escale ports from the department-grouped catalog', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));
    await user.click(screen.getByRole('button', { name: /^4Escale/ }));

    const port = screen.getByLabelText('PORT');
    await user.click(port);
    expect(screen.getByRole('group', { name: 'Manche' })).toHaveTextContent('Cherbourg');
    await user.type(port, 'FR CER');
    await user.click(screen.getByRole('option', { name: /Cherbourg.*FR CER/ }));

    expect(port).toHaveValue('Cherbourg');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(port);
    expect(screen.getByRole('group', { name: 'Finistère' })).toHaveTextContent('Brest');
  });

  it('removes submission and validates a complete DPR directly for a Marin', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['marin']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));

    expect(screen.queryByRole('button', { name: 'Soumettre le DPR' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Valider le DPR' }));

    expect(screen.getByRole('alert')).toHaveTextContent('La description de la journée est obligatoire avant validation.');
    expect(screen.getByRole('button', { name: /Informations Journalière/ })).toHaveClass('active');
    expect(mocks.save).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('DESCRIPTION DE LA JOURNÉE'), 'Quart réalisé sans événement.');
    await user.click(screen.getByRole('button', { name: 'Valider le DPR' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.transition).toHaveBeenCalledOnce();
    expect(mocks.transition).toHaveBeenCalledWith(expect.anything(), 'validate', 42);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps only Planning crew in Personnel embarqué and accepts manual external names', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['direction']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));

    expect(await screen.findByRole('checkbox', { name: 'Alice MARTIN' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Bob VACANCES' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Ajouter plusieurs autres personnes'), 'Jean DUPONT; Léa DURAND');
    await user.click(screen.getByRole('button', { name: /Ajouter les personnes/ }));

    expect(screen.getByText('Alice MARTIN')).toBeInTheDocument();
    expect(screen.getByText('Jean DUPONT')).toBeInTheDocument();
    expect(screen.getByText('Léa DURAND')).toBeInTheDocument();
  });

  it('reserves diagnostic for admin and keeps direct validation available', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['admin', 'capitaine']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    await user.click(screen.getByRole('button', { name: /Diagnostic/ }));
    await waitFor(() => expect(mocks.fetchDiagnostic).toHaveBeenCalled());
    expect(screen.getByText(/orphan_files: 0/)).toBeInTheDocument();

    const consultButtons = screen.getAllByRole('button', { name: 'Consulter' });
    await user.click(consultButtons[1]);
    expect(await screen.findByRole('button', { name: /Valider/ })).toBeInTheDocument();
  });

  it('lets a captain create, edit, validate and download DPRs without diagnostic access', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['capitaine']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });

    expect(screen.getByRole('button', { name: 'Saisir un DPR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Produire' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Diagnostic/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Consulter' })).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Consulter' })[1]);
    expect(await screen.findByRole('button', { name: /Valider/ })).toBeInTheDocument();
  });

  it.each(['direction', 'armement', 'marin'] as const)(
    'hides diagnostic for the %s profile',
    async (role) => {
      render(<DprPage client={{} as never} roles={[role]} />);
      await screen.findByRole('heading', { name: 'Daily Progress Report' });
      expect(screen.queryByRole('button', { name: /Diagnostic/ })).not.toBeInTheDocument();
    },
  );
});
