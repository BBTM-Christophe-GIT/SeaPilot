import { describe, expect, it } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline, getAllPlanningCrewEvents, planningReferenceMonthRange, timelineRange, type PlanningCrewEvent } from './planningModel';
import { buildPlanningCrewLanes } from './planningViews';
import type { PlanningAssignmentRecord, PlanningOverview } from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const days = buildPlanningTimeline('2026-09-21', 'month').slice(0, 7);
const range = { start: '2026-09-21', end: '2026-09-27' };
const filters = { vesselName: '', personName: '' };
const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, firstName: `Marin ${index + 1}`,
    lastName: 'TEST', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI',
    hiredOn: '', departedOn: '', active: true })),
};
const event = (personId: number, startsOn: string, endsOn: string, status = 'confirmed'): PlanningCrewEvent => ({
  id: `assignment-${personId}-${startsOn}`, kind: 'assignment', personId, vesselId: 1,
  person: `Marin ${personId} TEST`, vessel: 'COTENTIN', board: 'Bordée 1', functionLabel: 'Matelot',
  status: 'En Mer', confirmationStatus: status as PlanningCrewEvent['confirmationStatus'], responsible: '', rhythm: '',
  startsOn, endsOn, startsAt: '', endsAt: '', comments: '', sourceLabel: 'seapilot',
});
const events = [event(1, '2026-09-21', '2026-09-25'), event(2, '2026-09-21', '2026-09-26'),
  event(3, '2026-09-27', '2026-09-30'), event(4, '2026-09-26', '2026-09-27', 'cancelled'),
  event(5, '2026-09-28', '2026-09-30')];

// Posting dates, ships and watches from the September records reported as missing.
const septemberOverview: PlanningOverview = {
  ...EMPTY_PLANNING_OVERVIEW,
  vessels: [
    { id: 2, name: 'LE ROZEL', acronym: 'RZL', active: true },
    { id: 4, name: 'SUROIT', acronym: 'SRT', active: true },
    { id: 6, name: 'HIRONDELLE DE LA MANCHE', acronym: 'HDM', active: true },
    { id: 11, name: 'LANDEMER', acronym: 'LDM', active: true },
    { id: 3, name: 'KROKDUR', acronym: 'KRD', active: true },
  ],
  people: [
    { ...overview.people[0], id: 28, firstName: 'Gary', lastName: 'LEFEVRE', functionLabel: '2nd Capitaine', hiredOn: '2026-06-15' },
    { ...overview.people[0], id: 17, firstName: 'Mathieu', lastName: 'QUESNOT', functionLabel: 'Capitaine' },
  ],
  assignments: [],
};
function septemberAssignment(id: number, personId: number, vesselId: number, startsOn: string, endsOn: string,
  watchGroup = 'Bordée 1', statusLabel = 'En Mer', confirmationStatus: PlanningAssignmentRecord['confirmationStatus'] = 'confirmed'): PlanningAssignmentRecord {
  const person = septemberOverview.people.find((item) => item.id === personId)!;
  return { id, vesselId, vesselName: septemberOverview.vessels.find((item) => item.id === vesselId)!.name,
    captainPersonId: null, captainName: '', crewPersonId: personId, crewName: `${person.firstName} ${person.lastName}`,
    startsOn, endsOn, watchGroup, assignmentRole: person.functionLabel, statusLabel, confirmationStatus,
    comments: '', sourceLabel: 'seapilot' };
}
septemberOverview.assignments = [
  septemberAssignment(183, 28, 2, '2026-08-28', '2026-09-05'),
  septemberAssignment(705, 28, 2, '2026-09-15', '2026-09-15', 'Bordée 1', 'Vacance'),
  ...[248, 892, 894].map((id) => septemberAssignment(id, 28, 2, '2026-09-16', '2026-09-25')),
  septemberAssignment(898, 28, 2, '2026-09-13', '2026-09-13', 'Bordée 1', 'En Mer', 'cancelled'),
  septemberAssignment(867, 28, 11, '2026-10-12', '2026-10-26', 'Bordée 2'),
  septemberAssignment(636, 17, 4, '2026-09-07', '2026-09-07'),
  septemberAssignment(810, 17, 4, '2026-09-22', '2026-09-26'),
  septemberAssignment(869, 17, 4, '2026-09-28', '2026-09-29'),
  septemberAssignment(704, 17, 6, '2026-09-08', '2026-09-10'),
  septemberAssignment(748, 17, 2, '2026-09-13', '2026-09-16', 'Bordée 2'),
  septemberAssignment(639, 17, 11, '2026-09-30', '2026-10-12'),
  septemberAssignment(747, 17, 3, '2026-09-17', '2026-09-18', 'Bordée 1', 'En Mer', 'cancelled'),
];
const septemberDays = buildPlanningTimeline('2026-09-01', 'month');
const septemberReference = planningReferenceMonthRange('2026-09-01');
const septemberEvents = getAllPlanningCrewEvents(septemberOverview);
const fleetPostings = (rows: ReturnType<typeof buildPlanningCrewRows>) => rows.filter((row) => row.type === 'person')
  .map((row) => `${row.personId}:${row.vessel}:${row.board}`).sort();

