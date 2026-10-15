import { addPlanningDays, daysBetween } from './planningDates';

export const PLANNING_GRID_STATUSES = [
  'En Mer',
  'A Terre', 'Extra', 'Formation',
  'Vacance',
  'Congés Paternité',
  'Repos',
  'Arrêt Maladie',
  'Accident du Travail',
] as const;

export type PlanningGridStatus = typeof PLANNING_GRID_STATUSES[number];

export function isPlanningGridStatus(status: string): status is PlanningGridStatus {
  return (PLANNING_GRID_STATUSES as readonly string[]).includes(status);
}

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
  const key = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  const normalized = /^CONGES?PATERNITES?$/.test(key) ? 'Congés Paternité' : status;
  return isPlanningGridStatus(normalized)
    ? normalized
    : planningGridDefaultStatus(vessel);
}

export function planningGridCellsShareSegment(
  left: Pick<PlanningGridCell, 'status' | 'note' | 'isConflict' | 'functionLabel'> | null,
  right: Pick<PlanningGridCell, 'status' | 'note' | 'isConflict' | 'functionLabel'> | null,
): boolean {
  return Boolean(
    left
    && right
    && left.status === right.status
    && left.note === right.note
    && left.functionLabel === right.functionLabel
    && left.isConflict === right.isConflict,
  );
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
        functionLabel: cell.functionLabel,
        isConflict: false,
      };
    });
  }

  return targets.map((target, index) => {
    const sourceCell = source[index % source.length];
    return { ...target, status: sourceCell.status, note: sourceCell.note, functionLabel: sourceCell.functionLabel };
  });
}
