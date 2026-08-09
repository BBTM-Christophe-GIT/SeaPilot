import type { SupabaseClient } from '@supabase/supabase-js';

const ACTION_ITEM_SELECT = [
  'id', 'company_id', 'project_id', 'project_sharepoint_item_id', 'project_code', 'project_title',
  'vessel_id', 'vessel_sharepoint_item_id', 'vessel_name', 'category_key', 'action_type_key', 'action_type',
  'audit_type', 'title', 'status', 'priority_label', 'deviation_type', 'opened_on', 'due_on', 'closed_on',
  'issuer_name', 'owner_name', 'auditor_name', 'description', 'corrective_action', 'realized_action',
  'anomaly_cause', 'comments', 'level_label', 'location_detail', 'photo_1_path', 'photo_2_path',
  'closure_photo_path', 'victim_person_id', 'victim_sharepoint_item_id', 'lost_days', 'safety_event_details',
  'source_label', 'sharepoint_list_title', 'sharepoint_item_id', 'source_modified_at',
].join(', ');

const ACTION_DOCUMENT_SELECT = [
  'id', 'action_item_id', 'action_sharepoint_item_id', 'action_title', 'category_key', 'title',
  'source_label', 'source_sharepoint_id', 'file_url', 'notes',
].join(', ');

const ACTION_PLAN_EVIDENCE_BUCKET = 'action-plan-evidence';
const ACTION_PLAN_EVIDENCE_URL_TTL_SECONDS = 60 * 60;

type ActionItemRow = Record<string, unknown> & { id: number; title: string };
type ActionDocumentRow = Record<string, unknown> & { id: number; title: string };

export interface ActionItemRecord {
  id: number;
  companyId: number | null;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  vesselId: number | null;
  vesselSharePointItemId: string;
  vesselName: string;
  categoryKey: string;
  actionTypeKey: string;
  actionType: string;
  auditType: string;
  title: string;
  status: string;
  priorityLabel: string;
  deviationType: string;
  openedOn: string;
  dueOn: string;
  closedOn: string;
  issuerName: string;
  ownerName: string;
  auditorName: string;
  description: string;
  correctiveAction: string;
  realizedAction: string;
  anomalyCause: string;
  comments: string;
  levelLabel: string;
  locationDetail: string;
  photo1Path: string;
  photo2Path: string;
  closurePhotoPath: string;
  thumbnailUrl: string;
  victimPersonId: number | null;
  victimSharePointItemId: string;
  lostDays: number;
  safetyEventDetails: Record<string, unknown>;
  sourceLabel: string;
  sourceListTitle: string;
  sourceItemId: string;
  sourceModifiedAt: string;
}

export interface ActionDocumentRecord {
  id: number;
  actionItemId: number | null;
  actionSharePointItemId: string;
  actionTitle: string;
  categoryKey: string;
  title: string;
  sourceLabel: string;
  sourceSharePointId: string;
  fileUrl: string;
  notes: string;
}

export interface ActionTypeCatalogRecord {
  key: string;
  label: string;
  family: 'action' | 'audit' | 'visit' | 'event';
  hseClassification: string;
  tracksExposureRate: boolean;
  sortOrder: number;
}

export interface VesselOption {
  id: number;
  name: string;
}

export interface ActionPlanData {
  actions: ActionItemRecord[];
  documents: ActionDocumentRecord[];
  actionTypes: ActionTypeCatalogRecord[];
  vessels: VesselOption[];
  exposureHours: number;
  hseKpis: Record<string, number | string | boolean | null> | null;
  hseDashboard: ActionPlanHseDashboard | null;
}

export interface ActionPlanHsePoint {
  month: number;
  monthLabel: string;
  exposureHours: number;
  FAT: number;
  LWDC: number;
  LTI: number;
  RWC: number;
  MTC: number;
  FAC: number;
  nearMiss: number;
  safetyObservation: number;
  lostDays: number;
  LTIFR: number | null;
  TRIR: number | null;
  FAR: number | null;
  FACRate: number | null;
  MTCRate: number | null;
  RWCRate: number | null;
  SOFR: number | null;
  frequencyRate: number | null;
  severityRate: number | null;
}

