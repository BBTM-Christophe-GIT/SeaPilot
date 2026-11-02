import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';
import type { ModuleKey } from '../permissions/moduleAccess';
import { fetchVisibleModulesForRoles } from '../permissions/navigationPermissions';
import { fetchHrVisibilityRules, mapHrDocumentRows, mapPersonRows } from '../humanResources/peopleQueries';
import type { HrActionRecord } from '../humanResources/hrActionPlanning';
import { buildProcessPerformance, performanceToday, type ProcessPerformance, type ProcessPerformanceSources, type PerformanceAuditSite, type PerformanceAudit, type PerformanceFinding } from './processPerformance';
import { buildProcessPerformanceScope, buildPerformanceEntityScope, canViewCompanyPerformance, currentPerformanceAssignments, filterProcessPerformanceSources, performanceAssets, performanceVisibilityAllowed, type PerformanceAssignment, type ProcessPerformanceAsset, type ProcessPerformanceScope } from './processPerformanceScope';
import { createRegisterPerformanceCache, loadRegisterPerformance, type RegisterPerformanceCache } from './processPerformanceRegisters';
import { assertHomeReadRevision, cachedHomeRead, discardHomeRead, homeReadContext, homeReadRevision, invalidateHomeReadCache } from './homeReadCache';

export { buildProcessPerformanceScope, canViewCompanyPerformance, filterProcessPerformanceSources } from './processPerformanceScope';
export type { ProcessPerformanceScope } from './processPerformanceScope';

export interface ProcessPerformanceEntity extends ProcessPerformanceAsset {
  processes: ProcessPerformance[];
  /** False means a catalog entry, never an unrated or zero-scored computed entity. */
  processesLoaded?: boolean;
}
export interface ProcessPerformanceDashboard {
  processes: ProcessPerformance[];
  scopeLabel: string;
  entities: ProcessPerformanceEntity[];
}
export interface ProcessPerformanceDashboardOptions {
  /** Defaults to true for existing consumers. False loads only the global view and entity catalog. */
  includeEntities?: boolean;
  /** With includeEntities true, compute only these authorized entities; omit to compare all. */
  entityIds?: number[];
  forceRefresh?: boolean;
}

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

async function loadAudits(client: SupabaseClient, office: boolean, vesselIds: number[], names: string[] = []) {
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
  const [idSites, namedSites] = await Promise.all([
    fetchPerformanceRows<PerformanceAuditSite>(client, 'internal_audit_sites', siteSelect, { ids: { column: 'vessel_id', values: vesselIds } }),
    names.length ? fetchPerformanceRows<PerformanceAuditSite>(client, 'internal_audit_sites', siteSelect, { ids: { column: 'name', values: names } }) : Promise.resolve([]),
  ]);
  const auditSites = [...new Map([...idSites, ...namedSites.filter((site) => site.vessel_id == null)].map((site) => [site.id, site])).values()];
  const audits = await fetchPerformanceRows<PerformanceAudit>(client, 'internal_audits', auditSelect, { ids: { column: 'site_id', values: auditSites.map((site) => site.id) } });
  const findings = await fetchPerformanceRows<PerformanceFinding>(client, 'internal_audit_findings', findingSelect, { ids: { column: 'audit_id', values: audits.map((audit) => audit.id) } });
  return { auditSites, audits, findings };
}

interface SnapshotContext {
  moduleKeys: ModuleKey[];
  roles: RoleKey[];
  office: boolean;
  scope: ProcessPerformanceScope;
  today: string;
  membership: () => Promise<PerformanceAssignment[] | null>;
}
interface BaseSnapshot {
  context: SnapshotContext;
  rules: Awaited<ReturnType<typeof fetchHrVisibilityRules>>;
  raw: ProcessPerformanceSources;
  includeDocuments: boolean;
  includeReviews: boolean;
  processes: ProcessPerformance[];
}
interface PerformanceSnapshot {
  revision: number;
  context: Promise<SnapshotContext>;
  base: Promise<BaseSnapshot | null>;
  catalogue?: Promise<ProcessPerformanceAsset[]>;
  entityProcesses: Map<number, Promise<ProcessPerformance[]>>;
  loadedEntities: Map<number, ProcessPerformance[]>;
  registerCache: RegisterPerformanceCache;
}
const EMPTY_DASHBOARD: ProcessPerformanceDashboard = { processes: [], scopeLabel: '', entities: [] };
const PEOPLE_SCORE_SELECT = 'id,user_id,first_name,last_name,function_label,grade_label,role_label,contract_type,hired_on,departed_on,departure_reason,employment_periods,active';
const DOCUMENT_SCORE_SELECT = 'id,person_id,person_name,category_key,title,status,issued_on,expires_on,requires_captain_validation,medical_unfit';

