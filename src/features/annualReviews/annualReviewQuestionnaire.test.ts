import { describe, expect, it } from 'vitest';
import {
  ANNUAL_REVIEW_EVALUATION_GROUPS,
  ANNUAL_REVIEW_RATINGS,
  ANNUAL_REVIEW_TABS,
  annualReviewValidationErrors,
  emptyAnnualReviewAnswers,
} from './annualReviewQuestionnaire';

describe('annual review questionnaire', () => {
  it('mirrors the six workbook tabs and the six exclusive ratings', () => {
    expect(ANNUAL_REVIEW_TABS.map(([key]) => key)).toEqual(['guide', 'evaluation', 'esg', 'life', 'evolution', 'objectives']);
    expect(ANNUAL_REVIEW_RATINGS).toEqual(['Non Applicable', 'Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent']);
    expect(ANNUAL_REVIEW_EVALUATION_GROUPS.flatMap((group) => group.questions)).toHaveLength(23);
  });

  it('requires every rating, the life choices, evolution and rich objectives on submission', () => {
    const answers = emptyAnnualReviewAnswers();
    const errors = annualReviewValidationErrors(answers);
    expect(errors).toContain('23 critère(s) d’évaluation sans réponse.');
    expect(errors).toContain('La satisfaction générale doit être renseignée.');
    expect(errors).toContain('6 condition(s) de travail sans réponse.');
    expect(errors).toContain('Le souhait d’évolution doit être renseigné.');
    expect(errors).toContain('Les objectifs personnels pour l’année N+1 sont requis.');
  });

  it('validates a complete questionnaire and conditional evolution details', () => {
    const answers = emptyAnnualReviewAnswers();
    ANNUAL_REVIEW_EVALUATION_GROUPS.flatMap((group) => group.questions).forEach((question) => {
      answers.evaluation[question.id] = { rating: 'Bon', comment: '' };
    });
    answers.life.overall = 'satisfait';
    for (const key of ['missions', 'compensation', 'recognition', 'crew', 'rhythm', 'position']) answers.life.conditions[key] = 'satisfait';
    answers.evolution.choice = '2. Changer de poste au sein de BBTM';
    answers.objectives = '<p><strong>Préparer</strong> le brevet supérieur.</p>';
    expect(annualReviewValidationErrors(answers)).toContain('Le poste souhaité doit être précisé.');
    answers.evolution.desiredPosition = 'Second capitaine';
    expect(annualReviewValidationErrors(answers)).toEqual([]);
  });
});