export interface ActionPlanHseDashboard {
  year: number;
  methodologyVersion: string;
  configurationComplete: boolean;
  exposureRefreshed: boolean;
  totals: ActionPlanHsePoint;
  monthly: ActionPlanHsePoint[];
}

export interface ActionPlanMetrics {
  openActionCount: number;
  majorNonConformityCount: number;
  closedActionCount: number;
  overdueActionCount: number;
  exposureHours: number;
}

export interface CreateActionItemInput {
  title: string;
  issuerName: string;
  vesselId: number | null;
  vesselName: string;
  actionTypeKey: string;
  actionType: string;
  deviationType: string;
  openedOn: string;
  dueOn: string;
  ownerName: string;
  description: string;
  correctiveAction: string;
  lostDays: number;
}

export interface ActionTreatmentInput {
  comments: string;
  realizedAction: string;
  closeAction: boolean;
}

function nullableText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeActionLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function isActionClosed(action: Pick<ActionItemRecord, 'status' | 'closedOn'>): boolean {
  const status = normalizeActionLabel(action.status);
  if (status.includes('non solde') || status.includes('non-solde') || status.includes('a traiter')) return false;
  return Boolean(action.closedOn) || status.includes('solde') || status.includes('clos') || status.includes('termine');
}

export function actionThumbnailPath(
  action: Pick<ActionItemRecord, 'status' | 'closedOn' | 'photo1Path' | 'photo2Path' | 'closurePhotoPath'>,
): string {
  return isActionClosed(action) ? action.closurePhotoPath : action.photo1Path || action.photo2Path;
}

export function mapActionItemRows(rows: ActionItemRow[]): ActionItemRecord[] {
  return rows.map((row) => ({
    id: Number(row.id),
    companyId: row.company_id == null ? null : Number(row.company_id),
    projectId: row.project_id == null ? null : Number(row.project_id),
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectCode: nullableText(row.project_code),
    projectTitle: nullableText(row.project_title),
    vesselId: row.vessel_id == null ? null : Number(row.vessel_id),
    vesselSharePointItemId: nullableText(row.vessel_sharepoint_item_id),
    vesselName: nullableText(row.vessel_name),
    categoryKey: nullableText(row.category_key),
    actionTypeKey: nullableText(row.action_type_key),
    actionType: nullableText(row.action_type),
    auditType: nullableText(row.audit_type),
    title: nullableText(row.title),
    status: nullableText(row.status),
    priorityLabel: nullableText(row.priority_label),
    deviationType: nullableText(row.deviation_type),
    openedOn: nullableText(row.opened_on),
    dueOn: nullableText(row.due_on),
    closedOn: nullableText(row.closed_on),
    issuerName: nullableText(row.issuer_name),
    ownerName: nullableText(row.owner_name),
    auditorName: nullableText(row.auditor_name),
    description: nullableText(row.description),
    correctiveAction: nullableText(row.corrective_action),
    realizedAction: nullableText(row.realized_action),
    anomalyCause: nullableText(row.anomaly_cause),
    comments: nullableText(row.comments),
    levelLabel: nullableText(row.level_label),
    locationDetail: nullableText(row.location_detail),
    photo1Path: nullableText(row.photo_1_path),
    photo2Path: nullableText(row.photo_2_path),
    closurePhotoPath: nullableText(row.closure_photo_path),
    thumbnailUrl: '',
    victimPersonId: row.victim_person_id == null ? null : Number(row.victim_person_id),
    victimSharePointItemId: nullableText(row.victim_sharepoint_item_id),
    lostDays: Number(row.lost_days || 0),
    safetyEventDetails: row.safety_event_details && typeof row.safety_event_details === 'object'
      ? row.safety_event_details as Record<string, unknown>
      : {},
    sourceLabel: nullableText(row.source_label),
    sourceListTitle: nullableText(row.sharepoint_list_title),
    sourceItemId: nullableText(row.sharepoint_item_id),
    sourceModifiedAt: nullableText(row.source_modified_at),
  }));
}

