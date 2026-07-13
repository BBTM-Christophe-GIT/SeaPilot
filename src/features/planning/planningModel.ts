import type {
  PlanningAssignmentRecord,
  PlanningDayRecord,
  PlanningOverview,
  PlanningPeriodRecord,
  PlanningPerson,
  PlanningProjectRecord,
} from './planningQueries';

export type PlanningViewMode = 'week' | 'month' | 'year';

export interface PlanningTimelineDay {
  date: string;
  day: number;
  month: number;
  year: number;
  weekday: number;
  week: number;
  isWeekend: boolean;
}

export interface PlanningMonthSegment {
  key: string;
  label: string;
  startIndex: number;
  span: number;
}

export interface PlanningCrewEvent {
  id: string;
  kind: 'assignment' | 'day' | 'period';
  personId: number | null;
  vesselId: number | null;
  person: string;
  vessel: string;
  board: string;
  functionLabel: string;
  status: string;
  rhythm: string;
  startsOn: string;
  endsOn: string;
  comments: string;
  sourceLabel: string;
}

export interface PlanningCrewRow {
  key: string;
  type: 'vessel' | 'board' | 'person';
  personId: number | null;
  vesselId: number | null;
  label: string;
  vessel: string;
  board: string;
  functionLabel: string;
  vesselKey: string;
  boardKey: string;
  events: PlanningCrewEvent[];
  projects: PlanningProjectRecord[];
}

export interface PlanningFilters {
  vesselName: string;
  personName: string;
}

export interface PlanningDateRange {
  start: string;
  end: string;
}

export interface PlanningAlert {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  days: number;
  statusLabel: string;
  tone: 'danger' | 'warning';
  vesselName?: string;
}

