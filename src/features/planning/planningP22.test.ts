import { describe, expect, it } from 'vitest';
import type { PlanningP13Data } from './planningP13';
import {
  analyzePlanningP22DataQuality,
  buildPlanningP22SailorLoads,
  buildPlanningP22TensionWindows,
  buildPlanningP22VesselLoads,
  simulatePlanningP22Scenario,
} from './planningP22';
import type { PlanningOverview } from './planningQueries';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const RANGE = { start: '2026-08-01', end: '2026-08-31' };

function fixture(): { overview: PlanningOverview; data: PlanningP13Data } {
  const overview: PlanningOverview = {
    ...EMPTY_PLANNING_OVERVIEW,
    vessels: [
      { id: 10, name: 'COTENTIN', acronym: 'CTN', active: true },
      { id: 11, name: 'SUROÎT', acronym: 'SRT', active: true },
    ],
    people: [
      { id: 1, firstName: 'Alice', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
      { id: 2, firstName: 'Benoît', lastName: 'DURAND', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', deckCertificateLabel: 'Capitaine 3000', active: true },
    ],
    assignments: [
      { id: 1, vesselId: 10, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 1, crewName: 'Alice MARTIN', startsOn: '2026-08-02', endsOn: '2026-08-10', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'A', comments: '', sourceLabel: 'test' },
      { id: 2, vesselId: 11, vesselName: 'SUROÎT', captainPersonId: null, captainName: '', crewPersonId: 2, crewName: 'Benoît DURAND', startsOn: '2026-08-20', endsOn: '2026-08-25', startsAt: '', endsAt: '', assignmentRole: 'Capitaine', statusLabel: 'Embarqué', confirmationStatus: 'confirmed', watchGroup: 'B', comments: '', sourceLabel: 'test' },
    ],
    projects: [
      { id: 20, title: 'Campagne A', startsOn: '2026-08-01', endsOn: '2026-08-05', description: '', clientName: '', primaryVesselId: 10, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'operation', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
      { id: 21, title: 'Transit A', startsOn: '2026-08-05', endsOn: '2026-08-07', description: '', clientName: '', primaryVesselId: 10, primaryVesselName: 'COTENTIN', secondaryVesselId: null, secondaryVesselName: '', eventType: 'transit', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
      { id: 22, title: 'Maintenance S', startsOn: '2026-08-21', endsOn: '2026-08-22', description: '', clientName: '', primaryVesselId: 11, primaryVesselName: 'SUROÎT', secondaryVesselId: null, secondaryVesselName: '', eventType: 'maintenance', responsibleName: '', status: 'Confirmé', sourceLabel: 'test' },
    ],
    days: [
      { id: 30, personId: 1, vesselId: 10, crewName: 'Alice MARTIN', captainName: '', vesselName: 'COTENTIN', workDate: '2026-08-02', disembarkOn: '', yearNumber: 2026, monthNumber: 8, monthLabel: 'Août', dayNumber: 2, functionLabel: 'Capitaine', sailorStatus: 'Embarqué', dayStatus: 'Travail', rhythmLabel: '', watchGroup: 'A', slot365: '', departureOn: '', workedHours: 10, rest24h: 14, cumulative7d: 10, comments: '', sourceLabel: 'test' },
    ],
    hrDocuments: [
      { id: 40, personId: 1, personName: 'Alice MARTIN', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-01-01', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
      { id: 41, personId: 2, personName: 'Benoît DURAND', categoryKey: 'certificate', title: 'Capitaine 3000', status: 'valid', expiresOn: '2027-01-01', requiresCaptainValidation: false, medicalRestriction: '', medicalUnfit: false, fileUrl: '' },
    ],
  };
  const data: PlanningP13Data = {
    policies: [], notifications: [], dependencies: [],
    p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
  };
  return { overview, data };
}

describe('Planning P2.2 data quality and projections', () => {
  it('blocks unsupported statistical forecasts when the required sources are empty', () => {
    const { overview, data } = fixture();
    const report = analyzePlanningP22DataQuality(overview, data, RANGE);
    expect(report.overallStatus).toBe('limited');
    expect(report.features.find((feature) => feature.key === 'understaffing')).toMatchObject({ status: 'blocked' });
    expect(report.features.find((feature) => feature.key === 'external_integrations')).toMatchObject({ status: 'blocked' });
    expect(report.checks.find((check) => check.key === 'assignments')).toMatchObject({ status: 'limited' });
  });

  it('computes unique factual load days for vessels and sailors', () => {
    const { overview, data } = fixture();
    const vesselLoads = buildPlanningP22VesselLoads(overview, RANGE);
    expect(vesselLoads.find((load) => load.vesselId === 10)).toMatchObject({
      scheduledDays: 7,
      operationDays: 5,
      transitDays: 3,
      assignmentDays: 9,
      sourceEvents: 2,
    });
    const sailorLoads = buildPlanningP22SailorLoads(overview, data, RANGE);
    expect(sailorLoads.find((load) => load.personId === 1)).toMatchObject({ assignedDays: 9, recordedWorkDays: 1, overlapCount: 0 });
  });

  it('identifies tension windows with explicit facts, assumptions and limits', () => {
    const { overview, data } = fixture();
    const windows = buildPlanningP22TensionWindows(overview, data, RANGE);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].facts.length).toBeGreaterThan(0);
    expect(windows[0].assumptions.join(' ')).toContain('Score');
    expect(windows[0].limits.join(' ')).toContain('ne prédit pas');
  });

  it('simulates an absence without mutating the source or applying a replacement', () => {
    const { overview, data } = fixture();
    const before = JSON.stringify({ overview, data });
    const scenario = simulatePlanningP22Scenario(overview, data, RANGE, {
      kind: 'absence', personId: 1, vesselId: null, startsOn: '2026-08-04', endsOn: '2026-08-06',
    });
    expect(scenario).not.toBeNull();
    expect(scenario?.humanValidationRequired).toBe(true);
    expect(scenario?.metrics.find((metric) => metric.key === 'impacted_assignments')?.scenario).toBe(1);
    expect(scenario?.facts.join(' ')).toContain('1 affectation');
    expect(scenario?.limits.join(' ')).toContain('Aucune probabilité');
    expect(JSON.stringify({ overview, data })).toBe(before);
  });

  it('simulates a vessel immobilisation and exposes two alternative manual plans', () => {
    const { overview, data } = fixture();
    const scenario = simulatePlanningP22Scenario(overview, data, RANGE, {
      kind: 'vessel_unavailability', personId: null, vesselId: 10, startsOn: '2026-08-03', endsOn: '2026-08-06',
    });
    expect(scenario?.metrics.find((metric) => metric.key === 'impacted_projects')?.scenario).toBe(2);
    expect(scenario?.metrics.find((metric) => metric.key === 'impacted_assignments')?.scenario).toBe(1);
    expect(scenario?.alternatives).toHaveLength(2);
    expect(scenario?.limits.join(' ')).toContain('compatibilité technique');
  });

  it('rejects incomplete or incoherent scenario inputs', () => {
    const { overview, data } = fixture();
    expect(simulatePlanningP22Scenario(overview, data, RANGE, { kind: 'absence', personId: null, vesselId: null, startsOn: '2026-08-01', endsOn: '2026-08-02' })).toBeNull();
    expect(simulatePlanningP22Scenario(overview, data, RANGE, { kind: 'vessel_unavailability', personId: null, vesselId: 10, startsOn: '2026-08-10', endsOn: '2026-08-02' })).toBeNull();
  });

  it('keeps a one-year analysis within the performance budget', () => {
    const { overview, data } = fixture();
    overview.people = Array.from({ length: 500 }, (_, index) => ({ ...overview.people[index % 2], id: index + 100, firstName: `Marin${index}` }));
    const startedAt = performance.now();
    analyzePlanningP22DataQuality(overview, data, { start: '2026-01-01', end: '2026-12-31' });
    buildPlanningP22VesselLoads(overview, { start: '2026-01-01', end: '2026-12-31' });
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
