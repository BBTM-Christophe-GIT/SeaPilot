import { describe, expect, it } from 'vitest';
import {
  buildPlanningGridPaste,
  planningGridCellKey,
  planningGridCellsShareSegment,
  planningGridDefaultStatus,
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
  });

  it('separates adjacent cells when either status or comment differs', () => {
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'En Mer', 'Cherbourg'))).toBe(true);
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'A Terre', 'Cherbourg'))).toBe(false);
    expect(planningGridCellsShareSegment(cell('a', '2026-07-14', 'En Mer', 'Cherbourg'), cell('a', '2026-07-15', 'En Mer', 'Dieppe'))).toBe(false);
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
});
