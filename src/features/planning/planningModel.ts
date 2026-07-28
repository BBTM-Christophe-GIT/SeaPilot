import {
  PLANNING_ASSIGNMENT_NOTE_SOURCE,
  PLANNING_VESSEL_LOCATION_SOURCE,
  type PlanningAssignmentRecord,
  type PlanningDayRecord,
  type PlanningHrDocumentRecord,
  type PlanningOverview,
  type PlanningPeriodRecord,
  type PlanningPerson,
  type PlanningProjectRecord,
} from './planningQueries';
import {
  addPlanningDays,
  daysBetween,
  formatPlanningDate,
  isoDate,
  parsePlanningDate,
  planningWeekNumber,
  rangesOverlap,
  shiftPlanningMonths,
  shiftPlanningYears,
  startOfPlanningWeek,
} from './planningDates';

export { addPlanningDays, daysBetween, formatPlanningDate, isoDate, rangesOverlap } from './planningDates';

export type PlanningViewMode = 'day' | 'week' | 'fortnight' | 'month' | 'year';

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
  confirmationStatus: 'provisional' | 'confirmed' | 'cancelled';
  responsible: string;
  rhythm: string;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  comments: string;
  sourceLabel: string;
  assignmentId?: number;
  dailyNotes?: Record<string, string>;
  dailyStatuses?: Record<string, string>;
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
  boardRowId: number | null;
  hasAnyRecords: boolean;
  vesselKey: string;
  boardKey: string;
  events: PlanningCrewEvent[];
  projects: PlanningProjectRecord[];
}

export interface PlanningFilters {
  vesselName: string;
  personName: string;
  eventType?: string;
  status?: string;
  responsible?: string;
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

function buildDays(start: string, count: number): PlanningTimelineDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = parsePlanningDate(addPlanningDays(start, index));
    const weekday = (date.getUTCDay() + 6) % 7;
    return {
      date: isoDate(date),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      weekday,
      week: planningWeekNumber(isoDate(date)),
      isWeekend: weekday >= 5,
    };
  });
}

export function buildPlanningTimeline(anchorDate: string, mode: PlanningViewMode): PlanningTimelineDay[] {
  const anchor = parsePlanningDate(anchorDate);
  if (mode === 'year') {
    const year = anchor.getUTCFullYear();
    const start = `${year - 1}-11-01`;
    const end = addPlanningDays(`${year + 1}-03-01`, -1);
    return buildDays(start, daysBetween(start, end) + 1);
  }
  if (mode === 'day') return buildDays(addPlanningDays(anchorDate, -3), 7);
  if (mode === 'week') return buildDays(startOfPlanningWeek(anchorDate), 7);
  if (mode === 'fortnight') return buildDays(startOfPlanningWeek(anchorDate), 14);

  const monthStart = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const rangeStart = addPlanningDays(monthStart, -7);
  const rangeEnd = addPlanningDays(shiftPlanningMonths(monthStart, 1), 6);
  return buildDays(rangeStart, daysBetween(rangeStart, rangeEnd) + 1);
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
  if (mode === 'day') return formatPlanningDate(days[0].date);
  if (mode === 'week' || mode === 'fortnight') {
    return `${formatPlanningDate(days[0].date)} – ${formatPlanningDate(days[days.length - 1].date)}`;
  }
  const anchor = days[Math.min(14, days.length - 1)];
  return `${MONTH_LABELS[anchor.month - 1]} ${anchor.year}`;
}

export function shiftPlanningAnchor(anchorDate: string, mode: PlanningViewMode, amount: number): string {
  if (mode === 'day') return addPlanningDays(anchorDate, amount);
  if (mode === 'week') return addPlanningDays(anchorDate, amount * 7);
  if (mode === 'fortnight') return addPlanningDays(anchorDate, amount * 14);
  return mode === 'year' ? shiftPlanningYears(anchorDate, amount) : shiftPlanningMonths(anchorDate, amount);
}

