// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addAuditMonths, annualAuditWindow, auditWindow, blankAuditAnswers, compareAuditScores, completionIssues,
  auditDueOnFromDuration, defaultFindingDueOn, defaultFindingDuration, findingIssues, findingOverdue, isAuditDate, nextAnnualDate, planningStatus, previousYearAudit,
  plannedAuditDateIssues, questionIssues, scoreAudit, scoreBySection, todayAuditParis,
  type AuditAnswer, type AuditAnswerValue, type AuditFinding, type AuditSite, type InternalAudit,
} from './internalAuditModel';
import { BBTM_AUDIT_QUESTIONS, BBTM_AUDIT_SOURCE, createDefaultAuditTemplate } from './internalAuditSeed';

const site: AuditSite = { id: 'site-rozel', companyId: 1, name: 'LE ROZEL', kind: 'vessel', vesselId: 12, anniversaryOn: null };
function answer(value: AuditAnswerValue | null, maxPoints = 3, id = 'q1', section = 'Sécurité'): AuditAnswer {
  return { id, section, reference: '1.1', question: 'Question', maxPoints, guidance: '', answer: value, observation: '' };
}
function audit(changes: Partial<InternalAudit> = {}): InternalAudit {
  return {
    id: 'audit-2026', companyId: 1, siteId: site.id, templateId: 'template', templateName: 'Grille LE ROZEL',
    templateVersion: 1, year: 2026, plannedOn: '2026-09-30', performedOn: '2026-09-29',
    auditorName: 'Auditeur', status: 'completed', rows: [answer('conforme')], completedAt: '2026-09-29T10:00:00Z',
    ...changes,
  };
}
function finding(changes: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'finding', companyId: 1, auditId: 'audit-2026', questionId: 'q1', reference: '1.1', severity: 'major',
    description: 'Procédure manquante', assigneePersonId: null, assigneeRole: 'captain', assigneeVesselId: 12,
    assigneeLabel: 'Capitaines LE ROZEL', openedOn: '2026-10-24', dueOn: '2026-10-31', treatmentDelayValue: 1, treatmentDelayUnit: 'weeks', status: 'open', treatment: '', resolvedAt: null, closedAt: null,
    ...changes,
  };
}

describe('internal audit scoring', () => {
  it('awards full, half, or zero barème and excludes N/A from both totals', () => {
    const score = scoreAudit([answer('conforme', 4), answer('incomplet', 5, 'q2'), answer('non_conforme', 1, 'q3'), answer('na', 100, 'q4')]);
    expect(score).toEqual({ earnedPoints: 6.5, maxPoints: 10, percentage: 65, answeredCount: 4, totalCount: 4, excludedCount: 1 });
  });
  it('keeps unanswered applicable rows in the denominator and their progress incomplete', () => {
    expect(scoreAudit([answer('conforme'), answer(null, 3, 'q2')])).toEqual({
      earnedPoints: 3, maxPoints: 6, percentage: 50, answeredCount: 1, totalCount: 2, excludedCount: 0,
    });
    expect(scoreAudit([answer(null)]).percentage).toBeNull();
  });
  it('distinguishes a real zero score from unavailable or entirely N/A scores', () => {
    expect(scoreAudit([answer('non_conforme')]).percentage).toBe(0);
    expect(scoreAudit([answer('na')])).toMatchObject({ maxPoints: 0, percentage: null });
    expect(scoreAudit([]).percentage).toBeNull();
    expect(scoreAudit([answer('conforme', 0)]).percentage).toBeNull();
  });
  it('calculates weighted section scores and preserves first appearance order', () => {
    const rows = [answer('conforme', 9), answer('non_conforme', 1, 'q2'), answer('incomplet', 3, 'q3', 'Maintenance')];
    expect(scoreBySection(rows).map(({ section, percentage }) => ({ section, percentage })))
      .toEqual([{ section: 'Sécurité', percentage: 90 }, { section: 'Maintenance', percentage: 50 }]);
  });
});

