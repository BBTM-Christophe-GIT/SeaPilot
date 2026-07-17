import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { PlanningP13Data, PlanningWorkRestCheck } from './planningP13';
import { generatePlanningExport } from './planningP13Exports';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';

const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  assignments: [{ id: 1, vesselId: 2, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 3, crewName: 'Anne MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-10', startsAt: '2026-08-01T06:00:00Z', endsAt: '2026-08-10T18:00:00Z', assignmentRole: 'Capitaine', statusLabel: 'En mer', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: 'Test', sourceLabel: 'test' }],
};

const data: PlanningP13Data = {
  policies: [], notifications: [], dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

const check: PlanningWorkRestCheck = {
  id: '3:2026-08-04:rest_24h', personId: 3, personName: 'Anne MARTIN', vesselId: 2, vesselName: 'COTENTIN',
  date: '2026-08-04', policyId: 1, policyName: 'Interne', ruleCode: 'rest_24h', ruleLabel: 'Repos sur 24 heures',
  value: 10, threshold: 11, unit: 'hours', status: 'non_compliant', detail: 'Repos insuffisant', dataSource: 'test',
};

const context = { overview, data, checks: [check], startsOn: '2026-08-01', endsOn: '2026-08-31' };

describe('Planning P1.3 exports', () => {
  it('creates a valid Excel OOXML workbook without a heavyweight spreadsheet runtime', async () => {
    const result = await generatePlanningExport('crew_list', 'xlsx', context);
    expect(result.fileName).toBe('liste-equipage-2026-08-01-2026-08-31.xlsx');
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(archive.file('xl/workbook.xml')).not.toBeNull();
    await expect(archive.file('xl/worksheets/sheet1.xml')!.async('string')).resolves.toContain('Anne MARTIN');
  });

  it('creates calendar events with stable SeaPilot UIDs', async () => {
    const result = await generatePlanningExport('crew_list', 'ics', context);
    const content = await result.blob.text();
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('UID:assignment-1@seapilot');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN');
  });

  it('creates a PDF anomaly/work-rest report', async () => {
    const result = await generatePlanningExport('work_rest', 'pdf', context);
    expect(result.fileName).toMatch(/travail-repos.*\.pdf$/);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(500);
  });
});