function buildSnapshotProcesses(base: BaseSnapshot, scope: ProcessPerformanceScope, registers: ProcessPerformance[], membershipKnown = true): ProcessPerformance[] {
  const { raw, rules, includeDocuments, includeReviews, context } = base;
  const { roles, moduleKeys, office, today } = context;
  const sources = filterProcessPerformanceSources(raw, scope, roles, rules, includeReviews);
  if (!membershipKnown && moduleKeys.includes('humanResources')) { sources.people = null; sources.documents = null; sources.actions = null; sources.reviews = null; }
  const modules = { humanResources: 'humanResources', purchases: 'purchaseRequests', internalAudits: 'internalAudits', fleet: 'certificates', procedures: 'procedures' } as const;
  const core = buildProcessPerformance(sources, today, { includeReviews, includeAnnualAuditCycles: office,
    reviewPersonIds: office ? undefined : [...new Set((sources.reviews || []).filter((review) => review.review_year === Number(today.slice(0, 4))).map((review) => review.employee_person_id))],
    includeDocuments, includeMedical: performanceVisibilityAllowed(rules, roles, 'document_type', 'medical_visit'),
  }).filter((process) => moduleKeys.includes(modules[process.key as keyof typeof modules]));
  return [...core, ...registers].map((process) => ({ ...process, scopeLabel: scope.label }));
}

async function loadBaseSnapshot(client: SupabaseClient, context: SnapshotContext, registerCache: RegisterPerformanceCache): Promise<BaseSnapshot | null> {
  const { moduleKeys, office, scope, roles, today } = context;
  if (!moduleKeys.length) return null;
  const has = (key: ModuleKey) => moduleKeys.includes(key);
  const hr = has('humanResources');
  // Non-sensitive projections can start immediately. Hidden HR surfaces wait for their visibility rules.
  const rulesPromise = hr ? fetchHrVisibilityRules(client) : Promise.resolve([]);
  const peopleFilter = office ? {} : { ids: { column: 'id', values: scope.personIds } };
  const personFilter = office ? {} : { ids: { column: 'person_id', values: scope.personIds } };
  const vesselFilter = office ? {} : { ids: { column: 'vessel_id', values: scope.vesselIds } };
  const skip = () => Promise.resolve([]);
  const allowedDocuments = rulesPromise.then((rules) => hr && performanceVisibilityAllowed(rules, roles, 'section', 'documents'));
  const allowedReviews = rulesPromise.then((rules) => hr && has('annualReviews')
    && roles.some((role) => ['admin', 'direction', 'armement', 'capitaine'].includes(role))
    && performanceVisibilityAllowed(rules, roles, 'section', 'annualReviews'));
  const tasks = {
    people: hr ? fetchPerformanceRows<Parameters<typeof mapPersonRows>[0][number]>(client, 'people', PEOPLE_SCORE_SELECT, peopleFilter).then(mapPersonRows) : skip(),
    documents: allowedDocuments.then((allowed) => allowed ? fetchPerformanceRows<Parameters<typeof mapHrDocumentRows>[0][number]>(client, 'hr_documents', DOCUMENT_SCORE_SELECT, personFilter).then(mapHrDocumentRows) : []),
    actions: allowedDocuments.then((allowed) => allowed ? fetchPerformanceRows<Record<string, unknown>>(client, 'hr_action_plans', 'id,person_id,document_id,kind,title,status,due_on,scheduled_on,completed_on,location,owner_name', personFilter).then((rows) => rows.map(mapAction)) : []),
    reviews: allowedReviews.then((allowed) => allowed ? fetchPerformanceRows(client, 'annual_reviews', 'id,employee_person_id,employee_name_snapshot,review_year,status,starts_at,due_on,meeting_location,meeting_mode,video_url,manager_validated_at',
      office ? {} : { ids: { column: 'employee_person_id', values: scope.personIds } }) : []),
    purchases: has('purchaseRequests') ? fetchPerformanceRows(client, 'purchase_requests', 'id,request_number,title,status,approval_status,requested_on,ordered_on,expected_delivery_on,received_on,urgent,vessel_id,vessel_name,owner_name', vesselFilter) : skip(),
    fleetDocuments: has('certificates') ? fetchPerformanceRows(client, 'fleet_certificates', 'id,vessel_id,vessel_name,document_title,title,status,expires_on,planned_on,is_active_fleet', vesselFilter) : skip(),
    procedures: has('procedures') ? fetchPerformanceRows(client, roles.some((role) => role === 'admin' || role === 'direction') ? 'procedures' : 'published_procedures', 'id,title,procedure_code,annual_review,diffusion_on,status,vessel_name',
      office ? {} : { ids: { column: 'vessel_name', values: scope.vesselNames } }) : skip(),
  };
  const keys = Object.keys(tasks) as Array<keyof typeof tasks>;
  const [results, auditResult, registers, rules] = await Promise.all([
    Promise.allSettled(keys.map((key) => tasks[key])),
    has('internalAudits') ? loadAudits(client, office, scope.vesselIds, scope.vesselNames).catch(() => ({ auditSites: null, audits: null, findings: null })) : Promise.resolve({ auditSites: [], audits: [], findings: [] }),
    loadRegisterPerformance(client, moduleKeys, scope, today, registerCache), rulesPromise,
  ]);
  const raw = { ...Object.fromEntries(keys.map((key, index) => {
    const result = results[index];
    return [key, result.status === 'fulfilled' ? result.value : null];
  })), ...auditResult } as unknown as ProcessPerformanceSources;
  const base: BaseSnapshot = { context, rules, raw,
    includeDocuments: await allowedDocuments, includeReviews: await allowedReviews, processes: [], };
  base.processes = buildSnapshotProcesses(base, scope, registers);
  return base;
}

