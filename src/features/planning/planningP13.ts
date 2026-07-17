import { addPlanningDays, daysBetween, normalizePlanningText, rangesOverlap } from './planningModel';
import type { PlanningOverview, PlanningPerson } from './planningQueries';
import type { PlanningAbsenceRecord, PlanningConflictCaseRecord, PlanningP12Data } from './planningP12';

export type PlanningWorkRestScope = 'company' | 'vessel';

export interface PlanningWorkRestPolicy {
  id: number;
  name: string;
  scope: PlanningWorkRestScope;
  vesselId: number | null;
  effectiveFrom: string;
  effectiveTo: string;
  maxWork24h: number;
  minRest24h: number;
  maxWork7d: number;
  minRest7d: number;
  minConsecutiveRestHours: number;
  maxRestPeriods24h: number;
  nightStartsAt: string;
  nightEndsAt: string;
  maxNightWork24h: number;
  includeHandover: boolean;
  active: boolean;
  notes: string;
  updatedAt: string;
}

export type PlanningNotificationType =
  | 'new_assignment'
  | 'assignment_modified'
  | 'publication'
  | 'handover'
  | 'absence'
  | 'critical_conflict'
  | 'expiring_certificate'
  | 'vacant_position';

export interface PlanningNotificationRecord {
  id: number;
  notificationType: PlanningNotificationType;
  severity: 'information' | 'warning' | 'critical';
  title: string;
  body: string;
  entityKind: string;
  entityId: number | null;
  personId: number | null;
  vesselId: number | null;
  dueOn: string;
  createdAt: string;
  readAt: string;
}

export type PlanningDependencyType =
  | 'operation_sequence'
  | 'maintenance_recommission'
  | 'training_assignment'
  | 'delivery_operation';
export type PlanningDependencyEntityKind = 'project' | 'assignment' | 'absence' | 'handover';

export interface PlanningDependencyRecord {
  id: number;
  dependencyType: PlanningDependencyType;
  predecessorKind: PlanningDependencyEntityKind;
  predecessorId: number;
  successorKind: PlanningDependencyEntityKind;
  successorId: number;
  lagMinutes: number;
  vesselId: number | null;
  personId: number | null;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningP13Data {
  policies: PlanningWorkRestPolicy[];
  notifications: PlanningNotificationRecord[];
  dependencies: PlanningDependencyRecord[];
  p12: PlanningP12Data;
}

export type PlanningWorkRestRuleCode =
  | 'work_24h'
  | 'rest_24h'
  | 'work_7d'
  | 'rest_7d'
  | 'consecutive_rest'
  | 'rest_periods'
  | 'night_work';

export type PlanningWorkRestStatus = 'compliant' | 'non_compliant' | 'not_evaluable';

export interface PlanningWorkRestCheck {
  id: string;
  personId: number;
  personName: string;
  vesselId: number | null;
  vesselName: string;
  date: string;
  policyId: number | null;
  policyName: string;
  ruleCode: PlanningWorkRestRuleCode;
  ruleLabel: string;
  value: number | null;
  threshold: number | null;
  unit: 'hours' | 'periods';
  status: PlanningWorkRestStatus;
  detail: string;
  dataSource: string;
}

export interface PlanningDashboardMetrics {
  operatingVessels: number;
  embarkedSailors: number;
  availableSailors: number;
  upcomingHandovers: number;
  vacantPositions: number;
  criticalConflicts: number;
  coverageRate: number | null;
  complianceRate: number | null;
  deadlines7Days: number;
  deadlines14Days: number;
  deadlines30Days: number;
  unreadNotifications: number;
  dependencyViolations: number;
}

export interface PlanningDependencyViolation {
  dependency: PlanningDependencyRecord;
  predecessorLabel: string;
  successorLabel: string;
  predecessorEndsAt: string;
  successorStartsAt: string;
  requiredStartsAt: string;
  violated: boolean;
  detail: string;
}

export interface PlanningDateRange {
  start: string;
  end: string;
}

const RULE_LABELS: Record<PlanningWorkRestRuleCode, string> = {
  work_24h: 'Travail sur 24 heures',
  rest_24h: 'Repos sur 24 heures',
  work_7d: 'Travail sur 7 jours',
  rest_7d: 'Repos sur 7 jours',
  consecutive_rest: 'Repos consécutif',
  rest_periods: 'Nombre de périodes de repos',
  night_work: 'Travail de nuit',
};

export const PLANNING_DEPENDENCY_LABELS: Record<PlanningDependencyType, string> = {
  operation_sequence: 'Entre opérations',
  maintenance_recommission: 'Maintenance → remise en service',
  training_assignment: 'Formation → affectation',
  delivery_operation: 'Livraison → opération',
};

export const PLANNING_NOTIFICATION_LABELS: Record<PlanningNotificationType, string> = {
  new_assignment: 'Nouvelle affectation',
  assignment_modified: 'Affectation modifiée',
  publication: 'Publication',
  handover: 'Relève',
  absence: 'Absence',
  critical_conflict: 'Conflit critique',
  expiring_certificate: 'Certificat expirant',
  vacant_position: 'Poste vacant',
};

function personName(person: PlanningPerson | undefined, fallbackId: number): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : `Marin #${fallbackId}`;
}

