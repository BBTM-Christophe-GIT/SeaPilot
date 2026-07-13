import { describe, expect, it } from 'vitest';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningCrewLanes,
  buildPlanningFleetLanes,
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
  days: [],
  periods: [{ id: 200, personId: null, vesselId: 1, crewName: 'Paul DURAND', vesselName: 'COTENTIN', watchGroup: 'Bordée 1', functionLabel: 'Matelot', sailorStatus: 'Repos', startsOn: '2026-07-13', endsOn: '2026-07-14', yearNumber: 2026, comments: '', slot365SourceId: '', slot365SourceKey: '', sourceLabel: 'sharepoint' }],
  projects: [{ id: 300, title: 'Transit Cherbourg', startsOn: '2026-07-08', endsOn: '2026-07-09', description: '', clientName: '', primaryVesselId: 1, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'transit', responsibleName: 'Jean MARTIN', status: 'Confirmé', sourceLabel: 'seapilot' }],
  certificates: [],
  hrDocuments: [],
  rules: [],
  publications: [],
};

const range = { start: '2026-07-06', end: '2026-07-19' };
const emptyFilters = { vesselName: '', personName: '', eventType: '', status: '', responsible: '' };

describe('planning P0.2 views', () => {
  it('builds one fleet lane per active vessel and filters event metadata', () => {
    const lanes = buildPlanningFleetLanes(overview, range, { ...emptyFilters, eventType: 'transit', responsible: 'Jean MARTIN' });
    expect(lanes.map((lane) => lane.label)).toEqual(['COTENTIN', 'SUROIT']);
    expect(lanes.find((lane) => lane.label === 'COTENTIN')?.projects).toEqual([expect.objectContaining({ title: 'Transit Cherbourg' })]);
    expect(buildPlanningFleetLanes(overview, range, { ...emptyFilters, status: 'Annulé' }).every((lane) => lane.projects.length === 0)).toBe(true);
  });

  it('groups crew by linked person or team and classifies operational statuses', () => {
    const people = buildPlanningCrewLanes(overview, range, emptyFilters, 'people');
    const teams = buildPlanningCrewLanes(overview, range, emptyFilters, 'teams');
    expect(people).toEqual([expect.objectContaining({ label: 'Paul DURAND', personId: 10, watchGroup: 'Bordée 1' })]);
    expect(teams).toEqual([expect.objectContaining({ label: 'Bordée 1' })]);
    expect(planningCrewEventType(getAllPlanningCrewEvents(overview).find((event) => event.kind === 'period')!)).toBe('rest');
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
