import type { SupabaseClient } from '@supabase/supabase-js';

const PURCHASE_REQUEST_SELECT = [
  'id',
  'request_number',
  'title',
  'requested_on',
  'requester_name',
  'supplier_name',
  'project_id',
  'project_sharepoint_item_id',
  'project_code',
  'project_title',
  'vessel_id',
  'vessel_sharepoint_item_id',
  'vessel_name',
  'reference',
  'quantity',
  'unit_label',
  'unit_price_ht',
  'amount_ht',
  'currency',
  'status',
  'description',
  'urgent',
  'urgency_reason',
  'owner_name',
  'ordered_on',
  'expected_delivery_on',
  'received_on',
  'delivery_location',
  'delivery_details',
  'rebilling_label',
  'category_label',
  'processing_comment',
  'approval_status',
  'approval_reason',
  'approver_name',
  'approval_history',
  'website_url',
  'source_label',
  'sharepoint_encoded_abs_url',
  'created_at',
  'updated_at',
].join(', ');

const PURCHASE_ATTACHMENT_SELECT = [
  'id',
  'purchase_request_id',
  'title',
  'content_type',
  'file_size_bytes',
  'source_kind',
  'file_url',
  'storage_bucket',
  'storage_path',
  'created_at',
].join(', ');

const PURCHASE_EVENT_SELECT = [
  'id',
  'purchase_request_id',
  'event_type',
  'status_label',
  'actor_name',
  'comment',
  'effective_on',
  'created_at',
].join(', ');

const STORAGE_BUCKET = 'purchase-request-attachments';