const MONTH_LABELS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const ROLE_RANKS = [
  ['CAPITAINE'],
  ['CHEFMECANICIEN', 'CHEFMECANICIENNE'],
  ['2NDCAPITAINE', 'SECONDCAPITAINE', '2EMECAPITAINE'],
  ['BOSCO', 'MAITREDEQUIPAGE'],
];

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isoDate(date: Date): string {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

export function addPlanningDays(value: string, amount: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

function startOfWeek(value: string): string {
  const date = parseIsoDate(value);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return isoDate(date);
}

function isoWeek(date: Date): number {
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(cursor.getUTCFullYear(), 0, 1));
  return Math.ceil(((cursor.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function buildDays(start: string, count: number): PlanningTimelineDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = parseIsoDate(addPlanningDays(start, index));
    const weekday = (date.getUTCDay() + 6) % 7;
    return {
      date: isoDate(date),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      weekday,
      week: isoWeek(date),
      isWeekend: weekday >= 5,
    };
  });
}

export function buildPlanningTimeline(anchorDate: string, mode: PlanningViewMode): PlanningTimelineDay[] {
  const anchor = parseIsoDate(anchorDate);
  if (mode === 'year') {
    const year = anchor.getUTCFullYear();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return buildDays(start, daysBetween(start, end) + 1);
  }
  if (mode === 'week') {
    return buildDays(startOfWeek(anchorDate), 14);
  }

  const monthStart = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return buildDays(startOfWeek(monthStart), 49);
}

export function buildPlanningMonthSegments(days: PlanningTimelineDay[]): PlanningMonthSegment[] {
  const segments: PlanningMonthSegment[] = [];
  days.forEach((day, index) => {
    const key = `${day.year}-${day.month}`;
    const last = segments[segments.length - 1];
    if (last?.key === key) {
      last.span += 1;
      return;
    }
    segments.push({ key, label: `${MONTH_LABELS[day.month - 1]} ${day.year}`, startIndex: index, span: 1 });
  });
  return segments;
}

export function timelineRange(days: PlanningTimelineDay[]): PlanningDateRange {
  return { start: days[0]?.date || '', end: days[days.length - 1]?.date || '' };
}

export function planningPeriodTitle(days: PlanningTimelineDay[], mode: PlanningViewMode): string {
  if (!days.length) return '';
  if (mode === 'year') return String(days[0].year);
  if (mode === 'week') {
    return `${formatPlanningDate(days[0].date)} – ${formatPlanningDate(days[days.length - 1].date)}`;
  }
  const anchor = days[Math.min(14, days.length - 1)];
  return `${MONTH_LABELS[anchor.month - 1]} ${anchor.year}`;
}

export function shiftPlanningAnchor(anchorDate: string, mode: PlanningViewMode, amount: number): string {
  const anchor = parseIsoDate(anchorDate);
  if (mode === 'week') {
    anchor.setUTCDate(anchor.getUTCDate() + amount * 14);
  } else if (mode === 'year') {
    anchor.setUTCFullYear(anchor.getUTCFullYear() + amount);
  } else {
    anchor.setUTCMonth(anchor.getUTCMonth() + amount);
  }
  return isoDate(anchor);
}

export function dateGridPlacement(startsOn: string, endsOn: string, days: PlanningTimelineDay[]) {
  if (!days.length) return null;
  const range = timelineRange(days);
  if (!rangesOverlap(startsOn, endsOn || startsOn, range.start, range.end)) return null;
  const clippedStart = startsOn < range.start ? range.start : startsOn;
  const clippedEnd = (endsOn || startsOn) > range.end ? range.end : endsOn || startsOn;
  return { start: daysBetween(range.start, clippedStart) + 1, span: daysBetween(clippedStart, clippedEnd) + 1 };
}

export function rangesOverlap(start: string, end: string, rangeStart: string, rangeEnd: string): boolean {
  return Boolean(start && end && rangeStart && rangeEnd && start <= rangeEnd && end >= rangeStart);
}

export function normalizePlanningText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();
}

export function normalizePlanningStatus(value: string): string {
  const key = normalizePlanningText(value);
  if (key.includes('EMBAR') || key === 'ENMER' || key === 'TRAVAILLE') return 'En Mer';
  if (key === 'ATERRE') return 'A Terre';
  if (key.includes('REPOS') || key.includes('DEBAR')) return 'Repos';
  if (key.includes('VACAN')) return 'Vacance';
  if (key.includes('ARRET')) return 'Arrêt de travail';
  if (key.includes('FORMAT')) return 'Formation';
  return value || 'En Mer';
}

export function planningStatusTone(value: string): string {
  const key = normalizePlanningText(normalizePlanningStatus(value));
  if (key === 'ENMER') return 'sea';
  if (key === 'ATERRE') return 'shore';
  if (key === 'REPOS') return 'rest';
  if (key === 'VACANCE') return 'vacation';
  if (key === 'ARRETDETRAVAIL') return 'sick';
  if (key === 'FORMATION') return 'training';
  return 'neutral';
}

const SEDENTARY_FUNCTIONS = [
  'DIRECTEURQHSECHEFDEPROJET',
  'DIRECTRICEADMINISTRATIVEETFINANCIERE',
  'FLEETTECHNICALMANAGER',
  'PRESIDENT',
  'YARDMANAGERLEHAVRE',
];

export function isSedentaryPlanningFunction(value: string): boolean {
  const key = normalizePlanningText(value);
  return SEDENTARY_FUNCTIONS.some((functionKey) => key.includes(functionKey));
}

export function projectStatusTone(value: string): string {
  const key = normalizePlanningText(value);
  if (key.includes('FACTUR')) return 'billed';
  if (key.includes('VALID')) return 'valid';
  if (key.includes('COURS') || key.includes('PROGRESS')) return 'progress';
  if (key.includes('PLAN')) return 'planned';
  return 'other';
}

function personRoleRank(value: string): number {
  const key = normalizePlanningText(value);
  const rank = ROLE_RANKS.findIndex((aliases) => aliases.some((alias) => key.includes(alias)));
  return rank === -1 ? 99 : rank;
}

function crewEventFromPeriod(period: PlanningPeriodRecord): PlanningCrewEvent {
  return {
    id: `period-${period.id}`,
    kind: 'period',
    personId: period.personId,
    vesselId: period.vesselId,
    person: period.crewName,
    vessel: period.vesselName,
    board: period.watchGroup,
    functionLabel: period.functionLabel,
    status: normalizePlanningStatus(period.sailorStatus),
    rhythm: '',
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    comments: period.comments,
    sourceLabel: period.sourceLabel,
  };
}

function crewEventFromAssignment(assignment: PlanningAssignmentRecord): PlanningCrewEvent {
  return {
    id: `assignment-${assignment.id}`,
    kind: 'assignment',
    personId: assignment.crewPersonId,
    vesselId: assignment.vesselId,
    person: assignment.crewName,
    vessel: assignment.vesselName,
    board: assignment.watchGroup || 'Affectation',
    functionLabel: assignment.assignmentRole,
    status: normalizePlanningStatus(assignment.statusLabel),
    rhythm: '',
    startsOn: assignment.startsOn,
    endsOn: assignment.endsOn,
    comments: assignment.comments,
    sourceLabel: assignment.sourceLabel,
  };
}

function crewEventFromDay(day: PlanningDayRecord): PlanningCrewEvent {
  return {
    id: `day-${day.id}`,
    kind: 'day',
    personId: day.personId,
    vesselId: day.vesselId,
    person: day.crewName,
    vessel: day.vesselName,
    board: day.watchGroup,
    functionLabel: day.functionLabel,
    status: normalizePlanningStatus(day.sailorStatus || day.dayStatus),
    rhythm: day.rhythmLabel,
    startsOn: day.workDate,
    endsOn: day.workDate,
    comments: day.comments,
    sourceLabel: day.sourceLabel,
  };
}

function eventKey(event: PlanningCrewEvent): string {
  return [normalizePlanningText(event.person), normalizePlanningText(event.vessel), normalizePlanningText(event.board), event.startsOn, event.endsOn].join('|');
}

export function getAllPlanningCrewEvents(overview: PlanningOverview): PlanningCrewEvent[] {
  const events = overview.periods.map(crewEventFromPeriod);
  const occupied = new Set(events.map(eventKey));
  overview.assignments.map(crewEventFromAssignment).forEach((event) => {
    if (!occupied.has(eventKey(event))) events.push(event);
  });
  overview.days.map(crewEventFromDay).forEach((event) => {
    const covered = events.some(
      (current) =>
        normalizePlanningText(current.person) === normalizePlanningText(event.person) &&
        normalizePlanningText(current.vessel) === normalizePlanningText(event.vessel) &&
        current.startsOn <= event.startsOn &&
        current.endsOn >= event.endsOn,
    );
    if (!covered) events.push(event);
  });
  return events;
}

function safeKey(value: string): string {
  return normalizePlanningText(value) || 'NONRENSEIGNE';
}

export function buildPlanningCrewRows(
  overview: PlanningOverview,
  days: PlanningTimelineDay[],
  filters: PlanningFilters,
): PlanningCrewRow[] {
  const range = timelineRange(days);
  const events = getAllPlanningCrewEvents(overview).filter(
    (event) =>
      rangesOverlap(event.startsOn, event.endsOn, range.start, range.end) &&
      (!filters.vesselName || event.vessel === filters.vesselName) &&
      (!filters.personName || event.person === filters.personName),
  );
  const projects = overview.projects.filter(
    (project) =>
      project.startsOn &&
      rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end) &&
      (!filters.vesselName || project.primaryVesselName === filters.vesselName || project.secondaryVesselName === filters.vesselName),
  );
  const vesselNames = new Set(events.map((event) => event.vessel));
  projects.forEach((project) => {
    if (project.primaryVesselName) vesselNames.add(project.primaryVesselName);
    if (project.secondaryVesselName) vesselNames.add(project.secondaryVesselName);
  });

  const rows: PlanningCrewRow[] = [];
  [...vesselNames]
    .filter(Boolean)
    .sort((left, right) => {
      const leftOffice = normalizePlanningText(left).includes('ARMEMENT') ? 0 : 1;
      const rightOffice = normalizePlanningText(right).includes('ARMEMENT') ? 0 : 1;
      return leftOffice - rightOffice || left.localeCompare(right, 'fr');
    })
    .forEach((vessel) => {
      const vesselKey = `vessel-${safeKey(vessel)}`;
      const vesselEvents = events.filter((event) => event.vessel === vessel);
      const vesselProjects = projects.filter((project) => project.primaryVesselName === vessel || project.secondaryVesselName === vessel);
      rows.push({
        key: vesselKey,
        type: 'vessel',
        personId: null,
        vesselId: overview.vessels.find((item) => item.name === vessel)?.id || vesselEvents[0]?.vesselId || null,
        label: vessel,
        vessel,
        board: '',
        functionLabel: '',
        vesselKey,
        boardKey: '',
        events: [],
        projects: vesselProjects,
      });

      const boards = new Map<string, PlanningCrewEvent[]>();
      vesselEvents.forEach((event) => {
        const defaultBoard = normalizePlanningText(vessel).includes('ARMEMENT') ? 'Armement' : 'Bordée';
        const board = event.board || defaultBoard;
        boards.set(board, [...(boards.get(board) || []), event]);
      });
      [...boards.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'fr', { numeric: true }))
        .forEach(([board, boardEvents]) => {
          const boardKey = `${vesselKey}-board-${safeKey(board)}`;
          rows.push({
            key: boardKey,
            type: 'board',
            personId: null,
            vesselId: boardEvents[0]?.vesselId || overview.vessels.find((item) => item.name === vessel)?.id || null,
            label: board,
            vessel,
            board,
            functionLabel: '',
            vesselKey,
            boardKey,
            events: [],
            projects: [],
          });
          const people = new Map<string, PlanningCrewEvent[]>();
          boardEvents.forEach((event) => people.set(event.person, [...(people.get(event.person) || []), event]));
          [...people.entries()]
            .sort(([leftName, leftEvents], [rightName, rightEvents]) => {
              const leftRole = leftEvents[0]?.functionLabel || overview.people.find((person) => formatPlanningPerson(person) === leftName)?.functionLabel || '';
              const rightRole = rightEvents[0]?.functionLabel || overview.people.find((person) => formatPlanningPerson(person) === rightName)?.functionLabel || '';
              return personRoleRank(leftRole) - personRoleRank(rightRole) || leftName.localeCompare(rightName, 'fr');
            })
            .forEach(([person, personEvents]) => {
              rows.push({
                key: `${boardKey}-person-${safeKey(person)}`,
                type: 'person',
                personId: personEvents[0]?.personId || overview.people.find((item) => formatPlanningPerson(item) === person)?.id || null,
                vesselId: personEvents[0]?.vesselId || overview.vessels.find((item) => item.name === vessel)?.id || null,
                label: person,
                vessel,
                board,
                functionLabel: personEvents[0]?.functionLabel || '',
                vesselKey,
                boardKey,
                events: personEvents.sort((left, right) => left.startsOn.localeCompare(right.startsOn)),
                projects: [],
              });
            });
        });
    });
  return rows;
}

