import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createPlanningPreviewOverview, updatePlanningPreviewDayState } from './planningPreviewData';
import { getAllPlanningCrewEvents, buildPlanningExportRows } from './planningModel';
import { planningEventFunctionForScope, planningEventFunctionOnDate, splitPlanningEventByFunction } from './planningFunctions';
import { buildPlanningCrewList, generatePlanningCrewList } from './planningCrewList';
import { buildBoardingCertificateData } from './planningBoardingCertificate';
import { buildPlanningSilaePreviewData } from './planningSilaePreview';
import { buildSilaeEmployee, buildSilaeRows } from './planningSilae';
import { generatePlanningExport } from './planningP13Exports';

function fixture() {
  const original = createPlanningPreviewOverview('2026-07-14');
  const assignment = original.assignments.find((row) => row.crewPersonId === 101)!;
  original.assignments = [{ ...assignment, startsOn: '2026-07-10', endsOn: '2026-07-20', startsAt: '2026-07-10T08:00:00Z', endsAt: '2026-07-20T18:00:00Z' }];
  original.days = [];
  original.annualReviews = [];
  const input = { assignmentId: assignment.id, status: 'En Mer' as const, note: '', functionLabel: '2nd Capitaine' };
  const overview = ['2026-07-14', '2026-07-15'].reduce((data, workDate) => updatePlanningPreviewDayState(data, { ...input, workDate }), original);
  const event = getAllPlanningCrewEvents(overview).find((row) => row.assignmentId === assignment.id)!;
  return { original, overview, event, input };
}

describe('temporary planning functions across dated documents', () => {
  it('keeps RH and the assignment unchanged and coalesces consecutive daily functions', () => {
    const { original, overview, event } = fixture();
    expect(overview.people).toEqual(original.people);
    expect(overview.assignments).toEqual(original.assignments);
    expect(planningEventFunctionOnDate(event, '2026-07-13')).toBe('Capitaine');
    expect(planningEventFunctionOnDate(event, '2026-07-14')).toBe('2nd Capitaine');
    expect(planningEventFunctionForScope(event, null)).toBe('');
    expect(splitPlanningEventByFunction(event).map(({ startsOn, endsOn, functionLabel, startsAt, endsAt }) => ({ startsOn, endsOn, functionLabel, startsAt, endsAt }))).toEqual([
      { startsOn: '2026-07-10', endsOn: '2026-07-13', functionLabel: 'Capitaine', startsAt: '2026-07-10T08:00:00Z', endsAt: '2026-07-13T18:00:00Z' },
      { startsOn: '2026-07-14', endsOn: '2026-07-15', functionLabel: '2nd Capitaine', startsAt: '2026-07-14T08:00:00Z', endsAt: '2026-07-15T18:00:00Z' },
      { startsOn: '2026-07-16', endsOn: '2026-07-20', functionLabel: 'Capitaine', startsAt: '2026-07-16T08:00:00Z', endsAt: '2026-07-20T18:00:00Z' },
    ]);
    const changedStatus = updatePlanningPreviewDayState(overview, { assignmentId: event.assignmentId!, workDate: '2026-07-14', status: 'A Terre', note: 'Escale' });
    expect(changedStatus.days[1].functionLabel).toBe('2nd Capitaine');
    const restored = updatePlanningPreviewDayState(overview, { assignmentId: event.assignmentId!, workDate: '2026-07-14', status: 'En Mer', note: '', functionLabel: 'Capitaine' });
    expect(restored.days.map((day) => day.workDate)).toEqual(['2026-07-15']);
  });

  it('uses the selected day in the crew list and splits attestations without changing the day total', async () => {
    const { overview } = fixture();
    const input = { vesselId: 1, watchGroup: 'Bordée 1' };
    const document = buildPlanningCrewList(overview, { ...input, date: '2026-07-14' });
    expect(document.rows[0].rank).toBe('2nd Capitaine');
    expect(buildPlanningCrewList(overview, { ...input, date: '2026-07-16' }).rows[0].rank).toBe('Capitaine');
    const workbook = await generatePlanningCrewList(document, 'xlsx');
    const zip = await JSZip.loadAsync(await workbook.blob.arrayBuffer());
    expect(await zip.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('2nd Capitaine');
    const certificate = buildBoardingCertificateData(overview, { personId: 101, vesselIds: [1], startsOn: '2026-07-10', endsOn: '2026-07-20', generatedOn: '2026-07-21' });
    expect(certificate.totalDays).toBe(11);
    expect(certificate.periods).toMatchObject([
      { startsOn: '2026-07-16', endsOn: '2026-07-20', functionLabel: 'Capitaine', dayCount: 5 },
      { startsOn: '2026-07-14', endsOn: '2026-07-15', functionLabel: '2nd Capitaine', dayCount: 2 },
      { startsOn: '2026-07-10', endsOn: '2026-07-13', functionLabel: 'Capitaine', dayCount: 4 },
    ]);
    const rows = buildPlanningExportRows(overview, 'Pierre LEPRETRE', { start: '2026-07-13', end: '2026-07-16' });
    expect(rows.map((row) => row.functionLabel)).toEqual(['Capitaine', '2nd Capitaine', '2nd Capitaine', 'Capitaine']);
  });

  it('exports the temporary ENIM function and category in SILAE', () => {
    const { overview } = fixture();
    const data = buildPlanningSilaePreviewData(overview);
    const person = data.people.find((row) => row.id === 101)!;
    const employee = buildSilaeEmployee(data, person, '2026-07');
    expect(employee.issues).toEqual([]);
    expect(employee.periods.find((period) => period.startsOn === '2026-07-14')).toMatchObject({
      endsOn: '2026-07-15', functionLabel: '2nd Capitaine', enimFunctionCode: 'CA01A', enimCategory: '12', seaDays: 2,
    });
    expect(buildSilaeRows([employee]).flat()).toContain('CA01A');
    expect(person.functionLabel).toBe('Capitaine');
  });

  it('splits calendar periods with unique UIDs and excludes segments outside the requested period', async () => {
    const { overview, event } = fixture();
    const context = { overview, data: { policies: [], notifications: [], dependencies: [], p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] } }, checks: [], personIds: [101], startsOn: '2026-07-10', endsOn: '2026-07-20' };
    const content = await (await generatePlanningExport('crew_list', 'ics', context)).blob.text();
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(content).toContain(`UID:${event.id}@seapilot`);
    expect(content).toContain(`UID:${event.id}-2026-07-14@seapilot`);
    expect(content).toContain('DESCRIPTION:2nd Capitaine');
    expect(content).toContain('DTSTART:20260714T080000Z');
    const oneDay = await (await generatePlanningExport('crew_list', 'ics', { ...context, startsOn: '2026-07-14', endsOn: '2026-07-14' })).blob.text();
    expect(oneDay.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});
