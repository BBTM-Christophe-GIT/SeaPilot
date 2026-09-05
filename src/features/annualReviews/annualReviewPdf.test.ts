import { describe, expect, it } from 'vitest';
import { ANNUAL_REVIEW_EVALUATION_GROUPS, emptyAnnualReviewAnswers } from './annualReviewQuestionnaire';
import { buildAnnualReviewPdf } from './annualReviewPdf';
import type { AnnualReviewRecord } from './annualReviewQueries';

const transparentPng = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (character) => character.charCodeAt(0),
);

const review: AnnualReviewRecord = {
  id: 12, companyId: 1, reviewYear: 2026, employeePersonId: 2, managerPersonId: 1,
  employeeName: 'Luc MARTIN', managerName: 'Anne CAPITAINE', employeeFunction: 'Matelot',
  status: 'scheduled', startsAt: '2026-10-12T08:00:00Z', endsAt: '2026-10-12T09:00:00Z',
  meetingMode: 'in_person', meetingLocation: 'Cherbourg', videoUrl: '', proposalNote: '', proposedByPersonId: 1,
  collaboratorSubmittedAt: '', managerValidatedAt: '', collaboratorSignedAt: '', managerIdentitySnapshot: {},
  managerSignatureSnapshot: {}, collaboratorIdentitySnapshot: {}, collaboratorSignatureSnapshot: {},
  managerReportBucket: '', managerReportPath: '', managerReportFileName: '', finalReportBucket: '',
  finalReportPath: '', finalReportFileName: '', hrDocumentId: null,
};

describe('annual review PDF', () => {
  it('generates the personal copy with the exact document title and year', async () => {
    const answers = emptyAnnualReviewAnswers();
    ANNUAL_REVIEW_EVALUATION_GROUPS.flatMap((group) => group.questions).forEach((question) => {
      answers.evaluation[question.id] = { rating: 'Bon', comment: 'Exemple concret.' };
    });
    answers.life.overall = 'satisfait';
    answers.evolution.choice = '1. Poursuivre tel qu’aujourd’hui';
    answers.objectives = '<p><strong>Objectif :</strong> progresser.</p>';

    const generated = await buildAnnualReviewPdf({
      review, answers, ownerName: review.employeeName, kind: 'personal', logoBytes: transparentPng,
    });

    expect(generated.filename).toBe('Entretien Professionnel et d’Evaluation - Luc MARTIN - 2026.pdf');
    expect(generated.blob.type).toBe('application/pdf');
    expect(generated.blob.size).toBeGreaterThan(5_000);
  }, 20_000);
});
