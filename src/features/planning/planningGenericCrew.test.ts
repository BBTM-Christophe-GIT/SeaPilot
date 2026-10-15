import { describe, expect, it, vi } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline } from './planningModel';
import { buildPlanningFleetLanes } from './planningViews';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import { resolveGenericCrewRow, type GenericCrewRow } from './planningGenericCrew';

const draft: GenericCrewRow = { id: 1, revision: 3, vesselId: 10, watchGroup: 'Bordée 2', functionLabel: 'Capitaine', periods: [] };

describe('generic crew positions', () => {
  it('keeps distinct empty positions and their vessel visible in function order', () => {
    const overview = { ...EMPTY_PLANNING_OVERVIEW, vessels: [{ id: 10, name: 'GOURY', acronym: 'GY', active: true }],
      genericCrewRows: [{ ...draft, id: 2, functionLabel: 'Chef Mécanicien' }, draft, { ...draft, id: 3 }],
    };
    const days = buildPlanningTimeline('2026-09-26', 'month');
    const filters = { vesselName: '', personName: '' };
    const rows = buildPlanningCrewRows(overview, days, filters, []);
    expect(rows.filter((row) => row.genericRow).map((row) => row.label)).toEqual(['Capitaine', 'Capitaine', 'Chef Mécanicien']);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(buildPlanningFleetLanes(overview, { start: days[0].date, end: days.at(-1)!.date }, filters)[0].vesselId).toBe(10);
    expect(buildPlanningCrewRows(overview, days, { ...filters, vesselName: 'OTHER' })).toEqual([]);
    expect(buildPlanningCrewRows(overview, days, { ...filters, personName: 'Jean MARTIN' })).toEqual([]);
  });

  it('reports a refused replacement without claiming success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '40001', message: 'Ce poste a changé. Actualisez le planning avant de réessayer.' } });
    await expect(resolveGenericCrewRow({ rpc } as never, draft, 12, '2026-09-01')).rejects.toThrow('Ce poste a changé');
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('filters paternity positions by visible periods without trimming the source row used for editing', () => {
    const row = { ...draft, periods: [
      { id: 'paternity', startsOn: '2026-10-15', endsOn: '2026-10-16', status: 'Congés Paternités', comments: '' },
      { id: 'sea', startsOn: '2026-10-17', endsOn: '2026-10-20', status: 'En Mer', comments: '' },
    ] };
    const data = { ...EMPTY_PLANNING_OVERVIEW, vessels: [{ id: 10, name: 'GOURY', acronym: 'GY', active: true }],
      genericCrewRows: [row, { ...draft, id: 2, periods: [row.periods[1]] }],
    };
    const days = buildPlanningTimeline('2026-10-15', 'month');
    const filters = { vesselName: '', personName: '', status: 'Congés Paternité' };
    const rows = buildPlanningCrewRows(data, days, filters).filter((item) => item.genericRow);
    expect(rows.map((item) => item.genericRow?.id)).toEqual([1]);
    expect(rows[0].genericRow).toBe(row);
    expect(rows[0].genericRow?.periods).toHaveLength(2);
    expect(buildPlanningCrewRows(data, days.filter((day) => day.date >= '2026-10-17'), filters).filter((item) => item.genericRow)).toEqual([]);
  });
});
