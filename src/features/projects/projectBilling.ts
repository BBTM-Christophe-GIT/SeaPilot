import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ProjectContractRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
} from './projectQueries';

export type BillingExpenseCategory = 'fuel' | 'port' | 'water' | 'other';
export type BillingServiceCategory = 'spread_antipollution';
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
  category: BillingServiceCategory;
  unitAmountHt: number;
  quantity: number;
  includeInPdf?: boolean;
}

export interface ProjectBillingData {
  periods: ProjectBillingPeriod[];
  expenses: ProjectChargeableExpense[];
  documents: ProjectBillingDocument[];
  services: ProjectBillingService[];
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
  category: BillingServiceCategory;
  unitAmountHt: number;
  quantity: number;
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
    category: text(row.category) as BillingServiceCategory,
    unitAmountHt: number(row.unit_amount_ht),
    quantity: number(row.quantity),
    includeInPdf: row.include_in_pdf !== false,
  };
}

async function projectCompanyId(client: SupabaseClient, projectId: number): Promise<number> {
  const { data, error } = await client.from('projects').select('company_id').eq('id', projectId).single();
  if (error) throw error;
  return number(data?.company_id);
}

export async function fetchProjectBillingData(client: SupabaseClient, projectId: number): Promise<ProjectBillingData> {
  const [periodResult, expenseResult, documentResult, serviceResult] = await Promise.all([
    client.from('project_billing_periods').select('*').eq('project_id', projectId).order('period_month', { ascending: false }),
    client.from('project_chargeable_expenses').select('*').eq('project_id', projectId).order('invoice_date', { ascending: false }),
    client.from('project_billing_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    client.from('project_billing_services').select('*').eq('project_id', projectId).order('created_at'),
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
  };
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
): Promise<ProjectBillingService> {
  const companyId = await projectCompanyId(client, projectId);
  const { data, error } = await client
    .from('project_billing_services')
    .upsert({
      company_id: companyId,
      project_id: projectId,
      billing_period_id: billingPeriodId,
      category: draft.category,
      unit_amount_ht: draft.unitAmountHt,
      quantity: draft.quantity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'billing_period_id,category' })
    .select('*')
    .single();
  if (error) throw error;
  return mapService(data as Record<string, unknown>);
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

export async function saveProjectBillingPdfSelection(
  client: SupabaseClient,
  periodId: number,
  selection: Required<Pick<ProjectBillingPeriod,
    'includeOperationsInPdf' | 'includeExpensesInPdf' | 'includeBbtmInPdf' | 'excludedOperationKeys'>>,
): Promise<void> {
  const { error } = await client
    .from('project_billing_periods')
    .update({
      include_operations_in_pdf: selection.includeOperationsInPdf,
      include_expenses_in_pdf: selection.includeExpensesInPdf,
      include_bbtm_in_pdf: selection.includeBbtmInPdf,
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
  const { error: uploadError } = await client.storage.from('project-files').upload(objectPath, input.file, {
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
    await client.storage.from('project-files').remove([objectPath]);
    throw error;
  }
  return mapDocument(data as Record<string, unknown>);
}

export async function signedProjectBillingDocumentUrl(
  client: SupabaseClient,
  document: ProjectBillingDocument,
): Promise<string> {
  const { data, error } = await client.storage.from(document.bucketName).createSignedUrl(document.objectPath, 120);
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
  includeBbtmService?: boolean;
  dprs: ProjectBillingDpr[];
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
  return dprs.filter((dpr) => dpr.operation.trim().toUpperCase() === '24/24 OPERATION').length;
}

export function billingServicesTotal(services: ProjectBillingService[]): number {
  return services.reduce((sum, service) => sum + service.unitAmountHt * service.quantity, 0);
}

export function billingInvoiceTotal(
  hiresTotal: number,
  expenseTotal: number,
  services: ProjectBillingService[],
  includeBbtmService: boolean,
): number {
  return hiresTotal + expenseTotal + (includeBbtmService ? billingServicesTotal(services) : 0);
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
  const isPort = dpr.vesselStatus.trim().toUpperCase() === 'NAVIRE AU PORT';
  const arrival = isPort && dpr.arrivalAt ? `Accosté au port à ${addUtcOffset(dpr.arrivalAt)}` : '';
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
      fuelLiters: sourceFuelLiters
        ?? (sourceFuelM3 !== null
          ? sourceFuelM3 * 1_000
          : supplyFuelM3 !== null && supplyFuelM3 !== undefined
            ? supplyFuelM3 * 1_000
            : null),
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
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    compress: true,
    orientation: 'landscape',
    unit: 'pt',
    format: [2667.12, 1896],
  });
  const money = (value: number) => `${value
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u00a0\u202f]/g, ' ')} €`;
  const operationRows = billingOperationRows(input);
  const includeOperationAmounts = input.period.includeOperationsInPdf !== false;
  const includeExpenses = input.period.includeExpensesInPdf !== false;
  const hiresTotal = includeOperationAmounts
    ? operationRows.reduce((sum, row) => sum + row.amountHt, 0)
    : 0;
  const expenses = input.period.includeExpensesInPdf === false
    ? []
    : input.expenses.filter((expense) => expense.includeInPdf !== false);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  const includeBbtmService = input.period.includeBbtmInPdf !== false && input.includeBbtmService !== false;
  const services = includeBbtmService ? input.services.filter((service) => service.includeInPdf !== false) : [];
  const serviceTotal = includeBbtmService ? billingServicesTotal(services) : 0;
  const invoiceTotal = billingInvoiceTotal(hiresTotal, expenseTotal, services, includeBbtmService);

  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(30, 29, 28);
  };
  const strokeRect = (x: number, y: number, width: number, height: number, color = 0) => {
    pdf.setDrawColor(color);
    pdf.setLineWidth(0.75);
    pdf.rect(x, y, width, height);
  };
  const drawChevron = (x: number, y: number) => {
    pdf.setDrawColor(91, 88, 84);
    pdf.setLineWidth(2);
    pdf.line(x, y, x + 14, y + 14);
    pdf.line(x + 14, y + 14, x + 28, y);
  };
  const drawCalendar = (x: number, y: number) => {
    pdf.setDrawColor(91, 88, 84);
    pdf.setLineWidth(1.5);
    pdf.rect(x, y + 4, 12, 11);
    pdf.line(x, y + 8, x + 12, y + 8);
    pdf.line(x + 3, y + 1, x + 3, y + 6);
    pdf.line(x + 9, y + 1, x + 9, y + 6);
  };
  const drawSortArrow = (x: number, y: number, direction: 'up' | 'down') => {
    pdf.setFillColor(30, 29, 28);
    const points = direction === 'up'
      ? [[x, y + 14], [x + 14, y], [x + 28, y + 14]]
      : [[x, y], [x + 14, y + 14], [x + 28, y]];
    pdf.triangle(
      points[0][0],
      points[0][1],
      points[1][0],
      points[1][1],
      points[2][0],
      points[2][1],
      'F',
    );
  };
  const fitText = (value: string, maxWidth: number): string => {
    if (pdf.getTextWidth(value) <= maxWidth) return value;
    let candidate = value;
    while (candidate.length > 1 && pdf.getTextWidth(`${candidate}…`) > maxWidth) {
      candidate = candidate.slice(0, -1);
    }
    return `${candidate.trimEnd()}…`;
  };
  const fitTextLines = (value: string, maxWidth: number, maxLines = 2): string[] => {
    const lines = pdf.splitTextToSize(value, maxWidth) as string[];
    if (lines.length <= maxLines) return lines;
    return [
      ...lines.slice(0, maxLines - 1),
      fitText(lines.slice(maxLines - 1).join(' '), maxWidth),
    ];
  };
  const expenseTable = {
    left: 1284,
    right: 2619,
    headerTop: 389,
    headerBottom: 456,
    supplier: { x: 1297, width: 390 },
    specialty: { x: 1705, width: 280 },
    invoiceDate: { x: 2100 },
    invoiceNumber: { x: 2320, width: 185 },
    amount: { x: 2605 },
  } as const;

  try {
    const response = await fetch('/bbtm-logo.png');
    const source = await response.blob();
    const objectUrl = URL.createObjectURL(source);
    const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = logo.naturalWidth;
    canvas.height = logo.naturalHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(logo, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = 255 - pixels.data[index];
        pixels.data[index + 1] = 255 - pixels.data[index + 1];
        pixels.data[index + 2] = 255 - pixels.data[index + 2];
      }
      context.putImageData(pixels, 0, 0);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 110.25, 21.75, 217.5, 217.5);
    }
    URL.revokeObjectURL(objectUrl);
  } catch {
    // The export remains usable if the browser cannot decode the logo.
  }

  strokeRect(420, 18, 1668, 169.5);
  setFont(60, 'bold');
  pdf.text('Éléments de facturation', 1254, 142.5, { align: 'center' });
  strokeRect(420, 186.75, 1668, 55.5);
  pdf.setDrawColor(234);
  pdf.rect(945.375, 190.875, 776.25, 46.5);
  setFont(32);
  pdf.setTextColor(91, 88, 84);
  pdf.text(`${input.project.projectCode} - ${input.project.title}`, 950, 226);
  drawChevron(1686, 205);

  strokeRect(2088, 18, 483.75, 224.25);
  setFont(31, 'bold');
  pdf.text('Période', 2110, 56);
  pdf.setDrawColor(234);
  pdf.rect(2113.125, 70.125, 213, 69.75);
  pdf.rect(2331.375, 70.125, 213, 69.75);
  setFont(32);
  pdf.text(formatDate(input.startDate), 2120, 119);
  pdf.text(formatDate(input.endDate), 2338, 119);
  drawCalendar(2304, 96);
  drawCalendar(2522, 96);
  setFont(31, 'bold');
  pdf.text('Navire', 2110, 176);
  pdf.setDrawColor(234);
  pdf.rect(2110.875, 190.125, 455.25, 46.5);
  setFont(32);
  pdf.setTextColor(91, 88, 84);
  const selectedVessel = input.selectedVesselName
    || input.dprs.find((dpr) => dpr.vesselName)?.vesselName
    || input.project.primaryVesselName
    || 'Non renseigné';
  pdf.text(selectedVessel, 2117, 225);
  drawChevron(2523, 202);
  setFont(28, 'italic');
  pdf.setTextColor(30, 29, 28);
  pdf.text(
    `Référence Client : ${input.period.clientReference || defaultProjectClientReference(input.project) || '—'}`,
    2564,
    280,
    { align: 'right' },
  );
  pdf.setDrawColor(17, 141, 255);
  pdf.setLineWidth(0.75);
  pdf.line(2153, 288, 2564, 288);

  setFont(40, 'bold');
  pdf.text('Opérations', 672, 360, { align: 'center' });
  if (includeExpenses) pdf.text('Frais Imputables', 1951, 360, { align: 'center' });
  pdf.setDrawColor(96, 94, 92);
  pdf.setLineWidth(0.75);
  pdf.line(73.5, 375.375, 1270.5, 375.375);
  if (includeExpenses) pdf.line(1284, 375.375, 2619, 375.375);

  setFont(32, 'bold');
  pdf.text('Date', 140.65, 423);
  pdf.text('Operations', 389.06, 423);
  if (includeOperationAmounts) {
    pdf.text('Montant HT', 765.5, 423, { align: 'center' });
  }
  pdf.text('Commentaires', 1046.8, 423, { align: 'center' });
  drawSortArrow(82, 441, 'up');
  if (includeExpenses) {
    pdf.setFillColor(246, 247, 249);
    pdf.rect(
      expenseTable.left,
      expenseTable.headerTop,
      expenseTable.right - expenseTable.left,
      expenseTable.headerBottom - expenseTable.headerTop,
      'F',
    );
    pdf.text('Société', expenseTable.supplier.x, 431);
    pdf.text('Spécialités', expenseTable.specialty.x, 431);
    pdf.text('Date Facture', expenseTable.invoiceDate.x, 431, { align: 'center' });
    pdf.text('N° Facture', expenseTable.invoiceNumber.x, 431, { align: 'center' });
    pdf.text('Montant HT', expenseTable.amount.x, 431, { align: 'right' });
    pdf.setDrawColor(205, 208, 214);
    pdf.line(expenseTable.left, expenseTable.headerBottom, expenseTable.right, expenseTable.headerBottom);
    drawSortArrow(expenseTable.supplier.x, 441, 'up');
  }

  setFont(28);
  let operationY = 486;
  const operationSource = operationRows.length ? operationRows : [{
    date: '—',
    operation: 'Aucune opération DPR sur la période',
    amountHt: 0,
    comments: '',
  }];
  operationSource.forEach((row) => {
    const commentLines = row.comments ? row.comments.split('\n') : [];
    pdf.text(row.date, 81.75, operationY);
    pdf.text(fitText(row.operation, includeOperationAmounts ? 380 : 520), 277.5, operationY);
    if (includeOperationAmounts) pdf.text(money(row.amountHt), 829.5, operationY, { align: 'right' });
    commentLines.forEach((line, index) => pdf.text(line, 865.3, operationY + index * 36.75));
    operationY += Math.max(38.25, commentLines.length * 36.75 + (commentLines.length > 1 ? 1.5 : 0));
  });

  let expenseY = 486;
  expenses.forEach((expense, index) => {
    const supplierLines = fitTextLines(expense.supplier, expenseTable.supplier.width);
    const specialtyLines = fitTextLines(
      billingExpenseSpecialtyLabel(expense),
      expenseTable.specialty.width,
    );
    const lineCount = Math.max(supplierLines.length, specialtyLines.length);
    const rowHeight = Math.max(42, lineCount * 30 + 8);
    if (index % 2 === 1) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(
        expenseTable.left,
        expenseY - 29,
        expenseTable.right - expenseTable.left,
        rowHeight,
        'F',
      );
    }
    supplierLines.forEach((line, lineIndex) => {
      pdf.text(line, expenseTable.supplier.x, expenseY + lineIndex * 30);
    });
    specialtyLines.forEach((line, lineIndex) => {
      pdf.text(line, expenseTable.specialty.x, expenseY + lineIndex * 30);
    });
    const centeredY = expenseY + (lineCount - 1) * 15;
    pdf.text(formatDate(expense.invoiceDate), expenseTable.invoiceDate.x, centeredY, { align: 'center' });
    pdf.text(
      fitText(expense.invoiceNumber || '—', expenseTable.invoiceNumber.width),
      expenseTable.invoiceNumber.x,
      centeredY,
      { align: 'center' },
    );
    pdf.text(money(expense.amountHt), expenseTable.amount.x, centeredY, { align: 'right' });
    expenseY += rowHeight;
  });

  if (includeBbtmService) {
    const serviceY = Math.min(Math.max(expenseY + 58, 760), 1180);
    setFont(36, 'bold');
    pdf.text('Prestation BBTM', 1951, serviceY, { align: 'center' });
    pdf.setDrawColor(96, 94, 92);
    pdf.line(1284, serviceY + 15, 2619, serviceY + 15);
    setFont(28, 'bold');
    pdf.text('Catégorie', 1297, serviceY + 64);
    pdf.text('Montant unitaire HT', 1815, serviceY + 64, { align: 'center' });
    pdf.text('Nombre d’unités', 2180, serviceY + 64, { align: 'center' });
    pdf.text('Montant total HT', 2520, serviceY + 64, { align: 'center' });
    setFont(28);
    const serviceLabels: Record<BillingServiceCategory, string> = {
      spread_antipollution: 'Spread Antipollution',
    };
    const serviceSource = services.length ? services : [{
      id: 0,
      billingPeriodId: input.period.id,
      category: 'spread_antipollution' as const,
      unitAmountHt: 0,
      quantity: 0,
    }];
    serviceSource.forEach((service, index) => {
      const rowY = serviceY + 112 + index * 40;
      pdf.text(serviceLabels[service.category], 1297, rowY);
      pdf.text(money(service.unitAmountHt), 1880, rowY, { align: 'center' });
      pdf.text(service.quantity.toLocaleString('fr-FR', { maximumFractionDigits: 3 }), 2180, rowY, { align: 'center' });
      pdf.text(money(service.unitAmountHt * service.quantity), 2598, rowY, { align: 'right' });
    });
  }

  pdf.setFillColor(179, 179, 179);
  const subtotalDefinitions = [
    ...(includeOperationAmounts ? [{ label: 'Total des Loyers journaliers', value: hiresTotal }] : []),
    ...(includeExpenses ? [{ label: 'Total des Frais Imputables', value: expenseTotal }] : []),
    ...(includeBbtmService ? [{ label: 'Sous-total Prestation BBTM', value: serviceTotal }] : []),
  ];
  const totalFrame = {
    y: 1833 - (subtotalDefinitions.length * 105 + 187.5),
    height: subtotalDefinitions.length * 105 + 187.5,
  };
  pdf.rect(1810.5, totalFrame.y, 787.5, totalFrame.height, 'F');
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.75);
  pdf.rect(1810.5, totalFrame.y, 787.5, totalFrame.height);
  const totalBlocks = [
    ...subtotalDefinitions.map((definition, index) => ({
      ...definition,
      y: totalFrame.y + index * 105,
      height: 105,
      final: false,
    })),
    {
      y: totalFrame.y + subtotalDefinitions.length * 105,
      height: 187.5,
      label: 'Total Facture du mois Hors Taxes',
      value: invoiceTotal,
      final: true,
    },
  ];
  totalBlocks.forEach((block) => {
    const background = block.final ? 230 : 255;
    pdf.setFillColor(background, background, background);
    pdf.rect(1850.25, block.y, 742.5, block.height, 'F');
    pdf.setFillColor(179, 179, 179);
    pdf.rect(1850.25, block.y, 742.5, block.final ? 42.75 : 36.75, 'F');
    setFont(block.final ? 34 : 29, 'bold');
    pdf.text(block.label, 2221.5, block.y + (block.final ? 34 : 29), { align: 'center' });
    setFont(block.final ? 46 : 42, block.final ? 'bold' : 'normal');
    pdf.text(money(block.value), 2221.5, block.y + (block.final ? 126 : 92), { align: 'center' });
  });

  pdf.setProperties({
    title: `${input.project.projectCode} - Éléments de facturation - ${input.period.periodMonth.slice(0, 7)}`,
    subject: 'Export SeaPilot des éléments de facturation',
  });
  return pdf.output('blob');
}

export type BillingExportFormat = 'pdf' | 'merged-pdf' | 'zip';

export async function generateBillingExportPackage(
  client: SupabaseClient,
  input: BillingExportInput,
  documents: ProjectBillingDocument[],
  format: BillingExportFormat,
): Promise<{ blob: Blob; extension: 'pdf' | 'zip' }> {
  const summary = await generateBillingPdf(input);
  if (format === 'pdf' || documents.length === 0) return { blob: summary, extension: 'pdf' };

  const attachments = await Promise.all(documents.map(async (document) => {
    const { data, error } = await client.storage.from(document.bucketName).download(document.objectPath);
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