function createSnapshot(client: SupabaseClient, roles: RoleKey[], personId: number | null, moduleKeys: ModuleKey[] | undefined, today: string): PerformanceSnapshot {
  const office = canViewCompanyPerformance(roles);
  let membership: Promise<PerformanceAssignment[] | null> | undefined;
  const getMembership = () => membership ??= fetchPerformanceRows<PerformanceAssignment>(client, 'planning_assignments', 'id,vessel_id,crew_person_id,captain_person_id,watch_group,starts_on,ends_on,confirmation_status,vessels(name)', {
    lte: { column: 'starts_on', value: today }, gte: { column: 'ends_on', value: today }, neq: { column: 'confirmation_status', value: 'cancelled' },
  }).then((rows) => currentPerformanceAssignments(rows, today)).catch((error) => { if (!office) throw error; return null; });
  const context = (moduleKeys === undefined ? fetchVisibleModulesForRoles(client, roles).then((modules) => modules.map((module) => module.key)) : Promise.resolve([...moduleKeys]))
    .then(async (keys): Promise<SnapshotContext> => {
      const assigned = !office && personId && keys.length ? await getMembership() : [];
      return { roles: [...roles], moduleKeys: keys, office, today,
        scope: buildProcessPerformanceScope(roles, personId, assigned || []),
        membership: !office ? () => Promise.resolve(assigned) : keys.includes('humanResources') ? getMembership : () => Promise.resolve([]),
      };
    });
  const registerCache = createRegisterPerformanceCache();
  return { revision: homeReadRevision(client), context, registerCache,
    base: context.then((value) => loadBaseSnapshot(client, value, registerCache)),
    entityProcesses: new Map(), loadedEntities: new Map(),
  };
}

function snapshotFor(client: SupabaseClient, roles: RoleKey[], personId: number | null, moduleKeys: ModuleKey[] | undefined, today: string): PerformanceSnapshot {
  const key = homeReadContext('process-performance', roles, personId, moduleKeys, today);
  const snapshot = cachedHomeRead(client, key, () => createSnapshot(client, roles, personId, moduleKeys, today));
  // Errors and partial snapshots can be retried immediately; they never poison the short cache.
  void snapshot.base.then((base) => {
    if (base?.processes.some((process) => process.unavailableSources.length)) discardHomeRead(client, key, snapshot);
  }, () => discardHomeRead(client, key, snapshot));
  return snapshot;
}