export function mapActionDocumentRows(rows: ActionDocumentRow[]): ActionDocumentRecord[] {
  return rows.map((row) => ({
    id: Number(row.id),
    actionItemId: row.action_item_id == null ? null : Number(row.action_item_id),
    actionSharePointItemId: nullableText(row.action_sharepoint_item_id),
    actionTitle: nullableText(row.action_title),
    categoryKey: nullableText(row.category_key),
    title: nullableText(row.title),
    sourceLabel: nullableText(row.source_label),
    sourceSharePointId: nullableText(row.source_sharepoint_id),
    fileUrl: nullableText(row.file_url),
    notes: nullableText(row.notes),
  }));
}

export function buildActionPlanMetrics(actions: ActionItemRecord[], exposureHours = 0): ActionPlanMetrics {
  const today = new Date().toISOString().slice(0, 10);
  return {
    openActionCount: actions.filter((action) => !isActionClosed(action)).length,
    majorNonConformityCount: actions.filter((action) => normalizeActionLabel(action.deviationType).includes('majeure')).length,
    closedActionCount: actions.filter(isActionClosed).length,
    overdueActionCount: actions.filter((action) => !isActionClosed(action) && Boolean(action.dueOn) && action.dueOn < today).length,
    exposureHours,
  };
}

async function fetchActionItems(client: SupabaseClient): Promise<ActionItemRecord[]> {
  const { data, error } = await client.from('action_items').select(ACTION_ITEM_SELECT)
    .order('due_on', { ascending: true, nullsFirst: false }).order('title', { ascending: true });
  if (error) throw error;
  return mapActionItemRows((data || []) as unknown as ActionItemRow[]);
}

async function hydrateActionThumbnailUrls(client: SupabaseClient, actions: ActionItemRecord[]): Promise<ActionItemRecord[]> {
  const paths = Array.from(new Set(actions.map(actionThumbnailPath).filter(Boolean)));
  if (paths.length === 0) return actions;

  const { data, error } = await client.storage
    .from(ACTION_PLAN_EVIDENCE_BUCKET)
    .createSignedUrls(paths, ACTION_PLAN_EVIDENCE_URL_TTL_SECONDS);
  if (error || !data) return actions;

  const urlsByPath = new Map(data
    .filter((item) => item.path && item.signedUrl)
    .map((item) => [item.path, item.signedUrl]));
  return actions.map((action) => ({
    ...action,
    thumbnailUrl: urlsByPath.get(actionThumbnailPath(action)) || '',
  }));
}

async function fetchActionDocuments(client: SupabaseClient): Promise<ActionDocumentRecord[]> {
  const { data, error } = await client.from('action_documents').select(ACTION_DOCUMENT_SELECT)
    .order('action_title', { ascending: true, nullsFirst: false }).order('title', { ascending: true });
  if (error) throw error;
  return mapActionDocumentRows((data || []) as unknown as ActionDocumentRow[]);
}

async function fetchActionTypes(client: SupabaseClient): Promise<ActionTypeCatalogRecord[]> {
  const { data, error } = await client.from('action_type_catalog')
    .select('type_key,label,family,hse_classification,tracks_exposure_rate,sort_order')
    .eq('active', true).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    key: String(row.type_key), label: String(row.label),
    family: row.family as ActionTypeCatalogRecord['family'],
    hseClassification: nullableText(row.hse_classification),
    tracksExposureRate: Boolean(row.tracks_exposure_rate), sortOrder: Number(row.sort_order || 0),
  }));
}

