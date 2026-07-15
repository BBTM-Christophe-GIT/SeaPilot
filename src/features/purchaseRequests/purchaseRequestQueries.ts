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
  'amount_ht',
  'currency',
  'status',
  'description',
  'source_label',
].join(', ');

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
  amount_ht: number | string | null;
  currency: string | null;
  status: string | null;
  description: string | null;
  source_label: string | null;
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
  amountHt: number;
  currency: string;
  status: string;
  description: string;
  sourceLabel: string;
}

export interface PurchaseRequestMetrics {
  requestCount: number;
  openRequestCount: number;
  totalAmountHt: number;
  supplierCount: number;
}

export interface CreatePurchaseRequestInput {
  requestNumber: string;
  title: string;
  requestedOn: string;
  requesterName: string;
  supplierName: string;
  projectId: number | null;
  projectCode: string;
  projectTitle: string;
  amountHt: string;
  currency: string;
  status: string;
  description: string;
}

function nullableText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    throw new Error('Le montant HT est invalide.');
  }

  return parsed;
}

function normalizeStatus(status: string): string {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isOpenRequest(request: PurchaseRequestRecord): boolean {
  const status = normalizeStatus(request.status);

  return !status.includes('recu') && !status.includes('annule') && !status.includes('cloture') && !status.includes('facture');
}

export function mapPurchaseRequestRows(rows: PurchaseRequestRow[]): PurchaseRequestRecord[] {
  return rows.map((row) => ({
    id: row.id,
    amountHt: normalizeNumber(row.amount_ht),
    currency: nullableText(row.currency) || 'EUR',
    description: nullableText(row.description),
    projectCode: nullableText(row.project_code),
    projectId: row.project_id,
    projectSharePointItemId: nullableText(row.project_sharepoint_item_id),
    projectTitle: nullableText(row.project_title),
    requestedOn: nullableText(row.requested_on),
    requesterName: nullableText(row.requester_name),
    requestNumber: nullableText(row.request_number),
    sourceLabel: nullableText(row.source_label),
    status: nullableText(row.status),
    supplierName: nullableText(row.supplier_name),
    title: row.title,
  }));
}

export function buildPurchaseRequestMetrics(requests: PurchaseRequestRecord[]): PurchaseRequestMetrics {
  return {
    openRequestCount: requests.filter(isOpenRequest).length,
    requestCount: requests.length,
    supplierCount: new Set(requests.map((request) => request.supplierName).filter(Boolean)).size,
    totalAmountHt: requests.reduce((total, request) => total + request.amountHt, 0),
  };
}

export async function fetchPurchaseRequests(client: SupabaseClient): Promise<PurchaseRequestRecord[]> {
  const { data, error } = await client
    .from('purchase_requests')
    .select(PURCHASE_REQUEST_SELECT)
    .order('requested_on', { ascending: false, nullsFirst: false })
    .order('request_number', { ascending: true });

  if (error) {
    throw error;
  }

  return mapPurchaseRequestRows((data || []) as unknown as PurchaseRequestRow[]);
}

export async function createPurchaseRequest(
  client: SupabaseClient,
  input: CreatePurchaseRequestInput,
): Promise<PurchaseRequestRecord> {
  const title = input.title.trim() || input.requestNumber.trim();

  if (!title) {
    throw new Error("Le titre de la demande d'achat est obligatoire.");
  }

  const payload = {
    request_number: optionalText(input.requestNumber),
    title,
    requested_on: optionalText(input.requestedOn),
    requester_name: optionalText(input.requesterName),
    supplier_name: optionalText(input.supplierName),
    project_id: input.projectId,
    project_code: optionalText(input.projectCode),
    project_title: optionalText(input.projectTitle),
    amount_ht: optionalNumber(input.amountHt),
    currency: optionalText(input.currency) || 'EUR',
    status: optionalText(input.status),
    description: optionalText(input.description),
    source_label: 'seapilot',
  };
  const { data, error } = await client.from('purchase_requests').insert(payload).select(PURCHASE_REQUEST_SELECT).single();

  if (error) {
    throw error;
  }

  return mapPurchaseRequestRows([data as unknown as PurchaseRequestRow])[0];
}
