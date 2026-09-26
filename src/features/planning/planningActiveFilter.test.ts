import { describe, expect, it } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline, type PlanningCrewEvent } from './planningModel';
import { buildPlanningCrewLanes } from './planningViews';
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
});