async function fetchVessels(client: SupabaseClient): Promise<VesselOption[]> {
  const { data, error } = await client.from('vessels').select('id,name').eq('active', true).order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({ id: Number(row.id), name: String(row.name || '') })).filter((row) => row.name);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function mapHsePoint(summary: Record<string, unknown>, month: number): ActionPlanHsePoint {
  const monthLabels = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
  return {
    month,
    monthLabel: monthLabels[month - 1] || '',
    exposureHours: Number(summary.exposure_hours || 0),
    FAT: Number(summary.FAT || 0),
    LWDC: Number(summary.LWDC || 0),
    LTI: Number(summary.LTI || 0),
    RWC: Number(summary.RWC || 0),
    MTC: Number(summary.MTC || 0),
    FAC: Number(summary.FAC || 0),
    nearMiss: Number(summary.near_miss || 0),
    safetyObservation: Number(summary.safety_observation || 0),
    lostDays: Number(summary.lost_days || 0),
    LTIFR: numberOrNull(summary.LTIFR),
    TRIR: numberOrNull(summary.TRIR),
    FAR: numberOrNull(summary.FAR),
    FACRate: numberOrNull(summary.FAC_rate),
    MTCRate: numberOrNull(summary.MTC_rate),
    RWCRate: numberOrNull(summary.RWC_rate),
    SOFR: numberOrNull(summary.SOFR),
    frequencyRate: numberOrNull(summary.french_frequency_rate),
    severityRate: numberOrNull(summary.french_severity_rate),
  };
}

function endOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export async function fetchActionPlanHseDashboard(client: SupabaseClient, year: number): Promise<ActionPlanHseDashboard | null> {
  const { data: methods, error } = await client.from('hse_exposure_methodologies').select('id')
    .order('effective_from', { ascending: false }).limit(1);
  if (error || !methods?.[0]) return null;

  const methodologyId = methods[0].id;
  const startsOn = `${year}-01-01`;
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  const lastMonth = isCurrentYear ? now.getMonth() + 1 : 12;
  const endsOn = isCurrentYear ? now.toISOString().slice(0, 10) : `${year}-12-31`;
  let exposureRefreshed = false;

  try {
    const { error: refreshError } = await client.rpc('refresh_hse_exposure_hours', {
      p_starts_on: startsOn, p_ends_on: endsOn, p_methodology_id: methodologyId,
    });
    exposureRefreshed = !refreshError;
  } catch {
    // Capitaines may read the dashboard but cannot rebuild the exposure ledger.
    // The summaries below still use the most recently materialised ledger.
  }

  const results = await Promise.all(Array.from({ length: lastMonth }, async (_, index) => {
    const month = index + 1;
    const monthEnd = isCurrentYear && month === lastMonth ? endsOn : endOfMonth(year, month);
    const { data, error: rpcError } = await client.rpc('hse_kpi_summary', {
      p_starts_on: startsOn, p_ends_on: monthEnd, p_methodology_id: methodologyId,
    });
    if (rpcError || !data || typeof data !== 'object') throw rpcError || new Error('HSE_KPI_EMPTY');
    const raw = data as Record<string, unknown>;
    return { point: mapHsePoint(raw, month), raw };
  }));

  const totals = results[results.length - 1].point;
  const totalMetadata = results[results.length - 1].raw;

  return {
    year,
    methodologyVersion: String(totalMetadata.methodology_version || ''),
    configurationComplete: Boolean(totalMetadata.configuration_complete),
    exposureRefreshed,
    totals,
    monthly: results.map((result) => result.point),
  };
}

