import { rangesOverlap } from './planningDates';
import {
  getAllPlanningCrewEvents,
  formatPlanningPerson,
  normalizePlanningStatus,
  normalizePlanningText,
  type PlanningCrewEvent,
  type PlanningDateRange,
  type PlanningFilters,
} from './planningModel';
import type {
  PlanningConfirmationStatus,
  PlanningAssignmentRecord,
  PlanningFleetEventType,
  PlanningOverview,
  PlanningProjectRecord,
  PlanningVessel,
} from './planningQueries';

export type PlanningPerspective = 'fleet' | 'crew' | 'vessel' | 'sailor';
export type PlanningCrewGrouping = 'people' | 'teams';

export interface PlanningFleetLane {
  key: string;
  vesselId: number | null;
  label: string;
  detail: string;
  vessel: string;
  projects: PlanningProjectRecord[];
  assignments: PlanningAssignmentRecord[];
}

export interface PlanningCrewLane {
  key: string;
  label: string;
  detail: string;
  personId: number | null;
  watchGroup: string;
  events: PlanningCrewEvent[];
}

export interface PlanningEventMutation {
  vesselId: number;
  vesselName: string;
  startsOn: string;
  endsOn: string;
  startsAt?: string;
  endsAt?: string;
  statusLabel: string;
  confirmationStatus: PlanningConfirmationStatus;
  functionLabel: string;
  watchGroup: string;
  comments: string;
}

const FLEET_EVENT_LABELS: Record<PlanningFleetEventType, string> = {
  operation: 'Opération',
  transit: 'Transit',
  maintenance: 'Maintenance',
  unavailability: 'Indisponibilité',
};

const CONFIRMATION_LABELS: Record<PlanningConfirmationStatus, string> = {
  provisional: 'Provisoire',
  confirmed: 'Confirmée',
  cancelled: 'Annulée',
};

export function planningFleetEventTypeLabel(type: PlanningFleetEventType): string {
  return FLEET_EVENT_LABELS[type];
}

export function planningConfirmationLabel(status: PlanningConfirmationStatus): string {
  return CONFIRMATION_LABELS[status];
}

export function planningCrewEventType(event: Pick<PlanningCrewEvent, 'status'>): string {
  const status = normalizePlanningStatus(event.status);
  if (status === 'Repos') return 'rest';
  if (status === 'Vacance') return 'leave';
  if (status === 'Formation') return 'training';
  if (status === 'Arrêt de travail') return 'unavailability';
  return 'assignment';
}

export function planningCrewEventTypeLabel(type: string): string {
  return {
    assignment: 'Embarquement / affectation',
    rest: 'Repos',
    leave: 'Congé',
    training: 'Formation',
    unavailability: 'Indisponibilité',
  }[type] || type;
}

function normalizedEquals(left: string, right: string): boolean {
  return normalizePlanningText(left) === normalizePlanningText(right);
}

function projectMatchesFilters(project: PlanningProjectRecord, filters: PlanningFilters): boolean {
  return (
    (!filters.vesselName || project.primaryVesselName === filters.vesselName || project.secondaryVesselName === filters.vesselName)
    && (!filters.eventType || project.eventType === filters.eventType)
    && (!filters.status || normalizedEquals(project.status, filters.status))
    && (!filters.responsible || project.responsibleName === filters.responsible)
  );
}

function crewEventMatchesFilters(event: PlanningCrewEvent, filters: PlanningFilters): boolean {
  return (
    (!filters.vesselName || event.vessel === filters.vesselName)
    && (!filters.personName || event.person === filters.personName)
    && (!filters.eventType || planningCrewEventType(event) === filters.eventType)
    && (!filters.status || normalizedEquals(event.status, filters.status) || event.confirmationStatus === filters.status)
    && (!filters.responsible || event.responsible === filters.responsible)
  );
}

function vesselDetail(vessel: PlanningVessel | undefined): string {
  if (!vessel) return 'Navire historique';
  return vessel.acronym || 'Navire actif';
}

export function buildPlanningFleetLanes(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
): PlanningFleetLane[] {
  const projects = overview.projects.filter((project) => (
    project.startsOn
    && rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end)
    && projectMatchesFilters(project, filters)
  ));
  const assignments = overview.assignments.filter((assignment) => (
    assignment.confirmationStatus !== 'cancelled'
    && rangesOverlap(assignment.startsOn, assignment.endsOn, range.start, range.end)
    && (!filters.vesselName || assignment.vesselName === filters.vesselName)
    && (!filters.personName || assignment.crewName === filters.personName)
    && (!filters.eventType || filters.eventType === 'assignment')
    && (!filters.status || normalizedEquals(assignment.statusLabel, filters.status) || assignment.confirmationStatus === filters.status)
    && (!filters.responsible || assignment.captainName === filters.responsible)
  ));
  const vesselNames = new Set(
    overview.vessels
      .filter((vessel) => vessel.active && (!filters.vesselName || vessel.name === filters.vesselName))
      .map((vessel) => vessel.name),
  );
  projects.forEach((project) => {
    if (project.primaryVesselName) vesselNames.add(project.primaryVesselName);
    if (project.secondaryVesselName) vesselNames.add(project.secondaryVesselName);
  });
  assignments.forEach((assignment) => vesselNames.add(assignment.vesselName));

  return [...vesselNames]
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((vesselName) => {
      const vessel = overview.vessels.find((item) => item.name === vesselName);
      return {
        key: `fleet-${vessel?.id || normalizePlanningText(vesselName)}`,
        vesselId: vessel?.id || null,
        label: vesselName,
        detail: vesselDetail(vessel),
        vessel: vesselName,
        projects: projects.filter((project) => project.primaryVesselName === vesselName || project.secondaryVesselName === vesselName),
        assignments: assignments.filter((assignment) => assignment.vesselName === vesselName),
      };
    });
}