describe('annual audit calendar', () => {
  it('uses calendar months with clamped month ends including leap-day anniversaries', () => {
    expect(nextAnnualDate('2024-02-29')).toBe('2025-02-28');
    expect(addAuditMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addAuditMonths('2026-01-31', -3)).toBe('2025-10-31');
    expect(auditWindow('2026-08-31')).toEqual({ targetOn: '2026-08-31', opensOn: '2026-05-31', closesOn: '2026-11-30' });
  });
  it('rejects impossible dates instead of silently rolling into another month', () => {
    expect(isAuditDate('2026-02-29')).toBe(false);
    expect(isAuditDate('2024-02-29')).toBe(true);
    expect(isAuditDate('2026-13-01')).toBe(false);
    expect(isAuditDate('30/09/2026')).toBe(false);
    expect(nextAnnualDate('2026-02-30')).toBe('');
    expect(auditWindow('')).toEqual({ targetOn: '', opensOn: '', closesOn: '' });
  });
  it('uses the user Paris date at UTC midnight boundaries', () => {
    expect(todayAuditParis(new Date('2026-09-29T22:30:00Z'))).toBe('2026-09-30');
    expect(todayAuditParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
  it('keeps the annual anchor fixed when the planned day shifts and allows calendar-year crossing', () => {
    const anchored = { ...site, anniversaryOn: '2025-01-31' };
    expect(annualAuditWindow(anchored, 2026, '2025-11-15')).toEqual({
      targetOn: '2026-01-31', opensOn: '2025-10-31', closesOn: '2026-04-30',
    });
    const next = audit({ year: 2026, plannedOn: '2025-11-15', status: 'planned' });
    expect(plannedAuditDateIssues(anchored, next)).toEqual([]);
    expect(planningStatus(anchored, [next], '2025-11-01')).toMatchObject({ targetOn: '2026-01-31', opensOn: '2025-10-31' });
    expect(plannedAuditDateIssues(anchored, { ...next, plannedOn: '2026-05-01' })).toHaveLength(1);
    expect(annualAuditWindow({ ...site, anniversaryOn: '2024-02-29' }, 2025).targetOn).toBe('2025-02-28');
  });
  it('keeps both window endpoints inclusive and flags only the following day late', () => {
    const planned = audit({ status: 'planned', performedOn: null, completedAt: null });
    expect(planningStatus(site, [planned], '2026-06-29').status).toBe('upcoming');
    expect(planningStatus(site, [planned], '2026-06-30').status).toBe('window');
    expect(planningStatus(site, [planned], '2026-12-30').status).toBe('window');
    expect(planningStatus(site, [planned], '2026-12-31').status).toBe('overdue');
    expect(planningStatus(site, [audit({ ...planned, status: 'in_progress' })], '2026-09-30').status).toBe('in_progress');
  });
  it('derives the next annual window from an actual completion and isolates company/site', () => {
    expect(planningStatus(site, [audit()], '2026-09-30')).toMatchObject({
      status: 'completed', targetOn: '2027-09-29', opensOn: '2027-06-29', closesOn: '2027-12-29',
    });
    expect(planningStatus(site, [audit()], '2028-01-01').status).toBe('overdue');
    expect(planningStatus(site, [audit({ companyId: 2 }), audit({ siteId: 'other' })], '2026-09-30').status).toBe('unscheduled');
    expect(planningStatus({ ...site, anniversaryOn: '2026-09-30' }, [], '2026-09-30').status).toBe('window');
  });
  it('keeps an unperformed initial cycle overdue after calendar-year rollover', () => {
    expect(planningStatus({ ...site, anniversaryOn: '2025-06-15' }, [], '2026-01-01')).toMatchObject({
      status: 'overdue', targetOn: '2025-06-15', closesOn: '2025-09-15',
    });
  });
});

describe('audit score history', () => {
  it('compares only completed audits from the previous calendar year for the same site/company', () => {
    const current = audit();
    const previous = audit({ id: 'audit-2025', year: 2025, performedOn: '2025-10-01', rows: [answer('incomplet')] });
    const others = [
      audit({ id: 'old', year: 2024 }), audit({ id: 'other-vessel', year: 2025, siteId: 'other' }),
      audit({ id: 'other-company', year: 2025, companyId: 2 }), audit({ id: 'draft', year: 2025, status: 'in_progress' }),
    ];
    expect(previousYearAudit(current, others)).toBeNull();
    expect(compareAuditScores(current, [...others, previous])).toMatchObject({
      previousAudit: previous, current: { percentage: 100 }, previous: { percentage: 50 }, delta: 50,
      sections: [{ section: 'Sécurité', current: 100, previous: 50, delta: 50 }],
    });
  });
  it('selects the latest completed audit in year N-1 and retains missing chapters as unavailable', () => {
    const early = audit({ id: 'early', year: 2025, performedOn: '2025-01-01' });
    const latest = audit({ id: 'latest', year: 2025, performedOn: '2025-12-01', rows: [answer('conforme', 3, 'q1', 'Ancien chapitre')] });
    const comparison = compareAuditScores(audit(), [early, latest]);
    expect(comparison.previousAudit?.id).toBe('latest');
    expect(comparison.sections).toEqual([
      { section: 'Sécurité', current: 100, previous: null, delta: null },
      { section: 'Ancien chapitre', current: null, previous: 100, delta: null },
    ]);
    expect(compareAuditScores(audit(), []).delta).toBeNull();
  });
});

describe('audit template snapshots and validation', () => {
  it('imports all 61 reference rows across 11 ISM chapters and the user-confirmed missing barèmes', () => {
    expect(BBTM_AUDIT_QUESTIONS).toHaveLength(61);
    expect(new Set(BBTM_AUDIT_QUESTIONS.map((row) => row.section)).size).toBe(11);
    expect(BBTM_AUDIT_QUESTIONS.reduce((sum, row) => sum + row.maxPoints, 0)).toBe(183);
    expect(BBTM_AUDIT_QUESTIONS.filter((row) => ['10.4', '11.2.3'].includes(row.reference)).map((row) => row.maxPoints)).toEqual([3, 3]);
    expect(BBTM_AUDIT_SOURCE.sourceScoredRows).toBe(59);
    expect(questionIssues(BBTM_AUDIT_QUESTIONS)).toEqual([]);
  });
  it('copies rows independently so template changes cannot alter existing audit answers', () => {
    const template = createDefaultAuditTemplate(1, 'template');
    const snapshot = blankAuditAnswers(template.rows);
    const sourceQuestion = template.rows[0].question;
    template.rows[0].question = 'Nouvelle question LE ROZEL';
    snapshot[0].answer = 'conforme';
    expect(snapshot[0].question).toBe(sourceQuestion);
    expect(BBTM_AUDIT_QUESTIONS[0].question).toBe(sourceQuestion);
    expect(snapshot[0].observation).toBe('');
    expect(snapshot[1].answer).toBeNull();
  });
  it('requires a nonempty valid unique grid and all answers to complete the audit', () => {
    expect(completionIssues(audit())).toEqual([]);
    expect(completionIssues(audit({ rows: [] }))).toContain('La grille doit comporter au moins une question.');
    expect(completionIssues(audit({ rows: [answer(null)] }))).toContain('Répondez à toutes les questions avant de terminer l’audit.');
    expect(completionIssues(audit({ performedOn: null }))).toContain('Renseignez la date de réalisation.');
    expect(questionIssues([answer('conforme'), answer('conforme')])).toContain('Chaque ligne doit avoir un identifiant unique.');
    expect(questionIssues([answer('conforme', Number.NaN)])).toContain('Chaque barème doit être un nombre positif ou nul.');
  });
});

describe('audit findings and treatment ownership', () => {
  it('defaults major findings to one week, minor findings to one clamped calendar month, and remarks to no deadline', () => {
    expect(defaultFindingDuration('major')).toEqual({ amount: 1, unit: 'weeks' });
    expect(defaultFindingDuration('minor')).toEqual({ amount: 1, unit: 'months' });
    expect(defaultFindingDueOn('major', '2026-12-28')).toBe('2027-01-04');
    expect(defaultFindingDueOn('minor', '2026-01-31')).toBe('2026-02-28');
    expect(defaultFindingDueOn('minor', '2024-01-31')).toBe('2024-02-29');
    expect(defaultFindingDueOn('remark', '2026-10-01')).toBeNull();
    expect(auditDueOnFromDuration('2026-10-24', { amount: 2, unit: 'days' })).toBe('2026-10-26');
    expect(auditDueOnFromDuration('2026-10-24', { amount: 0, unit: 'days' })).toBeNull();
  });
  it('accepts a remark with no deadline and never flags it overdue', () => {
    const remark = finding({ severity: 'remark', dueOn: null, treatmentDelayValue: null, treatmentDelayUnit: null });
    expect(findingIssues(remark)).toEqual([]);
    expect(findingOverdue(remark, '2028-01-01')).toBe(false);
    expect(findingIssues(finding({ severity: 'remark' }))).toContain('Une remarque ne comporte pas de délai de traitement.');
  });
  it('accepts one named person or one vessel role and rejects ambiguous or missing assignment', () => {
    expect(findingIssues(finding())).toEqual([]);
    expect(findingIssues(finding({ assigneePersonId: 9, assigneeRole: null, assigneeVesselId: null }))).toEqual([]);
    for (const changes of [{ assigneePersonId: 9 }, { assigneeRole: null }, { assigneeVesselId: null }]) {
      expect(findingIssues(finding(changes))).toContain('Désignez une personne ou une fonction rattachée à un navire.');
    }
  });
  it('requires a valid deadline and treatment evidence before resolution/closure', () => {
    expect(findingIssues(finding({ dueOn: '2026-02-30' }))).toContain('Renseignez un délai de traitement valide.');
    expect(findingIssues(finding({ status: 'resolved' }))).toContain('Décrivez le traitement réalisé.');
    expect(findingIssues(finding({ status: 'closed', treatment: 'Document révisé et contrôlé' }))).toEqual([]);
  });
  it('marks unfinished findings overdue after their deadline while keeping the due day included', () => {
    expect(findingOverdue(finding(), '2026-10-31')).toBe(false);
    expect(findingOverdue(finding(), '2026-11-01')).toBe(true);
    expect(findingOverdue(finding({ status: 'in_progress' }), '2026-11-01')).toBe(true);
    expect(findingOverdue(finding({ status: 'resolved' }), '2026-11-01')).toBe(false);
    expect(findingOverdue(finding({ status: 'closed' }), '2026-11-01')).toBe(false);
  });
});
