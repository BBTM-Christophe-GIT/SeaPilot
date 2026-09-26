import { describe, expect, it, vi } from 'vitest';
import { buildPlanningCrewRows, buildPlanningTimeline } from './planningModel';
import { buildPlanningFleetLanes } from './planningViews';
import { EMPTY_PLANNING_OVERVIEW } from './usePlanningOverview';
import { resolveGenericCrewRow, type GenericCrewRow } from './planningGenericCrew';

const draft: GenericCrewRow = { id: 1, revision: 3, vesselId: 10, watchGroup: 'Bordée 2', functionLabel: 'Capitaine', periods: [] };

describe('generic crew positions', () => {
  it('keeps distinct empty positions and their vessel visible with the active filter, in function order', () => {
    const overview = { ...EMPTY_PLANNING_OVERVIEW, vessels: [{ id: 10, name: 'GOURY', acronym: 'GY', active: true }],
      genericCrewRows: [{ ...draft, id: 2, functionLabel: 'Chef Mécanicien' }, draft, { ...draft, id: 3 }],
    };
    const days = buildPlanningTimeline('2026-09-26', 'month');
    const filters = { vesselName: '', personName: '' };
    const rows = buildPlanningCrewRows(overview, days, filters, [], { activeFrom: '2026-09-26' });
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
});
