import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetNames } from '../fleet/fleetDisplay';
import { isAuditDate } from '../internalAudits/internalAuditModel';
import { createInternalAuditPreviewData } from '../internalAudits/internalAuditPreview';
import { createDocumentaryAuditPreviewData } from '../documentaryAudits/documentaryAuditPreview';
import { isPlanningDate } from './planningDates';
import { throwPlanningDataError } from './planningErrors';
import { normalizePlanningText, type PlanningCrewRow, type PlanningDateRange, type PlanningFilters } from './planningModel';
import type { PlanningVessel } from './planningQueries';
import type { PlanningFleetLane } from './planningViews';

export const PLANNING_AUDIT_LABELS = {
  internal_ism: 'Audit ISM Interne', ovid: 'OVID', ecmid: 'eCMID',
  external_ism: 'Audit ISM Externe', client: 'Audit Client',
} as const;
export type PlanningAuditKind = keyof typeof PLANNING_AUDIT_LABELS;
export interface PlanningAudit {
  id: string; kind: PlanningAuditKind; siteId: string; siteName: string; vesselId: number | null;
  plannedOn: string; performedOn: string | null; title: string;
  status: 'planned' | 'in_progress' | 'completed'; canOpen: boolean;
}

export function planningAuditKey(audit: Pick<PlanningAudit, 'id' | 'kind'>): string {
  return `audit-${audit.kind}-${audit.id}`;
}
export function planningAuditUrl(audit: Pick<PlanningAudit, 'id' | 'kind'>): string {
  const module = { internal_ism: 'internalAudits', ovid: 'ovid', ecmid: 'ecmid', external_ism: 'externalIsmAudits', client: 'clientAudits' }[audit.kind];
  return `/modules/${module}?audit=${encodeURIComponent(audit.id)}`;
}
export function mapPlanningAudits(data: unknown): PlanningAudit[] {
  if (!Array.isArray(data)) throw new Error('Le serveur n’a pas confirmé le chargement des audits planifiés.');
  return data.map((row: Record<string, unknown>) => {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.kind !== 'string'
      || !Object.hasOwn(PLANNING_AUDIT_LABELS, row.kind) || typeof row.siteId !== 'string'
      || typeof row.siteName !== 'string' || !row.siteName || typeof row.plannedOn !== 'string'
      || !isAuditDate(row.plannedOn) || !isPlanningDate(row.plannedOn)
      || (row.vesselId !== null && (!Number.isSafeInteger(row.vesselId) || Number(row.vesselId) <= 0))
      || !['planned', 'in_progress', 'completed'].includes(String(row.status))) {
      throw new Error('Les dates ou les sites des audits planifiés sont invalides.');
    }
    return { id: row.id, kind: row.kind as PlanningAuditKind, siteId: row.siteId, siteName: row.siteName,
      vesselId: row.vesselId as number | null, plannedOn: row.plannedOn,
      performedOn: typeof row.performedOn === 'string' && isAuditDate(row.performedOn) ? row.performedOn : null,
      title: typeof row.title === 'string' ? row.title : '', status: row.status as PlanningAudit['status'], canOpen: row.canOpen === true };
  });
}
export async function fetchPlanningAudits(client: SupabaseClient): Promise<PlanningAudit[]> {
  const { data, error } = await client.rpc('planning_audits_overview');
  if (error) throwPlanningDataError('load-planning-audits', 'Impossible de charger les audits planifiés.', error);
  return mapPlanningAudits(data);
}

/** Use the same demo dossiers as their source modules, resolving fleet IDs by name. */
export function createPlanningAuditPreview(vessels: readonly PlanningVessel[]): PlanningAudit[] {
  const internal = createInternalAuditPreviewData();
  const audits: PlanningAudit[] = internal.audits.flatMap((audit) => {
    const site = internal.sites.find((item) => item.id === audit.siteId);
    if (!site) return [];
    return [{ id: audit.id, kind: 'internal_ism', siteId: site.id, siteName: site.name,
      vesselId: site.kind === 'shore' ? null : vessels.find((vessel) => vessel.name === site.name)?.id ?? site.vesselId,
      plannedOn: audit.plannedOn, performedOn: audit.performedOn, title: audit.templateName, status: audit.status, canOpen: true }];
  });
  for (const kind of ['ovid', 'ecmid', 'external_ism', 'client'] as const) {
    const data = createDocumentaryAuditPreviewData(kind);
    for (const audit of data.audits) {
      const site = data.sites.find((item) => item.id === audit.siteId);
      if (!site || !audit.plannedOn) continue;
      audits.push({ id: audit.id, kind, siteId: site.id, siteName: site.name,
        vesselId: vessels.find((vessel) => vessel.name === site.name)?.id ?? site.vesselId,
        plannedOn: audit.plannedOn, performedOn: audit.auditedOn, title: audit.title,
        status: audit.auditedOn ? 'completed' : 'planned', canOpen: true });
    }
  }
  return audits;
}

/** Retain vessels with an audit even when no crew is assigned in this period. */
export function withPlanningAuditLanes(lanes: PlanningFleetLane[], rows: PlanningCrewRow[], audits: readonly PlanningAudit[],
  range: PlanningDateRange, filters: PlanningFilters): { lanes: PlanningFleetLane[]; rows: PlanningCrewRow[] } {
  const additionalLanes = new Map(lanes.map((lane) => [lane.vessel, lane]));
  const groups = new Map<string, PlanningCrewRow[]>();
  rows.forEach((row) => {
    const group = groups.get(row.vessel) ?? [];
    group.push(row); groups.set(row.vessel, group);
  });
  if (!filters.personName) audits.filter((audit) => audit.plannedOn >= range.start && audit.plannedOn <= range.end
    && (!filters.vesselName || filters.vesselName === audit.siteName)).forEach((audit) => {
    if (!additionalLanes.has(audit.siteName)) additionalLanes.set(audit.siteName, {
      key: `audit-site-${audit.siteId}`, vesselId: audit.vesselId, label: audit.siteName,
      detail: audit.vesselId === null ? 'Site à terre' : '', vessel: audit.siteName, projects: [], assignments: [], locations: [],
    });
    if (!groups.has(audit.siteName)) {
      const key = `vessel-${normalizePlanningText(audit.siteName)}`;
      groups.set(audit.siteName, [{ key, type: 'vessel', personId: null, vesselId: audit.vesselId, label: audit.siteName,
        vessel: audit.siteName, board: '', functionLabel: '', boardRowId: null, hasAnyRecords: false,
        vesselKey: key, boardKey: '', events: [], projects: additionalLanes.get(audit.siteName)!.projects }]);
    }
  });
  return { lanes: [...additionalLanes.values()], rows: [...groups.keys()].sort(compareFleetNames).flatMap((name) => groups.get(name)!) };
}
