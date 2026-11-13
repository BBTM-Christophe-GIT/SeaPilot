import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppShellOutletContext } from '../shell/AppShell';
import { AnnualReviewsPage } from './AnnualReviewsPage';

import { emptyAnnualReviewAnswers } from './annualReviewQuestionnaire';
import {
  fetchAnnualReview,
  fetchAnnualReviewObjectives,
  fetchAnnualReviewPeople,
  fetchAnnualReviewResponses,
  fetchAnnualReviews,
  saveAnnualReviewResponse,
  type AnnualReviewRecord,
  type AnnualReviewResponseRecord,
  type AnnualReviewStatus,
} from './annualReviewQueries';

vi.mock('./annualReviewQueries', async (importOriginal) => ({
  ...await importOriginal<typeof import('./annualReviewQueries')>(),
  fetchAnnualReview: vi.fn(),
  fetchAnnualReviewObjectives: vi.fn(),
  fetchAnnualReviewPeople: vi.fn(),
  fetchAnnualReviewResponses: vi.fn(),
  fetchAnnualReviews: vi.fn(),
  saveAnnualReviewResponse: vi.fn(),
}));

const collaboratorProfile = {
  id: 9303,
  firstName: 'Luc',
  lastName: 'MARTIN',
  functionLabel: 'Matelot polyvalent',
  gradeLabel: '',
  active: true,
  hiredOn: '2020-01-01',
  departedOn: '',
};

const captainProfile = {
  ...collaboratorProfile,
  id: 9301,
  firstName: 'Marie',
  lastName: 'BERNARD',
  functionLabel: 'Capitaine',
};

const submittedAt = '2026-11-10T10:00:00Z';
const validatedAt = '2026-11-10T11:00:00Z';

const collaboratorResponse: AnnualReviewResponseRecord = {
  id: 1,
  reviewId: 9901,
  respondentRole: 'collaborator',
  respondentPersonId: collaboratorProfile.id,
  answers: {
    ...emptyAnnualReviewAnswers(),
    evaluation: { bridge_manoeuvres: { rating: 'Excellent', comment: 'Auto-évaluation du marin' } },
  },
  shareWithManager: true,
  submittedAt,
};

const managerResponse: AnnualReviewResponseRecord = {
  id: 2,
  reviewId: 9901,
  respondentRole: 'manager',
  respondentPersonId: captainProfile.id,
  answers: {
    ...emptyAnnualReviewAnswers(),
    evaluation: { bridge_manoeuvres: { rating: 'Bon', comment: 'Appréciation du capitaine' } },
  },
  shareWithManager: null,
  submittedAt: '',
};

function renderProfileReview(profile: 'capitaine' | 'marin', status: AnnualReviewStatus, responses: AnnualReviewResponseRecord[]) {
  const review: AnnualReviewRecord = {
    id: 9901,
    companyId: 1,
    reviewYear: 2026,
    employeePersonId: collaboratorProfile.id,
    managerPersonId: captainProfile.id,
    employeeName: 'Luc MARTIN',
    managerName: 'Marie BERNARD',
    employeeFunction: collaboratorProfile.functionLabel,
    status,
    startsAt: '2026-11-09T09:00:00Z',
    endsAt: '2026-11-09T10:00:00Z',
    dueOn: '2027-12-31',
    meetingMode: 'in_person',
    meetingLocation: 'Bureau',
    videoUrl: '',
    proposalNote: '',
    proposedByPersonId: captainProfile.id,
    collaboratorSubmittedAt: status === 'scheduled' ? '' : submittedAt,
    managerValidatedAt: status === 'awaiting_signature' || status === 'archived' ? validatedAt : '',
    collaboratorSignedAt: status === 'archived' ? '2026-11-10T12:00:00Z' : '',
    managerIdentitySnapshot: {},
    managerSignatureSnapshot: {},
    collaboratorIdentitySnapshot: {},
    collaboratorSignatureSnapshot: {},
    managerReportBucket: '',
    managerReportPath: '',
    managerReportFileName: '',
    finalReportBucket: '',
    finalReportPath: '',
    finalReportFileName: '',
    hrDocumentId: null,
  };

  vi.mocked(fetchAnnualReview).mockResolvedValue(review);
  vi.mocked(fetchAnnualReviewObjectives).mockResolvedValue([]);
  vi.mocked(fetchAnnualReviewPeople).mockResolvedValue([]);
  vi.mocked(fetchAnnualReviewResponses).mockResolvedValue(responses);
  vi.mocked(fetchAnnualReviews).mockResolvedValue([review]);
  vi.mocked(saveAnnualReviewResponse).mockResolvedValue(review.id);

  const client = {} as AppShellOutletContext['client'];
  const user = userEvent.setup();
  renderPage({
    client,
    roles: [profile],
    previewMode: false,
    currentPerson: profile === 'capitaine' ? captainProfile : collaboratorProfile,
  }, profile === 'marin');
  return { client, user };
}

