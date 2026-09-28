import type { ProjectPlanningOccurrenceRecord, ProjectRecord, VesselRecord } from './projectQueries';
import { BAREBOAT_CONTRACT_TYPE, normalizeProjectContractType } from './projectContractOptions';
export interface UtilizationDpr { id: number; report_date: string; vessel_id: number | null; project_id: number | null }
const DAY = 86_400_000;
const EXCLUDED_KPI_VESSELS = new Set(['BBTM2710', 'TAMARIS', 'ECREHOUEL']);

export function localCalendarDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isPortfolioKpiVessel(vessel: VesselRecord, today: string): boolean {
  const name = vessel.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return vessel.active && (!vessel.assetKind || vessel.assetKind === 'vessel')
    && (!vessel.fleetExitOn || vessel.fleetExitOn >= today) && !EXCLUDED_KPI_VESSELS.has(name);
}

export function summarizeUtilization(metrics: ReturnType<typeof utilization>[]) {
  const totals = metrics.reduce((sum, metric) => ({
    days: sum.days + metric.days, planned: sum.planned + metric.planned, realized: sum.realized + metric.realized,
  }), { days: 0, planned: 0, realized: 0 });
  return { ...totals,
    plannedRate: totals.days ? Math.round(totals.planned / totals.days * 100) : 0,
    realizedRate: totals.days ? Math.round(totals.realized / totals.days * 100) : 0,
  };
}
export function calendarDays(start: string, end: string): string[] {
  const first = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
  return Array.from({ length: Math.min(366, Math.floor((last - first) / DAY) + 1) }, (_, index) => new Date(first + index * DAY).toISOString().slice(0, 10));
}
export function utilization(vessel: VesselRecord, start: string, end: string, operations: ProjectPlanningOccurrenceRecord[], dprs: UtilizationDpr[]) {
  const days = calendarDays(start, vessel.fleetExitOn && vessel.fleetExitOn < end ? vessel.fleetExitOn : end);
  const planned = days.filter((day) => operations.some((operation) => (operation.vesselIds || [operation.primaryVesselId]).includes(vessel.id)
    && operation.startsOn <= day && operation.endsOn >= day && !/annul|cancel/i.test(operation.status))).length;
  const recorded = new Set(dprs.filter((dpr) => dpr.vessel_id === vessel.id && dpr.project_id !== null).map((dpr) => dpr.report_date));
  const realized = days.filter((day) => recorded.has(day)).length;
  return { days: days.length, planned, realized, plannedRate: days.length ? Math.round(planned / days.length * 100) : 0, realizedRate: days.length ? Math.round(realized / days.length * 100) : 0 };
}
export function operationType(project?: ProjectRecord): string {
  const value = `${project?.contractType || ''} ${project?.title || ''} ${project?.description || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pollution|oil spill/.test(value)) return 'Antipollution';
  if (normalizeProjectContractType(project?.contractType) === BAREBOAT_CONTRACT_TYPE || /coque nue|bareboat/.test(value)) return 'Affrètement coque nue';
  if (/bouee|balisage/.test(value)) return 'Bouées';
  if (/remorqu|towage/.test(value)) return 'Remorquage';
  if (/affret|supplytime|bimco/.test(value)) return 'Affrètement à temps';
  return 'Autres opérations';
}
