import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnualReviewsPage } from './AnnualReviewsPage';
import type { AnnualReviewRecord } from './annualReviewQueries';
import { fetchAnnualReviews, fetchAnnualReviewPeople, fetchAnnualReviewResponses, fetchAnnualReviewObjectives } from './annualReviewQueries';
import type { AppShellOutletContext } from '../shell/AppShell';

vi.mock('./annualReviewQueries', async () => {
  const actual = await vi.importActual<typeof import('./annualReviewQueries')>('./annualReviewQueries');
  return { ...actual, fetchAnnualReviews: vi.fn(), fetchAnnualReviewPeople: vi.fn(), fetchAnnualReviewResponses: vi.fn(), fetchAnnualReviewObjectives: vi.fn() };
});

function review(id: number, personId: number, name: string): AnnualReviewRecord {
  return {
    id, companyId: 1, reviewYear: 2026, employeePersonId: personId, managerPersonId: 1,
    employeeName: name, managerName: 'Alice RH', employeeFunction: 'Matelot', status: 'scheduled',
    startsAt: '2026-11-03T08:00:00Z', endsAt: '2026-11-03T09:00:00Z', dueOn: '2026-12-31', meetingMode: 'in_person',
    meetingLocation: 'A bord du GOURY', videoUrl: '', proposalNote: '', proposedByPersonId: 1,
    collaboratorSubmittedAt: '', managerValidatedAt: '', collaboratorSignedAt: '', managerIdentitySnapshot: {}, managerSignatureSnapshot: {},
    collaboratorIdentitySnapshot: {}, collaboratorSignatureSnapshot: {}, managerReportBucket: '', managerReportPath: '', managerReportFileName: '',
    finalReportBucket: '', finalReportPath: '', finalReportFileName: '', hrDocumentId: null,
  };
}

function renderPage(query: string) {
  const context: AppShellOutletContext = { roles: ['admin'], client: {} as never, previewMode: false,
    currentPerson: { id: 1, firstName: 'Alice', lastName: 'RH', functionLabel: 'Direction', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' } };
  return render(<MemoryRouter initialEntries={[`/modules/annualReviews${query}`]}><Routes><Route element={<Outlet context={context} />}><Route path="modules/annualReviews" element={<AnnualReviewsPage />} /></Route></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAnnualReviews).mockResolvedValue([review(2, 29, 'Pierre LEPRETRE'), review(3, 10, 'Pierre HARACHE')]);
  vi.mocked(fetchAnnualReviewPeople).mockResolvedValue([
    { id: 29, firstName: 'Pierre', lastName: 'LEPRETRE', functionLabel: 'Capitaine', active: true, userId: 'lepretre-fixture' },
    { id: 10, firstName: 'Pierre', lastName: 'HARACHE', functionLabel: 'Capitaine', active: true, userId: 'harache-fixture' },
    { id: 40, firstName: 'Camille', lastName: 'NOUVEAU', functionLabel: 'Matelot', active: true, userId: 'new-fixture' },
  ]);
  vi.mocked(fetchAnnualReviewResponses).mockResolvedValue([]);
  vi.mocked(fetchAnnualReviewObjectives).mockResolvedValue([]);
});

describe('Annual review radar destinations', () => {
  it('selects the requested existing interview instead of the first campaign', async () => {
    renderPage('?review=3');
    const workspace = await screen.findByRole('main');
    await waitFor(() => expect(within(workspace).getByText('Pierre HARACHE')).toBeVisible());
    expect(within(workspace).queryByText('Pierre LEPRETRE')).not.toBeInTheDocument();
    expect(fetchAnnualReviewResponses).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('finds a person’s existing interview from the employee deep link', async () => {
    renderPage('?person=10');
    const workspace = await screen.findByRole('main');
    await waitFor(() => expect(within(workspace).getByText('Pierre HARACHE')).toBeVisible());
    expect(screen.queryByRole('heading', { name: 'Proposer un rendez-vous' })).not.toBeInTheDocument();
  });

  it('opens the invitation editor with an active employee preselected when no interview exists', async () => {
    renderPage('?person=40');
    expect(await screen.findByRole('heading', { name: 'Proposer un rendez-vous' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Collaborateur actif' })).toHaveValue('40');
    expect(screen.getByRole('option', { name: /Camille NOUVEAU/ })).toBeInTheDocument();
  });

  it('never opens a creation editor for a missing or inaccessible employee', async () => {
    renderPage('?person=999999');
    await screen.findByRole('main');
    await waitFor(() => expect(fetchAnnualReviews).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Proposer un rendez-vous' })).not.toBeInTheDocument();
  });
});