export function formatPlanningPerson(person: PlanningPerson): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

export function getUnassignedPlanningPeople(
  overview: PlanningOverview,
  range: PlanningDateRange,
  filters: PlanningFilters,
): PlanningPerson[] {
  const assigned = new Set(
    getAllPlanningCrewEvents(overview)
      .filter(
        (event) =>
          rangesOverlap(event.startsOn, event.endsOn, range.start, range.end) &&
          normalizePlanningText(event.vessel) !== 'NAVIRENONRENSEIGNE',
      )
      .map((event) => normalizePlanningText(event.person)),
  );
  return overview.people.filter((person) => {
    const name = formatPlanningPerson(person);
    return (
      person.active &&
      (!person.hiredOn || person.hiredOn <= range.end) &&
      (!person.departedOn || person.departedOn >= range.start) &&
      (!filters.personName || name === filters.personName) &&
      !assigned.has(normalizePlanningText(name))
    );
  });
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) / 86400000);
}

export interface PlanningConflict {
  event: PlanningCrewEvent;
  date: string;
}

export function getPlanningConflicts(
  overview: PlanningOverview,
  candidate: Pick<PlanningCrewEvent, 'id' | 'person' | 'personId' | 'vessel'> & { startsOn: string; endsOn: string },
): PlanningConflict[] {
  const personKey = normalizePlanningText(candidate.person);
  return getAllPlanningCrewEvents(overview)
    .filter((event) => {
      const samePerson = candidate.personId !== null && event.personId !== null
        ? candidate.personId === event.personId
        : normalizePlanningText(event.person) === personKey;
      return event.id !== candidate.id && samePerson && normalizePlanningText(event.vessel) !== normalizePlanningText(candidate.vessel)
        && rangesOverlap(event.startsOn, event.endsOn, candidate.startsOn, candidate.endsOn);
    })
    .map((event) => ({ event, date: event.startsOn > candidate.startsOn ? event.startsOn : candidate.startsOn }));
}