interface PurchaseRequestRow {
  id: number;
  request_number: string | null;
  title: string;
  requested_on: string | null;
  requester_name: string | null;
  supplier_name: string | null;
  project_id: number | null;
  project_sharepoint_item_id: string | null;
  project_code: string | null;
  project_title: string | null;
  vessel_id: number | null;
  vessel_sharepoint_item_id: string | null;
  vessel_name: string | null;
  reference: string | null;
  quantity: number | string | null;
  unit_label: string | null;
  unit_price_ht: number | string | null;
  amount_ht: number | string | null;
  currency: string | null;
  status: string | null;
  description: string | null;
  urgent: boolean | null;
  urgency_reason: string | null;
  owner_name: string | null;
  ordered_on: string | null;
  expected_delivery_on: string | null;
  received_on: string | null;
  delivery_location: string | null;
  delivery_details: string | null;
  rebilling_label: string | null;
  category_label: string | null;
  processing_comment: string | null;
  approval_status: string | null;
  approval_reason: string | null;
  approver_name: string | null;
  approval_history: string | null;
  website_url: string | null;
  source_label: string | null;
  sharepoint_encoded_abs_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface PurchaseAttachmentRow {
  id: number;
  purchase_request_id: number | null;
  title: string;
  content_type: string | null;
  file_size_bytes: number | null;
  source_kind: string;
  file_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
}

interface PurchaseEventRow {
  id: number;
  purchase_request_id: number;
  event_type: string;
  status_label: string | null;
  actor_name: string | null;
  comment: string | null;
  effective_on: string | null;
  created_at: string;
}

export type PurchaseRequestStage = 'to_process' | 'ordered' | 'receiving' | 'completed';

export interface PurchaseRequestAttachment {
  id: number;
  title: string;
  contentType: string;
  fileSizeBytes: number | null;
  sourceKind: 'sharepoint' | 'seapilot';
  downloadUrl: string;
  createdAt: string;
  isImage: boolean;
}

export interface PurchaseRequestEvent {
  id: number;
  eventType: string;
  statusLabel: string;
  actorName: string;
  comment: string;
  effectiveOn: string;
  createdAt: string;
}

export interface PurchaseRequestRecord {
  id: number;
  requestNumber: string;
  title: string;
  requestedOn: string;
  requesterName: string;
  supplierName: string;
  projectId: number | null;
  projectSharePointItemId: string;
  projectCode: string;
  projectTitle: string;
  vesselId: number | null;
  vesselSharePointItemId: string;
  vesselName: string;
  reference: string;
  quantity: number;
  unitLabel: string;
  unitPriceHt: number;
  amountHt: number;
  currency: string;
  status: string;
  stage: PurchaseRequestStage;
  description: string;
  urgent: boolean;
  urgencyReason: string;
  ownerName: string;
  orderedOn: string;
  expectedDeliveryOn: string;
  receivedOn: string;
  deliveryLocation: string;
  deliveryDetails: string;
  rebillingLabel: string;
  categoryLabel: string;
  processingComment: string;
  approvalStatus: string;
  approvalReason: string;
  approverName: string;
  approvalHistory: string;
  websiteUrl: string;
  sourceLabel: string;
  sharePointUrl: string;
  createdAt: string;
  updatedAt: string;
  attachments: PurchaseRequestAttachment[];
  events: PurchaseRequestEvent[];
}

export interface PurchaseRequestMetrics {
  requestCount: number;
  openRequestCount: number;
  totalAmountHt: number;
  supplierCount: number;
  urgentCount: number;
}

export interface PurchaseVesselOption {
  id: number;
  name: string;
}

export interface CreatePurchaseRequestInput {
  requestNumber: string;
  title: string;
  requestedOn: string;
  requesterName: string;
  supplierName: string;
  vesselId: number | null;
  reference: string;
  quantity: string;
  unitLabel: string;
  unitPriceHt: string;
  amountHt: string;
  currency: string;
  description: string;
  urgent: boolean;
  urgencyReason: string;
  deliveryLocation: string;
  deliveryDetails: string;
  expectedDeliveryOn: string;
  rebillingLabel: string;
  categoryLabel: string;
  websiteUrl: string;
}

export type PurchaseRequestAction =
  | 'take_charge'
  | 'plan_delivery'
  | 'mark_received'
  | 'approve'
  | 'refuse'
  | 'request_information';

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function derivePurchaseRequestStage(input: Pick<PurchaseRequestRecord, 'expectedDeliveryOn' | 'orderedOn' | 'receivedOn' | 'status'>): PurchaseRequestStage {
  const status = normalizeSearchValue(input.status);
  if (input.receivedOn || status.includes('traitee') || status.includes('recu') || status.includes('termine')) return 'completed';
  if (status.includes('reception') || (input.expectedDeliveryOn && !input.receivedOn)) return 'receiving';
  if (input.orderedOn || status.includes('cours') || status.includes('commande')) return 'ordered';
  return 'to_process';
}

function mapEventRows(rows: PurchaseEventRow[]): Map<number, PurchaseRequestEvent[]> {
  const eventsByRequest = new Map<number, PurchaseRequestEvent[]>();
  rows.forEach((row) => {
    const events = eventsByRequest.get(row.purchase_request_id) || [];
    events.push({
      id: row.id,
      eventType: row.event_type,
      statusLabel: nullableText(row.status_label),
      actorName: nullableText(row.actor_name),
      comment: nullableText(row.comment),
      effectiveOn: nullableText(row.effective_on),
      createdAt: nullableText(row.created_at),
    });
    eventsByRequest.set(row.purchase_request_id, events);
  });
  return eventsByRequest;
}

async function mapAttachmentRows(client: SupabaseClient, rows: PurchaseAttachmentRow[]): Promise<Map<number, PurchaseRequestAttachment[]>> {
  const mapped = await Promise.all(rows.map(async (row) => {
    let downloadUrl = nullableText(row.file_url);
    if (!downloadUrl && row.storage_bucket && row.storage_path) {
      const { data } = await client.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 60 * 60);
      downloadUrl = data?.signedUrl || '';
    }
    const contentType = nullableText(row.content_type);
    return {
      purchaseRequestId: row.purchase_request_id,
      attachment: {
        id: row.id,
        title: row.title,
        contentType,
        fileSizeBytes: row.file_size_bytes,
        sourceKind: row.source_kind === 'sharepoint' ? 'sharepoint' as const : 'seapilot' as const,
        downloadUrl,
        createdAt: row.created_at,
        isImage: contentType.startsWith('image/') || /\.(heic|jpe?g|png|webp)$/i.test(row.title),
      },
    };
  }));

  const attachmentsByRequest = new Map<number, PurchaseRequestAttachment[]>();
  mapped.forEach(({ purchaseRequestId, attachment }) => {
    if (purchaseRequestId === null) return;
    const attachments = attachmentsByRequest.get(purchaseRequestId) || [];
    attachments.push(attachment);
    attachmentsByRequest.set(purchaseRequestId, attachments);
  });
  return attachmentsByRequest;
}

