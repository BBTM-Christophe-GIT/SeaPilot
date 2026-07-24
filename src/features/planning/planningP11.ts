import type { PlanningOverview } from './planningQueries';

export type PlanningRotationPattern = '7_7' | '10_10' | '14_14' | 'custom';
export type PlanningRotationEditScope = 'occurrence' | 'following' | 'series';
export type PlanningTemplateKind =
  | 'handover'
  | 'maritime_campaign'
  | 'safety_vessel'
  | 'transit'
  | 'maintenance'
  | 'provisioning'
  | 'bunkering'
  | 'training'
  | 'safety_drill';

export interface PlanningRotationOccurrence {
  id: number;
  seriesId: number;
  assignmentId: number;
  occurrenceNumber: number;
  startsOn: string;
  endsOn: string;
  restStartsOn: string;
  restEndsOn: string;
  handoverAt: string;
  isOverride: boolean;
}

export interface PlanningRotationSeries {
  id: number;
  vesselId: number;
  crewPersonId: number;
  captainPersonId: number | null;
  name: string;
  patternKey: PlanningRotationPattern;
  startsOn: string;
  onboardDays: number;
  restDays: number;
  occurrenceCount: number;
  assignmentRole: string;
  watchGroup: string;
  handoverMinutes: number;
  confirmationStatus: 'provisional' | 'confirmed';
  active: boolean;
  occurrences: PlanningRotationOccurrence[];
}

export interface PlanningTemplate {
  id: number;
  vesselId: number | null;
  name: string;
  templateKind: PlanningTemplateKind;
  description: string;
  defaultDurationDays: number;
  defaultStatus: 'draft' | 'planned' | 'confirmed';
  configuration: Record<string, unknown>;
  active: boolean;
}

export interface PlanningManningRequirement {
  id?: number;
  matrixId?: number;
  functionLabel: string;
  minimumCount: number;
  targetCount: number;
  requiredCertificates: string[];
  requiredQualifications: string[];
  requiredAuthorizations: string[];
  requiredTrainings: string[];
  restrictions: string[];
  displayOrder: number;
}

export interface PlanningManningMatrix {
  id: number;
  vesselId: number;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: 'draft' | 'active' | 'archived';
  notes: string;
  version: number;
  requirements: PlanningManningRequirement[];
}

export interface PlanningStcwCertificate {
  id: number;
  sourceItemId: number;
  name: string;
  category: string;
  stcwRules: string[];
}

export interface PlanningP11Data {
  rotations: PlanningRotationSeries[];
  templates: PlanningTemplate[];
  matrices: PlanningManningMatrix[];
  certificates: PlanningStcwCertificate[];
}

export interface PlanningRotationPreviewOccurrence {
  occurrenceNumber: number;
  startsOn: string;
  endsOn: string;
  restStartsOn: string;
  restEndsOn: string;
}

export interface PlanningManningNoncompliance {
  personId: number;
  personName: string;
  missing: string[];
}

export interface PlanningManningComparisonRow {
  functionLabel: string;
  minimumCount: number;
  targetCount: number;
  plannedCount: number;
  vacantCount: number;
  duplicateCount: number;
  noncompliant: PlanningManningNoncompliance[];
  restrictions: string[];
}

export const PLANNING_FUNCTION_GROUPS = [
  {
    label: 'Pont',
    functions: [
      'Capitaine',
      '2nd Capitaine',
      'Lieutenant pont',
      'Officier chef de quart passerelle',
      'Officier chargé de la sécurité',
      'Officier chargé de la sûreté du navire – SSO',
      'Officier chargé des opérations cargo',
      'Officier de positionnement dynamique – DPO',
      'Maître d’équipage',
      'Matelot qualifié pont',
      'Matelot',
      'Matelot de quart',
      'Matelot polyvalent pont/machine',
    ],
  },
  {
    label: 'Machine',
    functions: [
      'Chef mécanicien',
      '2nd Mécanicien',
      'Officier chef de quart machine',
      'Officier électrotechnicien – ETO',
      'Maître machine',
      'Matelot machine',
      'Matelot polyvalent pont/machine',
    ],
  },
] as const;

export const PLANNING_FUNCTION_OPTIONS = [
  ...new Set(PLANNING_FUNCTION_GROUPS.flatMap((group) => group.functions)),
];

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function rotationPatternDays(pattern: PlanningRotationPattern): { onboardDays: number; restDays: number } | null {
  if (pattern === '7_7') return { onboardDays: 7, restDays: 7 };
  if (pattern === '10_10') return { onboardDays: 10, restDays: 10 };
  if (pattern === '14_14') return { onboardDays: 14, restDays: 14 };
  return null;
}

