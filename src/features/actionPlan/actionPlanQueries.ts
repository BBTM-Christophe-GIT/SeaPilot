import type { SupabaseClient } from '@supabase/supabase-js';

const ACTION_ITEM_SELECT = [
  'id',
  'project_id',
  'project_sharepoint_item_id',
  'project_code',
  'project_title',
  'vessel_id',
  'vessel_sharepoint_item_id',
  'vessel_name',
  'category_key',
  'action_type',
  'audit_type',
  'title',
  'status',
  'priority_label',
  'opened_on',
  'due_on',
  'owner_name',
  'auditor_name',
  'description',
  'corrective_action',
  'source_label',
].join(', ');

const ACTION_DOCUMENT_SELECT = [
  'id',
  'action_item_id',
  'action_sharepoint_item_id',
  'action_title',
  'category_key',
  'title',
  'source_label',
  'source_sharepoint_id',
  'file_url',
  'notes',
].join(', ');

interface ActionItemRow {
  id: number;
  project_id: number | null;
  project_sharepoint_item_id: string | null;
  project_code: string | null;
  project_title: string | null;
  vessel_id: number | null;
  vessel_sharepoint_item_id: string | null;
  vessel_name: string | null;
  category_key: string | null;
  action_type: string | null;
  audit_type: string | null;
  title: string;
  status: string | null;
  priority_label: string | null;
  opened_on: string | null;
  due_on: string | null;
  owner_name: string | null;
  auditor_name: string | null;
  description: string | null;
  corrective_action: string | null;
  source_label: string | null;
}

interface ActionDocumentRow {
  id: number;
  action_item_id: number | null;
  action_sharepoint_item_id: string | null;
  action_title: string | null;
  category_key: string | null;
  title: string;
  source_label: string | null;
  source_sharepoint_id: string | null;
  file_url: string | null;
  notes: string | null;
}

export interface ActionItemRecord {
  id: number;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  vesselId: number | null;
  vesselSharePointItemId: string;
  vesselName: string;
  categoryKey: string;
  actionType: string;
  auditType: string;
  title: string;
  status: string;
  priorityLabel: string;
  openedOn: string;
  dueOn: string;
  ownerName: string;
  auditorName: string;
  description: string;
  correctiveAction: string;
  sourceLabel: string;
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

export interface ActionPlanData {
  actions: ActionItemRecord[];
  documents: ActionDocumentRecord[];
}

export interface ActionPlanMetrics {
  openActionCount: number;
  highPriorityCount: number;
  dueActionCount: number;
  documentCount: number;
}

export interface CreateActionItemInput {
  projectId: number | null;
  projectCode: string;
  projectTitle: string;
  vesselName: string;
  categoryKey: string;
  actionType: string;
  auditType: string;
  title: string;
  status: string;
  priorityLabel: string;
  openedOn: string;
  dueOn: string;
  ownerName: string;
  auditorName: string;
  description: string;
  correctiveAction: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isOpenAction(action: ActionItemRecord): boolean {
  const status = normalizeLabel(action.status);

  return !status.includes('clos') && !status.includes('cloture') && !status.includes('annule') && !status.includes('termine');
}

function isHighPriority(action: ActionItemRecord): boolean {
  const priority = normalizeLabel(action.priorityLabel);

  return priority.includes('haute') || priority.includes('urgent') || priority.includes('critique');
}

export function mapActionItemRows(rows: ActionItemRow[]): ActionItemRecord[] {
  return rows.map((row) => ({
    actionType: nullableText(row.action_type),
    auditType: nullableText(row.audit_type),
    categoryKey: nullableText(row.category_key),
    correctiveAction: nullableText(row.corrective_action),
    description: nullableText(row.description),
    dueOn: nullableText(row.due_on),
    id: row.id,
    openedOn: nullableText(row.opened_on),
    ownerName: nullableText(row.owner_name),
    auditorName: nullableText(row.auditor_name),
    priorityLabel: nullableText(row.priority_label),
    projectCode: nullableText(row.project_code),
    projectId: row.project_id,
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectTitle: nullableText(row.project_title),
    sourceLabel: nullableText(row.source_label),
    status: nullableText(row.status),
    title: row.title,
    vesselId: row.vessel_id,
    vesselName: nullableText(row.vessel_name),
    vesselSharePointItemId: nullableText(row.vessel_sharepoint_item_id),
  }));
}

export function mapActionDocumentRows(rows: ActionDocumentRow[]): ActionDocumentRecord[] {
  return rows.map((row) => ({
    actionItemId: row.action_item_id,
    actionSharePointItemId: nullableText(row.action_sharepoint_item_id),
    actionTitle: nullableText(row.action_title),
    categoryKey: nullableText(row.category_key),
    fileUrl: nullableText(row.file_url),
    id: row.id,
    notes: nullableText(row.notes),
    sourceLabel: nullableText(row.source_label),
    sourceSharePointId: nullableText(row.source_sharepoint_id),
    title: row.title,
  }));
}

export function buildActionPlanMetrics(actions: ActionItemRecord[], documents: ActionDocumentRecord[]): ActionPlanMetrics {
  return {
    documentCount: documents.length,
    dueActionCount: actions.filter((action) => isOpenAction(action) && Boolean(action.dueOn)).length,
    highPriorityCount: actions.filter(isHighPriority).length,
    openActionCount: actions.filter(isOpenAction).length,
  };
}

export async function fetchActionItems(client: SupabaseClient): Promise<ActionItemRecord[]> {
  const { data, error } = await client
    .from('action_items')
    .select(ACTION_ITEM_SELECT)
    .order('due_on', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapActionItemRows((data || []) as unknown as ActionItemRow[]);
}

export async function fetchActionDocuments(client: SupabaseClient): Promise<ActionDocumentRecord[]> {
  const { data, error } = await client
    .from('action_documents')
    .select(ACTION_DOCUMENT_SELECT)
    .order('action_title', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (error) {
    throw error;
  }

  return mapActionDocumentRows((data || []) as unknown as ActionDocumentRow[]);
}

export async function fetchActionPlanData(client: SupabaseClient): Promise<ActionPlanData> {
  const [actions, documents] = await Promise.all([fetchActionItems(client), fetchActionDocuments(client)]);

  return { actions, documents };
}

export async function createActionItem(client: SupabaseClient, input: CreateActionItemInput): Promise<ActionItemRecord> {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Le titre de l'action est obligatoire.");
  }

  const payload = {
    project_id: input.projectId,
    project_code: optionalText(input.projectCode),
    project_title: optionalText(input.projectTitle),
    vessel_name: optionalText(input.vesselName),
    category_key: optionalText(input.categoryKey) || 'action',
    action_type: optionalText(input.actionType),
    audit_type: optionalText(input.auditType),
    title,
    status: optionalText(input.status),
    priority_label: optionalText(input.priorityLabel),
    opened_on: optionalText(input.openedOn),
    due_on: optionalText(input.dueOn),
    owner_name: optionalText(input.ownerName),
    auditor_name: optionalText(input.auditorName),
    description: optionalText(input.description),
    corrective_action: optionalText(input.correctiveAction),
    source_label: 'seapilot',
  };
  const { data, error } = await client.from('action_items').insert(payload).select(ACTION_ITEM_SELECT).single();

  if (error) {
    throw error;
  }

  return mapActionItemRows([data as unknown as ActionItemRow])[0];
}
