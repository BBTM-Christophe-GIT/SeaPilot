import { projectDriveStorage } from './projectDriveStorage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectContractRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
} from './projectQueries';

export type BillingExpenseCategory = 'fuel' | 'port' | 'water' | 'other';
export type BillingServiceCategory = string;
export type BillingPeriodMode = 'calendar-month' | 'custom';

export interface ProjectBillingPeriod {
  id: number;
  projectId: number;
  companyId: number;
  periodMonth: string;
  clientReference: string;
  invoiceNumber: string;
  invoiceIssuedOn: string;
  invoiceSentOn: string;
  paymentDueOn: string;
  paidOn: string;
  amountHt: number;
  comments: string;
  includeOperationsInPdf?: boolean;
  includeExpensesInPdf?: boolean;
  includeBbtmInPdf?: boolean;
  includeRawInPdf?: boolean;
  excludedOperationKeys?: string[];
}

export interface ProjectChargeableExpense {
  id: number;
  billingPeriodId: number;
  category: BillingExpenseCategory;
  nature: string;
  supplier: string;
  supplierSpecialties: string[];
  invoiceDate: string;
  invoiceNumber: string;
  amountHt: number;
  amountTtc: number | null;
  currency: string;
  quantity: number | null;
  unit: string;
  comments: string;
  dprReportId: number | null;
  includeInPdf?: boolean;
}

