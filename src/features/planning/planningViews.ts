import { rangesOverlap } from './planningDates';
import { comparePlanningCrewPeriods, planningCrewPeriod } from './planningCrewOrder';
import { compareCrewNames, crewFunctionRank, DEFAULT_CREW_PREFERENCES, formatCrewName, type CrewDisplayPreferences } from './planningCrewPreferences';
import {
  getAllPlanningCrewEvents,
  isPlanningPersonEmployedDuring,
  isSedentaryPlanningFunction,
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
  PlanningDayRecord,
  PlanningFleetEventType,
  PlanningOverview,
  PlanningProjectRecord,
  PlanningVessel,
} from './planningQueries';
import { PLANNING_ASSIGNMENT_NOTE_SOURCE, PLANNING_VESSEL_LOCATION_SOURCE } from './planningQueries';

export type PlanningPerspective = 'fleet' | 'projects' | 'crew';
export type PlanningCrewGrouping = 'people' | 'teams';

/** Select today's posting, never an old or future assignment. A manual fleet
 * selection is handled by the page and takes precedence over this default. */
export function defaultPlanningVesselName(overview: PlanningOverview, personId: number | null, date: string): string {
  if (personId === null) return '';
  const vessels = new Map(overview.vessels.filter((vessel) => vessel.active).map((vessel) => [vessel.id, vessel.name]));
  const day = overview.days.filter((item) => item.personId === personId && item.workDate === date
    && item.sourceLabel !== PLANNING_ASSIGNMENT_NOTE_SOURCE && item.sourceLabel !== PLANNING_VESSEL_LOCATION_SOURCE)
    .sort((left, right) => right.id - left.id)[0];
  if (day) return normalizePlanningStatus(day.sailorStatus || day.dayStatus) === 'En Mer'
    ? vessels.get(day.vesselId ?? -1) || '' : '';
  const assignment = overview.assignments.filter((item) =>
    (item.crewPersonId === personId || item.captainPersonId === personId)
    && item.startsOn <= date && item.endsOn >= date
    && item.confirmationStatus !== 'cancelled' && vessels.has(item.vesselId)
    && normalizePlanningStatus(item.statusLabel) === 'En Mer',
  ).sort((left, right) => Number(right.crewPersonId === personId) - Number(left.crewPersonId === personId)
    || Number(right.confirmationStatus === 'confirmed') - Number(left.confirmationStatus === 'confirmed')
    || right.startsOn.localeCompare(left.startsOn) || right.id - left.id)[0];
  if (assignment) return vessels.get(assignment.vesselId) || '';
  const period = overview.periods.filter((item) => item.personId === personId
    && item.startsOn <= date && item.endsOn >= date
    && normalizePlanningStatus(item.sailorStatus) === 'En Mer',
  ).sort((left, right) => right.startsOn.localeCompare(left.startsOn) || right.id - left.id)[0];
  return vessels.get(period?.vesselId ?? -1) || '';
}

export interface PlanningFleetLane {
  key: string;
  vesselId: number | null;
  label: string;
  detail: string;
  vessel: string;
  projects: PlanningProjectRecord[];
  assignments: PlanningAssignmentRecord[];
  locations: PlanningDayRecord[];
}

export interface PlanningCrewLane {
  key: string;
  label: string;
  detail: string;
  personId: number | null;
  vesselId?: number | null;
  vessel: string;
  watchGroup: string;
  functionLabel?: string;
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

export function planningCrewEventType(event: Pick<PlanningCrewEvent, 'status' | 'kind'>): string {
  if (event.kind === 'annualReview') return 'annual_review';
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
    leave: 'Congés',
    training: 'Formation',
    unavailability: 'Indisponibilité',
    annual_review: 'Entretien professionnel',
  }[type] || type;
}

function normalizedEquals(left: string, right: string): boolean {
  return normalizePlanningText(left) === normalizePlanningText(right);
}

