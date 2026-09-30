export type AuditAnswerValue = 'conforme' | 'incomplet' | 'non_conforme' | 'na';
export type AuditStatus = 'planned' | 'in_progress' | 'completed';
export type AuditFindingSeverity = 'major' | 'minor' | 'remark';
export type AuditFindingStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type AuditAssigneeRole = 'captain' | 'chief_engineer' | 'crew';

export interface AuditSite {
  id: string;
  companyId: number;
  name: string;
  kind: 'shore' | 'vessel';
  vesselId: number | null;
  anniversaryOn: string | null;
}

export interface AuditQuestion {
  id: string;
  section: string;
  reference: string;
  question: string;
  maxPoints: number;
  guidance: string;
}

export interface AuditTemplate {
  id: string;
  companyId: number;
  siteId: string | null;
  name: string;
  version: number;
  rows: AuditQuestion[];
  active: boolean;
}

export interface AuditAnswer extends AuditQuestion {
  answer: AuditAnswerValue | null;
  observation: string;
}

export interface InternalAudit {
  id: string;
  companyId: number;
  siteId: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  year: number;
  plannedOn: string;
  performedOn: string | null;
  auditorName: string;
  status: AuditStatus;
  rows: AuditAnswer[];
  completedAt: string | null;
}

export interface AuditFinding {
  id: string;
  companyId: number;
  auditId: string;
  questionId: string;
  reference: string;
  severity: AuditFindingSeverity;
  description: string;
  assigneePersonId: number | null;
  assigneeRole: AuditAssigneeRole | null;
  assigneeVesselId: number | null;
  assigneeLabel: string;
  dueOn: string;
  status: AuditFindingStatus;
  treatment: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface AuditFindingEvent {
  id: string;
  findingId: string;
  actorId: string | null;
  actorName: string;
  createdAt: string;
  status: AuditFindingStatus;
  treatment: string;
}

export const AUDIT_ANSWER_LABELS: Record<AuditAnswerValue, string> = {
  conforme: 'Conforme', incomplet: 'Incomplet', non_conforme: 'Non Conforme', na: 'N/A',
};
export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
  planned: 'Planifié', in_progress: 'En cours', completed: 'Réalisé',
};
export const FINDING_SEVERITY_LABELS: Record<AuditFindingSeverity, string> = {
  major: 'Non conformité majeure', minor: 'Non conformité mineure', remark: 'Remarque',
};
export const FINDING_STATUS_LABELS: Record<AuditFindingStatus, string> = {
  open: 'À traiter', in_progress: 'En cours', resolved: 'Traité, à vérifier', closed: 'Clos',
};
export const ASSIGNEE_ROLE_LABELS: Record<AuditAssigneeRole, string> = {
  captain: 'Capitaines', chief_engineer: 'Chefs Mécaniciens', crew: 'Équipage',
};

export interface AuditScore {
  earnedPoints: number;
  maxPoints: number;
  percentage: number | null;
  answeredCount: number;
  totalCount: number;
  excludedCount: number;
}

/** N/A removes its barème from the denominator; unanswered applicable rows stay in it. */
export function scoreAudit(rows: readonly AuditAnswer[]): AuditScore {
  let earnedPoints = 0;
  let maxPoints = 0;
  let answeredCount = 0;
  let excludedCount = 0;
  let scoredAnswerCount = 0;
  for (const row of rows) {
    const points = Number.isFinite(row.maxPoints) && row.maxPoints >= 0 ? row.maxPoints : 0;
    if (row.answer !== null) answeredCount += 1;
    if (row.answer === 'na') {
      excludedCount += 1;
      continue;
    }
    maxPoints += points;
    if (row.answer !== null && points > 0) scoredAnswerCount += 1;
    if (row.answer === 'conforme') earnedPoints += points;
    if (row.answer === 'incomplet') earnedPoints += points / 2;
  }
  return {
    earnedPoints, maxPoints,
    percentage: maxPoints > 0 && scoredAnswerCount > 0 ? earnedPoints / maxPoints * 100 : null,
    answeredCount, totalCount: rows.length, excludedCount,
  };
}

export function scoreBySection(rows: readonly AuditAnswer[]): (AuditScore & { section: string })[] {
  const sections = new Map<string, AuditAnswer[]>();
  for (const row of rows) {
    const section = row.section.trim() || 'Sans chapitre';
    const group = sections.get(section) ?? [];
    group.push(row);
    sections.set(section, group);
  }
  return [...sections.entries()].map(([section, answers]) => ({ section, ...scoreAudit(answers) }));
}

export function blankAuditAnswers(rows: readonly AuditQuestion[]): AuditAnswer[] {
  return rows.map((row) => ({ ...row, answer: null, observation: '' }));
}

