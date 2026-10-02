import type { QhsePolicyObjective, QhsePolicyObjectiveUpdate, QhsePolicyProcess } from './qhsePolicyModel';

export function summarizeQhsePolicyObjectives(objectives: QhsePolicyObjective[], processes?: QhsePolicyProcess[]) {
  const activeProcessIds = processes ? new Set(processes.filter((process) => !process.archived).map((process) => process.id)) : null;
  const active = objectives.filter((objective) => !objective.archived && (!activeProcessIds || activeProcessIds.has(objective.processId)));
  return {
    total: active.length,
    completed: active.filter((objective) => objective.progress >= 100).length,
    average: active.length ? active.reduce((sum, objective) => sum + objective.progress, 0) / active.length : null,
  };
}

export function qhsePolicyPercent(value: number) {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

export function qhsePolicyDate(value: string | null) {
  if (!value) return 'Sans échéance';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR');
}

export function qhsePolicyTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
}

export function qhsePolicyToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function orderQhsePolicyUpdates(updates: QhsePolicyObjectiveUpdate[]) {
  return [...updates].sort((left, right) => right.occurredOn.localeCompare(left.occurredOn) || right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

export function qhsePolicyError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