export async function fetchActionPlanData(client: SupabaseClient): Promise<ActionPlanData> {
  const currentYear = new Date().getFullYear();
  const [actionsResult, documentsResult, typesResult, vesselsResult, hseResult] = await Promise.allSettled([
    fetchActionItems(client), fetchActionDocuments(client), fetchActionTypes(client), fetchVessels(client), fetchActionPlanHseDashboard(client, currentYear),
  ]);
  if (actionsResult.status === 'rejected') throw actionsResult.reason;
  const actions = await hydrateActionThumbnailUrls(client, actionsResult.value);
  return {
    actions,
    documents: documentsResult.status === 'fulfilled' ? documentsResult.value : [],
    actionTypes: typesResult.status === 'fulfilled' ? typesResult.value : [],
    vessels: vesselsResult.status === 'fulfilled' ? vesselsResult.value : [],
    exposureHours: hseResult.status === 'fulfilled' ? hseResult.value?.totals.exposureHours || 0 : 0,
    hseKpis: hseResult.status === 'fulfilled' && hseResult.value ? hseResult.value.totals as unknown as ActionPlanData['hseKpis'] : null,
    hseDashboard: hseResult.status === 'fulfilled' ? hseResult.value : null,
  };
}

function safeFileName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100);
}

async function uploadEvidence(client: SupabaseClient, companyId: number, actionId: number, kind: string, file: File): Promise<string> {
  const path = `${companyId}/${actionId}/${kind}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await client.storage.from(ACTION_PLAN_EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function createActionItem(
  client: SupabaseClient,
  input: CreateActionItemInput,
  photos: File[] = [],
): Promise<ActionItemRecord> {
  const title = input.title.trim();
  if (!title) throw new Error("Le constat de l'action est obligatoire.");
  if (!input.issuerName.trim()) throw new Error("L'émetteur est obligatoire.");
  if (!input.actionTypeKey) throw new Error("Le type d'action est obligatoire.");

  const payload = {
    vessel_id: input.vesselId, vessel_name: optionalText(input.vesselName), category_key: 'action',
    action_type_key: input.actionTypeKey, action_type: optionalText(input.actionType), title,
    status: 'Ecart Non Soldé', deviation_type: optionalText(input.deviationType),
    opened_on: optionalText(input.openedOn) || new Date().toISOString().slice(0, 10), due_on: optionalText(input.dueOn),
    issuer_name: optionalText(input.issuerName), owner_name: optionalText(input.ownerName),
    description: optionalText(input.description), corrective_action: optionalText(input.correctiveAction),
    lost_days: input.lostDays || 0, source_label: 'seapilot',
  };
  const { data, error } = await client.from('action_items').insert(payload).select(ACTION_ITEM_SELECT).single();
  if (error) throw error;
  let row = data as unknown as ActionItemRow;
  const companyId = Number(row.company_id);
  if (photos.length && companyId) {
    const uploaded = await Promise.all(photos.slice(0, 2).map((file, index) => uploadEvidence(client, companyId, Number(row.id), `photo-${index + 1}`, file)));
    const { data: updated, error: updateError } = await client.from('action_items').update({
      photo_1_path: uploaded[0] || null, photo_2_path: uploaded[1] || null,
    }).eq('id', row.id).select(ACTION_ITEM_SELECT).single();
    if (updateError) throw updateError;
    row = updated as unknown as ActionItemRow;
  }
  return (await hydrateActionThumbnailUrls(client, mapActionItemRows([row])))[0];
}

export async function updateActionItemTreatment(
  client: SupabaseClient,
  action: ActionItemRecord,
  input: ActionTreatmentInput,
  closurePhoto?: File,
): Promise<ActionItemRecord> {
  let closurePhotoPath = action.closurePhotoPath || null;
  if (closurePhoto && action.companyId) {
    closurePhotoPath = await uploadEvidence(client, action.companyId, action.id, 'cloture', closurePhoto);
  }
  const payload = {
    comments: optionalText(input.comments), realized_action: optionalText(input.realizedAction), closure_photo_path: closurePhotoPath,
    status: input.closeAction ? 'Ecart Soldé' : action.status || 'Ecart Non Soldé',
    closed_on: input.closeAction ? new Date().toISOString().slice(0, 10) : action.closedOn || null,
  };
  const { data, error } = await client.from('action_items').update(payload).eq('id', action.id).select(ACTION_ITEM_SELECT).single();
  if (error) throw error;
  return (await hydrateActionThumbnailUrls(client, mapActionItemRows([data as unknown as ActionItemRow])))[0];
}