function policyForDate(
  policies: PlanningWorkRestPolicy[],
  date: string,
  vesselId: number | null,
): PlanningWorkRestPolicy | null {
  const candidates = policies.filter((policy) => policy.active
    && policy.effectiveFrom <= date
    && (!policy.effectiveTo || policy.effectiveTo >= date)
    && (policy.scope === 'company' || policy.vesselId === vesselId));
  let selected: PlanningWorkRestPolicy | null = null;
  for (const policy of candidates) {
    if (!selected
      || (policy.scope === 'vessel' && selected.scope !== 'vessel')
      || (policy.scope === selected.scope && policy.effectiveFrom > selected.effectiveFrom)) {
      selected = policy;
    }
  }
  return selected;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function handoverHoursByPersonAndDate(overview: PlanningOverview): Map<string, number> {
  const result = new Map<string, number>();
  for (const handover of overview.handovers) {
    if (handover.status === 'cancelled') continue;
    const date = handover.handoverAt.slice(0, 10);
    const people = new Set<number>();
    for (const position of handover.positions) {
      if (position.outgoingPersonId) people.add(position.outgoingPersonId);
      if (position.incomingPersonId) people.add(position.incomingPersonId);
    }
    for (const personId of people) {
      const key = `${personId}:${date}`;
      result.set(key, (result.get(key) || 0) + handover.durationMinutes / 60);
    }
  }
  return result;
}

function makeCheck(input: Omit<PlanningWorkRestCheck, 'id' | 'ruleLabel' | 'status'> & {
  compliant: boolean | null;
}): PlanningWorkRestCheck {
  const status: PlanningWorkRestStatus = input.compliant === null
    ? 'not_evaluable'
    : input.compliant
      ? 'compliant'
      : 'non_compliant';
  return {
    ...input,
    id: `${input.personId}:${input.date}:${input.ruleCode}`,
    ruleLabel: RULE_LABELS[input.ruleCode],
    status,
  };
}

export function buildPlanningWorkRestChecks(
  overview: PlanningOverview,
  policies: PlanningWorkRestPolicy[],
  range: PlanningDateRange,
): PlanningWorkRestCheck[] {
  const peopleById = new Map(overview.people.map((person) => [person.id, person]));
  const vesselsById = new Map(overview.vessels.map((vessel) => [vessel.id, vessel]));
  const handovers = handoverHoursByPersonAndDate(overview);
  const days = overview.days
    .filter((day) => day.personId && day.workDate >= range.start && day.workDate <= range.end)
    .sort((left, right) => left.workDate.localeCompare(right.workDate));
  const daysByPerson = new Map<number, typeof days>();
  for (const day of days) {
    const personDays = daysByPerson.get(day.personId!) || [];
    personDays.push(day);
    daysByPerson.set(day.personId!, personDays);
  }
  const calculated7dByDayId = new Map<number, number | null>();
  for (const personDays of daysByPerson.values()) {
    let startIndex = 0;
    let total = 0;
    let missing = 0;
    for (let endIndex = 0; endIndex < personDays.length; endIndex += 1) {
      const current = personDays[endIndex];
      if (current.workedHours === null) missing += 1;
      else total += current.workedHours;
      const earliestDate = addPlanningDays(current.workDate, -6);
      while (personDays[startIndex]?.workDate < earliestDate) {
        const removed = personDays[startIndex];
        if (removed.workedHours === null) missing -= 1;
        else total -= removed.workedHours;
        startIndex += 1;
      }
      calculated7dByDayId.set(current.id, missing ? null : total);
    }
  }

  const checks: PlanningWorkRestCheck[] = [];
  for (const day of days) {
    const personId = day.personId!;
    const policy = policyForDate(policies, day.workDate, day.vesselId);
    const base = {
      personId,
      personName: personName(peopleById.get(personId), personId),
      vesselId: day.vesselId,
      vesselName: day.vesselId ? vesselsById.get(day.vesselId)?.name || day.vesselName : day.vesselName,
      date: day.workDate,
      policyId: policy?.id || null,
      policyName: policy?.name || 'Aucun seuil configuré',
      dataSource: day.sourceLabel,
    };
    const handoverHours = policy?.includeHandover ? handovers.get(`${personId}:${day.workDate}`) || 0 : 0;
    const workedHours = day.workedHours === null
      ? (handoverHours > 0 ? handoverHours : null)
      : day.workedHours + handoverHours;
    const calculated7d = calculated7dByDayId.get(day.id) ?? null;
    const worked7d = day.cumulative7d ?? calculated7d;
    const rest7d = worked7d === null ? null : Math.max(0, 168 - worked7d);

    const definitions: Array<{
      code: PlanningWorkRestRuleCode;
      value: number | null;
      threshold: number | null;
      compliant: boolean | null;
      unit: 'hours' | 'periods';
      detail: string;
    }> = [
      { code: 'work_24h', value: workedHours === null ? null : rounded(workedHours), threshold: policy?.maxWork24h ?? null, compliant: !policy || workedHours === null ? null : workedHours <= policy.maxWork24h, unit: 'hours', detail: handoverHours ? `Passation incluse : ${rounded(handoverHours)} h.` : 'Heures issues de la journée Planning.' },
      { code: 'rest_24h', value: day.rest24h, threshold: policy?.minRest24h ?? null, compliant: !policy || day.rest24h === null ? null : day.rest24h >= policy.minRest24h, unit: 'hours', detail: 'Repos déclaré ou importé sur la fenêtre de 24 heures.' },
      { code: 'work_7d', value: worked7d === null ? null : rounded(worked7d), threshold: policy?.maxWork7d ?? null, compliant: !policy || worked7d === null ? null : worked7d <= policy.maxWork7d, unit: 'hours', detail: day.cumulative7d === null ? 'Cumul calculé depuis les journées disponibles.' : 'Cumul sur 7 jours importé.' },
      { code: 'rest_7d', value: rest7d === null ? null : rounded(rest7d), threshold: policy?.minRest7d ?? null, compliant: !policy || rest7d === null ? null : rest7d >= policy.minRest7d, unit: 'hours', detail: 'Repos calculé comme la différence entre 168 heures et le travail cumulé.' },
      { code: 'consecutive_rest', value: day.consecutiveRestHours ?? null, threshold: policy?.minConsecutiveRestHours ?? null, compliant: !policy || day.consecutiveRestHours == null ? null : day.consecutiveRestHours >= policy.minConsecutiveRestHours, unit: 'hours', detail: 'Plus longue période de repos consécutif déclarée.' },
      { code: 'rest_periods', value: day.restPeriodCount ?? null, threshold: policy?.maxRestPeriods24h ?? null, compliant: !policy || day.restPeriodCount == null ? null : day.restPeriodCount <= policy.maxRestPeriods24h, unit: 'periods', detail: 'Nombre de périodes de repos sur 24 heures.' },
      { code: 'night_work', value: day.nightWorkHours ?? null, threshold: policy?.maxNightWork24h ?? null, compliant: !policy || day.nightWorkHours == null ? null : day.nightWorkHours <= policy.maxNightWork24h, unit: 'hours', detail: policy ? `Fenêtre de nuit configurée : ${policy.nightStartsAt}–${policy.nightEndsAt}.` : 'Aucune politique applicable.' },
    ];

    for (const definition of definitions) {
      checks.push(makeCheck({
        ...base,
        ruleCode: definition.code,
        value: definition.value,
        threshold: definition.threshold,
        unit: definition.unit,
        compliant: definition.compliant,
        detail: definition.detail,
      }));
    }
  }
  return checks;
}

interface DependencyEntity {
  startsAt: string;
  endsAt: string;
  label: string;
}

function endOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}

function startOfDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function dependencyEntities(overview: PlanningOverview, absences: PlanningAbsenceRecord[]): Map<string, DependencyEntity> {
  const entities = new Map<string, DependencyEntity>();
  for (const project of overview.projects) entities.set(`project:${project.id}`, { startsAt: startOfDay(project.startsOn), endsAt: endOfDay(project.endsOn), label: project.title });
  for (const assignment of overview.assignments) entities.set(`assignment:${assignment.id}`, { startsAt: assignment.startsAt || startOfDay(assignment.startsOn), endsAt: assignment.endsAt || endOfDay(assignment.endsOn), label: `${assignment.crewName} · ${assignment.vesselName}` });
  for (const absence of absences) entities.set(`absence:${absence.id}`, { startsAt: absence.startsAt, endsAt: absence.endsAt, label: `${absence.reason} · Marin #${absence.personId}` });
  for (const handover of overview.handovers) entities.set(`handover:${handover.id}`, { startsAt: handover.handoverAt, endsAt: new Date(Date.parse(handover.handoverAt) + handover.durationMinutes * 60_000).toISOString(), label: `Relève · ${handover.location}` });
  return entities;
}

export function buildPlanningDependencyViolations(
  overview: PlanningOverview,
  absences: PlanningAbsenceRecord[],
  dependencies: PlanningDependencyRecord[],
): PlanningDependencyViolation[] {
  const entities = dependencyEntities(overview, absences);
  return dependencies.filter((dependency) => dependency.active).map((dependency) => {
    const predecessor = entities.get(`${dependency.predecessorKind}:${dependency.predecessorId}`);
    const successor = entities.get(`${dependency.successorKind}:${dependency.successorId}`);
    if (!predecessor || !successor) {
      return {
        dependency,
        predecessorLabel: predecessor?.label || 'Élément source introuvable',
        successorLabel: successor?.label || 'Élément cible introuvable',
        predecessorEndsAt: predecessor?.endsAt || '',
        successorStartsAt: successor?.startsAt || '',
        requiredStartsAt: '',
        violated: true,
        detail: 'La dépendance référence un élément supprimé ou non visible.',
      };
    }
    const requiredStartsAt = new Date(Date.parse(predecessor.endsAt) + dependency.lagMinutes * 60_000).toISOString();
    const violated = Date.parse(successor.startsAt) < Date.parse(requiredStartsAt);
    return {
      dependency,
      predecessorLabel: predecessor.label,
      successorLabel: successor.label,
      predecessorEndsAt: predecessor.endsAt,
      successorStartsAt: successor.startsAt,
      requiredStartsAt,
      violated,
      detail: violated
        ? `La cible débute avant la fin de la source et le délai de ${dependency.lagMinutes} minutes.`
        : `Le délai de ${dependency.lagMinutes} minutes est respecté.`,
    };
  });
}