export function mapPurchaseRequestRows(
  rows: PurchaseRequestRow[],
  attachmentsByRequest = new Map<number, PurchaseRequestAttachment[]>(),
  eventsByRequest = new Map<number, PurchaseRequestEvent[]>(),
): PurchaseRequestRecord[] {
  return rows.map((row) => {
    const base = {
      id: row.id,
      requestNumber: nullableText(row.request_number) || String(row.id),
      title: row.title,
      requestedOn: nullableText(row.requested_on),
      requesterName: nullableText(row.requester_name),
      supplierName: nullableText(row.supplier_name),
      projectId: row.project_id,
      projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
      projectCode: nullableText(row.project_code),
      projectTitle: nullableText(row.project_title),
      vesselId: row.vessel_id,
      vesselSharePointItemId: nullableText(row.vessel_sharepoint_item_id),
      vesselName: nullableText(row.vessel_name),
      reference: nullableText(row.reference),
      quantity: normalizeNumber(row.quantity),
      unitLabel: nullableText(row.unit_label),
      unitPriceHt: normalizeNumber(row.unit_price_ht),
      amountHt: normalizeNumber(row.amount_ht),
      currency: nullableText(row.currency) || 'EUR',
      status: nullableText(row.status),
      description: nullableText(row.description),
      urgent: Boolean(row.urgent),
      urgencyReason: nullableText(row.urgency_reason),
      ownerName: nullableText(row.owner_name),
      orderedOn: nullableText(row.ordered_on),
      expectedDeliveryOn: nullableText(row.expected_delivery_on),
      receivedOn: nullableText(row.received_on),
      deliveryLocation: nullableText(row.delivery_location),
      deliveryDetails: nullableText(row.delivery_details),
      rebillingLabel: nullableText(row.rebilling_label),
      categoryLabel: nullableText(row.category_label),
      processingComment: nullableText(row.processing_comment),
      approvalStatus: nullableText(row.approval_status),
      approvalReason: nullableText(row.approval_reason),
      approverName: nullableText(row.approver_name),
      approvalHistory: nullableText(row.approval_history),
      websiteUrl: nullableText(row.website_url),
      sourceLabel: nullableText(row.source_label),
      sharePointUrl: nullableText(row.sharepoint_encoded_abs_url),
      createdAt: nullableText(row.created_at),
      updatedAt: nullableText(row.updated_at),
      attachments: attachmentsByRequest.get(row.id) || [],
      events: eventsByRequest.get(row.id) || [],
    };
    return { ...base, stage: derivePurchaseRequestStage(base) };
  });
}

export function buildPurchaseRequestMetrics(requests: PurchaseRequestRecord[]): PurchaseRequestMetrics {
  return {
    openRequestCount: requests.filter((request) => request.stage !== 'completed').length,
    requestCount: requests.length,
    supplierCount: new Set(requests.map((request) => request.supplierName).filter(Boolean)).size,
    totalAmountHt: requests.reduce((total, request) => total + request.amountHt, 0),
    urgentCount: requests.filter((request) => request.urgent).length,
  };
}

