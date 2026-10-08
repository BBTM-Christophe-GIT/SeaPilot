import { describe, expect, it } from 'vitest';
import { buildPlanningCrewLanes } from './planningViews';
import { buildPlanningCrewRows, buildPlanningTimeline, getAllPlanningCrewEvents } from './planningModel';
import { planningCrewPeriod } from './planningCrewOrder';
import { createPlanningPreviewOverview } from './planningPreviewData';

const range = { start: '2026-07-01', end: '2026-07-31' };
const filters = { vesselName: '', personName: '', eventType: '', status: '', responsible: '' };
function fixture() {
  const overview = createPlanningPreviewOverview('2026-07-14');
  overview.vessels = [{ ...overview.vessels[0], name: 'GOURY' }, { ...overview.vessels[1], name: 'SUROIT' }];
  overview.people = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'].map((lastName, index) => ({
    ...overview.people[0], id: index + 1, firstName: 'Marin', lastName, functionLabel: index < 2 ? 'Capitaine' : 'Matelot',
  }));
  overview.assignments = overview.people.map((person, index) => ({ ...overview.assignments[0], id: index + 1,
    crewPersonId: person.id, crewName: `Marin ${person.lastName}`, assignmentRole: person.functionLabel,
    vesselId: index === 4 ? 2 : 1, vesselName: index === 4 ? 'SUROIT' : 'GOURY',
    startsOn: index === 0 || index === 2 ? '2026-07-20' : '2026-07-01',
    endsOn: index === 0 || index === 2 ? '2026-07-26' : '2026-07-07',
    watchGroup: 'Bordée 1',
  }));
  overview.days = []; overview.periods = []; overview.annualReviews = []; overview.boardRows = [];
  return overview;
}

describe('crew ordering by visible vessel and posting period', () => {
  it('keeps each rotation together ahead of HR function ordering inside a board', () => {
    const rows = buildPlanningCrewRows(fixture(), buildPlanningTimeline('2026-07-01', 'month'), filters);
    expect(rows.filter((row) => row.type === 'person').map((row) => row.label)).toEqual([
      'Marin BRAVO', 'Marin DELTA', 'Marin ALPHA', 'Marin CHARLIE', 'Marin ECHO',
    ]);
  });
  it.each(['people', 'teams'] as const)('keeps matching postings consecutive in the %s view', (grouping) => {
    expect(buildPlanningCrewLanes(fixture(), range, filters, grouping).map((lane) => lane.label)).toEqual([
      'Marin BRAVO', 'Marin DELTA', 'Marin ALPHA', 'Marin CHARLIE', 'Marin ECHO',
    ]);
  });
  it('uses the visible portion of the longest posting and joins consecutive imported days', () => {
    const [event] = getAllPlanningCrewEvents(fixture());
    const events = [
      { ...event, startsOn: '2026-06-01', endsOn: '2026-07-02', vessel: 'SUROIT' },
      { ...event, startsOn: '2026-07-10', endsOn: '2026-07-10', vessel: 'GOURY' },
      { ...event, startsOn: '2026-07-11', endsOn: '2026-07-13', vessel: 'GOURY', functionLabel: '2nd Capitaine' },
    ];
    expect(planningCrewPeriod(events.reverse(), range)).toEqual({ vessel: 'GOURY', start: '2026-07-10', end: '2026-07-13' });
    expect(planningCrewPeriod(events, { start: '2026-06-01', end: '2026-06-30' })).toEqual({ vessel: 'SUROIT', start: '2026-06-01', end: '2026-06-30' });
    expect(planningCrewPeriod(events, { start: '2027-01-01', end: '2027-01-31' })).toBeNull();
  });
});
