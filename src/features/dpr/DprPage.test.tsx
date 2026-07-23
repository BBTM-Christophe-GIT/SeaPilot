import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DPR_PAYLOAD } from './dprFormModel.ts';
import type { DprDashboardData, DprReportRecord } from './dprQueries.ts';

const mocks = vi.hoisted(() => ({
  fetchDashboard: vi.fn(), fetchDetail: vi.fn(), fetchDiagnostic: vi.fn(),
  save: vi.fn(), transition: vi.fn(), upload: vi.fn(), remove: vi.fn(), signedUrl: vi.fn(),
}));

vi.mock('./dprQueries.ts', () => ({
  fetchDprDashboard: mocks.fetchDashboard,
  fetchDprDetail: mocks.fetchDetail,
  fetchDprDiagnostic: mocks.fetchDiagnostic,
  saveDprPayload: mocks.save,
  runDprTransition: mocks.transition,
  uploadDprFile: mocks.upload,
  removeDprFile: mocks.remove,
  createDprSignedUrl: mocks.signedUrl,
}));

vi.mock('./dprPdf.ts', () => ({
  generateDprPdf: vi.fn().mockResolvedValue({ blob: new Blob(['pdf'], { type: 'application/pdf' }), filename: 'DPR-1056.pdf' }),
}));

import { DprPage } from './DprPage';

const report: DprReportRecord = {
  id: 1056, number: 1056, status: 'validated', reportDate: '2026-07-21', projectId: 144,
  projectCode: 'P144', projectTitle: 'Guard Vessel EMDT', unlistedProjectName: '', vesselId: 3,
  vesselName: 'GOURY', issuerName: 'Pierre LEPRETRE', description: 'Transit et mesures', qhseNote: 'RAS',
  createdBy: 'user-1', updatedAt: '2026-07-21T18:00:00Z', fuelConsumedLiters: 650,
  files: [{ id: 9, dprId: 1056, kind: 'pdf', bucket: 'dpr-pdfs', path: 'company/1/dpr/1056/file.pdf', filename: 'DPR-1056.pdf', mimeType: 'application/pdf', sizeBytes: 1200, sha256: 'a'.repeat(64), isCurrent: true, status: 'ready' }],
};

const submittedReport: DprReportRecord = { ...report, id: 1057, number: 1057, status: 'submitted', files: [] };

const dashboard: DprDashboardData = {
  currentUserId: 'user-1', currentUserName: 'Camille Marin', reports: [report, submittedReport],
  references: {
    projects: [{ id: 144, code: 'P144', title: 'Guard Vessel EMDT' }],
    vessels: [{ id: 3, name: 'GOURY' }],
    people: [{ id: 12, name: 'Pierre LEPRETRE', functionLabel: 'Capitaine', crewFunction: 'captain' }],
    exerciseTypes: [{ key: 'fire-protection', label: "Protection contre l'incendie" }],
    portReasons: [{ key: 'crew-change', label: 'Crew Change' }],
  },
};

describe('DprPage Phase 7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchDashboard.mockResolvedValue(dashboard);
    mocks.fetchDetail.mockImplementation((_client, target: DprReportRecord) => Promise.resolve({ report: target, payload: { ...structuredClone(EMPTY_DPR_PAYLOAD), reportDate: target.reportDate, projectId: 144, vesselId: 3, description: target.description }, files: target.files }));
    mocks.fetchDiagnostic.mockResolvedValue({ reports: 2, orphan_files: 0 });
    mocks.signedUrl.mockResolvedValue('https://signed.test/dpr.pdf');
  });

  it('renders Supabase DPR grouped by vessel and project with filters', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Daily Progress Report' })).toBeInTheDocument();
    expect(screen.getAllByText('GOURY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P144').length).toBeGreaterThan(0);
    expect(screen.getByText('DPR-1056')).toBeInTheDocument();
    expect(screen.getByText('2 DPR affiché(s)')).toBeInTheDocument();

    await user.selectOptions(screen.getByText('NAVIRE').closest('label')!.querySelector('select')!, '3');
    fireEvent.change(screen.getByPlaceholderText('DPR, rédacteur…'), { target: { value: 'introuvable' } });
    expect(screen.getByText('Aucun rapport ne correspond aux filtres.')).toBeInTheDocument();
  });

  it('reconstructs the six-step form and marks unsaved changes', async () => {
    const user = userEvent.setup();
    render(<DprPage client={{} as never} roles={['marin']} />);
    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    expect(screen.queryByRole('button', { name: /Diagnostic/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Saisir un DPR/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Informations Projet/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Informations Journalière/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indicateurs QHSE/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^4Escale/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^5Photos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ajouter un fichier/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Camille Marin')).toBeDisabled();

    const currentDate = new Date().toISOString().slice(0, 10);
    const changedDate = currentDate === '2026-07-23' ? '2026-07-24' : '2026-07-23';
    fireEvent.change(screen.getByDisplayValue(currentDate), { target: { value: changedDate } });
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
  });

  it('reserves diagnostic for admin and validation for captain', async () => {
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
});