export function getPlanningConflictEventIds(overview: PlanningOverview): Set<string> {
  const events = getAllPlanningCrewEvents(overview);
  const conflicted = new Set<string>();
  events.forEach((event, index) => {
    events.slice(index + 1).forEach((candidate) => {
      const samePerson = event.personId !== null && candidate.personId !== null
        ? event.personId === candidate.personId
        : normalizePlanningText(event.person) === normalizePlanningText(candidate.person);
      if (
        samePerson
        && normalizePlanningText(event.vessel) !== normalizePlanningText(candidate.vessel)
        && rangesOverlap(event.startsOn, event.endsOn, candidate.startsOn, candidate.endsOn)
      ) {
        conflicted.add(event.id);
        conflicted.add(candidate.id);
      }
    });
  });
  return conflicted;
}

export interface PlanningExportRow {
  date: string;
  person: string;
  worked: string;
  status: string;
  functionLabel: string;
  vessel: string;
  watchGroup: string;
  comments: string;
  source: string;
}

export function buildPlanningExportRows(
  overview: PlanningOverview,
  personName: string,
  range: PlanningDateRange,
): PlanningExportRow[] {
  const personKey = normalizePlanningText(personName);
  const rows: PlanningExportRow[] = [];
  getAllPlanningCrewEvents(overview)
    .filter((event) => normalizePlanningText(event.person) === personKey && rangesOverlap(event.startsOn, event.endsOn, range.start, range.end))
    .forEach((event) => {
      const start = event.startsOn < range.start ? range.start : event.startsOn;
      const end = event.endsOn > range.end ? range.end : event.endsOn;
      for (let date = start; date <= end; date = addPlanningDays(date, 1)) {
        rows.push({
          date,
          person: event.person,
          worked: normalizePlanningStatus(event.status) === 'En Mer' ? 'Oui' : 'Non',
          status: normalizePlanningStatus(event.status),
          functionLabel: event.functionLabel,
          vessel: event.vessel,
          watchGroup: event.board,
          comments: event.comments,
          source: event.sourceLabel,
        });
      }
    });
  return rows.sort((left, right) => left.date.localeCompare(right.date) || left.vessel.localeCompare(right.vessel, 'fr'));
}