/** Date-only calculations use UTC to preserve calendar days through DST changes. */
export function isAuditDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

export function addAuditMonths(value: string, months: number): string {
  if (!isAuditDate(value) || !Number.isInteger(months)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

export function nextAnnualDate(performedOn: string): string {
  return addAuditMonths(performedOn, 12);
}

export interface AuditWindow {
  targetOn: string;
  opensOn: string;
  closesOn: string;
}

export function auditWindow(targetOn: string): AuditWindow {
  return {
    targetOn: isAuditDate(targetOn) ? targetOn : '',
    opensOn: addAuditMonths(targetOn, -3),
    closesOn: addAuditMonths(targetOn, 3),
  };
}

/** Keep the site's fixed anniversary when the scheduled day moves within its annual window. */
export function annualAuditWindow(site: AuditSite, year: number, firstPlannedOn = ''): AuditWindow {
  const anchor = site.anniversaryOn && isAuditDate(site.anniversaryOn) ? site.anniversaryOn : firstPlannedOn;
  if (!anchor || !isAuditDate(anchor) || !Number.isInteger(year) || year < 1000 || year > 9999) return auditWindow('');
  const targetOn = addAuditMonths(anchor, (year - Number(anchor.slice(0, 4))) * 12);
  return auditWindow(targetOn);
}

export function plannedAuditDateIssues(site: AuditSite, audit: InternalAudit): string[] {
  if (!isAuditDate(audit.plannedOn)) return ['Renseignez une date de planification valide.'];
  const window = annualAuditWindow(site, audit.year, audit.plannedOn);
  if (!window.targetOn) return ['Renseignez une année de campagne valide.'];
  return audit.plannedOn < window.opensOn || audit.plannedOn > window.closesOn
    ? ['La date planifiée doit se situer dans la fenêtre annuelle de trois mois avant ou après la date anniversaire.'] : [];
}

export function todayAuditParis(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function formatAuditDate(value: string | null): string {
  return value && isAuditDate(value) ? value.split('-').reverse().join('/') : '—';
}

export type AuditPlanningStatus = 'unscheduled' | 'upcoming' | 'window' | 'overdue' | 'in_progress' | 'completed';
export const PLANNING_STATUS_LABELS: Record<AuditPlanningStatus, string> = {
  unscheduled: 'À planifier', upcoming: 'À venir', window: 'Fenêtre ouverte',
  overdue: 'En retard', in_progress: 'En cours', completed: 'Réalisé',
};

export interface AuditPlanningEntry {
  status: AuditPlanningStatus;
  targetOn: string | null;
  opensOn: string | null;
  closesOn: string | null;
  audit: InternalAudit | null;
}

export function planningStatus(site: AuditSite, audits: readonly InternalAudit[], today = todayAuditParis()): AuditPlanningEntry {
  const siteAudits = audits.filter((audit) => audit.companyId === site.companyId && audit.siteId === site.id);
  const pending = siteAudits.filter((audit) => audit.status !== 'completed')
    .sort((left, right) => left.plannedOn.localeCompare(right.plannedOn) || left.id.localeCompare(right.id))[0];
  const completed = siteAudits.filter((audit) => audit.status === 'completed' && audit.performedOn && isAuditDate(audit.performedOn))
    .sort((left, right) => (right.performedOn ?? '').localeCompare(left.performedOn ?? '') || right.id.localeCompare(left.id))[0];
  const anchorYear = site.anniversaryOn ? Number(site.anniversaryOn.slice(0, 4)) : 0;
  const targetYear = pending?.year ?? (completed ? completed.year + 1 : anchorYear || Number(today.slice(0, 4)));
  const fallbackOn = pending?.plannedOn || (completed?.performedOn ? nextAnnualDate(completed.performedOn) : '');
  const window = annualAuditWindow(site, targetYear, fallbackOn);
  if (!window.targetOn) {
    return { status: 'unscheduled', targetOn: null, opensOn: null, closesOn: null, audit: pending ?? completed ?? null };
  }
  const status: AuditPlanningStatus = today > window.closesOn ? 'overdue'
    : pending?.status === 'in_progress' ? 'in_progress'
      : today >= window.opensOn ? 'window'
        : !pending && completed?.year === Number(today.slice(0, 4)) ? 'completed' : 'upcoming';
  return { status, ...window, audit: pending ?? completed ?? null };
}

/** Only the immediately previous audit year for the same site and company is comparable. */
export function previousYearAudit(audit: InternalAudit, audits: readonly InternalAudit[]): InternalAudit | null {
  return audits.filter((candidate) => candidate.id !== audit.id && candidate.companyId === audit.companyId
    && candidate.siteId === audit.siteId && candidate.status === 'completed' && candidate.year === audit.year - 1)
    .sort((left, right) => (right.performedOn ?? '').localeCompare(left.performedOn ?? '')
      || (right.completedAt ?? '').localeCompare(left.completedAt ?? '') || right.id.localeCompare(left.id))[0] ?? null;
}

export interface AuditScoreComparison {
  previousAudit: InternalAudit | null;
  current: AuditScore;
  previous: AuditScore | null;
  delta: number | null;
  sections: { section: string; current: number | null; previous: number | null; delta: number | null }[];
}

export function compareAuditScores(audit: InternalAudit, audits: readonly InternalAudit[]): AuditScoreComparison {
  const previousAudit = previousYearAudit(audit, audits);
  const current = scoreAudit(audit.rows);
  const previous = previousAudit ? scoreAudit(previousAudit.rows) : null;
  const currentSections = scoreBySection(audit.rows);
  const previousSections = previousAudit ? scoreBySection(previousAudit.rows) : [];
  const names = [...new Set([...currentSections.map((row) => row.section), ...previousSections.map((row) => row.section)])];
  const difference = (latest: number | null, prior: number | null) => latest !== null && prior !== null ? latest - prior : null;
  return {
    previousAudit, current, previous,
    delta: difference(current.percentage, previous?.percentage ?? null),
    sections: names.map((section) => {
      const latest = currentSections.find((row) => row.section === section)?.percentage ?? null;
      const prior = previousSections.find((row) => row.section === section)?.percentage ?? null;
      return { section, current: latest, previous: prior, delta: difference(latest, prior) };
    }),
  };
}

export function questionIssues(rows: readonly AuditQuestion[]): string[] {
  const issues: string[] = [];
  if (rows.length === 0) issues.push('La grille doit comporter au moins une question.');
  if (new Set(rows.map((row) => row.id)).size !== rows.length || rows.some((row) => !row.id.trim())) {
    issues.push('Chaque ligne doit avoir un identifiant unique.');
  }
  if (rows.some((row) => !row.question.trim())) issues.push('Renseignez le texte de chaque question.');
  if (rows.some((row) => !row.section.trim())) issues.push('Renseignez le chapitre de chaque question.');
  if (rows.some((row) => !Number.isFinite(row.maxPoints) || row.maxPoints < 0)) {
    issues.push('Chaque barème doit être un nombre positif ou nul.');
  }
  return issues;
}

export function completionIssues(audit: InternalAudit): string[] {
  const issues = questionIssues(audit.rows);
  if (!isAuditDate(audit.plannedOn)) issues.push('Renseignez une date de planification valide.');
  if (!audit.performedOn || !isAuditDate(audit.performedOn)) issues.push('Renseignez la date de réalisation.');
  if (!audit.auditorName.trim()) issues.push('Renseignez le nom de l’auditeur.');
  if (audit.rows.some((row) => row.answer === null || !Object.hasOwn(AUDIT_ANSWER_LABELS, row.answer))) {
    issues.push('Répondez à toutes les questions avant de terminer l’audit.');
  }
  return issues;
}

export function findingIssues(finding: AuditFinding): string[] {
  const issues: string[] = [];
  if (!finding.description.trim()) issues.push('Décrivez l’écart constaté.');
  if (!isAuditDate(finding.dueOn)) issues.push('Renseignez un délai de traitement valide.');
  const person = Number.isInteger(finding.assigneePersonId) && (finding.assigneePersonId ?? 0) > 0;
  const role = finding.assigneeRole !== null && Object.hasOwn(ASSIGNEE_ROLE_LABELS, finding.assigneeRole);
  if (person === role || (role && !(Number.isInteger(finding.assigneeVesselId) && (finding.assigneeVesselId ?? 0) > 0))
    || (person && finding.assigneeVesselId !== null)) {
    issues.push('Désignez une personne ou une fonction rattachée à un navire.');
  }
  if (!Object.hasOwn(FINDING_SEVERITY_LABELS, finding.severity)) issues.push('Choisissez un type d’écart.');
  if (!Object.hasOwn(FINDING_STATUS_LABELS, finding.status)) issues.push('Choisissez un statut de traitement.');
  if (['resolved', 'closed'].includes(finding.status) && !finding.treatment.trim()) issues.push('Décrivez le traitement réalisé.');
  return issues;
}

export function findingOverdue(finding: AuditFinding, today = todayAuditParis()): boolean {
  return finding.status !== 'closed' && finding.status !== 'resolved' && isAuditDate(finding.dueOn) && finding.dueOn < today;
}