function activeConflict(conflictCase: PlanningConflictCaseRecord): boolean {
  return !['resolved', 'dismissed'].includes(conflictCase.status);
}

function expiringWithin(date: string, referenceDate: string, days: number): boolean {
  if (!date) return false;
  const delta = daysBetween(referenceDate, date);
  return delta >= 0 && delta <= days;
}

export function buildPlanningP13Dashboard(
  overview: PlanningOverview,
  data: PlanningP13Data,
  checks: PlanningWorkRestCheck[],
  dependencyViolations: PlanningDependencyViolation[],
  referenceDate: string,
): PlanningDashboardMetrics {
  const activeAssignments = overview.assignments.filter((assignment) => assignment.confirmationStatus !== 'cancelled'
    && assignment.startsOn <= referenceDate && assignment.endsOn >= referenceDate);
  const embarkedIds = new Set(activeAssignments.map((assignment) => assignment.crewPersonId));
  const absentIds = new Set(data.p12.absences.filter((absence) => absence.status === 'approved'
    && absence.startsOn <= referenceDate && absence.endsOn >= referenceDate).map((absence) => absence.personId));
  const activePeople = overview.people.filter((person) => person.active
    && (!person.hiredOn || person.hiredOn <= referenceDate)
    && (!person.departedOn || person.departedOn >= referenceDate));
  const activeCases = data.p12.conflictCases.filter(activeConflict);
  const vacancies = activeCases.filter((conflictCase) => conflictCase.conflictType === 'vacant_position');
  const critical = activeCases.filter((conflictCase) => conflictCase.priority === 'critical' || conflictCase.severity === 'blocking');
  const activeMatrices = data.p12.matrices.filter((matrix) => matrix.status === 'active'
    && matrix.effectiveFrom <= referenceDate && (!matrix.effectiveTo || matrix.effectiveTo >= referenceDate));
  let requiredPositions = 0;
  let coveredPositions = 0;
  for (const matrix of activeMatrices) {
    const assignments = activeAssignments.filter((assignment) => assignment.vesselId === matrix.vesselId);
    for (const requirement of matrix.requirements) {
      requiredPositions += requirement.targetCount;
      const expected = normalizePlanningText(requirement.functionLabel);
      const actual = assignments.filter((assignment) => {
        const label = normalizePlanningText(assignment.assignmentRole);
        return expected.includes(label) || label.includes(expected);
      }).length;
      coveredPositions += Math.min(actual, requirement.targetCount);
    }
  }
  const evaluableChecks = checks.filter((check) => check.status !== 'not_evaluable');
  const compliantChecks = evaluableChecks.filter((check) => check.status === 'compliant').length;
  const certificateDates = [
    ...overview.certificates.map((certificate) => certificate.expiresOn),
    ...overview.hrDocuments.map((document) => document.expiresOn),
  ].filter(Boolean);
  const operatingVessels = new Set(overview.projects.filter((project) => project.eventType === 'operation'
    && rangesOverlap(project.startsOn, project.endsOn, referenceDate, referenceDate)
    && !normalizePlanningText(project.status).includes('ANNU')).flatMap((project) => [project.primaryVesselId, project.secondaryVesselId]).filter(Boolean));
  return {
    operatingVessels: operatingVessels.size,
    embarkedSailors: embarkedIds.size,
    availableSailors: activePeople.filter((person) => !embarkedIds.has(person.id) && !absentIds.has(person.id)).length,
    upcomingHandovers: overview.handovers.filter((handover) => handover.status !== 'cancelled'
      && handover.handoverAt.slice(0, 10) >= referenceDate
      && handover.handoverAt.slice(0, 10) <= addPlanningDays(referenceDate, 30)).length,
    vacantPositions: vacancies.length,
    criticalConflicts: critical.length,
    coverageRate: requiredPositions ? rounded((coveredPositions / requiredPositions) * 100) : null,
    complianceRate: evaluableChecks.length ? rounded((compliantChecks / evaluableChecks.length) * 100) : null,
    deadlines7Days: certificateDates.filter((date) => expiringWithin(date, referenceDate, 7)).length,
    deadlines14Days: certificateDates.filter((date) => expiringWithin(date, referenceDate, 14)).length,
    deadlines30Days: certificateDates.filter((date) => expiringWithin(date, referenceDate, 30)).length,
    unreadNotifications: data.notifications.filter((notification) => !notification.readAt).length,
    dependencyViolations: dependencyViolations.filter((violation) => violation.violated).length,
  };
}