export function formatPlanningDate(value: string): string {
  if (!value) return 'Non renseignée';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(parseIsoDate(value));
}

function durationLabel(days: number): string {
  const absolute = Math.abs(days);
  if (absolute < 31) return `${absolute} j`;
  const months = Math.floor(absolute / 30.44);
  const remainder = Math.round(absolute - months * 30.44);
  return `${months} mois${remainder ? ` ${remainder} j` : ''}`;
}

export function buildPlanningCertificateAlerts(overview: PlanningOverview, today: string): PlanningAlert[] {
  const horizon = addPlanningDays(today, 90);
  return overview.certificates
    .filter((certificate) => certificate.expiresOn && certificate.expiresOn <= horizon)
    .map((certificate) => {
      const days = daysBetween(today, certificate.expiresOn);
      return {
        id: `certificate-${certificate.id}`,
        title: certificate.title,
        subtitle: 'Alarme échéance',
        date: certificate.expiresOn,
        days,
        statusLabel: days < 0 ? `expiré depuis ${durationLabel(days)}` : `expire dans ${durationLabel(days)}`,
        tone: (days < 0 ? 'danger' : 'warning') as PlanningAlert['tone'],
        vesselName: certificate.vesselName,
      };
    })
    .sort((left, right) => left.days - right.days || left.title.localeCompare(right.title, 'fr'));
}

export function buildPlanningHrAlerts(overview: PlanningOverview, today: string): PlanningAlert[] {
  const horizon = addPlanningDays(today, 90);
  const activeIds = new Set(overview.people.filter((person) => person.active).map((person) => person.id));
  return overview.hrDocuments
    .filter((document) => document.personId !== null && activeIds.has(document.personId) && document.expiresOn && document.expiresOn <= horizon)
    .map((document) => {
      const days = daysBetween(today, document.expiresOn);
      return {
        id: `hr-${document.id}`,
        title: document.personName || document.title,
        subtitle: document.title,
        date: document.expiresOn,
        days,
        statusLabel: days < 0 ? `expiré depuis ${durationLabel(days)}` : `expire dans ${durationLabel(days)}`,
        tone: (days < 0 ? 'danger' : 'warning') as PlanningAlert['tone'],
      };
    })
    .sort((left, right) => left.days - right.days || left.title.localeCompare(right.title, 'fr'));
}

export function getUnbilledPlanningProjects(overview: PlanningOverview, year: number): PlanningProjectRecord[] {
  const range = { start: `${year}-01-01`, end: `${year}-12-31` };
  return overview.projects.filter(
    (project) =>
      project.startsOn &&
      rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end) &&
      !normalizePlanningText(project.status).includes('FACTUR'),
  );
}
