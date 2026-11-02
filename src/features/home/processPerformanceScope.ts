import type { RoleKey } from '../permissions/roles';
import { getHrFunctionVisibilityKey, type HrVisibilityRule, type HrVisibilityScope } from '../humanResources/peopleQueries';
import { buildManagerHomeAssignmentScope, type ManagerHomeAssignmentRow } from './managerHomeData';
import type { ProcessPerformanceSources } from './processPerformance';

export interface ProcessPerformanceScope {
  kind: 'company' | 'watch' | 'self';
  label: string;
  personId: number | null;
  personIds: number[];
  vesselIds: number[];
  vesselNames: string[];
  watchGroups: string[];
  assignments?: ManagerHomeAssignmentRow[];
}
export function canViewCompanyPerformance(roles: RoleKey[]): boolean {
  return roles.some((role) => ['admin', 'direction', 'armement'].includes(role));
}
export function buildProcessPerformanceScope(roles: RoleKey[], personId: number | null, assignments: ManagerHomeAssignmentRow[]): ProcessPerformanceScope {
  if (canViewCompanyPerformance(roles)) return { kind: 'company', label: 'Périmètre compagnie', personId, personIds: [], vesselIds: [], vesselNames: [], watchGroups: [] };
  const assigned = personId ? buildManagerHomeAssignmentScope(assignments, personId) : null;
  const self = !roles.includes('capitaine');
  const context = [assigned?.watchGroups.join(' / '), assigned?.vesselNames.join(' / ')].filter(Boolean).join(' · ');
  return { kind: self ? 'self' : 'watch', label: `Votre périmètre${context ? ` · ${context}` : ' · aucune affectation active'}`,
    personId, personIds: self ? personId ? [personId] : [] : assigned?.personIds || [], vesselIds: assigned?.vesselIds || [],
    vesselNames: assigned?.vesselNames || [], watchGroups: assigned?.watchGroups || [], assignments: assigned?.assignments || [] };
}
export function performanceVisibilityAllowed(rules: HrVisibilityRule[], roles: RoleKey[], scope: HrVisibilityScope, key: string): boolean {
  if (roles.includes('admin')) return true;
  const rule = rules.find((item) => item.scope === scope && item.itemKey === key);
  return !rule || roles.some((role) => rule.visibleToRoles.includes(role));
}
const normalizedVessel = (value: string | null | undefined) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** RLS is authoritative; this additionally excludes cross-vessel/watch data from every ratio and task. */
export function filterProcessPerformanceSources(sources: ProcessPerformanceSources, scope: ProcessPerformanceScope, roles: RoleKey[], rules: HrVisibilityRule[], includeReviews: boolean): ProcessPerformanceSources {
  const company = scope.kind === 'company';
  const personIds = new Set(scope.personIds);
  const people = sources.people?.filter((person) => (company || personIds.has(person.id))
    && performanceVisibilityAllowed(rules, roles, 'function', getHrFunctionVisibilityKey(person.functionLabel))) ?? null;
  const visiblePeople = new Set((people || []).map((person) => person.id));
  const documents = sources.documents?.filter((document) => document.personId !== null && visiblePeople.has(document.personId)
    && performanceVisibilityAllowed(rules, roles, 'document_type', document.categoryKey)) ?? null;
  const visibleDocumentIds = new Set((documents || []).map((document) => document.id));
  const vesselMatches = (id: number | null | undefined, name?: string | null) => company || (id != null
    ? scope.vesselIds.includes(id) : Boolean(normalizedVessel(name)) && scope.vesselNames.some((vessel) => normalizedVessel(vessel) === normalizedVessel(name)));
  const auditSites = sources.auditSites?.filter((site) => vesselMatches(site.vessel_id)) ?? null;
  const auditSiteIds = new Set((auditSites || []).map((site) => site.id));
  const audits = sources.audits?.filter((audit) => company || auditSiteIds.has(audit.site_id)) ?? null;
  const auditIds = new Set((audits || []).map((audit) => audit.id));
  return {
    people, documents,
    actions: sources.actions?.filter((action) => visiblePeople.has(action.personId)
      && (action.documentId === null || visibleDocumentIds.has(action.documentId)) && (action.kind !== 'annual_review' || includeReviews)
      && (action.kind !== 'medical_visit' || performanceVisibilityAllowed(rules, roles, 'document_type', 'medical_visit'))) ?? null,
    reviews: includeReviews ? sources.reviews?.filter((review) => visiblePeople.has(review.employee_person_id)) ?? null : [],
    purchases: sources.purchases?.filter((row) => vesselMatches(row.vessel_id, row.vessel_name)) ?? null,
    auditSites, audits, findings: sources.findings?.filter((finding) => company || auditIds.has(finding.audit_id)) ?? null,
    fleetDocuments: sources.fleetDocuments?.filter((row) => vesselMatches(row.vessel_id, row.vessel_name)) ?? null,
    procedures: sources.procedures?.filter((row) => vesselMatches(null, row.vessel_name)) ?? null,
  };
}
