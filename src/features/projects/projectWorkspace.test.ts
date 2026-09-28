import { describe, expect, it } from 'vitest';
import { billingReferenceScope, billingReferenceScopeLabel } from './projectBillingReferences';
import { utilization, calendarDays } from './projectPortfolioMetrics';
import { countDailyOperations, type ProjectBillingDpr } from './projectBilling';
import type { ProjectPlanningOccurrenceRecord, VesselRecord } from './projectQueries';

describe('project workspace business rules', () => {
  it('assigns a distinct client reference slot to every export combination', () => {
    const scopes = [];
    for (const hire of [false, true]) for (const expenses of [false, true]) for (const bbtm of [false, true]) scopes.push(billingReferenceScope({ includeOperationsInPdf: hire, includeExpensesInPdf: expenses, includeBbtmInPdf: bbtm }));
    expect(new Set(scopes).size).toBe(8);
    expect(billingReferenceScopeLabel(3)).toBe('Loyers + Frais fournisseurs');
    expect(billingReferenceScopeLabel(4)).toBe('Prestations BBTM');
  });
  it('counts operation and crew change vessel-days, excluding standby and duplicate DPRs', () => {
    const report = (id: number, operation: string, vesselId = 1) => ({ id, operation, vesselId, vesselName: 'GOURY', reportDate: '2026-09-01' } as ProjectBillingDpr);
    expect(countDailyOperations([report(1, '24/24 Operation'), report(2, '24/24 Crew Change'), report(3, '24/24 Crew Change', 2), report(4, '24/24 Weather Stand-by', 3)])).toBe(2);
  });
  it('clips overlap and duplicate vessel-days without letting archived projects disappear from utilization', () => {
    const vessel = { id: 1, fleetExitOn: '' } as VesselRecord;
    const operation = { primaryVesselId: 1, startsOn: '2024-02-01', endsOn: '2024-02-29', status: 'Terminé' } as ProjectPlanningOccurrenceRecord;
    const dprs = [1, 2].map((id) => ({ id, vessel_id: 1, report_date: '2024-02-01', project_id: 9 }));
    expect(utilization(vessel, '2024-02-01', '2024-02-29', [operation, operation], dprs)).toEqual({ days: 29, planned: 29, realized: 1, plannedRate: 100, realizedRate: 3 });
    expect(utilization(vessel, '2024-01-01', '2024-12-31', [operation], dprs).days).toBe(366);
    expect(calendarDays('2026-09-04', '2026-09-01')).toEqual([]);
  });
  it('includes secondary vessels, excludes cancelled operations, and caps at fleet exit', () => {
    const vessel = { id: 2, fleetExitOn: '2026-09-02' } as VesselRecord;
    const operation = { vesselIds: [1, 2], startsOn: '2026-08-30', endsOn: '2026-09-10', status: 'Confirmé' } as ProjectPlanningOccurrenceRecord;
    expect(utilization(vessel, '2026-09-01', '2026-09-30', [operation], []).planned).toBe(2);
    expect(utilization(vessel, '2026-09-01', '2026-09-30', [{ ...operation, status: 'Annulé' }], []).planned).toBe(0);
  });
});