function entityCatalogue(client: SupabaseClient, snapshot: PerformanceSnapshot): Promise<ProcessPerformanceAsset[]> {
  return snapshot.catalogue ??= snapshot.context.then(async ({ moduleKeys, office, scope }) => {
    if (!moduleKeys.length) return [];
    const assets = await fetchPerformanceRows<{ id: number; name: string; asset_kind: ProcessPerformanceAsset['assetKind']; length_overall: number | string | null; active: boolean }>(client,
      'vessels', 'id,name,asset_kind,length_overall,active', office ? {} : { ids: { column: 'id', values: scope.vesselIds } }).catch(() => []);
    return performanceAssets(assets, scope);
  });
}

function loadEntity(client: SupabaseClient, snapshot: PerformanceSnapshot, base: BaseSnapshot, asset: ProcessPerformanceAsset): Promise<ProcessPerformance[]> {
  let pending = snapshot.entityProcesses.get(asset.id);
  if (!pending) {
    pending = base.context.membership().then(async (assignments) => {
      const scope = buildPerformanceEntityScope(base.context.scope, asset, assignments || []);
      // Global register reads have already primed this snapshot's scoped inventory cache.
      const registers = await loadRegisterPerformance(client, base.context.moduleKeys, scope, base.context.today, snapshot.registerCache);
      const processes = buildSnapshotProcesses(base, scope, registers, assignments !== null);
      assertHomeReadRevision(client, snapshot.revision);
      snapshot.loadedEntities.set(asset.id, processes);
      return processes;
    });
    snapshot.entityProcesses.set(asset.id, pending);
    void pending.catch(() => snapshot.entityProcesses.delete(asset.id));
  }
  return pending;
}

export function invalidateProcessPerformanceCache(client?: SupabaseClient): void { invalidateHomeReadCache(client); }

export async function fetchProcessPerformance(client: SupabaseClient, roles: RoleKey[], today = performanceToday(), personId: number | null = null, authorizedModuleKeys?: ModuleKey[]): Promise<ProcessPerformance[]> {
  if (!roles.length || authorizedModuleKeys?.length === 0) return [];
  const snapshot = snapshotFor(client, roles, personId, authorizedModuleKeys, today);
  const base = await snapshot.base;
  assertHomeReadRevision(client, snapshot.revision);
  return base?.processes || [];
}

export async function fetchProcessPerformanceDashboard(client: SupabaseClient, roles: RoleKey[], today = performanceToday(), personId: number | null = null, authorizedModuleKeys?: ModuleKey[], options: ProcessPerformanceDashboardOptions = {}): Promise<ProcessPerformanceDashboard> {
  if (!roles.length || authorizedModuleKeys?.length === 0) return { ...EMPTY_DASHBOARD };
  if (options.forceRefresh) invalidateProcessPerformanceCache(client);
  const snapshot = snapshotFor(client, roles, personId, authorizedModuleKeys, today);
  const [base, assets] = await Promise.all([snapshot.base, entityCatalogue(client, snapshot)]);
  assertHomeReadRevision(client, snapshot.revision);
  if (!base) return { ...EMPTY_DASHBOARD };
  if (options.includeEntities !== false) {
    const requested = options.entityIds === undefined ? assets : assets.filter((asset) => options.entityIds!.includes(asset.id));
    await Promise.all(requested.map((asset) => loadEntity(client, snapshot, base, asset)));
  }
  assertHomeReadRevision(client, snapshot.revision);
  const dashboard: ProcessPerformanceDashboard = { processes: base.processes, scopeLabel: base.context.scope.label,
    entities: assets.map((asset) => ({ ...asset, processes: snapshot.loadedEntities.get(asset.id) || [], processesLoaded: snapshot.loadedEntities.has(asset.id) })),
  };
  // Optional presentation adapter for isolated previews; it never grants access or changes scoring.
  const resolver = (client as SupabaseClient & {
    resolveProcessPerformanceTaskLinks?: (snapshot: ProcessPerformanceDashboard) => Promise<ProcessPerformanceDashboard>;
  }).resolveProcessPerformanceTaskLinks;
  const resolved = typeof resolver === 'function' ? await resolver(dashboard) : dashboard;
  assertHomeReadRevision(client, snapshot.revision);
  return resolved;
}
