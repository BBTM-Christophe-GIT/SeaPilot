import { describe, expect, it } from 'vitest';
import {
  buildPlanningGridPaste,
  planningGridCellKey,
  planningGridCellsShareSegment,
  planningGridDefaultStatus,
  normalizePlanningGridStatus,
  type PlanningGridCell,
} from './planningGrid';

function cell(laneKey: string, workDate: string, status: PlanningGridCell['status'], note = ''): PlanningGridCell {
  return {
    key: planningGridCellKey(laneKey, workDate), laneKey, workDate,
    personId: 1, person: 'Anne MARTIN', vesselId: 2, vessel: 'GOURY',
    watchGroup: 'Bordée 1', functionLabel: 'Capitaine', assignmentId: 3,
    eventId: 'assignment-3', status, note, isConflict: false,
  };
}

describe('Planning grid editing helpers', () => {
  it('uses the shore default only for Armement rows', () => {
    expect(planningGridDefaultStatus('Armement - Cherbourg')).toBe('A Terre');
    expect(planningGridDefaultStatus('GOURY')).toBe('En Mer');
    expect(normalizePlanningGridStatus('', 'ARMEMENT - Cherbourg')).toBe('A Terre');
  });

  it('keeps health-related daily statuses when reading the grid', () => {
    expect(normalizePlanningGridStatus('Arrêt Maladie', 'GOURY')).toBe('Arrêt Maladie');
    expect(normalizePlanningGridStatus('Accident du Travail', 'GOURY')).toBe('Accident du Travail');
  });

  it.each(['Congés Paternité', 'congés paternité', 'CONGE PATERNITE', '  CONGES PATERNITE  ', 'Congés Paternités', ' CONGE PATERNITES '])('keeps paternity leave distinct from ordinary leave and ship defaults (%s)', (status) => {
    expect(normalizePlanningGridStatus(status, 'GOURY')).toBe('Congés Paternité');
    expect(normalizePlanningGridStatus(status, 'ARMEMENT - Cherbourg')).toBe('Congés Paternité');
  });

  it('separates adjacent cells when status, comment or conflict state differs', () => {
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'En Mer', 'Cherbourg'))).toBe(true);
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'A Terre', 'Cherbourg'))).toBe(false);
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'En Mer', 'Dieppe'))).toBe(false);
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer'), { ...cell('a', '2026-07-15', 'En Mer'), isConflict: true })).toBe(false);
  });

  it('pastes a copied sequence on another line from the selected anchor date', () => {
    const pasted = buildPlanningGridPaste(
      [cell('source', '2026-07-14', 'En Mer', 'Cherbourg'), cell('source', '2026-07-15', 'A Terre', 'Dieppe')],
      [{ ...cell('target', '2026-08-03', 'Repos'), personId: 9, vesselId: 8, vessel: 'SUROIT', assignmentId: null }],
    );
    expect(pasted).toMatchObject([
      { laneKey: 'target', workDate: '2026-08-03', personId: 9, vesselId: 8, status: 'En Mer', note: 'Cherbourg' },
      { laneKey: 'target', workDate: '2026-08-04', personId: 9, vesselId: 8, status: 'A Terre', note: 'Dieppe', assignmentId: null },
    ]);
  });

  it('separates and copies the function actually exercised', () => {
    const source = { ...cell('source', '2026-07-14', 'En Mer'), functionLabel: '2nd Capitaine' };
    const target = cell('target', '2026-07-16', 'En Mer');
    expect(planningGridCellsShareSegment(source, { ...source, functionLabel: 'Capitaine' })).toBe(false);
    expect(buildPlanningGridPaste([source], [target])[0]).toMatchObject({ functionLabel: '2nd Capitaine', workDate: '2026-07-16' });
  });

  it('copies paternity leave without changing neighbouring health-related statuses', () => {
    const pasted = buildPlanningGridPaste(
      [cell('source', '2026-10-15', 'Congés Paternité'), cell('source', '2026-10-16', 'Arrêt Maladie'), cell('source', '2026-10-17', 'Accident du Travail')],
      [cell('target', '2026-10-19', 'En Mer')],
    );
    expect(pasted.map(({ workDate, status }) => [workDate, status])).toEqual([
      ['2026-10-19', 'Congés Paternité'], ['2026-10-20', 'Arrêt Maladie'], ['2026-10-21', 'Accident du Travail'],
    ]);
  });
});