function projectMatchesFilters(project: PlanningProjectRecord, filters: PlanningFilters): boolean {
  return (
    (!filters.vesselName || (project.vesselNames || [project.primaryVesselName, project.secondaryVesselName]).includes(filters.vesselName))
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

export function buildPlanningProjectLanes(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
): PlanningFleetLane[] {
  const lanes = buildPlanningFleetLanes({ ...overview, assignments: [], days: [] }, range, filters, []);
  const lanesByVessel = new Map(lanes.map((lane) => [lane.vessel, lane]));
  overview.vessels.filter((vessel) => vessel.active).forEach((vessel) => {
    if (lanesByVessel.has(vessel.name)) return;
    lanesByVessel.set(vessel.name, {
      key: `fleet-${vessel.id}`,
      vesselId: vessel.id,
      label: vessel.name,
      detail: vesselDetail(vessel),
      vessel: vessel.name,
      projects: [],
      assignments: [],
      locations: [],
    });
  });
  return [...lanesByVessel.values()]
    .filter((lane) => !filters.vesselName || lane.vessel === filters.vesselName)
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export function buildPlanningFleetLanes(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
  eventPool: PlanningCrewEvent[] = getAllPlanningCrewEvents(overview),
  includeEmptyVessels = false,
): PlanningFleetLane[] {
  const uniqueProjects = [...new Map(overview.projects.map((project) => [
    `${project.id}:${(project.vesselIds || [project.primaryVesselId, project.secondaryVesselId]).join(',')}:${project.startsOn}:${project.endsOn}`,
    project,
  ])).values()];
  const projects = uniqueProjects.filter((project) => (
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
  const locations = overview.days.filter((day) => (
    day.sourceLabel === PLANNING_VESSEL_LOCATION_SOURCE
    && day.workDate >= range.start
    && day.workDate <= range.end
    && (!filters.vesselName || day.vesselName === filters.vesselName)
  ));
  const vesselNames = new Set(
    [
      ...(!filters.personName ? (overview.genericCrewRows || []).flatMap((row) => {
        const vessel = overview.vessels.find((item) => item.id === row.vesselId);
        return vessel && (!filters.vesselName || vessel.name === filters.vesselName) ? [vessel.name] : [];
      }) : []),
      ...(includeEmptyVessels && !filters.personName ? overview.vessels
        .filter((vessel) => vessel.active && (!filters.vesselName || vessel.name === filters.vesselName))
        .map((vessel) => vessel.name) : []),
      ...eventPool
      .filter((event) => (
        event.confirmationStatus !== 'cancelled'
        && rangesOverlap(event.startsOn, event.endsOn, range.start, range.end)
        && (!filters.vesselName || event.vessel === filters.vesselName)
        && (!filters.personName || event.person === filters.personName)
      ))
      .map((event) => event.vessel)
      .filter(Boolean),
      ...projects.flatMap((project) => (
        project.vesselNames || [project.primaryVesselName, project.secondaryVesselName]
      )).filter(Boolean),
    ],
  );
  const vesselsByName = new Map(overview.vessels.map((vessel) => [vessel.name, vessel]));

  return [...vesselNames]
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((vesselName) => {
      const vessel = vesselsByName.get(vesselName);
      return {
        key: `fleet-${vessel?.id || normalizePlanningText(vesselName)}`,
        vesselId: vessel?.id || null,
        label: vesselName,
        detail: vesselDetail(vessel),
        vessel: vesselName,
        projects: projects.filter((project) => (
          project.vesselNames || [project.primaryVesselName, project.secondaryVesselName]
        ).includes(vesselName)),
        assignments: assignments.filter((assignment) => assignment.vesselName === vesselName),
        locations: locations.filter((location) => location.vesselName === vesselName),
      };
    });
}

export function buildPlanningCrewLanes(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
  grouping: PlanningCrewGrouping,
  eventPool: PlanningCrewEvent[] = getAllPlanningCrewEvents(overview),
  preferences: CrewDisplayPreferences = DEFAULT_CREW_PREFERENCES,
  activeFrom?: string,
): PlanningCrewLane[] {
  const peopleById = new Map(overview.people.map((person) => [person.id, person]));
  const vesselsByName = new Map(overview.vessels.map((vessel) => [vessel.name, vessel.id]));
  const events = eventPool.filter((event) => event.confirmationStatus !== 'cancelled'
    && rangesOverlap(event.startsOn, event.endsOn, range.start, range.end) && crewEventMatchesFilters(event, filters))
    .map((event) => event.vesselId === null && vesselsByName.has(event.vessel)
      ? { ...event, vesselId: vesselsByName.get(event.vessel)! } : event);
  const peopleByName = new Map(overview.people.map((person) => [normalizePlanningText(formatPlanningPerson(person)), person]));
  const groups = new Map<string, PlanningCrewLane>();
  events.forEach((event) => {
    const person = peopleById.get(event.personId ?? -1) || peopleByName.get(normalizePlanningText(event.person));
    const key = person ? `person-${person.id}` : `person-name-${normalizePlanningText(event.person)}`;
    const lane = groups.get(key) || { key, label: person ? formatCrewName(person, preferences.nameFormat) : event.person,
      detail: person?.functionLabel || event.functionLabel, personId: person?.id ?? event.personId,
      vesselId: event.vesselId, vessel: event.vessel, watchGroup: event.board,
      functionLabel: person?.functionLabel || event.functionLabel, events: [] };
    lane.events.push(event);
    groups.set(key, lane);
  });
  // Empty days still debit the counter, including a month with no assignment.
  if (!filters.vesselName && !filters.eventType && !filters.status && !filters.responsible) {
    overview.people.filter((person) => (person.active || Boolean(person.departedOn)) && Boolean(person.functionLabel)
      && isPlanningPersonEmployedDuring(person, range)
      && !isSedentaryPlanningFunction(person.functionLabel)
      && (!filters.personName || filters.personName === formatPlanningPerson(person))).forEach((person) => {
      const key = `person-${person.id}`;
      if (!groups.has(key)) groups.set(key, { key, label: formatCrewName(person, preferences.nameFormat), detail: person.functionLabel,
        personId: person.id, vesselId: null, vessel: '', watchGroup: '', functionLabel: person.functionLabel, events: [] });
    });
  }
  const periodsByLane = new Map([...groups.values()].map((lane) => [lane.key, planningCrewPeriod(lane.events, range)]));
  return [...groups.values()].filter((lane) => !activeFrom || range.end < activeFrom
    || lane.events.some((event) => event.endsOn >= activeFrom)).map((lane) => ({ ...lane,
    detail: [grouping === 'teams' ? lane.watchGroup || 'Sans équipe' : lane.functionLabel,
      ...new Set(lane.events.map((event) => event.vessel).filter(Boolean))].filter(Boolean).join(' · '),
  })).sort((left, right) => (preferences.sortOrder === 'period'
    ? comparePlanningCrewPeriods(periodsByLane.get(left.key) || null, periodsByLane.get(right.key) || null) : 0)
    || (grouping === 'teams' ? left.watchGroup.localeCompare(right.watchGroup, 'fr') : 0)
    || (preferences.sortOrder === 'function' ? crewFunctionRank(left.functionLabel || '') - crewFunctionRank(right.functionLabel || '') : 0)
    || compareCrewNames(
      peopleById.get(left.personId ?? -1) || { firstName: '', lastName: left.label },
      peopleById.get(right.personId ?? -1) || { firstName: '', lastName: right.label },
    )
    || left.key.localeCompare(right.key, 'fr', { numeric: true }));
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