export function dateGridPlacement(startsOn: string, endsOn: string, days: PlanningTimelineDay[]) {
  if (!days.length) return null;
  const range = timelineRange(days);
  if (!rangesOverlap(startsOn, endsOn || startsOn, range.start, range.end)) return null;
  const clippedStart = startsOn < range.start ? range.start : startsOn;
  const clippedEnd = (endsOn || startsOn) > range.end ? range.end : endsOn || startsOn;
  return { start: daysBetween(range.start, clippedStart) + 1, span: daysBetween(clippedStart, clippedEnd) + 1 };
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

export function planningStatusDisplayLabel(value: string): string {
  return normalizePlanningStatus(value) === 'Vacance' ? 'Vacances' : value;
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
    confirmationStatus: 'confirmed',
    responsible: '',
    rhythm: '',
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    startsAt: '',
    endsAt: '',
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
    confirmationStatus: assignment.confirmationStatus,
    responsible: assignment.captainName === '-' ? '' : assignment.captainName,
    rhythm: '',
    startsOn: assignment.startsOn,
    endsOn: assignment.endsOn,
    startsAt: assignment.startsAt || '',
    endsAt: assignment.endsAt || '',
    comments: assignment.comments,
    sourceLabel: assignment.sourceLabel,
    assignmentId: assignment.id,
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
    confirmationStatus: 'confirmed',
    responsible: day.captainName,
    rhythm: day.rhythmLabel,
    startsOn: day.workDate,
    endsOn: day.workDate,
    startsAt: '',
    endsAt: '',
    comments: day.comments,
    sourceLabel: day.sourceLabel,
  };
}

function eventKey(event: PlanningCrewEvent): string {
  return [normalizePlanningText(event.person), normalizePlanningText(event.vessel), normalizePlanningText(event.board), event.startsOn, event.endsOn].join('|');
}