function firstEvaluationQuestion() {
  const question = screen.getByText('Manœuvres & règles de barre', { exact: true }).closest('article');
  if (!question) throw new Error('Le bloc du critère d’évaluation est introuvable.');
  return within(question);
}

function renderPage(context: AppShellOutletContext, recipient = false) {
  return render(
    <MemoryRouter initialEntries={[recipient ? '/annual-review/9901' : '/modules/annualReviews']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="modules/annualReviews" element={<AnnualReviewsPage />} />
          <Route path="annual-review/:reviewId" element={<AnnualReviewsPage recipientRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AnnualReviewsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets an authorised manager open the invitation editor', async () => {
    const user = userEvent.setup();
    renderPage({
      roles: ['admin'], client: {} as never, previewMode: true,
      currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Administrateur', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' },
    });

    expect(await screen.findByRole('heading', { name: 'Entretien Professionnel et d’Evaluation' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouvel entretien' }));
    expect(screen.getByRole('heading', { name: 'Proposer un rendez-vous' })).toBeInTheDocument();
    expect(screen.getByLabelText('Collaborateur actif')).toBeInTheDocument();
    expect(screen.queryByText('Date et heure de fin')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Durée' })).toBeInTheDocument();
    expect(screen.getByLabelText('Date et heure de début')).toHaveAttribute('step', '900');
    expect(screen.getByLabelText('Année de l’entretien calculée')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Minutes')).toHaveDisplayValue('0 min');
    expect(screen.getByText('Lieu physique')).toBeInTheDocument();
    expect(screen.getByText('Visioconférence')).toBeInTheDocument();
  });

  it('gives the collaborator a permanent guide, personal exports and an explicit sharing choice', async () => {
    renderPage({
      roles: ['marin'], client: {} as never, previewMode: true,
      currentPerson: { id: 9303, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot polyvalent', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' },
    }, true);

    expect(await screen.findByRole('heading', { name: 'Entretien Professionnel et d’Evaluation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guide du collaborateur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger mes réponses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeInTheDocument();
    expect(screen.getByText('Partager avec le manager')).toBeInTheDocument();
    expect(screen.getByText('Garder mes réponses privées')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guide' })).toBeInTheDocument();
  });

  it('shows both answers for the same question and saves only the captain’s changes', async () => {
    const { client, user } = renderProfileReview('capitaine', 'collaborator_submitted', [collaboratorResponse, managerResponse]);
    await user.click(await screen.findByRole('button', { name: '1. Évaluation' }));
    await screen.findByText('Auto-évaluation du marin');

    const question = firstEvaluationQuestion();
    const collaborator = within(question.getByRole('group', { name: 'Collaborateur' }));
    const management = within(question.getByRole('group', { name: 'Management' }));
    expect(collaborator.getByText('Excellent')).toBeVisible();
    expect(collaborator.getByText('Auto-évaluation du marin')).toBeVisible();
    expect(collaborator.queryByRole('textbox')).not.toBeInTheDocument();
    expect(management.getByRole('radio', { name: 'Bon' })).toBeChecked();
    const comment = management.getByRole('textbox', { name: 'Commentaire' });
    expect(comment).toHaveValue('Appréciation du capitaine');
    await user.click(management.getByRole('radio', { name: 'Moyen' }));
    await user.clear(comment);
    await user.type(comment, 'Avis corrigé');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(saveAnnualReviewResponse).toHaveBeenCalledWith(
      client,
      9901,
      { ...managerResponse.answers, evaluation: { bridge_manoeuvres: { comment: 'Avis corrigé', rating: 'Moyen' } } },
      false,
      null,
    );
    expect(await screen.findByText('Brouillon enregistré.')).toBeVisible();
  });

  it.each([
    { status: 'collaborator_submitted', collaborator: [] },
    { status: 'scheduled', collaborator: [{ ...collaboratorResponse, submittedAt: '' }] },
  ] as const)('keeps the collaborator’s answers out of the captain’s questionnaire in state $status without shared submitted answers', async ({ status, collaborator }) => {
    const { user } = renderProfileReview('capitaine', status, [managerResponse, ...collaborator]);
    await user.click(await screen.findByRole('button', { name: '1. Évaluation' }));
    expect(await screen.findByDisplayValue('Appréciation du capitaine')).toBeEnabled();
    expect(screen.queryByRole('group', { name: 'Collaborateur' })).not.toBeInTheDocument();
    expect(screen.queryByText('Auto-évaluation du marin')).not.toBeInTheDocument();
  });

  it('compares the applicable evolution details without adding an unrelated manager field', async () => {
    const { user } = renderProfileReview('capitaine', 'collaborator_submitted', [
      {
        ...collaboratorResponse,
        answers: {
          ...collaboratorResponse.answers,
          evolution: {
            ...collaboratorResponse.answers.evolution,
            choice: '2. Changer de poste au sein de BBTM',
            desiredPosition: 'Chef de pont',
          },
        },
      },
      {
        ...managerResponse,
        answers: {
          ...managerResponse.answers,
          evolution: {
            ...managerResponse.answers.evolution,
            choice: '3. Aller en formation',
            desiredTraining: 'Formation sécurité',
          },
        },
      },
    ]);
    await user.click(await screen.findByRole('button', { name: '4. Évolution' }));

    expect(await screen.findByText('Chef de pont')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Quel poste souhaitez-vous ?' })).not.toBeInTheDocument();
    const training = screen.getByRole('textbox', { name: 'Quelle formation souhaitez-vous ?' });
    expect(training).toHaveValue('Formation sécurité');
    expect(training).toBeEnabled();
  });

  it.each(['awaiting_signature', 'archived'] as const)('shows both answers read-only to the Marin with shared responses in state %s', async (status) => {
    const { user } = renderProfileReview(
      'marin',
      status,
      [collaboratorResponse, { ...managerResponse, submittedAt: validatedAt }],
    );
    await user.click(await screen.findByRole('button', { name: '1. Évaluation' }));
    await screen.findByText('Appréciation du capitaine');

    const question = firstEvaluationQuestion();
    const collaborator = within(question.getByRole('group', { name: 'Collaborateur' }));
    const management = within(question.getByRole('group', { name: 'Management' }));
    expect(collaborator.getByText('Auto-évaluation du marin')).toBeVisible();
    expect(management.getByText('Appréciation du capitaine')).toBeVisible();
    expect(question.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the Marin their own shared answer while the captain still has a draft', async () => {
    const { user } = renderProfileReview('marin', 'collaborator_submitted', [collaboratorResponse]);
    await user.click(await screen.findByRole('button', { name: '1. Évaluation' }));

    expect(await screen.findByDisplayValue('Auto-évaluation du marin')).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Management' })).not.toBeInTheDocument();
    expect(screen.queryByText('Appréciation du capitaine')).not.toBeInTheDocument();
  });
});