export async function fetchPurchaseRequests(client: SupabaseClient): Promise<PurchaseRequestRecord[]> {
  const [requestsResult, attachmentsResult, eventsResult] = await Promise.all([
    client.from('purchase_requests').select(PURCHASE_REQUEST_SELECT)
      .order('requested_on', { ascending: false, nullsFirst: false }).order('request_number', { ascending: false }),
    client.from('purchase_request_attachments').select(PURCHASE_ATTACHMENT_SELECT).order('created_at', { ascending: true }),
    client.from('purchase_request_events').select(PURCHASE_EVENT_SELECT).order('created_at', { ascending: false }),
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (attachmentsResult.error) throw attachmentsResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const [attachmentsByRequest, eventsByRequest] = await Promise.all([
    mapAttachmentRows(client, (attachmentsResult.data || []) as unknown as PurchaseAttachmentRow[]),
    Promise.resolve(mapEventRows((eventsResult.data || []) as unknown as PurchaseEventRow[])),
  ]);
  return mapPurchaseRequestRows(
    (requestsResult.data || []) as unknown as PurchaseRequestRow[],
    attachmentsByRequest,
    eventsByRequest,
  );
}

export async function fetchPurchaseVessels(client: SupabaseClient): Promise<PurchaseVesselOption[]> {
  const { data, error } = await client.from('vessels').select('id,name').eq('active', true).order('name');
  if (error) throw error;
  return (data || []).map((row) => ({ id: Number(row.id), name: String(row.name || '') }));
}

export async function fetchCurrentAssignedVessel(
  client: SupabaseClient,
  personId: number,
  referenceDate = new Date().toISOString().slice(0, 10),
): Promise<PurchaseVesselOption | null> {
  const { data, error } = await client.from('planning_assignments')
    .select('vessel_id,vessels(name)')
    .or(`crew_person_id.eq.${personId},captain_person_id.eq.${personId}`)
    .lte('starts_on', referenceDate)
    .gte('ends_on', referenceDate)
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const vesselRelation = data.vessels as unknown as { name?: string } | { name?: string }[] | null;
  const vessel = Array.isArray(vesselRelation) ? vesselRelation[0] : vesselRelation;
  return { id: Number(data.vessel_id), name: String(vessel?.name || '') };
}

function optionalNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new Error('Un montant ou une quantité est invalide.');
  return String(parsed);
}

function safeFileName(fileName: string): string {
  return fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

async function uploadPurchaseAttachments(
  client: SupabaseClient,
  requestId: number,
  files: File[],
): Promise<PurchaseRequestAttachment[]> {
  if (!files.length) return [];
  const uploads = await Promise.all(files.map(async (file) => {
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} dépasse 25 Mo.`);
    const storagePath = `${requestId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await client.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      cacheControl: '3600', contentType: file.type || undefined, upsert: false,
    });
    if (error) throw error;
    return {
      purchase_request_id: requestId,
      title: file.name,
      content_type: file.type || null,
      file_size_bytes: file.size,
      source_kind: 'seapilot',
      file_url: null,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
    };
  }));

  const { data, error } = await client.from('purchase_request_attachments')
    .insert(uploads).select(PURCHASE_ATTACHMENT_SELECT);
  if (error) throw error;
  const mapped = await mapAttachmentRows(client, (data || []) as unknown as PurchaseAttachmentRow[]);
  return mapped.get(requestId) || [];
}

export async function createPurchaseRequest(
  client: SupabaseClient,
  input: CreatePurchaseRequestInput,
  files: File[] = [],
): Promise<PurchaseRequestRecord> {
  if (!input.title.trim()) throw new Error('La désignation est obligatoire.');
  const payload = {
    request_number: input.requestNumber.trim() || null,
    title: input.title.trim(),
    requested_on: input.requestedOn || null,
    requester_name: input.requesterName.trim() || null,
    supplier_name: input.supplierName.trim() || null,
    vessel_id: input.vesselId,
    reference: input.reference.trim() || null,
    quantity: optionalNumber(input.quantity),
    unit_label: input.unitLabel.trim() || null,
    unit_price_ht: optionalNumber(input.unitPriceHt),
    amount_ht: optionalNumber(input.amountHt),
    currency: input.currency.trim() || 'EUR',
    description: input.description.trim() || null,
    urgent: input.urgent,
    urgency_reason: input.urgencyReason.trim() || null,
    delivery_location: input.deliveryLocation.trim() || null,
    delivery_details: input.deliveryDetails.trim() || null,
    expected_delivery_on: input.expectedDeliveryOn || null,
    rebilling_label: input.rebillingLabel.trim() || null,
    category_label: input.categoryLabel.trim() || null,
    website_url: input.websiteUrl.trim() || null,
  };
  const { data, error } = await client.rpc('purchase_request_create', { p_payload: payload });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as unknown as PurchaseRequestRow;
  const attachments = await uploadPurchaseAttachments(client, row.id, files);
  return mapPurchaseRequestRows([row], new Map([[row.id, attachments]]))[0];
}

export async function transitionPurchaseRequest(
  client: SupabaseClient,
  requestId: number,
  action: PurchaseRequestAction,
  options: { comment?: string; effectiveDate?: string } = {},
): Promise<void> {
  const { error } = await client.rpc('purchase_request_transition', {
    p_request_id: requestId,
    p_action: action,
    p_comment: options.comment?.trim() || null,
    p_effective_date: options.effectiveDate || null,
  });
  if (error) throw error;
}