export interface ProjectBillingDocument {
  id: number;
  billingPeriodId: number | null;
  chargeableExpenseId: number | null;
  documentKind: 'client_invoice' | 'chargeable_expense' | 'export';
  bucketName: string;
  objectPath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface ProjectBillingService {
  id: number;
  billingPeriodId: number;
  serviceCatalogId: number | null;
  category: BillingServiceCategory;
  descriptionHtml: string;
  unitAmountHt: number;
  quantity: number;
  includeInPdf?: boolean;
}

export interface ProjectBillingRawLine {
  id: number;
  billingPeriodId: number;
  serviceCatalogId: number | null;
  vesselId?: number | null;
  vesselName?: string;
  serviceDate: string;
  designation: string;
  unitAmountHt: number;
  quantity: number;
  includeInPdf?: boolean;
}

export interface ProjectServiceCatalogEntry {
  id: number;
  companyId: number;
  vesselId?: number | null;
  vesselName?: string;
  category: string;
  unitAmountHt: number;
  descriptionHtml: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBillingData {
  periods: ProjectBillingPeriod[];
  expenses: ProjectChargeableExpense[];
  documents: ProjectBillingDocument[];
  services: ProjectBillingService[];
  rawLines?: ProjectBillingRawLine[];
}

export interface BillingPeriodDraft {
  periodMonth: string;
  clientReference: string;
  invoiceNumber: string;
  invoiceIssuedOn: string;
  invoiceSentOn: string;
  paymentDueOn: string;
  paidOn: string;
  amountHt: number;
  comments: string;
  includeOperationsInPdf: boolean;
  includeExpensesInPdf: boolean;
  includeBbtmInPdf: boolean;
  includeRawInPdf?: boolean;
  excludedOperationKeys: string[];
}

export interface BillingExpenseDraft {
  category: BillingExpenseCategory;
  nature: string;
  supplier: string;
  supplierSpecialties: string[];
  invoiceDate: string;
  invoiceNumber: string;
  amountHt: number;
  amountTtc: number | null;
  currency: string;
  quantity: number | null;
  unit: string;
  comments: string;
  dprReportId: number | null;
}

export interface BillingServiceDraft {
  serviceCatalogId: number | null;
  category: BillingServiceCategory;
  descriptionHtml: string;
  unitAmountHt: number;
  quantity: number;
}

export interface BillingRawLineDraft {
  serviceCatalogId: number | null;
  vesselId?: number | null;
  vesselName?: string;
  serviceDate: string;
  designation: string;
  unitAmountHt: number;
  quantity: number;
  includeInPdf?: boolean;
}

export interface ProjectServiceCatalogDraft {
  id?: number;
  vesselId?: number | null;
  vesselName?: string;
  category: string;
  unitAmountHt: number;
  descriptionHtml: string;
  active?: boolean;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : number(value);
}

export function billingExpenseSpecialtyLabel(expense: Pick<ProjectChargeableExpense, 'supplierSpecialties' | 'nature' | 'category'>): string {
  if (expense.supplierSpecialties.length) return expense.supplierSpecialties.join(' · ');
  if (expense.nature.trim()) return expense.nature.trim();
  return ({ fuel: 'Gasoil', port: 'Frais de port', water: 'Eau', other: 'Non renseignée' } as const)[expense.category];
}

function mapPeriod(row: Record<string, unknown>): ProjectBillingPeriod {
  return {
    id: number(row.id),
    projectId: number(row.project_id),
    companyId: number(row.company_id),
    periodMonth: text(row.period_month),
    clientReference: text(row.client_reference),
    invoiceNumber: text(row.invoice_number),
    invoiceIssuedOn: text(row.invoice_issued_on),
    invoiceSentOn: text(row.invoice_sent_on),
    paymentDueOn: text(row.payment_due_on),
    paidOn: text(row.paid_on),
    amountHt: number(row.amount_ht),
    comments: text(row.comments),
    includeOperationsInPdf: row.include_operations_in_pdf !== false,
    includeExpensesInPdf: row.include_expenses_in_pdf !== false,
    includeBbtmInPdf: row.include_bbtm_in_pdf !== false,
    includeRawInPdf: row.include_raw_in_pdf !== false,
    excludedOperationKeys: Array.isArray(row.excluded_operation_keys)
      ? row.excluded_operation_keys.map(String)
      : [],
  };
}

function mapExpense(row: Record<string, unknown>): ProjectChargeableExpense {
  return {
    id: number(row.id),
    billingPeriodId: number(row.billing_period_id),
    category: text(row.category) as BillingExpenseCategory,
    nature: text(row.nature),
    supplier: text(row.supplier),
    supplierSpecialties: Array.isArray(row.supplier_specialties) ? row.supplier_specialties.map(String).filter(Boolean) : [],
    invoiceDate: text(row.invoice_date),
    invoiceNumber: text(row.invoice_number),
    amountHt: number(row.amount_ht),
    amountTtc: nullableNumber(row.amount_ttc),
    currency: text(row.currency) || 'EUR',
    quantity: nullableNumber(row.quantity),
    unit: text(row.unit),
    comments: text(row.comments),
    dprReportId: nullableNumber(row.dpr_report_id),
    includeInPdf: row.include_in_pdf !== false,
  };
}

function mapDocument(row: Record<string, unknown>): ProjectBillingDocument {
  return {
    id: number(row.id),
    billingPeriodId: nullableNumber(row.billing_period_id),
    chargeableExpenseId: nullableNumber(row.chargeable_expense_id),
    documentKind: text(row.document_kind) as ProjectBillingDocument['documentKind'],
    bucketName: text(row.bucket_name),
    objectPath: text(row.object_path),
    fileName: text(row.file_name),
    mimeType: text(row.mime_type),
    fileSizeBytes: number(row.file_size_bytes),
  };
}

function mapService(row: Record<string, unknown>): ProjectBillingService {
  return {
    id: number(row.id),
    billingPeriodId: number(row.billing_period_id),
    serviceCatalogId: nullableNumber(row.service_catalog_id),
    category: text(row.category) as BillingServiceCategory,
    descriptionHtml: text(row.description_html),
    unitAmountHt: number(row.unit_amount_ht),
    quantity: number(row.quantity),
    includeInPdf: row.include_in_pdf !== false,
  };
}

function mapRawLine(row: Record<string, unknown>): ProjectBillingRawLine {
  return {
    id: number(row.id),
    billingPeriodId: number(row.billing_period_id),
    serviceCatalogId: nullableNumber(row.service_catalog_id),
    vesselId: nullableNumber(row.vessel_id),
    vesselName: text(row.vessel_name),
    serviceDate: text(row.service_date),
    designation: text(row.designation),
    unitAmountHt: number(row.unit_amount_ht),
    quantity: number(row.quantity),
    includeInPdf: row.include_in_pdf !== false,
  };
}

function mapServiceCatalogEntry(row: Record<string, unknown>): ProjectServiceCatalogEntry {
  return {
    id: number(row.id),
    companyId: number(row.company_id),
    vesselId: nullableNumber(row.vessel_id),
    vesselName: text(row.vessel_name),
    category: text(row.category),
    unitAmountHt: number(row.unit_amount_ht),
    descriptionHtml: text(row.description_html),
    active: row.active !== false,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function fetchProjectServiceCatalog(
  client: SupabaseClient,
  includeInactive = false,
): Promise<ProjectServiceCatalogEntry[]> {
  let query = client.from('project_service_catalog').select('*').order('category');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => mapServiceCatalogEntry(row as Record<string, unknown>));
}

export async function saveProjectServiceCatalogEntry(
  client: SupabaseClient,
  draft: ProjectServiceCatalogDraft,
): Promise<ProjectServiceCatalogEntry> {
  const payload = {
    category: draft.category.trim(),
    vessel_id: draft.vesselId ?? null,
    vessel_name: draft.vesselName?.trim() || '',
    unit_amount_ht: draft.unitAmountHt,
    description_html: draft.descriptionHtml,
    active: draft.active !== false,
    updated_at: new Date().toISOString(),
  };
  const query = draft.id
    ? client.from('project_service_catalog').update(payload).eq('id', draft.id)
    : client.from('project_service_catalog').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapServiceCatalogEntry(data as Record<string, unknown>);
}

export async function archiveProjectServiceCatalogEntry(client: SupabaseClient, id: number): Promise<void> {
  const { error } = await client
    .from('project_service_catalog')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function projectCompanyId(client: SupabaseClient, projectId: number): Promise<number> {
  const { data, error } = await client.from('projects').select('company_id').eq('id', projectId).single();
  if (error) throw error;
  return number(data?.company_id);
}

export async function fetchProjectBillingData(client: SupabaseClient, projectId: number): Promise<ProjectBillingData> {
  const [periodResult, expenseResult, documentResult, serviceResult, rawLines] = await Promise.all([
    client.from('project_billing_periods').select('*').eq('project_id', projectId).order('period_month', { ascending: false }),
    client.from('project_chargeable_expenses').select('*').eq('project_id', projectId).order('invoice_date', { ascending: false }),
    client.from('project_billing_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    client.from('project_billing_services').select('*').eq('project_id', projectId).order('created_at'),
    fetchProjectBillingRawLines(client, projectId),
  ]);
  if (periodResult.error) throw periodResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (documentResult.error) throw documentResult.error;
  if (serviceResult.error) throw serviceResult.error;
  return {
    periods: (periodResult.data || []).map((row) => mapPeriod(row as Record<string, unknown>)),
    expenses: (expenseResult.data || []).map((row) => mapExpense(row as Record<string, unknown>)),
    documents: (documentResult.data || []).map((row) => mapDocument(row as Record<string, unknown>)),
    services: (serviceResult.data || []).map((row) => mapService(row as Record<string, unknown>)),
    rawLines,
  };
}

async function fetchProjectBillingRawLines(client: SupabaseClient, projectId: number): Promise<ProjectBillingRawLine[]> {
  const rawLines: ProjectBillingRawLine[] = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    // PostgREST caps each response at 1,000 rows. Stable ordering preserves every line across pages.
    const { data, error } = await client.from('project_billing_raw_lines')
      .select('*')
      .eq('project_id', projectId)
      .order('service_date')
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rawLines.push(...(data || []).map((row) => mapRawLine(row as Record<string, unknown>)));
    if (!data || data.length < pageSize) return rawLines;
  }
}

export async function saveProjectBillingPeriod(
  client: SupabaseClient,
  projectId: number,
  draft: BillingPeriodDraft,
): Promise<ProjectBillingPeriod> {
  const companyId = await projectCompanyId(client, projectId);
  const payload = {
    company_id: companyId,
    project_id: projectId,
    period_month: `${draft.periodMonth.slice(0, 7)}-01`,
    client_reference: draft.clientReference.trim() || null,
    invoice_number: draft.invoiceNumber.trim() || null,
    invoice_issued_on: draft.invoiceIssuedOn || null,
    invoice_sent_on: draft.invoiceSentOn || null,
    payment_due_on: draft.paymentDueOn || null,
    paid_on: draft.paidOn || null,
    amount_ht: draft.amountHt || 0,
    comments: draft.comments.trim() || null,
    include_operations_in_pdf: draft.includeOperationsInPdf,
    include_expenses_in_pdf: draft.includeExpensesInPdf,
    include_bbtm_in_pdf: draft.includeBbtmInPdf,
    include_raw_in_pdf: draft.includeRawInPdf !== false,
    excluded_operation_keys: draft.excludedOperationKeys,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('project_billing_periods')
    .upsert(payload, { onConflict: 'company_id,project_id,period_month' })
    .select('*')
    .single();
  if (error) throw error;
  return mapPeriod(data as Record<string, unknown>);
}

export async function ensureProjectBillingPeriod(
  client: SupabaseClient,
  projectId: number,
  draft: BillingPeriodDraft,
): Promise<ProjectBillingPeriod> {
  const companyId = await projectCompanyId(client, projectId);
  const periodMonth = `${draft.periodMonth.slice(0, 7)}-01`;
  const readPeriod = () => client
    .from('project_billing_periods')
    .select('*')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .eq('period_month', periodMonth);
  const { data: existing, error: readError } = await readPeriod().maybeSingle();
  if (readError) throw readError;
  if (existing) return mapPeriod(existing as Record<string, unknown>);

  // Another session may create this month after our read. Never replace its invoice or PDF choices.
  const { error: insertError } = await client.from('project_billing_periods').upsert({
    company_id: companyId,
    project_id: projectId,
    period_month: periodMonth,
    client_reference: draft.clientReference.trim() || null,
    invoice_number: draft.invoiceNumber.trim() || null,
    invoice_issued_on: draft.invoiceIssuedOn || null,
    invoice_sent_on: draft.invoiceSentOn || null,
    payment_due_on: draft.paymentDueOn || null,
    paid_on: draft.paidOn || null,
    amount_ht: draft.amountHt || 0,
    comments: draft.comments.trim() || null,
    include_operations_in_pdf: draft.includeOperationsInPdf,
    include_expenses_in_pdf: draft.includeExpensesInPdf,
    include_bbtm_in_pdf: draft.includeBbtmInPdf,
    include_raw_in_pdf: draft.includeRawInPdf !== false,
    excluded_operation_keys: draft.excludedOperationKeys,
  }, { onConflict: 'company_id,project_id,period_month', ignoreDuplicates: true });
  if (insertError) throw insertError;

  // A separate read also returns the winning row when the insert was ignored on conflict.
  const { data: saved, error: savedError } = await readPeriod().single();
  if (savedError) throw savedError;
  return mapPeriod(saved as Record<string, unknown>);
}

export async function saveProjectChargeableExpense(
  client: SupabaseClient,
  projectId: number,
  billingPeriodId: number,
  draft: BillingExpenseDraft,
  expenseId?: number,
): Promise<ProjectChargeableExpense> {
  const companyId = await projectCompanyId(client, projectId);
  const payload = {
    company_id: companyId,
    project_id: projectId,
    billing_period_id: billingPeriodId,
    category: draft.category,
    nature: draft.category === 'other' ? draft.nature.trim() : null,
    supplier: draft.supplier.trim(),
    supplier_specialties: draft.supplierSpecialties,
    invoice_date: draft.invoiceDate,
    invoice_number: draft.invoiceNumber.trim() || null,
    amount_ht: draft.amountHt,
    amount_ttc: draft.amountTtc,
    currency: draft.currency.trim().toUpperCase() || 'EUR',
    quantity: draft.quantity,
    unit: draft.unit.trim() || null,
    comments: draft.comments.trim() || null,
    chargeable: true,
    included_in_client_invoice: false,
    dpr_report_id: draft.dprReportId,
    updated_at: new Date().toISOString(),
  };
  const query = expenseId
    ? client.from('project_chargeable_expenses').update(payload).eq('id', expenseId)
    : client.from('project_chargeable_expenses').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapExpense(data as Record<string, unknown>);
}

export async function deleteProjectChargeableExpense(client: SupabaseClient, expenseId: number): Promise<void> {
  const { error } = await client.from('project_chargeable_expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function setProjectChargeableExpensePdfInclusion(
  client: SupabaseClient,
  expenseId: number,
  includeInPdf: boolean,
): Promise<void> {
  const { error } = await client
    .from('project_chargeable_expenses')
    .update({ include_in_pdf: includeInPdf, updated_at: new Date().toISOString() })
    .eq('id', expenseId);
  if (error) throw error;
}

export async function saveProjectBillingService(
  client: SupabaseClient,
  projectId: number,
  billingPeriodId: number,
  draft: BillingServiceDraft,
  serviceId?: number,
): Promise<ProjectBillingService> {
  const companyId = await projectCompanyId(client, projectId);
  const payload = {
    company_id: companyId,
    project_id: projectId,
    billing_period_id: billingPeriodId,
    service_catalog_id: draft.serviceCatalogId,
    category: draft.category.trim(),
    description_html: draft.descriptionHtml,
    unit_amount_ht: draft.unitAmountHt,
    quantity: draft.quantity,
    updated_at: new Date().toISOString(),
  };
  const query = serviceId
    ? client.from('project_billing_services').update(payload).eq('id', serviceId)
    : client.from('project_billing_services').insert(payload);
  const { data, error } = await query
    .select('*')
    .single();
  if (error) throw error;
  return mapService(data as Record<string, unknown>);
}

export async function deleteProjectBillingService(client: SupabaseClient, serviceId: number): Promise<void> {
  const { error } = await client.from('project_billing_services').delete().eq('id', serviceId);
  if (error) throw error;
}

export async function setProjectBillingServicePdfInclusion(
  client: SupabaseClient,
  serviceId: number,
  includeInPdf: boolean,
): Promise<void> {
  const { error } = await client
    .from('project_billing_services')
    .update({ include_in_pdf: includeInPdf, updated_at: new Date().toISOString() })
    .eq('id', serviceId);
  if (error) throw error;
}

export async function saveProjectBillingRawLine(
  client: SupabaseClient,
  projectId: number,
  billingPeriodId: number,
  draft: BillingRawLineDraft,
  rawLineId?: number,
): Promise<ProjectBillingRawLine> {
  const companyId = await projectCompanyId(client, projectId);
  const payload = {
    company_id: companyId,
    project_id: projectId,
    billing_period_id: billingPeriodId,
    service_catalog_id: draft.serviceCatalogId,
    service_date: draft.serviceDate,
    designation: draft.designation.trim(),
    vessel_id: draft.vesselId ?? null,
    vessel_name: draft.vesselName?.trim() || '',
    unit_amount_ht: draft.unitAmountHt,
    quantity: draft.quantity,
    include_in_pdf: true,
    updated_at: new Date().toISOString(),
  };
  const query = rawLineId
    ? client.from('project_billing_raw_lines').update(payload).eq('id', rawLineId)
    : client.from('project_billing_raw_lines').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapRawLine(data as Record<string, unknown>);
}

export async function deleteProjectBillingRawLine(client: SupabaseClient, rawLineId: number): Promise<void> {
  const { error } = await client.from('project_billing_raw_lines').delete().eq('id', rawLineId);
  if (error) throw error;
}

export async function setProjectBillingRawLinePdfInclusion(
  client: SupabaseClient,
  rawLineId: number,
  includeInPdf: boolean,
): Promise<void> {
  const { error } = await client.from('project_billing_raw_lines')
    .update({ include_in_pdf: includeInPdf, updated_at: new Date().toISOString() })
    .eq('id', rawLineId);
  if (error) throw error;
}

export async function saveProjectBillingPdfSelection(
  client: SupabaseClient,
  periodId: number,
  selection: Required<Pick<ProjectBillingPeriod,
    'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'excludedOperationKeys'>>
    & Pick<ProjectBillingPeriod, 'includeRawInPdf'>,
): Promise<void> {
  const { error } = await client
    .from('project_billing_periods')
    .update({
      include_operations_in_pdf: selection.includeOperationsInPdf,
      include_expenses_in_pdf: selection.includeExpensesInPdf,
      include_bbtm_in_pdf: selection.includeBbtmInPdf,
      include_raw_in_pdf: selection.includeRawInPdf !== false,
      excluded_operation_keys: selection.excludedOperationKeys,
      updated_at: new Date().toISOString(),
    })
    .eq('id', periodId);
  if (error) throw error;
}

export function billingExpenseAttachmentName(file: File, expense: ProjectChargeableExpense): File {
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  const categoryLabels: Record<BillingExpenseCategory, string> = {
    fuel: 'Gasoil',
    port: 'Frais de port',
    water: 'Eau',
    other: expense.nature || 'Autre',
  };
  const invoice = expense.invoiceNumber.trim() || 'sans facture';
  const name = `${expense.invoiceDate} - ${invoice} - ${categoryLabels[expense.category]}${extension}`;
  return new File([file], name, { type: file.type, lastModified: file.lastModified });
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

export async function uploadProjectBillingDocument(
  client: SupabaseClient,
  input: {
    projectId: number;
    billingPeriodId: number;
    expenseId?: number;
    file: File;
    kind: ProjectBillingDocument['documentKind'];
  },
): Promise<ProjectBillingDocument> {
  const companyId = await projectCompanyId(client, input.projectId);
  const objectPath = [
    'projects',
    input.projectId,
    input.billingPeriodId,
    input.expenseId ? `expenses/${input.expenseId}` : input.kind,
    `${crypto.randomUUID()}-${safeFileName(input.file.name)}`,
  ].join('/');
  const { error: uploadError } = await projectDriveStorage(client, 'project-files').upload(objectPath, input.file, {
    cacheControl: '3600',
    contentType: input.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadError) throw uploadError;
  const { data, error } = await client.from('project_billing_documents').insert({
    company_id: companyId,
    project_id: input.projectId,
    billing_period_id: input.billingPeriodId,
    chargeable_expense_id: input.expenseId || null,
    document_kind: input.kind,
    bucket_name: 'project-files',
    object_path: objectPath,
    file_name: input.file.name,
    mime_type: input.file.type || 'application/octet-stream',
    file_size_bytes: input.file.size,
  }).select('*').single();
  if (error) {
    await projectDriveStorage(client, 'project-files').remove([objectPath]);
    throw error;
  }
  return mapDocument(data as Record<string, unknown>);
}

export async function signedProjectBillingDocumentUrl(
  client: SupabaseClient,
  document: ProjectBillingDocument,
): Promise<string> {
  const { data, error } = await projectDriveStorage(client, document.bucketName).createSignedUrl(document.objectPath, 120);
  if (error) throw error;
  return data.signedUrl;
}

export interface BillingExportInput {
  project: ProjectRecord;
  contract?: ProjectContractRecord;
  operations: ProjectPlanningOccurrenceRecord[];
  period: ProjectBillingPeriod;
  expenses: ProjectChargeableExpense[];
  services: ProjectBillingService[];
  rawLines?: ProjectBillingRawLine[];
  includeBbtmService?: boolean;
  dprs: ProjectBillingDpr[];
  /** Full-month DPRs when the visible/exported range is shorter than the billing month. */
  monthlyDprs?: ProjectBillingDpr[];
  selectedVesselName: string;
  startDate: string;
  endDate: string;
}

export interface ProjectBillingDpr {
  id: number;
  reportDate: string;
  vesselId: number | null;
  vesselName: string;
  operation: string;
  amountHt: number | null;
  vesselStatus: string;
  arrivalAt: string;
  departureAt: string;
  fuelLiters: number | null;
}

export interface BillingOperationRow {
  date: string;
  operation: string;
  amountHt: number;
  comments: string;
}

export function billingOperationKey(dpr: Pick<ProjectBillingDpr, 'id' | 'reportDate' | 'vesselName'>): string {
  return dpr.id > 0 ? `dpr:${dpr.id}` : `date:${dpr.reportDate}:${dpr.vesselName.trim().toLocaleUpperCase('fr-FR')}`;
}

export function defaultProjectClientReference(project: Pick<ProjectRecord, 'projectCode'>): string {
  return project.projectCode.trim().toUpperCase() === 'P144' ? 'TRE-PO-000503' : '';
}

function dateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function missingBillingDates(dprs: ProjectBillingDpr[], startDate: string, endDate: string): string[] {
  const coveredDates = new Set(dprs.map((dpr) => dpr.reportDate));
  return dateRange(startDate, endDate).filter((date) => !coveredDates.has(date));
}

export function completeBillingDprs(
  dprs: ProjectBillingDpr[],
  startDate: string,
  endDate: string,
  input: { vesselName: string; amountHt: number | null },
): ProjectBillingDpr[] {
  const synthetic = missingBillingDates(dprs, startDate, endDate).map((reportDate, index) => ({
    id: -(index + 1),
    reportDate,
    vesselId: null,
    vesselName: input.vesselName,
    operation: '24/24 Operation',
    amountHt: input.amountHt,
    vesselStatus: '',
    arrivalAt: '',
    departureAt: '',
    fuelLiters: null,
  }));
  return [...dprs, ...synthetic].sort(
    (left, right) => left.reportDate.localeCompare(right.reportDate) || left.id - right.id,
  );
}

export function countDailyOperations(dprs: ProjectBillingDpr[]): number {
  return new Set(dprs.filter((dpr) => /^(24\/24 )?(OPERATION|CREW CHANGE)$/.test(dpr.operation.trim().replace(/\s+/g, ' ').toUpperCase()))
    .map((dpr) => `${dpr.vesselId ?? dpr.vesselName}|${dpr.reportDate}`)).size;
}

export function automaticBillingServiceQuantity(
  project: Pick<ProjectRecord, 'projectCode'>,
  category: string,
  periodMonth: string,
  dprs: Pick<ProjectBillingDpr, 'reportDate' | 'operation'>[],
): number | null {
  const normalizedCategory = category.trim().replace(/[_\s]+/g, ' ').toUpperCase();
  if (project.projectCode.trim().toUpperCase() !== 'P144' || normalizedCategory !== 'SPREAD ANTIPOLLUTION') return null;
  const month = periodMonth.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  if (!/^\d{4}-\d{2}$/.test(month) || monthNumber < 1 || monthNumber > 12) throw new Error('Le mois de facturation est invalide.');
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const lastDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const weatherStandbyDays = new Set(dprs.filter((dpr) => (
    dpr.reportDate >= `${month}-01` && dpr.reportDate <= lastDate
    && dpr.operation.trim().replace(/\s+/g, ' ').toUpperCase() === '24/24 WEATHER STAND-BY'
  )).map((dpr) => dpr.reportDate));
  return daysInMonth - weatherStandbyDays.size;
}

export function billingExportServices(input: BillingExportInput): ProjectBillingService[] {
  if (input.period.includeBbtmInPdf === false || input.includeBbtmService === false) return [];
  return input.services.filter((service) => service.includeInPdf !== false).map((service) => ({
    ...service,
    quantity: automaticBillingServiceQuantity(input.project, service.category, input.period.periodMonth, input.monthlyDprs ?? input.dprs) ?? service.quantity,
  }));
}

export function billingServicesTotal(services: ProjectBillingService[]): number {
  return services.reduce((sum, service) => sum + service.unitAmountHt * service.quantity, 0);
}

export function billingExportRawLines(input: BillingExportInput): ProjectBillingRawLine[] {
  if (input.period.includeRawInPdf === false) return [];
  return [...(input.rawLines || [])]
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate) || left.id - right.id);
}

function billingRawLineCents(line: Pick<ProjectBillingRawLine, 'unitAmountHt' | 'quantity'>): bigint {
  if (![line.unitAmountHt, line.quantity].every((value) => Number.isFinite(value) && value >= 0 && value < 1e21)) return 0n;
  const unitCents = BigInt(line.unitAmountHt.toFixed(2).replace('.', ''));
  const quantityThousandths = BigInt(line.quantity.toFixed(3).replace('.', ''));
  // Round each displayed line to cents before adding it to the invoice.
  return (unitCents * quantityThousandths + 500n) / 1_000n;
}

export function billingRawLineTotal(line: Pick<ProjectBillingRawLine, 'unitAmountHt' | 'quantity'>): number {
  return Number(billingRawLineCents(line)) / 100;
}

export function billingRawLinesTotal(rawLines: ProjectBillingRawLine[]): number {
  const cents = rawLines.reduce((sum, line) => sum + billingRawLineCents(line), 0n);
  return Number(cents) / 100;
}

export function billingInvoiceTotal(
  hiresTotal: number,
  expenseTotal: number,
  services: ProjectBillingService[],
  includeBbtmService: boolean,
  rawLines: ProjectBillingRawLine[] = [],
  includeRaw = true,
): number {
  const total = hiresTotal + expenseTotal + (includeBbtmService ? billingServicesTotal(services) : 0)
    + (includeRaw ? billingRawLinesTotal(rawLines) : 0);
  return Number(total.toFixed(2));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function firstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  const value = firstText(source, keys);
  if (!value) return null;
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function addUtcOffset(value: string, hours = 2): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setTime(date.getTime() + hours * 60 * 60 * 1_000);
  return `${String(date.getUTCHours()).padStart(2, '0')}h${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00Z`));
}

function formatWholeNumber(value: number): string {
  return Math.round(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, ' ');
}

function cubicMetersToLiters(value: number): number {
  return Math.round(value * 1_000);
}

function singleLineBillingOperation(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function resolveBillingDprOperation(sourceOperation: string, reasonKeys: string[]): string {
  const operation = singleLineBillingOperation(sourceOperation);
  if (operation) return operation;
  const normalizedReasons = new Set(reasonKeys.map((reason) => reason.trim().toLowerCase()));
  if (normalizedReasons.has('crew-change')) return '24/24 Crew Change';
  if (normalizedReasons.has('weather-standby')) return '24/24 Weather Stand-by';
  return '24/24 Operation';
}

export function billingDprComment(
  dpr: Pick<ProjectBillingDpr, 'operation' | 'vesselStatus' | 'arrivalAt' | 'departureAt' | 'fuelLiters'>,
): string {
  const operation = dpr.operation.trim().toUpperCase();
  const isSpecialOperation = operation === '24/24 CREW CHANGE'
    || operation === '24/24 WEATHER STAND-BY'
    || operation === 'CONTRACTUAL MAINTENANCE DAY';
  const arrival = dpr.arrivalAt ? `Accosté au port à ${addUtcOffset(dpr.arrivalAt)}` : '';
  const departure = dpr.departureAt ? `Appareillage du quai à ${addUtcOffset(dpr.departureAt)}` : '';
  const refueling = dpr.fuelLiters && dpr.fuelLiters > 0
    ? `Refueling : ${formatWholeNumber(dpr.fuelLiters)} L`
    : '';
  if (!isSpecialOperation) return refueling;
  return [arrival, refueling, departure].filter(Boolean).join('\n');
}

export async function fetchProjectBillingDprs(
  client: SupabaseClient,
  projectId: number,
  startDate: string,
  endDate: string,
  vesselName = '',
): Promise<ProjectBillingDpr[]> {
  const reportResult = await client
    .from('dpr_reports')
    .select('id,report_date,vessel_id,description,source_payload')
    .eq('project_id', projectId)
    .gte('report_date', startDate)
    .lte('report_date', endDate)
    .is('deleted_at', null)
    .order('report_date')
    .order('id');
  if (reportResult.error) throw reportResult.error;
  const reports = (reportResult.data || []) as Array<Record<string, unknown>>;
  if (!reports.length) return [];

  const reportIds = reports.map((row) => number(row.id));
  const vesselIds = Array.from(new Set(
    reports.map((row) => nullableNumber(row.vessel_id)).filter((id): id is number => id !== null),
  ));
  const [callResult, supplyResult, vesselResult] = await Promise.all([
    client.from('dpr_port_calls').select('dpr_id,arrival_at,departure_at,display_order,dpr_port_call_reasons(reason_type_key)').in('dpr_id', reportIds).order('display_order'),
    client.from('dpr_supplies').select('dpr_id,fuel_m3').in('dpr_id', reportIds),
    vesselIds.length
      ? client.from('vessels').select('id,name').in('id', vesselIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (callResult.error) throw callResult.error;
  if (supplyResult.error) throw supplyResult.error;
  if (vesselResult.error) throw vesselResult.error;

  const calls = new Map<number, Array<Record<string, unknown>>>();
  ((callResult.data || []) as Array<Record<string, unknown>>).forEach((row) => {
    const id = number(row.dpr_id);
    calls.set(id, [...(calls.get(id) || []), row]);
  });
  const supplies = new Map(
    ((supplyResult.data || []) as Array<Record<string, unknown>>).map((row) => [
      number(row.dpr_id),
      nullableNumber(row.fuel_m3),
    ]),
  );
  const vessels = new Map(
    ((vesselResult.data || []) as Array<Record<string, unknown>>).map((row) => [number(row.id), text(row.name)]),
  );

  return reports.flatMap((row) => {
    const id = number(row.id);
    const source = record(row.source_payload);
    const vesselId = nullableNumber(row.vessel_id);
    const resolvedVesselName = vesselId ? vessels.get(vesselId) || '' : '';
    if (vesselName && resolvedVesselName !== vesselName) return [];
    const reportCalls = calls.get(id) || [];
    const arrivalAt = firstText(source, ['Heure_x002d_NavireAccost_x00e9_a'])
      || text(reportCalls.find((call) => call.arrival_at)?.arrival_at);
    const departureAt = firstText(source, ['Heure_x002d_AppareillageduPort'])
      || text([...reportCalls].reverse().find((call) => call.departure_at)?.departure_at);
    const sourceFuelLiters = firstNumber(source, [
      'P144_x002d_FAC_x002d_Fuel_x0020_',
      'P144-FAC-Fuel',
    ]);
    const sourceFuelM3 = firstNumber(source, ['P144_x002d_FAC_x002d_Fuel_x0028_']);
    const supplyFuelM3 = supplies.get(id);
    const reasonKeys = reportCalls.flatMap((call) => {
      const reasons = call.dpr_port_call_reasons;
      if (!Array.isArray(reasons)) return [];
      return reasons
        .map((reason) => firstText(record(reason), ['reason_type_key']))
        .filter(Boolean);
    });
    return [{
      id,
      reportDate: text(row.report_date),
      vesselId,
      vesselName: resolvedVesselName,
      operation: resolveBillingDprOperation(
        firstText(source, ['P144_x002d_FAC_x002d_Operations', 'P144-FAC-Operations']),
        reasonKeys,
      ),
      amountHt: firstNumber(source, ['P144_x002d_FAC_x002d_Montant', 'P144_x002d_FAC_x002d_Forfait_x00']),
      vesselStatus: firstText(source, ['P144_x002d_FAC_x002d_Entr_x00e9_', 'Statut du Navire']),
      arrivalAt,
      departureAt,
      fuelLiters: supplyFuelM3 !== null && supplyFuelM3 !== undefined
        ? cubicMetersToLiters(supplyFuelM3)
        : sourceFuelLiters
          ?? (sourceFuelM3 !== null ? cubicMetersToLiters(sourceFuelM3) : null),
    }];
  });
}

export function billingOperationRows(input: BillingExportInput): BillingOperationRow[] {
  return input.dprs
    .filter((dpr) => dpr.reportDate >= input.startDate && dpr.reportDate <= input.endDate)
    .filter((dpr) => !(input.period.excludedOperationKeys || []).includes(billingOperationKey(dpr)))
    .sort((left, right) => left.reportDate.localeCompare(right.reportDate) || left.id - right.id)
    .map((dpr) => ({
      date: formatDate(dpr.reportDate),
      operation: singleLineBillingOperation(dpr.operation) || '24/24 Operation',
      amountHt: dpr.amountHt
        ?? billingApplicableHire(
          input.operations,
          input.contract,
          dpr.reportDate,
          dpr.vesselName || input.selectedVesselName,
          contractHireModeForOperation(dpr.operation),
        )
        ?? 0,
      comments: billingDprComment(dpr),
    }));
}

export type ContractHireMode = 'operation' | 'standby' | 'weather-standby';

export function contractHireModeForOperation(operation: string): ContractHireMode {
  const normalized = singleLineBillingOperation(operation).toLocaleUpperCase('fr-FR');
  if (/WEATHER\s+STAND[ -]?BY/.test(normalized) || /STAND[ -]?BY\s+M[ÉE]T[ÉE]O/.test(normalized)) {
    return 'weather-standby';
  }
  if (/STAND[ -]?BY/.test(normalized)) return 'standby';
  return 'operation';
}

export function contractHireForDate(
  contract: ProjectContractRecord | undefined,
  reportDate: string,
  mode: ContractHireMode = 'operation',
): number | null {
  const period = [...(contract?.hirePeriods || [])]
    .filter((candidate) => candidate.startsOn <= reportDate && (!candidate.endsOn || candidate.endsOn >= reportDate))
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn) || right.id - left.id)[0];
  if (!period) return contract?.charterHire ?? null;
  if (mode === 'weather-standby') return period.weatherStandbyHire ?? period.charterHire;
  if (mode === 'standby') return period.standbyHire ?? period.charterHire;
  return period.charterHire;
}

export function billingApplicableHire(
  operations: ProjectPlanningOccurrenceRecord[],
  contract: ProjectContractRecord | undefined,
  reportDate: string,
  vesselName: string,
  mode: ContractHireMode = 'operation',
): number | null {
  const normalizedVesselName = vesselName.trim().toLocaleUpperCase('fr-FR');
  const operation = operations
    .filter((candidate) => candidate.startsOn <= reportDate
      && candidate.endsOn >= reportDate
      && (!normalizedVesselName
        || (candidate.vesselNames || [candidate.primaryVesselName]).some(
          (name) => name.trim().toLocaleUpperCase('fr-FR') === normalizedVesselName,
        )))
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn) || right.id - left.id)[0];
  if (operation?.charterHireOverride === true) return operation.charterHire;
  if (operation?.charterHireOverride === undefined && mode === 'operation') {
    return operation?.charterHire ?? contractHireForDate(contract, reportDate, mode);
  }
  return contractHireForDate(contract, reportDate, mode) ?? operation?.charterHire ?? null;
}

export function billingOperationHire(
  operations: ProjectPlanningOccurrenceRecord[],
  reportDate: string,
  vesselName: string,
): number | null {
  const normalizedVesselName = vesselName.trim().toLocaleUpperCase('fr-FR');
  const matchingOperations = operations
    .filter((operation) => (
      operation.charterHire !== null
      && operation.startsOn <= reportDate
      && operation.endsOn >= reportDate
      && (
        !normalizedVesselName
        || operation.primaryVesselName.trim().toLocaleUpperCase('fr-FR') === normalizedVesselName
      )
    ))
    .sort((left, right) => (
      right.startsOn.localeCompare(left.startsOn)
      || right.id - left.id
    ));
  return matchingOperations[0]?.charterHire ?? null;
}

export async function generateBillingPdf(input: BillingExportInput): Promise<Blob> {
  const { renderBillingPdf } = await import('./projectBillingPdf');
  const currencyCode = (value: string) => value.trim().toUpperCase() || 'EUR';
  const money = (value: number, currency = 'EUR') => value
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u00a0\u202f]/g, ' ') + ' ' + (currency === 'EUR' ? '€' : currency);
  const hireCurrency = currencyCode(input.contract?.hireCurrency || 'EUR');
  const operationRows = billingOperationRows(input);
  const includeOperationAmounts = input.period.includeOperationsInPdf !== false;
  const includeExpenses = input.period.includeExpensesInPdf !== false;
  const hiresTotal = includeOperationAmounts
    ? operationRows.reduce((sum, row) => sum + row.amountHt, 0)
    : 0;
  const expenses = includeExpenses
    ? input.expenses.filter((expense) => expense.includeInPdf !== false)
    : [];
  const expenseTotals = new Map<string, number>();
  expenses.forEach((expense) => {
    const currency = currencyCode(expense.currency);
    expenseTotals.set(currency, (expenseTotals.get(currency) || 0) + expense.amountHt);
  });
  const includeBbtmService = input.period.includeBbtmInPdf !== false && input.includeBbtmService !== false;
  const services = billingExportServices(input);
  const serviceTotal = includeBbtmService ? billingServicesTotal(services) : 0;
  const rawLines = billingExportRawLines(input);
  const rawLinesTotal = billingRawLinesTotal(rawLines);
  const invoiceTotals = new Map<string, number>(expenseTotals);
  const addInvoiceAmount = (currency: string, amount: number) => {
    invoiceTotals.set(currency, (invoiceTotals.get(currency) || 0) + amount);
  };
  if (includeOperationAmounts) addInvoiceAmount(hireCurrency, hiresTotal);
  if (serviceTotal || rawLines.length) addInvoiceAmount('EUR', serviceTotal + rawLinesTotal);
  if (!invoiceTotals.size) invoiceTotals.set('EUR', 0);
  const currencyAmounts = (totals: Map<string, number>) => [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => money(Number(value.toFixed(2)), currency));
  const quantity = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
  const monthDate = new Date(input.period.periodMonth.slice(0, 7) + '-01T12:00:00');
  const formattedMonth = Number.isNaN(monthDate.getTime())
    ? input.period.periodMonth.slice(0, 7)
    : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(monthDate);
  const operationSource = operationRows.length ? operationRows : [{
    date: '—', operation: 'Aucune opération DPR sur la période', amountHt: 0, comments: '',
  }];
  return renderBillingPdf({
    documentTitle: input.project.projectCode + ' - Éléments de facturation - ' + input.period.periodMonth.slice(0, 7),
    projectLabel: input.project.projectCode + ' - ' + input.project.title,
    monthLabel: formattedMonth.charAt(0).toLocaleUpperCase('fr-FR') + formattedMonth.slice(1),
    periodLabel: 'Période : ' + formatDate(input.startDate) + ' au ' + formatDate(input.endDate),
    clientReference: input.period.clientReference || defaultProjectClientReference(input.project) || '—',
    vesselName: rawLines.length ? null : (input.selectedVesselName
      || input.dprs.find((dpr) => dpr.vesselName)?.vesselName
      || input.project.primaryVesselName || 'Non renseigné'),
    includeOperationAmounts,
    operationRows: operationSource.map((row) => [
      row.date, row.operation,
      ...(includeOperationAmounts ? [money(row.amountHt, hireCurrency)] : []),
      row.comments,
    ]),
    expenseRows: includeExpenses ? expenses.map((expense) => [
      expense.supplier, billingExpenseSpecialtyLabel(expense), formatDate(expense.invoiceDate),
      expense.invoiceNumber || '—', money(expense.amountHt, currencyCode(expense.currency)),
    ]) : null,
    serviceRows: includeBbtmService ? (services.length ? services.map((service) => [
      service.category || 'Prestation non renseignée', money(service.unitAmountHt),
      quantity(service.quantity), money(service.unitAmountHt * service.quantity),
    ]) : [['Prestation non renseignée', money(0), '0', money(0)]]) : null,
    rawRows: rawLines.map((line) => [
      formatDate(line.serviceDate), line.vesselName?.trim() || '—', line.designation,
      money(line.unitAmountHt), quantity(line.quantity), money(billingRawLineTotal(line)),
    ]),
    totals: [
      ...(includeOperationAmounts ? [{
        label: "Loyers d'Affrètement", amounts: [money(hiresTotal, hireCurrency)],
      }] : []),
      ...(includeExpenses ? [{
        label: 'Frais imputables',
        amounts: currencyAmounts(expenseTotals.size ? expenseTotals : new Map([['EUR', 0]])),
      }] : []),
      ...(includeBbtmService ? [{
        label: 'Prestations BBTM', amounts: [money(serviceTotal)],
      }] : []),
      ...(rawLines.length ? [{
        label: 'Détail des Opérations', amounts: [money(rawLinesTotal)],
      }] : []),
      { label: 'Total facture du mois HT', amounts: currencyAmounts(invoiceTotals), final: true },
    ],
  });
}

export type BillingExportFormat = 'pdf' | 'merged-pdf' | 'zip';

export async function generateBillingExportPackage(
  client: SupabaseClient,
  input: BillingExportInput,
  documents: ProjectBillingDocument[],
  format: BillingExportFormat,
): Promise<{ blob: Blob; extension: 'pdf' | 'zip' }> {
  const summary = await generateBillingPdf(input);
  if (format === 'pdf') return { blob: summary, extension: 'pdf' };

  const includedExpenses = new Set(input.expenses.filter((expense) => expense.includeInPdf !== false).map((expense) => expense.id));
  const includedDocuments = input.period.includeExpensesInPdf === false ? [] : documents.filter((document) => document.chargeableExpenseId !== null && includedExpenses.has(document.chargeableExpenseId));
  const attachments = await Promise.all(includedDocuments.map(async (document) => {
    const { data, error } = await projectDriveStorage(client, document.bucketName).download(document.objectPath);
    if (error) throw error;
    return { document, blob: data };
  }));

  if (format === 'zip') {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('01-Elements-de-facturation.pdf', summary);
    attachments.forEach(({ document, blob }, index) => {
      zip.file(`${String(index + 2).padStart(2, '0')}-${safeFileName(document.fileName)}`, blob);
    });
    return { blob: await zip.generateAsync({ type: 'blob' }), extension: 'zip' };
  }

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  const appendPdf = async (blob: Blob) => {
    const source = await PDFDocument.load(await blob.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  };
  await appendPdf(summary);
  for (const attachment of attachments) {
    if (attachment.document.mimeType === 'application/pdf' || attachment.document.fileName.toLowerCase().endsWith('.pdf')) {
      await appendPdf(attachment.blob);
    }
  }
  const mergedBytes = await merged.save();
  return { blob: new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' }), extension: 'pdf' };
}
