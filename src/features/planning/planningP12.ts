import { formatPlanningPerson, normalizePlanningText, rangesOverlap } from './planningModel';
import type {
  PlanningAssignmentRecord,
  PlanningHrDocumentRecord,
  PlanningOverview,
  PlanningPerson,
} from './planningQueries';
import type { PlanningManningMatrix, PlanningManningRequirement } from './planningP11';

export type PlanningAbsenceType = 'leave' | 'illness' | 'training' | 'medical_visit' | 'unavailability' | 'recovery';
export type PlanningAbsenceStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';
export type PlanningConflictType =
  | 'double_assignment'
  | 'absence'
  | 'unavailability'
  | 'vacant_position'
  | 'invalid_certificate'
  | 'missing_qualification'
  | 'insufficient_staffing'
  | 'maintenance_incompatible'
  | 'incomplete_handover';
export type PlanningConflictSeverity = 'information' | 'warning' | 'blocking';
export type PlanningConflictPriority = 'low' | 'normal' | 'high' | 'critical';
export type PlanningConflictStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed' | 'derogated';

export interface PlanningAbsenceRecord {
  id: number;
  personId: number;
  absenceType: PlanningAbsenceType;
  startsAt: string;
  endsAt: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  status: PlanningAbsenceStatus;
  requestedBy: string;
  reviewedBy: string;
  reviewedAt: string;
  reviewComment: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningConflictCaseRecord {
  id: number;
  conflictKey: string;
  conflictType: PlanningConflictType;
  severity: PlanningConflictSeverity;
  title: string;
  description: string;
  personId: number | null;
  vesselId: number | null;
  assignmentId: number | null;
  projectId: number | null;
  handoverId: number | null;
  absenceId: number | null;
  startsOn: string;
  endsOn: string;
  ownerId: string;
  ownerName: string;
  priority: PlanningConflictPriority;
  status: PlanningConflictStatus;
  lastComment: string;
  derogationId: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string;
  updatedAt: string;
}

export interface PlanningConflictCaseHistoryRecord {
  id: number;
  caseId: number;
  action: string;
  comment: string;
  payload: Record<string, unknown>;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface PlanningP12Data {
  absences: PlanningAbsenceRecord[];
  conflictCases: PlanningConflictCaseRecord[];
  conflictHistory: PlanningConflictCaseHistoryRecord[];
  matrices: PlanningManningMatrix[];
}

export interface PlanningDetectedConflict {
  key: string;
  type: PlanningConflictType;
  severity: PlanningConflictSeverity;
  title: string;
  detail: string;
  personId: number | null;
  vesselId: number | null;
  assignmentId: number | null;
  projectId: number | null;
  handoverId: number | null;
  absenceId: number | null;
  startsOn: string;
  endsOn: string;
  functionLabel: string;
}

export type PlanningReplacementCompatibility = 'compatible' | 'warning' | 'incompatible';

export interface PlanningReplacementCandidate {
  person: PlanningPerson;
  compatibility: PlanningReplacementCompatibility;
  reasons: string[];
}

export interface PlanningReplacementFilters {
  functionLabel: string;
  qualification: string;
}

export interface PlanningDateRange {
  start: string;
  end: string;
}

const ABSENCE_TYPE_LABELS: Record<PlanningAbsenceType, string> = {
  leave: 'Congé',
  illness: 'Maladie',
  training: 'Formation',
  medical_visit: 'Visite médicale',
  unavailability: 'Indisponibilité',
  recovery: 'Récupération',
};

const CONFLICT_TYPE_LABELS: Record<PlanningConflictType, string> = {
  double_assignment: 'Double affectation',
  absence: 'Absence',
  unavailability: 'Indisponibilité',
  vacant_position: 'Poste vacant',
  invalid_certificate: 'Certificat invalide',
  missing_qualification: 'Qualification manquante',
  insufficient_staffing: 'Effectif insuffisant',
  maintenance_incompatible: 'Maintenance incompatible',
  incomplete_handover: 'Relève incomplète',
};

export function planningAbsenceTypeLabel(type: PlanningAbsenceType): string {
  return ABSENCE_TYPE_LABELS[type];
}

export function planningConflictTypeLabel(type: PlanningConflictType): string {
  return CONFLICT_TYPE_LABELS[type];
}

function absenceDecisionLabel(type: PlanningAbsenceType, approved: boolean): string {
  const feminine = type !== 'leave';
  return `${planningAbsenceTypeLabel(type)} ${approved ? (feminine ? 'validée' : 'validé') : (feminine ? 'demandée' : 'demandé')}`;
}

function dateIntersection(left: PlanningDateRange, right: PlanningDateRange): PlanningDateRange | null {
  const start = left.start > right.start ? left.start : right.start;
  const end = left.end < right.end ? left.end : right.end;
  return end >= start ? { start, end } : null;
}

function assignmentOverlaps(assignment: PlanningAssignmentRecord, range: PlanningDateRange): boolean {
  return assignment.confirmationStatus !== 'cancelled'
    && rangesOverlap(assignment.startsOn, assignment.endsOn, range.start, range.end);
}

function matchingRole(assignment: PlanningAssignmentRecord, functionLabel: string): boolean {
  const expected = normalizePlanningText(functionLabel);
  const actual = normalizePlanningText(assignment.assignmentRole);
  return Boolean(expected && actual && (expected.includes(actual) || actual.includes(expected)));
}

function assignmentPersonName(overview: PlanningOverview, assignment: PlanningAssignmentRecord): string {
  if (assignment.crewName) return assignment.crewName;
  const person = overview.people.find((item) => item.id === assignment.crewPersonId);
  return person ? formatPlanningPerson(person) : `Marin #${assignment.crewPersonId}`;
}

function vesselName(overview: PlanningOverview, vesselId: number | null): string {
  if (!vesselId) return 'Navire non renseigné';
  return overview.vessels.find((item) => item.id === vesselId)?.name || `Navire #${vesselId}`;
}

function conflict(input: Omit<PlanningDetectedConflict, 'personId' | 'vesselId' | 'assignmentId' | 'projectId' | 'handoverId' | 'absenceId' | 'functionLabel'> & Partial<Pick<PlanningDetectedConflict, 'personId' | 'vesselId' | 'assignmentId' | 'projectId' | 'handoverId' | 'absenceId' | 'functionLabel'>>): PlanningDetectedConflict {
  return {
    personId: null,
    vesselId: null,
    assignmentId: null,
    projectId: null,
    handoverId: null,
    absenceId: null,
    functionLabel: '',
    ...input,
  };
}

function activeMatrices(matrices: PlanningManningMatrix[], range: PlanningDateRange): PlanningManningMatrix[] {
  return matrices.filter((matrix) => matrix.status === 'active'
    && rangesOverlap(matrix.effectiveFrom, matrix.effectiveTo || '9999-12-31', range.start, range.end));
}

function requirementDocuments(requirement: PlanningManningRequirement): { certificates: string[]; qualifications: string[] } {
  return {
    certificates: requirement.requiredCertificates,
    qualifications: [
      ...requirement.requiredQualifications,
      ...requirement.requiredAuthorizations,
      ...requirement.requiredTrainings,
    ],
  };
}

function personDocumentValues(person: PlanningPerson, documents: PlanningHrDocumentRecord[]): string[] {
  return [
    person.functionLabel,
    person.gradeLabel,
    person.roleLabel,
    person.deckCertificateLabel || '',
    person.engineCertificateLabel || '',
    ...documents.flatMap((document) => [document.title, document.categoryKey]),
  ].filter(Boolean);
}

function termMatches(term: string, values: string[]): boolean {
  const expected = normalizePlanningText(term);
  return values.some((value) => {
    const candidate = normalizePlanningText(value);
    return candidate.includes(expected) || expected.includes(candidate);
  });
}

function documentIsValid(document: PlanningHrDocumentRecord, endsOn: string): boolean {
  const status = normalizePlanningText(document.status);
  return !document.medicalUnfit
    && !/(EXPIRE|INVALID|INVALIDE|MISSING|MANQUANT|REFUSE)/.test(status)
    && (!document.expiresOn || document.expiresOn >= endsOn);
}

function requirementFor(
  matrices: PlanningManningMatrix[],
  vesselId: number,
  functionLabel: string,
  startsOn: string,
  endsOn: string,
): PlanningManningRequirement | null {
  const matrix = activeMatrices(matrices, { start: startsOn, end: endsOn })
    .find((item) => item.vesselId === vesselId);
  return matrix?.requirements.find((item) => {
    const expected = normalizePlanningText(item.functionLabel);
    const actual = normalizePlanningText(functionLabel);
    return expected === actual || expected.includes(actual) || actual.includes(expected);
  }) || null;
}

function pushUnique(target: PlanningDetectedConflict[], item: PlanningDetectedConflict): void {
  if (!target.some((candidate) => candidate.key === item.key)) target.push(item);
}

export function buildPlanningP12Conflicts(
  overview: PlanningOverview,
  data: Pick<PlanningP12Data, 'absences' | 'matrices'>,
  range: PlanningDateRange,
): PlanningDetectedConflict[] {
  const detected: PlanningDetectedConflict[] = [];
  const assignments = overview.assignments.filter((assignment) => assignmentOverlaps(assignment, range));
  const assignmentsByPerson = new Map<number, PlanningAssignmentRecord[]>();
  for (const assignment of assignments) {
    const personAssignments = assignmentsByPerson.get(assignment.crewPersonId) || [];
    personAssignments.push(assignment);
    assignmentsByPerson.set(assignment.crewPersonId, personAssignments);
  }

  for (const [personId, personAssignments] of assignmentsByPerson) {
    const sorted = personAssignments.slice().sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.id - right.id);
    for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
        const left = sorted[leftIndex];
        const right = sorted[rightIndex];
        if (right.startsOn > left.endsOn) break;
        if (left.id === right.id || !rangesOverlap(left.startsOn, left.endsOn, right.startsOn, right.endsOn)) continue;
        const ids = [left.id, right.id].sort((a, b) => a - b);
        const overlap = dateIntersection({ start: left.startsOn, end: left.endsOn }, { start: right.startsOn, end: right.endsOn });
        if (!overlap) continue;
        pushUnique(detected, conflict({
          key: `double_assignment:${ids[0]}:${ids[1]}`,
          type: 'double_assignment', severity: 'blocking', title: 'Double affectation',
          detail: `${assignmentPersonName(overview, left)} est affecté simultanément à ${vesselName(overview, left.vesselId)} et ${vesselName(overview, right.vesselId)}.`,
          personId, vesselId: left.vesselId, assignmentId: left.id,
          startsOn: overlap.start, endsOn: overlap.end, functionLabel: left.assignmentRole,
        }));
      }
    }
  }

  for (const absence of data.absences) {
    if (!['requested', 'approved'].includes(absence.status) || !rangesOverlap(absence.startsOn, absence.endsOn, range.start, range.end)) continue;
    const impacted = assignments.filter((assignment) => assignment.crewPersonId === absence.personId
      && rangesOverlap(assignment.startsOn, assignment.endsOn, absence.startsOn, absence.endsOn));
    for (const assignment of impacted) {
      const overlap = dateIntersection(
        { start: assignment.startsOn, end: assignment.endsOn },
        { start: absence.startsOn, end: absence.endsOn },
      );
      if (!overlap) continue;
      const absenceType = absence.absenceType === 'unavailability' ? 'unavailability' : 'absence';
      pushUnique(detected, conflict({
        key: `${absenceType}:${absence.id}:assignment:${assignment.id}`,
        type: absenceType,
        severity: absence.status === 'approved' ? 'blocking' : 'warning',
        title: absenceDecisionLabel(absence.absenceType, absence.status === 'approved'),
        detail: `${assignmentPersonName(overview, assignment)} est planifié sur ${vesselName(overview, assignment.vesselId)} pendant cette période.`,
        personId: absence.personId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        absenceId: absence.id, startsOn: overlap.start, endsOn: overlap.end,
        functionLabel: assignment.assignmentRole,
      }));
      if (absence.status === 'approved') {
        pushUnique(detected, conflict({
          key: `vacant_position:absence:${absence.id}:assignment:${assignment.id}`,
          type: 'vacant_position', severity: 'blocking', title: `Poste vacant · ${assignment.assignmentRole}`,
          detail: `L’absence validée libère le poste de ${assignment.assignmentRole} sur ${vesselName(overview, assignment.vesselId)}.`,
          personId: absence.personId, vesselId: assignment.vesselId, assignmentId: assignment.id,
          absenceId: absence.id, startsOn: overlap.start, endsOn: overlap.end,
          functionLabel: assignment.assignmentRole,
        }));
      }
    }
  }

  const legacyUnavailabilityPattern = /(CONGE|ABSEN|MALAD|ARRET|REPOS|FORMATION|INDISPON)/;
  for (const period of overview.periods) {
    if (!period.personId || !legacyUnavailabilityPattern.test(normalizePlanningText(period.sailorStatus))
      || !rangesOverlap(period.startsOn, period.endsOn, range.start, range.end)) continue;
    const impacted = assignments.filter((assignment) => assignment.crewPersonId === period.personId
      && rangesOverlap(assignment.startsOn, assignment.endsOn, period.startsOn, period.endsOn));
    for (const assignment of impacted) {
      const overlap = dateIntersection(
        { start: assignment.startsOn, end: assignment.endsOn },
        { start: period.startsOn, end: period.endsOn },
      );
      if (!overlap) continue;
      pushUnique(detected, conflict({
        key: `unavailability:period:${period.id}:assignment:${assignment.id}`,
        type: 'unavailability', severity: 'blocking', title: 'Indisponibilité historique',
        detail: `${assignmentPersonName(overview, assignment)} est marqué « ${period.sailorStatus} » pendant son affectation.`,
        personId: period.personId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        startsOn: overlap.start, endsOn: overlap.end, functionLabel: assignment.assignmentRole,
      }));
    }
  }

  const documentsByPerson = new Map<number, PlanningHrDocumentRecord[]>();
  for (const document of overview.hrDocuments) {
    if (!document.personId) continue;
    const documents = documentsByPerson.get(document.personId) || [];
    documents.push(document);
    documentsByPerson.set(document.personId, documents);
  }

  for (const assignment of assignments) {
    const personDocuments = documentsByPerson.get(assignment.crewPersonId) || [];
    const invalidCredentials = personDocuments.filter((document) => {
      const credential = /(BREVET|CERTIFICAT|QUALIFICATION|HABILITATION)/.test(normalizePlanningText(`${document.categoryKey} ${document.title}`));
      return credential && !documentIsValid(document, assignment.endsOn);
    });
    for (const document of invalidCredentials) {
      pushUnique(detected, conflict({
        key: `invalid_certificate:${assignment.id}:${document.id}`,
        type: 'invalid_certificate', severity: 'blocking', title: 'Certificat invalide',
        detail: `${document.title} n’est pas valide jusqu’à la fin de l’affectation de ${assignmentPersonName(overview, assignment)}.`,
        personId: assignment.crewPersonId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        startsOn: assignment.startsOn, endsOn: assignment.endsOn, functionLabel: assignment.assignmentRole,
      }));
    }

    const requirement = requirementFor(data.matrices, assignment.vesselId, assignment.assignmentRole, assignment.startsOn, assignment.endsOn);
    if (!requirement) continue;
    const values = personDocumentValues(
      overview.people.find((person) => person.id === assignment.crewPersonId) || {
        id: assignment.crewPersonId, firstName: '', lastName: '', functionLabel: '', gradeLabel: '', roleLabel: '', contractType: '', hiredOn: '', departedOn: '', active: true,
      },
      personDocuments.filter((document) => documentIsValid(document, assignment.endsOn)),
    );
    const requirements = requirementDocuments(requirement);
    for (const term of requirements.certificates.filter((item) => !termMatches(item, values))) {
      pushUnique(detected, conflict({
        key: `invalid_certificate:requirement:${assignment.id}:${normalizePlanningText(term)}`,
        type: 'invalid_certificate', severity: 'blocking', title: `Certificat requis · ${term}`,
        detail: `${assignmentPersonName(overview, assignment)} ne dispose pas d’un certificat « ${term} » valide sur toute la période.`,
        personId: assignment.crewPersonId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        startsOn: assignment.startsOn, endsOn: assignment.endsOn, functionLabel: assignment.assignmentRole,
      }));
    }
    for (const term of requirements.qualifications.filter((item) => !termMatches(item, values))) {
      pushUnique(detected, conflict({
        key: `missing_qualification:${assignment.id}:${normalizePlanningText(term)}`,
        type: 'missing_qualification', severity: 'blocking', title: `Qualification requise · ${term}`,
        detail: `${assignmentPersonName(overview, assignment)} ne possède pas la qualification requise pour ${assignment.assignmentRole}.`,
        personId: assignment.crewPersonId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        startsOn: assignment.startsOn, endsOn: assignment.endsOn, functionLabel: assignment.assignmentRole,
      }));
    }
  }

  for (const matrix of activeMatrices(data.matrices, range)) {
    const matrixRange = dateIntersection(
      range,
      { start: matrix.effectiveFrom, end: matrix.effectiveTo || '9999-12-31' },
    );
    if (!matrixRange) continue;
    const vesselAssignments = assignments.filter((assignment) => assignment.vesselId === matrix.vesselId
      && rangesOverlap(assignment.startsOn, assignment.endsOn, matrixRange.start, matrixRange.end));
    for (const requirement of matrix.requirements) {
      const plannedCount = vesselAssignments.filter((assignment) => matchingRole(assignment, requirement.functionLabel)).length;
      if (plannedCount < requirement.targetCount) {
        pushUnique(detected, conflict({
          key: `vacant_position:matrix:${matrix.id}:requirement:${requirement.id || requirement.displayOrder}`,
          type: 'vacant_position', severity: plannedCount < requirement.minimumCount ? 'blocking' : 'warning',
          title: `Poste vacant · ${requirement.functionLabel}`,
          detail: `${plannedCount} planifié(s) pour une cible de ${requirement.targetCount} sur ${vesselName(overview, matrix.vesselId)}.`,
          vesselId: matrix.vesselId, startsOn: matrixRange.start, endsOn: matrixRange.end,
          functionLabel: requirement.functionLabel,
        }));
      }
      if (plannedCount < requirement.minimumCount) {
        pushUnique(detected, conflict({
          key: `insufficient_staffing:matrix:${matrix.id}:requirement:${requirement.id || requirement.displayOrder}`,
          type: 'insufficient_staffing', severity: 'blocking', title: `Effectif insuffisant · ${requirement.functionLabel}`,
          detail: `${plannedCount} planifié(s) pour un minimum obligatoire de ${requirement.minimumCount}.`,
          vesselId: matrix.vesselId, startsOn: matrixRange.start, endsOn: matrixRange.end,
          functionLabel: requirement.functionLabel,
        }));
      }
    }
  }

  const maintenanceProjects = overview.projects.filter((project) => project.eventType === 'maintenance'
    && !/(ANNULE|CANCEL)/.test(normalizePlanningText(project.status))
    && project.startsOn && rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end));
  for (const project of maintenanceProjects) {
    const projectVesselIds = [project.primaryVesselId, project.secondaryVesselId].filter((value): value is number => value !== null);
    for (const assignment of assignments.filter((item) => projectVesselIds.includes(item.vesselId))) {
      const overlap = dateIntersection(
        { start: assignment.startsOn, end: assignment.endsOn },
        { start: project.startsOn, end: project.endsOn || project.startsOn },
      );
      if (!overlap) continue;
      pushUnique(detected, conflict({
        key: `maintenance_incompatible:${project.id}:assignment:${assignment.id}`,
        type: 'maintenance_incompatible', severity: 'warning', title: 'Maintenance et embarquement simultanés',
        detail: `${project.title} chevauche l’affectation de ${assignmentPersonName(overview, assignment)} sur ${vesselName(overview, assignment.vesselId)}.`,
        personId: assignment.crewPersonId, vesselId: assignment.vesselId, assignmentId: assignment.id,
        projectId: project.id, startsOn: overlap.start, endsOn: overlap.end, functionLabel: assignment.assignmentRole,
      }));
    }
  }

  for (const handover of overview.handovers) {
    const handoverDate = handover.handoverAt.slice(0, 10);
    if (handover.status === 'cancelled' || !rangesOverlap(handoverDate, handoverDate, range.start, range.end)) continue;
    const incompletePositions = handover.positions.filter((position) => !position.outgoingPersonId || !position.incomingPersonId);
    if (!handover.positions.length || incompletePositions.length) {
      pushUnique(detected, conflict({
        key: `incomplete_handover:${handover.id}`,
        type: 'incomplete_handover',
        severity: ['confirmed', 'completed'].includes(handover.status) ? 'blocking' : 'warning',
        title: 'Relève incomplète',
        detail: handover.positions.length
          ? `${incompletePositions.length} poste(s) sans marin entrant ou sortant.`
          : 'Aucun poste entrant ou sortant n’est renseigné.',
        vesselId: handover.vesselId, handoverId: handover.id,
        startsOn: handoverDate, endsOn: handoverDate,
      }));
    }
  }

  const severityRank: Record<PlanningConflictSeverity, number> = { blocking: 0, warning: 1, information: 2 };
  return detected.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
    || left.startsOn.localeCompare(right.startsOn) || left.title.localeCompare(right.title, 'fr'));
}

