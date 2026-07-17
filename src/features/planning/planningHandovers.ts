import { addPlanningDays, planningLocalDateTimeToUtc } from './planningDates';
import {
  evaluatePlanningAssignment,
  formatPlanningPerson,
  getAllPlanningCrewEvents,
  normalizePlanningText,
  type PlanningControlResult,
} from './planningModel';
import type {
  PlanningAssignmentRecord,
  PlanningHandoverPositionRecord,
  PlanningOverview,
  SavePlanningHandoverPositionInput,
} from './planningQueries';

export type PlanningHandoverComparisonStatus = 'unchanged' | 'replaced' | 'vacant' | 'noncompliant';

export interface PlanningHandoverComparisonRow {
  key: string;
  functionLabel: string;
  outgoingPersonId: number | null;
  outgoingPersonName: string;
  incomingPersonId: number | null;
  incomingPersonName: string;
  status: PlanningHandoverComparisonStatus;
  documentIssues: PlanningControlResult[];
  qualificationIssues: PlanningControlResult[];
  controls: PlanningControlResult[];
}

function assignmentStartsAt(assignment: PlanningAssignmentRecord): number {
  return new Date(assignment.startsAt || planningLocalDateTimeToUtc(`${assignment.startsOn}T00:00`)).getTime();
}

function assignmentEndsAt(assignment: PlanningAssignmentRecord): number {
  return new Date(assignment.endsAt || planningLocalDateTimeToUtc(`${assignment.endsOn}T23:59`)).getTime();
}

function assignmentRoleKey(assignment: PlanningAssignmentRecord): string {
  return normalizePlanningText(assignment.assignmentRole) || 'EQUIPAGE';
}

export function buildPlanningHandoverPositions(
  assignments: PlanningAssignmentRecord[],
  vesselId: number,
  handoverAt: string,
): SavePlanningHandoverPositionInput[] {
  if (!vesselId || !handoverAt) return [];
  const instant = new Date(planningLocalDateTimeToUtc(handoverAt)).getTime();
  const window = 24 * 60 * 60 * 1000;
  const relevant = assignments.filter((assignment) => (
    assignment.vesselId === vesselId
    && assignment.confirmationStatus !== 'cancelled'
    && assignmentStartsAt(assignment) <= instant + window
    && assignmentEndsAt(assignment) >= instant - window
  ));
  const outgoing = relevant.filter((assignment) => (
    assignmentStartsAt(assignment) < instant
    && assignmentEndsAt(assignment) >= instant - window
  ));
  const incoming = relevant.filter((assignment) => (
    assignmentEndsAt(assignment) > instant
    && assignmentStartsAt(assignment) <= instant + window
  ));
  const roleKeys = [...new Set([...outgoing, ...incoming].map(assignmentRoleKey))];
  const positions: SavePlanningHandoverPositionInput[] = [];

  roleKeys.forEach((roleKey) => {
    const outgoingForRole = outgoing.filter((assignment) => assignmentRoleKey(assignment) === roleKey);
    const incomingForRole = incoming.filter((assignment) => assignmentRoleKey(assignment) === roleKey);
    const rowCount = Math.max(outgoingForRole.length, incomingForRole.length);
    for (let index = 0; index < rowCount; index += 1) {
      const outgoingAssignment = outgoingForRole[index];
      const incomingAssignment = incomingForRole[index];
      positions.push({
        functionLabel: incomingAssignment?.assignmentRole || outgoingAssignment?.assignmentRole || 'Équipage',
        outgoingPersonId: outgoingAssignment ? String(outgoingAssignment.crewPersonId) : '',
        incomingPersonId: incomingAssignment ? String(incomingAssignment.crewPersonId) : '',
        outgoingAssignmentId: outgoingAssignment ? String(outgoingAssignment.id) : '',
        incomingAssignmentId: incomingAssignment ? String(incomingAssignment.id) : '',
        comments: '',
      });
    }
  });

  return positions;
}

export function handoverPositionInputFromRecord(position: PlanningHandoverPositionRecord): SavePlanningHandoverPositionInput {
  return {
    functionLabel: position.functionLabel,
    outgoingPersonId: position.outgoingPersonId === null ? '' : String(position.outgoingPersonId),
    incomingPersonId: position.incomingPersonId === null ? '' : String(position.incomingPersonId),
    outgoingAssignmentId: position.outgoingAssignmentId === null ? '' : String(position.outgoingAssignmentId),
    incomingAssignmentId: position.incomingAssignmentId === null ? '' : String(position.incomingAssignmentId),
    comments: position.comments,
  };
}

export function buildPlanningHandoverComparison(
  overview: PlanningOverview,
  vesselId: number,
  handoverAt: string,
  positions: Array<SavePlanningHandoverPositionInput | PlanningHandoverPositionRecord>,
): PlanningHandoverComparisonRow[] {
  const peopleById = new Map(overview.people.map((person) => [person.id, person]));
  const vessel = overview.vessels.find((item) => item.id === vesselId);
  const assignmentById = new Map(overview.assignments.map((assignment) => [assignment.id, assignment]));
  const eventPool = getAllPlanningCrewEvents(overview);
  const handoverDate = handoverAt.slice(0, 10);

  return positions.map((position, index) => {
    const outgoingPersonId = Number(position.outgoingPersonId) || null;
    const incomingPersonId = Number(position.incomingPersonId) || null;
    const incomingAssignmentId = Number(position.incomingAssignmentId) || null;
    const incomingAssignment = incomingAssignmentId === null ? undefined : assignmentById.get(incomingAssignmentId);
    const incomingPerson = incomingPersonId === null ? undefined : peopleById.get(incomingPersonId);
    const outgoingPerson = outgoingPersonId === null ? undefined : peopleById.get(outgoingPersonId);
    const controls = incomingPersonId === null ? [] : evaluatePlanningAssignment(overview, {
      id: incomingAssignment ? `assignment-${incomingAssignment.id}` : `handover-${index}`,
      personId: incomingPersonId,
      person: incomingPerson ? formatPlanningPerson(incomingPerson) : `Marin #${incomingPersonId}`,
      vessel: vessel?.name || `Navire #${vesselId}`,
      functionLabel: position.functionLabel,
      status: 'En Mer',
      startsOn: incomingAssignment?.startsOn || handoverDate,
      endsOn: incomingAssignment?.endsOn || addPlanningDays(handoverDate, 1),
      startsAt: incomingAssignment?.startsAt,
      endsAt: incomingAssignment?.endsAt,
    }, eventPool);
    const documentIssues = controls.filter((control) => control.code === 'pending_validation');
    const qualificationIssues = controls.filter((control) => control.code === 'missing_qualification');
    const noncompliant = controls.some((control) => control.level === 'blocking' || control.level === 'warning');
    let status: PlanningHandoverComparisonStatus = 'replaced';
    if (incomingPersonId === null) status = 'vacant';
    else if (noncompliant) status = 'noncompliant';
    else if (outgoingPersonId === incomingPersonId) status = 'unchanged';
    return {
      key: `${position.functionLabel}-${index}`,
      functionLabel: position.functionLabel,
      outgoingPersonId,
      outgoingPersonName: outgoingPerson ? formatPlanningPerson(outgoingPerson) : 'Poste non pourvu',
      incomingPersonId,
      incomingPersonName: incomingPerson ? formatPlanningPerson(incomingPerson) : 'Poste vacant',
      status,
      documentIssues,
      qualificationIssues,
      controls,
    };
  });
}