describe('Planning active display filter', () => {
  it('preserves the existing fleet rows when disabled and includes today when enabled', () => {
    const original = buildPlanningCrewRows(overview, days, filters, events);
    expect(original.filter((row) => row.type === 'person').map((row) => row.personId).sort()).toEqual([1, 2, 3]);
    const active = buildPlanningCrewRows(overview, days, filters, events, { activeFrom: '2026-09-26' });
    expect(active.filter((row) => row.type === 'person').map((row) => row.personId).sort()).toEqual([2, 3]);
    expect(active.find((row) => row.personId === 2)?.events[0].startsOn).toBe('2026-09-21');
    expect(buildPlanningCrewRows(overview, days, filters, events, { activeFrom: '2026-10-01' })).toEqual(original);
  });

  it.each(['people', 'teams'] as const)('filters %s lanes without changing their history or order', (grouping) => {
    const original = buildPlanningCrewLanes(overview, range, filters, grouping, events);
    expect(original.some((lane) => lane.personId === 6)).toBe(true);
    const active = buildPlanningCrewLanes(overview, range, filters, grouping, events, undefined, '2026-09-26');
    expect(active.map((lane) => lane.personId).sort()).toEqual([2, 3]);
    expect(active).toEqual(original.filter((lane) => lane.personId === 2 || lane.personId === 3));
    expect(buildPlanningCrewLanes(overview, range, filters, grouping, events, undefined, '2026-10-01')).toEqual(original);
  });

  it('keeps only the current vessel row when the person has moved to another vessel', () => {
    const moved = [...events, { ...event(1, '2026-09-26', '2026-09-27'), vessel: 'GOURY', vesselId: 2 }];
    const rows = buildPlanningCrewRows(overview, days, filters, moved, { activeFrom: '2026-09-26' });
    expect(rows.filter((row) => row.personId === 1).map((row) => row.vessel)).toEqual(['GOURY']);
  });

  it('keeps a newly added row long enough to create its first assignment', () => {
    const data = { ...overview, boardRows: [{ id: 10, vesselId: 1, personId: 6,
      watchGroup: 'Bordée 1', functionLabel: 'Matelot', createdAt: '2026-09-26T10:00:00Z' }] };
    const options = { activeFrom: '2026-09-26' };
    expect(buildPlanningCrewRows(data, days, filters, events, options).some((row) => row.personId === 6)).toBe(false);
    expect(buildPlanningCrewRows(data, days, filters, events, { ...options, pendingBoardRowIds: new Set([10]) })
      .some((row) => row.personId === 6)).toBe(true);
  });

  it('reveals only the explicitly added board when its existing events are all past', () => {
    const data = { ...overview, boardRows: [{ id: 10, vesselId: 1, personId: 1,
      watchGroup: 'Bordée 1', functionLabel: 'Matelot', createdAt: '2026-09-26T10:00:00Z' }] };
    const history = [event(1, '2026-09-21', '2026-09-25'),
      { ...event(1, '2026-09-21', '2026-09-25'), board: 'Bordée 2' }];
    const options = { activeFrom: '2026-09-26', pendingBoardRowIds: new Set([10]) };
    const rows = buildPlanningCrewRows(data, days, filters, history, options).filter((row) => row.personId === 1);
    expect(rows).toEqual([expect.objectContaining({ board: 'Bordée 1', events: [history[0]] })]);
    expect(buildPlanningCrewRows(data, days, { ...filters, personName: 'Marin 2 TEST' }, history, options)
      .some((row) => row.personId === 1)).toBe(false);
    expect(buildPlanningCrewRows({ ...data, people: [{ ...data.people[0], departedOn: '2026-08-31' }] },
      days, filters, history, options).some((row) => row.personId === 1)).toBe(false);
  });

  it('keeps Gary and all Mathieu September postings when the historical month grid extends into October', () => {
    expect(timelineRange(septemberDays)).toEqual({ start: '2026-08-31', end: '2026-10-18' });
    // Trailing October postings previously kept only the two LANDEMER rows.
    expect(fleetPostings(buildPlanningCrewRows(septemberOverview, septemberDays, filters, septemberEvents,
      { activeFrom: '2026-10-01' }))).toEqual(['17:LANDEMER:Bordée 1', '28:LANDEMER:Bordée 2']);

    const rows = buildPlanningCrewRows(septemberOverview, septemberDays, filters, septemberEvents, {
      activeFrom: '2026-10-01', referenceRange: septemberReference, employmentRange: septemberReference,
    });
    expect(fleetPostings(rows)).toEqual([
      '17:HIRONDELLE DE LA MANCHE:Bordée 1', '17:LANDEMER:Bordée 1', '17:LE ROZEL:Bordée 2',
      '17:SUROIT:Bordée 1', '28:LANDEMER:Bordée 2', '28:LE ROZEL:Bordée 1',
    ]);
    expect(rows.find((row) => row.personId === 28 && row.vessel === 'LE ROZEL')?.events.map((item) => item.assignmentId)).toEqual([183, 705, 894]);
    expect(rows).toEqual(buildPlanningCrewRows(septemberOverview, septemberDays, filters, septemberEvents,
      { employmentRange: septemberReference }));
  });

  it.each(['people', 'teams'] as const)('preserves the same historical September events in %s without relying on October postings', (grouping) => {
    const septemberOnly = septemberEvents.filter((item) => item.endsOn < '2026-10-01');
    const original = buildPlanningCrewLanes(septemberOverview, timelineRange(septemberDays), filters, grouping, septemberOnly);
    const historical = buildPlanningCrewLanes(septemberOverview, timelineRange(septemberDays), filters, grouping,
      septemberOnly, undefined, '2026-10-01', septemberReference);
    expect(historical).toEqual(original);
    expect(historical.map((lane) => lane.personId)).toEqual([28, 17]);
    expect(historical.flatMap((lane) => lane.events).some((item) => item.confirmationStatus === 'cancelled')).toBe(false);
  });

  it.each([
    ['2026-09-26', ['17:LANDEMER:Bordée 1', '17:SUROIT:Bordée 1', '28:LANDEMER:Bordée 2'], [17, 28]],
    ['2026-08-20', ['17:HIRONDELLE DE LA MANCHE:Bordée 1', '17:LANDEMER:Bordée 1', '17:LE ROZEL:Bordée 2', '17:SUROIT:Bordée 1', '28:LANDEMER:Bordée 2', '28:LE ROZEL:Bordée 1'], [17, 28]],
  ] as const)('retains the existing active cutoff for a current or future reference month on %s', (activeFrom, postings, personIds) => {
    const rows = buildPlanningCrewRows(septemberOverview, septemberDays, filters, septemberEvents,
      { activeFrom, referenceRange: septemberReference });
    expect(fleetPostings(rows)).toEqual(postings);
    const lanes = buildPlanningCrewLanes(septemberOverview, timelineRange(septemberDays), filters, 'people',
      septemberEvents, undefined, activeFrom, septemberReference);
    expect(lanes.map((lane) => lane.personId)).toEqual(personIds);
    expect(lanes).toEqual(buildPlanningCrewLanes(septemberOverview, timelineRange(septemberDays), filters, 'people',
      septemberEvents, undefined, activeFrom));
  });

  it('keeps explicit vessel/person filters and reference-month employment restrictions on historical rows', () => {
    const selected = { vesselName: 'LE ROZEL', personName: 'Gary LEFEVRE' };
    const options = { activeFrom: '2026-10-01', referenceRange: septemberReference, employmentRange: septemberReference };
    expect(fleetPostings(buildPlanningCrewRows(septemberOverview, septemberDays, selected, septemberEvents, options)))
      .toEqual(['28:LE ROZEL:Bordée 1']);
    expect(buildPlanningCrewLanes(septemberOverview, timelineRange(septemberDays), selected, 'people',
      septemberEvents, undefined, options.activeFrom, septemberReference).map((lane) => lane.personId)).toEqual([28]);
    const employment = { ...septemberOverview, people: septemberOverview.people.map((person) => person.id === 28
      ? { ...person, departedOn: '2026-08-31' } : person) };
    expect(fleetPostings(buildPlanningCrewRows(employment, septemberDays, selected, septemberEvents, options))).toEqual([]);
  });
});