export function getAllPlanningCrewEvents(overview: PlanningOverview): PlanningCrewEvent[] {
  const events = overview.periods.map(crewEventFromPeriod);
  const notesByAssignment = new Map<number, Record<string, string>>();
  const statusesByAssignment = new Map<number, Record<string, string>>();
  overview.days.forEach((day) => {
    if (day.sourceLabel !== PLANNING_ASSIGNMENT_NOTE_SOURCE) return;
    const assignmentId = Number(day.slot365.replace('assignment:', ''));
    if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0) return;
    const notes = notesByAssignment.get(assignmentId) || {};
    notes[day.workDate] = day.comments;
    notesByAssignment.set(assignmentId, notes);
    const statuses = statusesByAssignment.get(assignmentId) || {};
    statuses[day.workDate] = normalizePlanningStatus(day.sailorStatus);
    statusesByAssignment.set(assignmentId, statuses);
  });
  overview.assignments.map(crewEventFromAssignment).forEach((event) => {
    const enriched = {
      ...event,
      dailyNotes: notesByAssignment.get(event.assignmentId || 0) || {},
      dailyStatuses: statusesByAssignment.get(event.assignmentId || 0) || {},
    };
    const existingIndex = events.findIndex((current) => eventKey(current) === eventKey(event));
    if (existingIndex === -1) events.push(enriched);
    else events[existingIndex] = { ...events[existingIndex], assignmentId: event.assignmentId, dailyNotes: enriched.dailyNotes, dailyStatuses: enriched.dailyStatuses };
  });
  overview.days
    .filter((day) => day.sourceLabel !== PLANNING_VESSEL_LOCATION_SOURCE && day.sourceLabel !== PLANNING_ASSIGNMENT_NOTE_SOURCE)
    .map(crewEventFromDay)
    .forEach((event) => {
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
  const allEvents = getAllPlanningCrewEvents(overview);
  const events = allEvents.filter(
    (event) =>
      event.confirmationStatus !== 'cancelled' &&
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
  const boardRows = (overview.boardRows || []).flatMap((boardRow) => {
    const vessel = overview.vessels.find((item) => item.id === boardRow.vesselId);
    const person = overview.people.find((item) => item.id === boardRow.personId);
    if (!vessel || !person) return [];
    const personName = formatPlanningPerson(person);
    if (filters.vesselName && filters.vesselName !== vessel.name) return [];
    if (filters.personName && filters.personName !== personName) return [];
    if (filters.eventType || filters.status || filters.responsible) return [];
    return [{ boardRow, vessel, person, personName }];
  });
  const vesselNames = new Set([
    ...events.map((event) => event.vessel),
    ...boardRows.map((entry) => entry.vessel.name),
  ]);

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
      const vesselBoardRows = boardRows.filter((entry) => entry.vessel.name === vessel);
      const vesselRecord = overview.vessels.find((item) => item.name === vessel);
      const vesselProjects = projects.filter((project) => project.primaryVesselName === vessel || project.secondaryVesselName === vessel);
      rows.push({
        key: vesselKey,
        type: 'vessel',
        personId: null,
        vesselId: vesselRecord?.id || vesselEvents[0]?.vesselId || null,
        label: vessel,
        vessel,
        board: '',
        functionLabel: '',
        boardRowId: null,
        hasAnyRecords: false,
        vesselKey,
        boardKey: '',
        events: [],
        projects: vesselProjects,
      });

      const boards = new Map<string, { events: PlanningCrewEvent[]; rows: typeof vesselBoardRows }>();
      vesselEvents.forEach((event) => {
        const defaultBoard = normalizePlanningText(vessel).includes('ARMEMENT') ? 'Armement' : 'Bordée';
        const board = event.board || defaultBoard;
        const current = boards.get(board) || { events: [], rows: [] };
        boards.set(board, { ...current, events: [...current.events, event] });
      });
      vesselBoardRows.forEach((entry) => {
        const current = boards.get(entry.boardRow.watchGroup) || { events: [], rows: [] };
        boards.set(entry.boardRow.watchGroup, { ...current, rows: [...current.rows, entry] });
      });
      [...boards.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'fr', { numeric: true }))
        .forEach(([board, boardContent]) => {
          const boardEvents = boardContent.events;
          const boardKey = `${vesselKey}-board-${safeKey(board)}`;
          rows.push({
            key: boardKey,
            type: 'board',
            personId: null,
            vesselId: boardEvents[0]?.vesselId || vesselRecord?.id || null,
            label: board,
            vessel,
            board,
            functionLabel: '',
            boardRowId: null,
            hasAnyRecords: false,
            vesselKey,
            boardKey,
            events: [],
            projects: [],
          });
          const people = new Map<string, PlanningCrewEvent[]>();
          boardEvents.forEach((event) => people.set(event.person, [...(people.get(event.person) || []), event]));
          boardContent.rows.forEach((entry) => {
            if (!people.has(entry.personName)) people.set(entry.personName, []);
          });
          [...people.entries()]
            .sort(([leftName, leftEvents], [rightName, rightEvents]) => {
              const leftRole = leftEvents[0]?.functionLabel || overview.people.find((person) => formatPlanningPerson(person) === leftName)?.functionLabel || '';
              const rightRole = rightEvents[0]?.functionLabel || overview.people.find((person) => formatPlanningPerson(person) === rightName)?.functionLabel || '';
              return personRoleRank(leftRole) - personRoleRank(rightRole) || leftName.localeCompare(rightName, 'fr');
            })
            .forEach(([person, personEvents]) => {
              const linkedPerson = overview.people.find((item) => formatPlanningPerson(item) === person);
              const boardRow = boardContent.rows.find((entry) => entry.person.id === linkedPerson?.id)?.boardRow;
              const personId = personEvents[0]?.personId || linkedPerson?.id || null;
              const hasAnyRecords = allEvents.some((event) => (
                event.vessel === vessel
                && (event.board || (normalizePlanningText(vessel).includes('ARMEMENT') ? 'Armement' : 'Bordée')) === board
                && (personId !== null ? event.personId === personId || event.person === person : event.person === person)
              ));
              rows.push({
                key: `${boardKey}-person-${safeKey(person)}`,
                type: 'person',
                personId,
                vesselId: personEvents[0]?.vesselId || vesselRecord?.id || null,
                label: person,
                vessel,
                board,
                functionLabel: personEvents[0]?.functionLabel || boardRow?.functionLabel || linkedPerson?.functionLabel || '',
                boardRowId: boardRow?.id || null,
                hasAnyRecords,
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

export type PlanningControlLevel = 'information' | 'warning' | 'blocking';

export type PlanningControlCode =
  | 'invalid_period'
  | 'inactive_person'
  | 'crew_unavailability'
  | 'crew_absence'
  | 'assignment_overlap'
  | 'function_mismatch'
  | 'missing_qualification'
  | 'medical_unfit'
  | 'medical_restriction'
  | 'pending_validation';

export interface PlanningAssignmentCandidate {
  id: string;
  personId: number | null;
  person: string;
  vessel: string;
  functionLabel: string;
  status: string;
  startsOn: string;
  endsOn: string;
  startsAt?: string;
  endsAt?: string;
}

export interface PlanningControlResult {
  id: string;
  code: PlanningControlCode;
  level: PlanningControlLevel;
  title: string;
  detail: string;
  date: string;
  eventId: string;
  personId: number | null;
}

const DEFAULT_PLANNING_CONTROL_LEVELS: Record<PlanningControlCode, PlanningControlLevel> = {
  invalid_period: 'blocking',
  inactive_person: 'blocking',
  crew_unavailability: 'blocking',
  crew_absence: 'blocking',
  assignment_overlap: 'warning',
  function_mismatch: 'information',
  missing_qualification: 'warning',
  medical_unfit: 'blocking',
  medical_restriction: 'warning',
  pending_validation: 'warning',
};

const ABSENCE_STATUS_TONES = new Set(['vacation', 'sick']);
const UNAVAILABLE_STATUS_TONES = new Set(['rest', 'training']);
const DECK_FUNCTION_TOKENS = ['CAPITAINE', 'PONT', 'MATELOT', 'BOSCO', 'OFFICIER'];
const ENGINE_FUNCTION_TOKENS = ['MACHINE', 'MECANICIEN', 'CHEFMECANICIEN'];

function planningRuleLevel(
  overview: PlanningOverview,
  code: PlanningControlCode,
  effectiveOn: string,
): PlanningControlLevel | null {
  const configured = overview.rules.find((rule) => rule.code === code);
  if (!configured) return DEFAULT_PLANNING_CONTROL_LEVELS[code];
  if (!configured.active || configured.effectiveFrom > effectiveOn) return null;
  return configured.controlLevel;
}

function isSamePlanningPerson(
  left: Pick<PlanningAssignmentCandidate, 'personId' | 'person'>,
  right: Pick<PlanningCrewEvent, 'personId' | 'person'>,
): boolean {
  if (left.personId !== null && right.personId !== null) return left.personId === right.personId;
  return normalizePlanningText(left.person) === normalizePlanningText(right.person);
}

export function planningExpiredDocumentsForDate(
  documents: readonly PlanningHrDocumentRecord[],
  personId: number | null,
  workDate: string,
): PlanningHrDocumentRecord[] {
  if (personId === null) return [];
  return documents.filter((document) => {
    if (document.personId !== personId) return false;
    if (document.expiresOn) return document.expiresOn < workDate;
    return normalizePlanningText(document.status).includes('EXPIRED');
  });
}

function controlResult(
  overview: PlanningOverview,
  candidate: PlanningAssignmentCandidate,
  code: PlanningControlCode,
  input: Omit<PlanningControlResult, 'code' | 'level' | 'eventId' | 'personId'>,
): PlanningControlResult | null {
  const level = planningRuleLevel(overview, code, candidate.startsOn || '9999-12-31');
  if (!level) return null;
  return { ...input, code, level, eventId: candidate.id, personId: candidate.personId };
}

export function evaluatePlanningAssignment(
  overview: PlanningOverview,
  candidate: PlanningAssignmentCandidate,
  eventPool: PlanningCrewEvent[] = getAllPlanningCrewEvents(overview),
): PlanningControlResult[] {
  const results: PlanningControlResult[] = [];
  const add = (result: PlanningControlResult | null) => {
    if (result) results.push(result);
  };

  if (!candidate.startsOn || !candidate.endsOn || candidate.endsOn < candidate.startsOn) {
    add(controlResult(overview, candidate, 'invalid_period', {
      id: `invalid-period-${candidate.id}`,
      title: 'Période incohérente',
      detail: 'La date de fin doit être postérieure ou égale à la date de début.',
      date: candidate.startsOn,
    }));
    return results;
  }

  const person = candidate.personId !== null
    ? overview.people.find((item) => item.id === candidate.personId)
    : overview.people.find((item) => normalizePlanningText(formatPlanningPerson(item)) === normalizePlanningText(candidate.person));
  if (person && (!person.active || (person.hiredOn && person.hiredOn > candidate.endsOn) || (person.departedOn && person.departedOn < candidate.startsOn))) {
    add(controlResult(overview, candidate, 'inactive_person', {
      id: `inactive-person-${candidate.id}-${person.id}`,
      title: 'Marin indisponible administrativement',
      detail: `${formatPlanningPerson(person)} n'est pas actif pendant toute la période sélectionnée.`,
      date: candidate.startsOn,
    }));
  }

  eventPool.forEach((event) => {
    if (event.id === candidate.id || !isSamePlanningPerson(candidate, event)) return;
    if (!rangesOverlap(event.startsOn, event.endsOn, candidate.startsOn, candidate.endsOn)) return;

    const overlapDate = event.startsOn > candidate.startsOn ? event.startsOn : candidate.startsOn;
    const candidateTone = planningStatusTone(candidate.status);
    const eventTone = planningStatusTone(event.status);
    if (
      ['sea', 'shore'].includes(candidateTone)
      && ['sea', 'shore'].includes(eventTone)
      && normalizePlanningText(event.vessel) !== normalizePlanningText(candidate.vessel)
    ) {
      const pair = [candidate.id, event.id].sort().join('-');
      add(controlResult(overview, candidate, 'assignment_overlap', {
        id: `assignment-overlap-${pair}`,
        title: 'Double affectation',
        detail: `${candidate.person} est également affecté au ${event.vessel} le ${formatPlanningDate(overlapDate)}.`,
        date: overlapDate,
      }));
    }

    if (['sea', 'shore'].includes(candidateTone) && ABSENCE_STATUS_TONES.has(eventTone)) {
      add(controlResult(overview, candidate, 'crew_absence', {
        id: `crew-absence-${candidate.id}-${event.id}`,
        title: 'Absence sur la période',
        detail: `${candidate.person} est déclaré « ${planningStatusDisplayLabel(event.status)} » du ${formatPlanningDate(event.startsOn)} au ${formatPlanningDate(event.endsOn)}.`,
        date: overlapDate,
      }));
    } else if (['sea', 'shore'].includes(candidateTone) && UNAVAILABLE_STATUS_TONES.has(eventTone)) {
      add(controlResult(overview, candidate, 'crew_unavailability', {
        id: `crew-unavailability-${candidate.id}-${event.id}`,
        title: 'Indisponibilité sur la période',
        detail: `${candidate.person} est déclaré « ${planningStatusDisplayLabel(event.status)} » du ${formatPlanningDate(event.startsOn)} au ${formatPlanningDate(event.endsOn)}.`,
        date: overlapDate,
      }));
    }
  });

  if (person?.functionLabel && candidate.functionLabel) {
    const expected = normalizePlanningText(person.functionLabel);
    const assigned = normalizePlanningText(candidate.functionLabel);
    if (expected && assigned && !expected.includes(assigned) && !assigned.includes(expected)) {
      add(controlResult(overview, candidate, 'function_mismatch', {
        id: `function-mismatch-${candidate.id}-${person.id}`,
        title: 'Fonction à confirmer',
        detail: `Fonction RH : ${person.functionLabel} · fonction planifiée : ${candidate.functionLabel}.`,
        date: candidate.startsOn,
      }));
    }
  }

  if (person && candidate.functionLabel) {
    const assignedFunction = normalizePlanningText(candidate.functionLabel);
    const needsDeckQualification = DECK_FUNCTION_TOKENS.some((token) => assignedFunction.includes(token));
    const needsEngineQualification = ENGINE_FUNCTION_TOKENS.some((token) => assignedFunction.includes(token));
    if ((needsDeckQualification && !person.deckCertificateLabel) || (needsEngineQualification && !person.engineCertificateLabel)) {
      add(controlResult(overview, candidate, 'missing_qualification', {
        id: `missing-qualification-${candidate.id}-${person.id}`,
        title: 'Qualification manquante',
        detail: `${candidate.functionLabel} requiert une qualification ${needsEngineQualification ? 'machine' : 'pont'} renseignée dans le dossier RH.`,
        date: candidate.startsOn,
      }));
    }
  }

  overview.hrDocuments.filter((document) => document.personId === candidate.personId).forEach((document) => {
    const documentKey = normalizePlanningText(document.status);

    if (document.medicalUnfit) {
      add(controlResult(overview, candidate, 'medical_unfit', {
        id: `medical-unfit-${candidate.id}-${document.id}`,
        title: 'Inaptitude médicale active',
        detail: `${document.title} signale une inaptitude médicale. L'affectation doit être revue.`,
        date: candidate.startsOn,
      }));
    }
    if (document.medicalRestriction) {
      add(controlResult(overview, candidate, 'medical_restriction', {
        id: `medical-restriction-${candidate.id}-${document.id}`,
        title: 'Restriction médicale',
        detail: document.medicalRestriction,
        date: candidate.startsOn,
      }));
    }
    if (document.requiresCaptainValidation && documentKey.includes('PENDING')) {
      add(controlResult(overview, candidate, 'pending_validation', {
        id: `pending-validation-${candidate.id}-${document.id}`,
        title: 'Document en attente de validation',
        detail: `${document.title} doit encore être validé par le capitaine.`,
        date: candidate.startsOn,
      }));
    }
  });

  const levelRank: Record<PlanningControlLevel, number> = { blocking: 0, warning: 1, information: 2 };
  return results.sort((left, right) => levelRank[left.level] - levelRank[right.level] || left.date.localeCompare(right.date));
}

export function buildPlanningControlCenter(
  overview: PlanningOverview,
  eventPool: PlanningCrewEvent[] = getAllPlanningCrewEvents(overview),
): PlanningControlResult[] {
  const unique = new Map<string, PlanningControlResult>();
  const eventsByPerson = new Map<string, PlanningCrewEvent[]>();
  eventPool.forEach((event) => {
    const key = normalizePlanningText(event.person);
    eventsByPerson.set(key, [...(eventsByPerson.get(key) || []), event]);
  });
  eventPool.forEach((event) => {
    evaluatePlanningAssignment(overview, {
      id: event.id,
      personId: event.personId,
      person: event.person,
      vessel: event.vessel,
      functionLabel: event.functionLabel,
      status: event.status,
      startsOn: event.startsOn,
      endsOn: event.endsOn,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    }, eventsByPerson.get(normalizePlanningText(event.person)) || []).forEach((result) => unique.set(result.id, result));
  });
  const levelRank: Record<PlanningControlLevel, number> = { blocking: 0, warning: 1, information: 2 };
  return [...unique.values()].sort(
    (left, right) => levelRank[left.level] - levelRank[right.level] || left.date.localeCompare(right.date) || left.title.localeCompare(right.title, 'fr'),
  );
}

export function hasBlockingPlanningControls(results: PlanningControlResult[]): boolean {
  return results.some((result) => result.level === 'blocking');
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
