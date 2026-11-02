import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import type { ModuleKey } from '../permissions/moduleAccess';
import { fetchVisibleModulesForRoles } from '../permissions/navigationPermissions';
import { fetchAllHrDocuments, fetchAllPeople, fetchHrVisibilityRules, mapHrDocumentRows, mapPersonRows } from '../humanResources/peopleQueries';
import type { HrActionRecord } from '../humanResources/hrActionPlanning';
import { fetchHrActions } from '../humanResources/hrActionPlanning';
import type { ManagerHomeAssignmentRow } from './managerHomeData';
import { buildProcessPerformance, performanceToday, type ProcessPerformance, type ProcessPerformanceSources, type PerformanceAuditSite, type PerformanceAudit, type PerformanceFinding } from './processPerformance';
import { buildProcessPerformanceScope, canViewCompanyPerformance, filterProcessPerformanceSources, performanceVisibilityAllowed } from './processPerformanceScope';
import { loadRegisterPerformance } from './processPerformanceRegisters';

export { buildProcessPerformanceScope, canViewCompanyPerformance, filterProcessPerformanceSources } from './processPerformanceScope';
export type { ProcessPerformanceScope } from './processPerformanceScope';

interface PerformanceRowFilter {
  ids?: { column: string; values: Array<string | number> };
  lte?: { column: string; value: string };
  gte?: { column: string; value: string };
  neq?: { column: string; value: string };
}

/** Stable ordering and explicit ranges avoid silently rating only the first API page. */
export async function fetchPerformanceRows<T>(client: SupabaseClient, table: string, select: string, filters: PerformanceRowFilter = {}): Promise<T[]> {
  if (filters.ids && !filters.ids.values.length) return [];
  const batchSize = 500;
  const rows: T[] = [];
  for (let offset = 0; ; offset += batchSize) {
    let query = client.from(table).select(select).order('id', { ascending: true }).range(offset, offset + batchSize - 1);
    if (filters.ids) query = query.in(filters.ids.column, filters.ids.values);
    if (filters.lte) query = query.lte(filters.lte.column, filters.lte.value);
    if (filters.gte) query = query.gte(filters.gte.column, filters.gte.value);
    if (filters.neq) query = query.neq(filters.neq.column, filters.neq.value);
    const result = await query;
    if (result.error) throw result.error;
    const page = (result.data || []) as T[];
    rows.push(...page);
    if (page.length < batchSize) return rows;
  }
}

function mapAction(row: Record<string, unknown>): HrActionRecord {
  const text = (value: unknown) => value == null ? '' : String(value);
  return { id: Number(row.id), personId: Number(row.person_id), documentId: row.document_id == null ? null : Number(row.document_id),
    kind: row.kind as HrActionRecord['kind'], status: row.status as HrActionRecord['status'], title: text(row.title),
    dueOn: text(row.due_on), scheduledOn: text(row.scheduled_on), completedOn: text(row.completed_on), location: text(row.location), ownerName: text(row.owner_name), notes: text(row.notes) };
}

async function loadAudits(client: SupabaseClient, office: boolean, vesselIds: number[]) {
  const siteSelect = 'id,name,anniversary_on,vessel_id';
  const auditSelect = 'id,site_id,year,status,planned_on,performed_on';
  const findingSelect = 'id,audit_id,description,due_on,status';
  if (office) {
    const [auditSites, audits, findings] = await Promise.all([
      fetchPerformanceRows<PerformanceAuditSite>(client, 'internal_audit_sites', siteSelect),
      fetchPerformanceRows<PerformanceAudit>(client, 'internal_audits', auditSelect),
      fetchPerformanceRows<PerformanceFinding>(client, 'internal_audit_findings', findingSelect),
    ]);
    return { auditSites, audits, findings };
  }
  const auditSites = await fetchPerformanceRows<PerformanceAuditSite>(client, 'internal_audit_sites', siteSelect, { ids: { column: 'vessel_id', values: vesselIds } });
  const audits = await fetchPerformanceRows<PerformanceAudit>(client, 'internal_audits', auditSelect, { ids: { column: 'site_id', values: auditSites.map((site) => site.id) } });
  const findings = await fetchPerformanceRows<PerformanceFinding>(client, 'internal_audit_findings', findingSelect, { ids: { column: 'audit_id', values: audits.map((audit) => audit.id) } });
  return { auditSites, audits, findings };
}