export function buildPlanningCrewLanes(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
  grouping: PlanningCrewGrouping,
): PlanningCrewLane[] {
  const events = getAllPlanningCrewEvents(overview).filter((event) => (
    rangesOverlap(event.startsOn, event.endsOn, range.start, range.end)
    && crewEventMatchesFilters(event, filters)
  ));
  const grouped = new Map<string, PlanningCrewEvent[]>();
  events.forEach((event) => {
    const linkedPerson = overview.people.find((person) => person.id === event.personId || normalizedEquals(formatPlanningPerson(person), event.person));
    const key = grouping === 'people'
      ? linkedPerson ? `person-${linkedPerson.id}` : event.personId === null ? `person-name-${normalizePlanningText(event.person)}` : `person-${event.personId}`
      : `team-${normalizePlanningText(event.board || 'Sans équipe')}`;
    grouped.set(key, [...(grouped.get(key) || []), event]);
  });

  return [...grouped.entries()]
    .map(([key, laneEvents]) => {
      const first = laneEvents[0];
      const linkedPerson = overview.people.find((person) => person.id === first.personId || normalizedEquals(formatPlanningPerson(person), first.person));
      const label = grouping === 'people' ? first.person : first.board || 'Sans équipe';
      const detailValues = grouping === 'people'
        ? [...new Set(laneEvents.flatMap((event) => [event.functionLabel, event.vessel]).filter(Boolean))]
        : [...new Set(laneEvents.map((event) => event.person).filter(Boolean))];
      return {
        key,
        label,
        detail: detailValues.join(' · '),
        personId: grouping === 'people' ? linkedPerson?.id ?? first.personId : null,
        watchGroup: first.board,
        events: laneEvents,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export function patchPlanningEvent(
  overview: PlanningOverview,
  event: PlanningCrewEvent,
  mutation: PlanningEventMutation,
): PlanningOverview {
  const id = Number(event.id.split('-').pop());
  if (event.kind === 'assignment') {
    return {
      ...overview,
      assignments: overview.assignments.map((assignment) => assignment.id === id ? {
        ...assignment,
        vesselId: mutation.vesselId,
        vesselName: mutation.vesselName,
        startsOn: mutation.startsOn,
        endsOn: mutation.endsOn,
        startsAt: mutation.startsAt || assignment.startsAt,
        endsAt: mutation.endsAt || assignment.endsAt,
        assignmentRole: mutation.functionLabel,
        statusLabel: mutation.statusLabel,
        confirmationStatus: mutation.confirmationStatus,
        watchGroup: mutation.watchGroup,
        comments: mutation.comments,
      } : assignment),
    };
  }
  if (event.kind === 'period') {
    return {
      ...overview,
      periods: overview.periods.map((period) => period.id === id ? {
        ...period,
        vesselId: mutation.vesselId,
        vesselName: mutation.vesselName,
        startsOn: mutation.startsOn,
        endsOn: mutation.endsOn,
        functionLabel: mutation.functionLabel,
        sailorStatus: mutation.statusLabel,
        watchGroup: mutation.watchGroup,
        comments: mutation.comments,
      } : period),
    };
  }
  return {
    ...overview,
    days: overview.days.map((day) => day.id === id ? {
      ...day,
      vesselId: mutation.vesselId,
      vesselName: mutation.vesselName,
      workDate: mutation.startsOn,
      departureOn: mutation.startsOn,
      disembarkOn: mutation.endsOn,
      functionLabel: mutation.functionLabel,
      sailorStatus: mutation.statusLabel,
      watchGroup: mutation.watchGroup,
      comments: mutation.comments,
    } : day),
  };
}

export function removePlanningEvent(overview: PlanningOverview, event: PlanningCrewEvent): PlanningOverview {
  const id = Number(event.id.split('-').pop());
  if (event.kind === 'assignment') return { ...overview, assignments: overview.assignments.filter((item) => item.id !== id) };
  if (event.kind === 'period') return { ...overview, periods: overview.periods.filter((item) => item.id !== id) };
  return { ...overview, days: overview.days.filter((item) => item.id !== id) };
}

export function replacePlanningProject(overview: PlanningOverview, project: PlanningProjectRecord): PlanningOverview {
  return {
    ...overview,
    projects: overview.projects.some((item) => item.id === project.id)
      ? overview.projects.map((item) => item.id === project.id ? project : item)
      : [...overview.projects, project],
  };
}