export function absenceImpactedAssignments(
  overview: PlanningOverview,
  absence: PlanningAbsenceRecord,
): PlanningAssignmentRecord[] {
  return overview.assignments.filter((assignment) => assignment.crewPersonId === absence.personId
    && assignment.confirmationStatus !== 'cancelled'
    && rangesOverlap(assignment.startsOn, assignment.endsOn, absence.startsOn, absence.endsOn));
}

function incompatibleCredentialDocuments(documents: PlanningHrDocumentRecord[], endsOn: string): PlanningHrDocumentRecord[] {
  return documents.filter((document) => {
    const credential = /(BREVET|CERTIFICAT|QUALIFICATION|HABILITATION|MEDICAL|APTITUDE)/
      .test(normalizePlanningText(`${document.categoryKey} ${document.title}`));
    return credential && !documentIsValid(document, endsOn);
  });
}

export function buildPlanningReplacementCandidates(
  overview: PlanningOverview,
  data: Pick<PlanningP12Data, 'absences' | 'matrices'>,
  target: PlanningDetectedConflict,
  filters: PlanningReplacementFilters = { functionLabel: '', qualification: '' },
): PlanningReplacementCandidate[] {
  if (!target.vesselId || !target.startsOn || !target.endsOn) return [];
  const currentAssignment = target.assignmentId
    ? overview.assignments.find((assignment) => assignment.id === target.assignmentId)
    : null;
  const requiredFunction = filters.functionLabel || target.functionLabel || currentAssignment?.assignmentRole || '';
  const requirement = requirementFor(data.matrices, target.vesselId, requiredFunction, target.startsOn, target.endsOn);
  const requiredTerms = requirement ? requirementDocuments(requirement) : { certificates: [], qualifications: [] };
  const functionFilter = normalizePlanningText(filters.functionLabel);
  const qualificationFilter = normalizePlanningText(filters.qualification);
  const documentsByPerson = new Map<number, PlanningHrDocumentRecord[]>();
  for (const document of overview.hrDocuments) {
    if (!document.personId) continue;
    const documents = documentsByPerson.get(document.personId) || [];
    documents.push(document);
    documentsByPerson.set(document.personId, documents);
  }

  const candidates = overview.people.filter((person) => person.active
    && person.id !== currentAssignment?.crewPersonId
    && (!person.hiredOn || person.hiredOn <= target.endsOn)
    && (!person.departedOn || person.departedOn >= target.startsOn));

  return candidates.flatMap((person) => {
    const documents = documentsByPerson.get(person.id) || [];
    const allValues = personDocumentValues(person, documents);
    if (functionFilter && !termMatches(functionFilter, [person.functionLabel, person.gradeLabel, person.roleLabel])) return [];
    if (qualificationFilter && !termMatches(qualificationFilter, allValues)) return [];

    const blockingReasons: string[] = [];
    const warningReasons: string[] = [];
    const overlappingAssignment = overview.assignments.find((assignment) => assignment.crewPersonId === person.id
      && assignment.confirmationStatus !== 'cancelled'
      && rangesOverlap(assignment.startsOn, assignment.endsOn, target.startsOn, target.endsOn));
    if (overlappingAssignment) {
      blockingReasons.push(`Déjà affecté à ${vesselName(overview, overlappingAssignment.vesselId)} du ${overlappingAssignment.startsOn} au ${overlappingAssignment.endsOn}.`);
    }
    const overlappingAbsence = data.absences.find((absence) => absence.personId === person.id
      && absence.status === 'approved'
      && rangesOverlap(absence.startsOn, absence.endsOn, target.startsOn, target.endsOn));
    if (overlappingAbsence) blockingReasons.push(`${absenceDecisionLabel(overlappingAbsence.absenceType, true)} sur la période.`);

    const invalidDocuments = incompatibleCredentialDocuments(documents, target.endsOn);
    if (invalidDocuments.length) blockingReasons.push(`Document(s) invalide(s) : ${invalidDocuments.map((document) => document.title).join(', ')}.`);
    const validValues = personDocumentValues(person, documents.filter((document) => documentIsValid(document, target.endsOn)));
    const missingCertificates = requiredTerms.certificates.filter((term) => !termMatches(term, validValues));
    const missingQualifications = requiredTerms.qualifications.filter((term) => !termMatches(term, validValues));
    if (missingCertificates.length) blockingReasons.push(`Certificat(s) requis manquant(s) : ${missingCertificates.join(', ')}.`);
    if (missingQualifications.length) blockingReasons.push(`Qualification(s) requise(s) manquante(s) : ${missingQualifications.join(', ')}.`);

    if (requiredFunction && !termMatches(requiredFunction, [person.functionLabel, person.gradeLabel, person.roleLabel])) {
      warningReasons.push(`Fonction RH différente : ${person.functionLabel || person.gradeLabel || 'non renseignée'}.`);
    }
    const reasons = [...blockingReasons, ...warningReasons];
    return [{
      person,
      compatibility: blockingReasons.length ? 'incompatible' : warningReasons.length ? 'warning' : 'compatible',
      reasons: reasons.length ? reasons : ['Disponible, documents et qualifications compatibles sur la période.'],
    } satisfies PlanningReplacementCandidate];
  }).sort((left, right) => {
    const rank: Record<PlanningReplacementCompatibility, number> = { compatible: 0, warning: 1, incompatible: 2 };
    return rank[left.compatibility] - rank[right.compatibility]
      || formatPlanningPerson(left.person).localeCompare(formatPlanningPerson(right.person), 'fr');
  });
}