export function buildRotationPreview(
  startsOn: string,
  onboardDays: number,
  restDays: number,
  occurrenceCount: number,
): PlanningRotationPreviewOccurrence[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || onboardDays < 1 || restDays < 1 || occurrenceCount < 1) return [];
  return Array.from({ length: occurrenceCount }, (_, index) => {
    const occurrenceStartsOn = addDays(startsOn, index * (onboardDays + restDays));
    const endsOn = addDays(occurrenceStartsOn, onboardDays - 1);
    return {
      occurrenceNumber: index + 1,
      startsOn: occurrenceStartsOn,
      endsOn,
      restStartsOn: addDays(endsOn, 1),
      restEndsOn: addDays(endsOn, restDays),
    };
  });
}

export function rotationPreviewHasOverlaps(preview: PlanningRotationPreviewOccurrence[]): boolean {
  return preview.some((occurrence, index) => index > 0 && occurrence.startsOn <= preview[index - 1].endsOn);
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function requirementTerms(requirement: PlanningManningRequirement): string[] {
  return [
    ...requirement.requiredCertificates,
    ...requirement.requiredQualifications,
    ...requirement.requiredAuthorizations,
    ...requirement.requiredTrainings,
  ].filter(Boolean);
}

function documentMatches(term: string, values: string[]): boolean {
  const expected = normalized(term);
  return values.some((value) => {
    const candidate = normalized(value);
    return candidate.includes(expected) || expected.includes(candidate);
  });
}

export function missingManningRequirementTerms(
  overview: PlanningOverview,
  personId: number,
  requirement: PlanningManningRequirement,
  validUntil: string,
): string[] {
  const person = overview.people.find((item) => item.id === personId);
  if (!person) return requirementTerms(requirement);
  const documents = overview.hrDocuments.filter((document) => document.personId === personId);
  const validDocuments = documents.filter((document) => {
    const invalidStatus = /(expire|invalide|refuse)/.test(normalized(document.status));
    return !invalidStatus && (!document.expiresOn || document.expiresOn >= validUntil);
  });
  const validDocumentValues = validDocuments.flatMap((document) => [document.title, document.categoryKey]);
  const allDocumentValues = documents.flatMap((document) => [document.title, document.categoryKey]);
  const profileCertificateValues = [person.deckCertificateLabel || '', person.engineCertificateLabel || ''].filter(Boolean);
  return requirementTerms(requirement).filter((term) => documentMatches(term, allDocumentValues)
    ? !documentMatches(term, validDocumentValues)
    : !documentMatches(term, profileCertificateValues));
}

export function buildManningMatrixComparison(
  overview: PlanningOverview,
  matrix: PlanningManningMatrix,
  startsOn: string,
  endsOn: string,
): PlanningManningComparisonRow[] {
  const peopleById = new Map(overview.people.map((person) => [person.id, person]));
  const assignments = overview.assignments.filter((assignment) =>
    assignment.vesselId === matrix.vesselId
    && assignment.confirmationStatus !== 'cancelled'
    && assignment.startsOn <= endsOn
    && assignment.endsOn >= startsOn,
  );

  return matrix.requirements
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((requirement) => {
      const expectedRole = normalized(requirement.functionLabel);
      const matchingAssignments = assignments.filter((assignment) => {
        const person = peopleById.get(assignment.crewPersonId);
        return [assignment.assignmentRole, person?.functionLabel || ''].some((role) => normalized(role) === expectedRole);
      });
      const noncompliant = matchingAssignments.flatMap((assignment) => {
        const missing = missingManningRequirementTerms(overview, assignment.crewPersonId, requirement, assignment.endsOn);
        return missing.length ? [{
          personId: assignment.crewPersonId,
          personName: assignment.crewName,
          missing,
        }] : [];
      });
      const plannedCount = matchingAssignments.length;
      return {
        functionLabel: requirement.functionLabel,
        minimumCount: requirement.minimumCount,
        targetCount: requirement.targetCount,
        plannedCount,
        vacantCount: Math.max(0, requirement.minimumCount - plannedCount),
        duplicateCount: Math.max(0, plannedCount - requirement.targetCount),
        noncompliant,
        restrictions: requirement.restrictions,
      };
    });
}

export function daysBetweenInclusive(startsOn: string, endsOn: string): number {
  return Math.round((Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / DAY_MS) + 1;
}
