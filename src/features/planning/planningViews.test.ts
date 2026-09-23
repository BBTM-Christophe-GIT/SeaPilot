import { describe, expect, it } from 'vitest';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningCrewLanes,
  buildPlanningFleetLanes,
  defaultPlanningVesselName,
  buildPlanningProjectLanes,
  patchPlanningEvent,
  planningCrewEventType,
  removePlanningEvent,
  replacePlanningProject,
} from './planningViews';
import { getAllPlanningCrewEvents } from './planningModel';

const overview: PlanningOverview = {
  vessels: [
    { id: 1, name: 'COTENTIN', acronym: 'CTN', active: true },
    { id: 2, name: 'SUROIT', acronym: 'SRT', active: true },
  ],
  people: [
    { id: 10, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  assignments: [{ id: 100, vesselId: 1, vesselName: 'COTENTIN', captainPersonId: null, captainName: '-', crewPersonId: 10, crewName: 'Paul DURAND', startsOn: '2026-07-06', endsOn: '2026-07-12', assignmentRole: 'Pont', statusLabel: 'En Mer', confirmationStatus: 'provisional', watchGroup: 'Bordée 1', comments: '', sourceLabel: 'seapilot' }],
  days: [{ id: 400, personId: null, vesselId: 1, crewName: '', captainName: '', vesselName: 'COTENTIN', workDate: '2026-07-14', disembarkOn: '', yearNumber: 2026, monthNumber: 7, monthLabel: 'Juillet', dayNumber: 14, functionLabel: '', sailorStatus: '', dayStatus: 'Lieu du personnel', rhythmLabel: '', watchGroup: '', slot365: '', departureOn: '', workedHours: null, rest24h: null, cumulative7d: null, consecutiveRestHours: null, restPeriodCount: null, nightWorkHours: null, comments: 'Cherbourg', sourceLabel: 'seapilot-vessel-location' }],
  periods: [{ id: 200, personId: null, vesselId: 1, crewName: 'Paul DURAND', vesselName: 'COTENTIN', watchGroup: 'Bordée 1', functionLabel: 'Matelot', sailorStatus: 'Repos', startsOn: '2026-07-13', endsOn: '2026-07-14', yearNumber: 2026, comments: '', slot365SourceId: '', slot365SourceKey: '', sourceLabel: 'sharepoint' }],
  projects: [{ id: 300, title: 'Transit Cherbourg', startsOn: '2026-07-08', endsOn: '2026-07-09', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'transit', responsibleName: 'Jean MARTIN', status: 'Confirmé', sourceLabel: 'seapilot' }],
  certificates: [],
  hrDocuments: [],
  rules: [],
  publications: [],
  versions: [],
  history: [],
  handovers: [],
  derogations: [],
  derogationHistory: [],
};

const range = { start: '2026-07-06', end: '2026-07-19' };
const emptyFilters = { vesselName: '', personName: '', eventType: '', status: '', responsible: '' };

describe('planning P0.2 views', () => {
  it('applies explicit surname/function sorting independently of posting periods and display format', () => {
    const roles = ['Matelot', 'Maître Machine', "Maître d’Equipage", '2nd Capitaine', 'Chef Mécanicien', 'Capitaine'];
    const people = roles.map((functionLabel, index) => ({ ...overview.people[0], id: index + 1, firstName: 'Jean', lastName: String.fromCharCode(65 + index), functionLabel }));
    const data = { ...overview, people, periods: [], assignments: people.map((person, index) =>
      ({ ...overview.assignments[0], id: index + 1, crewPersonId: person.id, crewName: `Jean ${person.lastName}`, startsOn: `2026-07-${String(12 - index).padStart(2, '0')}` })) };
    const byName = buildPlanningCrewLanes(data, range, emptyFilters, 'people', undefined, { nameFormat: 'last_first', sortOrder: 'last_name' });
    expect(byName.map((lane) => lane.label)).toEqual(['A Jean', 'B Jean', 'C Jean', 'D Jean', 'E Jean', 'F Jean']);
    const byFunction = buildPlanningCrewLanes(data, range, emptyFilters, 'people', undefined, { nameFormat: 'first_last', sortOrder: 'function' });
    expect(byFunction.map((lane) => lane.label)).toEqual(['Jean F', 'Jean E', 'Jean D', 'Jean C', 'Jean B', 'Jean A']);
    expect(buildPlanningCrewLanes(data, range, { ...emptyFilters, personName: 'Jean A' }, 'people', undefined,
      { nameFormat: 'last_first', sortOrder: 'function' }).map((lane) => lane.label)).toEqual(['A Jean']);
    expect(byName[0].events[0].person).toBe('Jean A');
  });
  it('keeps empty active vessels in the project view without crew or location data', () => {
    const lanes = buildPlanningProjectLanes(overview, range, emptyFilters);
    expect(lanes.map((lane) => lane.label)).toEqual(['COTENTIN', 'SUROIT']);
    expect(lanes[0].projects).toHaveLength(1);
    expect(lanes[1].projects).toHaveLength(0);
    expect(lanes.every((lane) => !lane.assignments.length && !lane.locations.length)).toBe(true);
    expect(buildPlanningProjectLanes(overview, { start: '2027-01-01', end: '2027-01-31' }, emptyFilters)).toHaveLength(2);
  });

  it('includes empty active vessels for the field fleet selector', () => {
    expect(buildPlanningFleetLanes({ ...overview, assignments: [], periods: [], projects: [] }, range, emptyFilters, [], true)
      .map((lane) => lane.label)).toEqual(['COTENTIN', 'SUROIT']);
    expect(buildPlanningFleetLanes(overview, range, { ...emptyFilters, vesselName: 'SUROIT' }, [], true)
      .map((lane) => lane.label)).toEqual(['SUROIT']);
  });

  it('filters multi-vessel projects to the selected vessel and retains historical project lanes', () => {
    const source = { ...overview, projects: [{ ...overview.projects[0], vesselIds: [1, 2, 99], vesselNames: ['COTENTIN', 'SUROIT', 'HISTORIQUE'] }] };
    const lanes = buildPlanningProjectLanes(source, range, { ...emptyFilters, vesselName: 'SUROIT' });
    expect(lanes.map((lane) => lane.label)).toEqual(['SUROIT']);
    expect(lanes[0].projects).toHaveLength(1);
    expect(buildPlanningProjectLanes(source, range, emptyFilters).map((lane) => lane.label)).toEqual(['COTENTIN', 'HISTORIQUE', 'SUROIT']);
    expect(buildPlanningProjectLanes(source, range, { ...emptyFilters, status: 'Annulé' }).every((lane) => !lane.projects.length)).toBe(true);
  });

  it('builds fleet lanes only for vessels with visible crew and filters event metadata', () => {
    const lanes = buildPlanningFleetLanes(overview, range, { ...emptyFilters, eventType: 'transit', responsible: 'Jean MARTIN' });
    expect(lanes.map((lane) => lane.label)).toEqual(['COTENTIN']);
    expect(lanes.find((lane) => lane.label === 'COTENTIN')?.projects).toEqual([expect.objectContaining({ title: 'Transit Cherbourg' })]);
    expect(lanes.find((lane) => lane.label === 'COTENTIN')?.locations).toEqual([expect.objectContaining({ workDate: '2026-07-14', comments: 'Cherbourg' })]);
    expect(buildPlanningFleetLanes(overview, range, { ...emptyFilters, status: 'Annulé' }).every((lane) => lane.projects.length === 0)).toBe(true);
  });

  it('groups crew by linked person or team and classifies operational statuses', () => {
    const people = buildPlanningCrewLanes(overview, range, emptyFilters, 'people');
    const teams = buildPlanningCrewLanes(overview, range, emptyFilters, 'teams');
    expect(people).toEqual([expect.objectContaining({ label: 'Paul DURAND', personId: 10, watchGroup: 'Bordée 1' })]);
    expect(teams).toEqual([expect.objectContaining({ label: 'Paul DURAND', personId: 10, detail: 'Bordée 1 · COTENTIN' })]);
    expect(getAllPlanningCrewEvents(overview).some((event) => event.id === 'day-400')).toBe(false);
    expect(planningCrewEventType(getAllPlanningCrewEvents(overview).find((event) => event.kind === 'period')!)).toBe('rest');
  });

  it('uses the linked HR function in the personnel view when an assignment keeps an older role', () => {
    const adrienOverview: PlanningOverview = {
      ...overview,
      people: [{
        ...overview.people[0],
        id: 6,
        firstName: 'Adrien',
        lastName: 'BOIS',
        functionLabel: 'Capitaine',
      }],
      periods: [],
      assignments: [{
        ...overview.assignments[0],
        id: 156,
        crewPersonId: 6,
        crewName: 'Adrien BOIS',
        assignmentRole: '2nd Capitaine',
      }],
    };

    expect(buildPlanningCrewLanes(adrienOverview, range, emptyFilters, 'people')).toEqual([
      expect.objectContaining({
        label: 'Adrien BOIS',
        functionLabel: 'Capitaine',
        detail: 'Capitaine · COTENTIN',
      }),
    ]);
  });

  it('sorts the personnel lanes by last name, then first name', () => {
    const personnelOverview: PlanningOverview = {
      ...overview,
      people: [
        { ...overview.people[0], id: 11, firstName: 'Alain', lastName: 'ZULU' },
        { ...overview.people[0], id: 12, firstName: 'Zoé', lastName: 'ALPHA' },
        overview.people[0],
      ],
      assignments: [
        { ...overview.assignments[0], id: 101, crewPersonId: 11, crewName: 'Alain ZULU' },
        { ...overview.assignments[0], id: 102, crewPersonId: 12, crewName: 'Zoé ALPHA' },
        overview.assignments[0],
      ],
      periods: [],
    };

    expect(buildPlanningCrewLanes(personnelOverview, range, emptyFilters, 'people').map((lane) => lane.label))
      .toEqual(['Zoé ALPHA', 'Paul DURAND', 'Alain ZULU']);
  });

  it('shows one synchronized operation on every selected vessel lane without a vessel limit', () => {
    const multiVesselOverview: PlanningOverview = {
      ...overview,
      vessels: [
        ...overview.vessels,
        { id: 3, name: 'LE ROZEL', acronym: 'LRZ', active: true },
      ],
      projects: [{
        ...overview.projects[0],
        eventType: 'operation',
        vesselIds: [1, 2, 3],
        vesselNames: ['COTENTIN', 'SUROIT', 'LE ROZEL'],
      }],
    };

    const lanes = buildPlanningFleetLanes(multiVesselOverview, range, emptyFilters);
    expect(lanes.filter((lane) => lane.projects.some((project) => project.id === 300)).map((lane) => lane.label)).toEqual([
      'COTENTIN',
      'LE ROZEL',
      'SUROIT',
    ]);
  });

  it('patches, removes and replaces records without rebuilding the overview', () => {
    const event = getAllPlanningCrewEvents(overview).find((item) => item.kind === 'assignment')!;
    const patched = patchPlanningEvent(overview, event, {
      vesselId: 2,
      vesselName: 'SUROIT',
      startsOn: '2026-07-07',
      endsOn: '2026-07-13',
      statusLabel: 'En Mer',
      confirmationStatus: 'confirmed',
      functionLabel: 'Pont',
      watchGroup: 'Bordée 2',
      comments: 'Déplacée',
    });
    expect(patched.assignments[0]).toEqual(expect.objectContaining({ vesselName: 'SUROIT', confirmationStatus: 'confirmed', comments: 'Déplacée' }));
    expect(removePlanningEvent(patched, event).assignments).toHaveLength(0);
    expect(replacePlanningProject(overview, { ...overview.projects[0], status: 'Annulé' }).projects[0].status).toBe('Annulé');
  });
});


describe('default vessel for real field profiles', () => {
  it('selects the current assignment for a sailor and the responsible captain', () => {
    const data = { ...overview, assignments: [{ ...overview.assignments[0], captainPersonId: 20 }] };
    expect(defaultPlanningVesselName(data, 10, '2026-07-08')).toBe('COTENTIN');
    expect(defaultPlanningVesselName(data, 20, '2026-07-08')).toBe('COTENTIN');
    expect(defaultPlanningVesselName(data, 10, '2026-07-01')).toBe('');
    expect(defaultPlanningVesselName(data, 10, '2026-07-20')).toBe('');
    expect(defaultPlanningVesselName(data, null, '2026-07-08')).toBe('');
  });

  it('prefers a personal assignment and ignores cancelled assignments', () => {
    const data = { ...overview, assignments: [
      { ...overview.assignments[0], id: 102, vesselId: 2, crewPersonId: 30, captainPersonId: 10 },
      overview.assignments[0],
      { ...overview.assignments[0], id: 103, vesselId: 2, confirmationStatus: 'cancelled' as const },
    ] };
    expect(defaultPlanningVesselName(data, 10, '2026-07-08')).toBe('COTENTIN');
  });

  it('uses daily overrides and historical period-only assignments', () => {
    const day = { ...overview.days[0], personId: 10, vesselId: 2, workDate: '2026-07-08', sailorStatus: 'En Mer', sourceLabel: 'sharepoint' };
    expect(defaultPlanningVesselName({ ...overview, days: [day] }, 10, '2026-07-08')).toBe('SUROIT');
    expect(defaultPlanningVesselName({ ...overview, days: [{ ...day, sailorStatus: 'Repos' }] }, 10, '2026-07-08')).toBe('');
    const data = { ...overview, assignments: [], periods: [{ ...overview.periods[0], personId: 10, sailorStatus: 'En Mer' }] };
    expect(defaultPlanningVesselName(data, 10, '2026-07-13')).toBe('COTENTIN');
  });
});