export async function fetchProcessPerformance(client: SupabaseClient, roles: RoleKey[], today = performanceToday(), personId: number | null = null, authorizedModuleKeys?: ModuleKey[]): Promise<ProcessPerformance[]> {
  if (!roles.length) return [];
  // The shell may supply its authoritative configured permissions. Standalone consumers load the same permissions.
  const moduleKeys = authorizedModuleKeys ?? (await fetchVisibleModulesForRoles(client, roles)).map((module) => module.key);
  if (!moduleKeys.length) return [];
  const office = canViewCompanyPerformance(roles);
  const assignments = !office && personId ? await fetchPerformanceRows<ManagerHomeAssignmentRow>(client, 'planning_assignments', 'id,vessel_id,crew_person_id,captain_person_id,watch_group,vessels(name)', {
    lte: { column: 'starts_on', value: today }, gte: { column: 'ends_on', value: today }, neq: { column: 'confirmation_status', value: 'cancelled' },
  }) : [];
  const scope = buildProcessPerformanceScope(roles, personId, assignments);
  const has = (key: ModuleKey) => moduleKeys.includes(key);
  const hr = has('humanResources');
  const rules = hr ? await fetchHrVisibilityRules(client) : [];
  const includeDocuments = performanceVisibilityAllowed(rules, roles, 'section', 'documents');
  const includeReviews = hr && has('annualReviews') && roles.some((role) => ['admin', 'direction', 'armement', 'capitaine'].includes(role))
    && performanceVisibilityAllowed(rules, roles, 'section', 'annualReviews');
  const peopleFilter = office ? {} : { ids: { column: 'id', values: scope.personIds } };
  const personFilter = office ? {} : { ids: { column: 'person_id', values: scope.personIds } };
  const vesselFilter = office ? {} : { ids: { column: 'vessel_id', values: scope.vesselIds } };
  const skip = () => Promise.resolve([]);
  const tasks = {
    people: hr ? office ? fetchAllPeople(client) : fetchPerformanceRows<Parameters<typeof mapPersonRows>[0][number]>(client, 'people', 'id,user_id,first_name,last_name,function_label,grade_label,role_label,contract_type,hired_on,departed_on,departure_reason,employment_periods,active', peopleFilter).then(mapPersonRows) : skip(),
    documents: hr && includeDocuments ? office ? fetchAllHrDocuments(client) : fetchPerformanceRows<Parameters<typeof mapHrDocumentRows>[0][number]>(client, 'hr_documents', 'id,person_id,person_name,category_key,title,status,issued_on,expires_on,medical_unfit', personFilter).then(mapHrDocumentRows) : skip(),
    actions: hr && includeDocuments ? office ? fetchHrActions(client) : fetchPerformanceRows<Record<string, unknown>>(client, 'hr_action_plans', 'id,person_id,document_id,kind,title,status,due_on,scheduled_on,completed_on,location,owner_name,notes', personFilter).then((rows) => rows.map(mapAction)) : skip(),
    reviews: includeReviews ? fetchPerformanceRows(client, 'annual_reviews', 'id,employee_person_id,employee_name_snapshot,review_year,status,starts_at,due_on,meeting_location,meeting_mode,video_url,manager_validated_at',
      office ? {} : { ids: { column: 'employee_person_id', values: scope.personIds } }) : skip(),
    purchases: has('purchaseRequests') ? fetchPerformanceRows(client, 'purchase_requests', 'id,request_number,title,status,approval_status,requested_on,ordered_on,expected_delivery_on,received_on,urgent,vessel_id,vessel_name,owner_name', vesselFilter) : skip(),
    fleetDocuments: has('certificates') ? fetchPerformanceRows(client, 'fleet_certificates', 'id,vessel_id,vessel_name,document_title,title,status,expires_on,planned_on,is_active_fleet', vesselFilter) : skip(),
    procedures: has('procedures') ? fetchPerformanceRows(client, roles.some((role) => role === 'admin' || role === 'direction') ? 'procedures' : 'published_procedures', 'id,title,procedure_code,annual_review,diffusion_on,status,vessel_name',
      office ? {} : { ids: { column: 'vessel_name', values: scope.vesselNames } }) : skip(),
  };
  const keys = Object.keys(tasks) as Array<keyof typeof tasks>;
  const [results, auditResult, registers] = await Promise.all([
    Promise.allSettled(keys.map((key) => tasks[key])),
    has('internalAudits') ? loadAudits(client, office, scope.vesselIds).catch(() => ({ auditSites: null, audits: null, findings: null })) : Promise.resolve({ auditSites: [], audits: [], findings: [] }),
    loadRegisterPerformance(client, moduleKeys, scope, today),
  ]);
  const raw = { ...Object.fromEntries(keys.map((key, index) => {
    const result = results[index];
    return [key, result.status === 'fulfilled' ? result.value : null];
  })), ...auditResult } as unknown as ProcessPerformanceSources;
  const sources = filterProcessPerformanceSources(raw, scope, roles, rules, includeReviews);
  const modules = { humanResources: 'humanResources', purchases: 'purchaseRequests', internalAudits: 'internalAudits', fleet: 'certificates', procedures: 'procedures' } as const;
  const core = buildProcessPerformance(sources, today, { includeReviews, includeAnnualAuditCycles: office,
    reviewPersonIds: office ? undefined : [...new Set((sources.reviews || []).filter((review) => review.review_year === Number(today.slice(0, 4))).map((review) => review.employee_person_id))],
    includeDocuments,
    includeMedical: performanceVisibilityAllowed(rules, roles, 'document_type', 'medical_visit') }).filter((process) => has(modules[process.key as keyof typeof modules]));
  return [...core, ...registers].map((process) => ({ ...process, scopeLabel: scope.label }));
}
