import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { PlanningP13Data, PlanningWorkRestCheck } from './planningP13';
import { generatePlanningExport } from './planningP13Exports';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import type { PlanningDayRecord } from './planningQueries';

const overview = {
  ...EMPTY_PLANNING_OVERVIEW,
  people: [
    { id: 3, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 4, firstName: 'Pierre', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  vessels: [{ id: 2, name: 'COTENTIN', acronym: 'CTN', active: true }],
  assignments: [{ id: 1, vesselId: 2, vesselName: 'COTENTIN', captainPersonId: null, captainName: '', crewPersonId: 3, crewName: 'Anne MARTIN', startsOn: '2026-08-01', endsOn: '2026-08-10', startsAt: '2026-08-01T06:00:00Z', endsAt: '2026-08-10T18:00:00Z', assignmentRole: 'Capitaine', statusLabel: 'En mer', confirmationStatus: 'confirmed' as const, watchGroup: 'A', comments: 'Test', sourceLabel: 'test' }],
  periods: [{ id: 7, personId: 4, vesselId: 2, crewName: 'Pierre DURAND', vesselName: 'COTENTIN', watchGroup: 'Bordée 2', functionLabel: 'Matelot', sailorStatus: 'En Mer', startsOn: '2026-08-03', endsOn: '2026-08-12', yearNumber: 2026, comments: 'Import BBTM', slot365SourceId: 'bbtm.xlsx', slot365SourceKey: 'bbtm:7', sourceLabel: 'bbtm-planning-xlsx-v1' }],
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
const baseDay: PlanningDayRecord = {
  id: 31, personId: 3, vesselId: 2, crewName: 'Anne MARTIN', captainName: '', vesselName: 'COTENTIN',
  workDate: '2026-08-02', disembarkOn: '', yearNumber: 2026, monthNumber: 8, monthLabel: 'août', dayNumber: 2,
  functionLabel: 'Capitaine', sailorStatus: 'Repos', dayStatus: 'Repos', rhythmLabel: '', watchGroup: 'A',
  slot365: 'assignment:1', departureOn: '', workedHours: null, rest24h: null, cumulative7d: null,
  comments: '', sourceLabel: 'seapilot-assignment-note',
};

describe('Planning P1.3 exports', () => {
  it('creates a valid Excel OOXML workbook without a heavyweight spreadsheet runtime', async () => {
    const result = await generatePlanningExport('crew_list', 'xlsx', context);
    expect(result.fileName).toBe('liste-equipage-2026-08-01-2026-08-31.xlsx');
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(archive.file('xl/workbook.xml')).not.toBeNull();
    await expect(archive.file('xl/worksheets/sheet1.xml')!.async('string')).resolves.toContain('<cols>');
    await expect(archive.file('xl/worksheets/sheet1.xml')!.async('string')).resolves.toContain('Anne MARTIN');
    await expect(archive.file('xl/worksheets/sheet1.xml')!.async('string')).resolves.toContain('Pierre DURAND');
  });

  it('creates calendar events with stable BBTM UIDs', async () => {
    const result = await generatePlanningExport('crew_list', 'ics', context);
    const content = await result.blob.text();
    expect(content).toContain('BEGIN:VCALENDAR');
    expect(content).toContain('UID:assignment-1@seapilot');
    expect(content).toContain('UID:period-7@seapilot');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN · En Mer');
  });

  it.each(['crew_list', 'schedule', 'sailor'] as const)('exports every planning status except normalized rest in the %s calendar', async (kind) => {
    const statuses = ['En Mer', 'A Terre', 'Extra', 'Repos', 'Vacance', 'Congés Paternité', 'Arrêt Maladie',
      'Accident du Travail', 'Arrêt de travail', 'Formation', 'RTT', ' RÉPOS ', 'Débarqué'];
    const periods = statuses.map((sailorStatus, index) => ({ ...overview.periods[0], id: 20 + index,
      sailorStatus, startsOn: `2026-08-${String(index + 1).padStart(2, '0')}`,
      endsOn: `2026-08-${String(index + 1).padStart(2, '0')}` }));
    const result = await generatePlanningExport(kind, 'ics', { ...context, overview: { ...overview, assignments: [], periods } });
    const content = await result.blob.text();
    const summaries = content.split('\r\n').filter((line) => line.startsWith('SUMMARY:'));
    expect(summaries).toHaveLength(10);
    for (const status of statuses.slice(0, 11).filter((status) => status !== 'Repos')) {
      expect(summaries).toContain(`SUMMARY:Pierre DURAND · COTENTIN · ${status}`);
    }
    expect(summaries.join('\n')).not.toMatch(/repos|débarqué/i);
  });

  it('splits daily status overrides, removes rest days and retains non-rest overrides on a rest assignment', async () => {
    const assignment = { ...overview.assignments[0], statusLabel: 'Repos' };
    const day = (workDate: string, sailorStatus: string, id: number): PlanningDayRecord => ({ ...baseDay,
      id, workDate, sailorStatus, dayStatus: sailorStatus });
    const days = [day('2026-08-02', 'Congés Paternités', 31), day('2026-08-03', 'Arrêt Maladie', 32),
      day('2026-08-04', 'Accident du Travail', 33), day('2026-08-05', 'En Mer', 34), day('2026-08-06', 'En Mer', 35)];
    const result = await generatePlanningExport('sailor', 'ics', {
      ...context, overview: { ...overview, periods: [], assignments: [assignment], days },
      startsOn: '2026-08-02', endsOn: '2026-08-05',
    });
    const content = await result.blob.text();
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(content).toContain('UID:assignment-1-2026-08-02@seapilot');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN · Congés Paternité');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN · Arrêt Maladie');
    expect(content).toContain('SUMMARY:Anne MARTIN · COTENTIN · Accident du Travail');
    expect(content).toContain('DTSTART:20260805T060000Z\r\nDTEND:20260805T180000Z');
    expect(content).not.toMatch(/Repos|20260806|20260810/);
  });

  it('does not bridge a rest override between two active days', async () => {
    const result = await generatePlanningExport('schedule', 'ics', {
      ...context, startsOn: '2026-08-01', endsOn: '2026-08-03',
      overview: { ...overview, periods: [], days: [baseDay] },
    });
    const content = await result.blob.text();
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(content).toContain('DTSTART:20260801T060000Z\r\nDTEND:20260801T180000Z');
    expect(content).toContain('DTSTART:20260803T060000Z\r\nDTEND:20260803T180000Z');
    expect(content).not.toContain('20260802');
  });

  it('keeps Paris civil hours when clipping and splitting across the daylight-saving change', async () => {
    const assignment = { ...overview.assignments[0], startsOn: '2026-10-24', endsOn: '2026-10-27',
      startsAt: '2026-10-24T06:00:00Z', endsAt: '2026-10-27T19:00:00Z' };
    const result = await generatePlanningExport('schedule', 'ics', {
      ...context, startsOn: '2026-10-24', endsOn: '2026-10-26', overview: { ...overview, periods: [], assignments: [assignment],
        days: [{ ...baseDay, workDate: '2026-10-25' }] },
    });
    const content = await result.blob.text();
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(content).toContain('DTSTART:20261024T060000Z\r\nDTEND:20261024T180000Z');
    expect(content).toContain('DTSTART:20261026T070000Z\r\nDTEND:20261026T190000Z');
    expect(content).not.toMatch(/20261025|20261027/);
  });

  it('adds the sailor export and applies sailor and vessel filters', async () => {
    const result = await generatePlanningExport('sailor', 'xlsx', { ...context, personIds: [3], vesselIds: [2] });
    expect(result.fileName).toBe('marins-2026-08-01-2026-08-31.xlsx');
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    await expect(archive.file('xl/worksheets/sheet1.xml')!.async('string')).resolves.toContain('Anne MARTIN');
  });

  it('creates a PDF anomaly/work-rest report', async () => {
    const result = await generatePlanningExport('work_rest', 'pdf', context);
    expect(result.fileName).toMatch(/travail-repos.*\.pdf$/);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.blob.size).toBeGreaterThan(500);
  });
});
