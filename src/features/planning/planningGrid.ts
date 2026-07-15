import { addPlanningDays, daysBetween } from './planningDates';

export type PlanningGridStatus = 'En Mer' | 'A Terre' | 'Vacance' | 'Repos';

export interface PlanningGridCell {
  key: string;
  laneKey: string;
  workDate: string;
  personId: number;
  person: string;
  vesselId: number;
  vessel: string;
  watchGroup: string;
  functionLabel: string;
  assignmentId: number | null;
  eventId: string | null;
  status: PlanningGridStatus;
  note: string;
  isConflict: boolean;
}

export interface PlanningGridClipboard {
  mode: 'copy' | 'cut';
  cells: PlanningGridCell[];
}

export function planningGridCellKey(laneKey: string, workDate: string): string {
  return `${laneKey}::${workDate}`;
}

export function planningGridDefaultStatus(vessel: string): PlanningGridStatus {
  return vessel.trim().toLocaleUpperCase('fr-FR').includes('ARMEMENT') ? 'A Terre' : 'En Mer';
}

export function normalizePlanningGridStatus(status: string, vessel: string): PlanningGridStatus {
  return ['En Mer', 'A Terre', 'Vacance', 'Repos'].includes(status)
    ? status as PlanningGridStatus
    : planningGridDefaultStatus(vessel);
}

export function planningGridCellsShareSegment(
  left: Pick<PlanningGridCell, 'status' | 'note'> | null,
  right: Pick<PlanningGridCell, 'status' | 'note'> | null,
): boolean {
  return Boolean(left && right && left.status === right.status && left.note === right.note);
}

export function sortPlanningGridCells(cells: PlanningGridCell[]): PlanningGridCell[] {
  return [...cells].sort((left, right) => left.workDate.localeCompare(right.workDate) || left.laneKey.localeCompare(right.laneKey, 'fr'));
}

export function buildPlanningGridPaste(
  sourceCells: PlanningGridCell[],
  targetCells: PlanningGridCell[],
): PlanningGridCell[] {
  const source = sortPlanningGridCells(sourceCells);
  const targets = sortPlanningGridCells(targetCells);
  if (!source.length || !targets.length) return [];
  const targetLane = targets[0];
  if (targets.some((cell) => cell.laneKey !== targetLane.laneKey)) return [];

  if (targets.length === 1) {
    const sourceStart = source[0].workDate;
    return source.map((cell) => {
      const workDate = addPlanningDays(targetLane.workDate, daysBetween(sourceStart, cell.workDate));
      return {
        ...targetLane,
        key: planningGridCellKey(targetLane.laneKey, workDate),
        workDate,
        assignmentId: workDate === targetLane.workDate ? targetLane.assignmentId : null,
        eventId: workDate === targetLane.workDate ? targetLane.eventId : null,
        status: cell.status,
        note: cell.note,
        isConflict: false,
      };
    });
  }

  return targets.map((target, index) => {
    const sourceCell = source[index % source.length];
    return { ...target, status: sourceCell.status, note: sourceCell.note };
  });
}
