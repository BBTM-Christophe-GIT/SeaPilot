import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';

export type BillingExpenseCategory = 'fuel' | 'port' | 'water' | 'other';
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
}

export interface ProjectChargeableExpense {
  id: number;
  billingPeriodId: number;
  category: BillingExpenseCategory;
  nature: string;
  supplier: string;
  invoiceDate: string;
  invoiceNumber: string;
  amountHt: number;
  amountTtc: number | null;
  currency: string;
  quantity: number | null;
  unit: string;
  comments: string;
  chargeable: boolean;
  includedInClientInvoice: boolean;
  dprReportId: number | null;
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

export interface ProjectBillingData {
  periods: ProjectBillingPeriod[];
  expenses: ProjectChargeableExpense[];
  documents: ProjectBillingDocument[];
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
}

export interface BillingExpenseDraft {
  category: BillingExpenseCategory;
  nature: string;
  supplier: string;
  invoiceDate: string;
  invoiceNumber: string;
  amountHt: number;
  amountTtc: number | null;
  currency: string;
  quantity: number | null;
  unit: string;
  comments: string;
  chargeable: boolean;
  includedInClientInvoice: boolean;
  dprReportId: number | null;
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
  };
}

function mapExpense(row: Record<string, unknown>): ProjectChargeableExpense {
  return {
    id: number(row.id),
    billingPeriodId: number(row.billing_period_id),
    category: text(row.category) as BillingExpenseCategory,
    nature: text(row.nature),
    supplier: text(row.supplier),
    invoiceDate: text(row.invoice_date),
    invoiceNumber: text(row.invoice_number),
    amountHt: number(row.amount_ht),
    amountTtc: nullableNumber(row.amount_ttc),
    currency: text(row.currency) || 'EUR',
    quantity: nullableNumber(row.quantity),
    unit: text(row.unit),
    comments: text(row.comments),
    chargeable: row.chargeable !== false,
    includedInClientInvoice: row.included_in_client_invoice === true,
    dprReportId: nullableNumber(row.dpr_report_id),
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

async function projectCompanyId(client: SupabaseClient, projectId: number): Promise<number> {
  const { data, error } = await client.from('projects').select('company_id').eq('id', projectId).single();
  if (error) throw error;
  return number(data?.company_id);
}

export async function fetchProjectBillingData(client: SupabaseClient, projectId: number): Promise<ProjectBillingData> {
  const [periodResult, expenseResult, documentResult] = await Promise.all([
    client.from('project_billing_periods').select('*').eq('project_id', projectId).order('period_month', { ascending: false }),
    client.from('project_chargeable_expenses').select('*').eq('project_id', projectId).order('invoice_date', { ascending: false }),
    client.from('project_billing_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ]);
  if (periodResult.error) throw periodResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (documentResult.error) throw documentResult.error;
  return {
    periods: (periodResult.data || []).map((row) => mapPeriod(row as Record<string, unknown>)),
    expenses: (expenseResult.data || []).map((row) => mapExpense(row as Record<string, unknown>)),
    documents: (documentResult.data || []).map((row) => mapDocument(row as Record<string, unknown>)),
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
    invoice_date: draft.invoiceDate,
    invoice_number: draft.invoiceNumber.trim() || null,
    amount_ht: draft.amountHt,
    amount_ttc: draft.amountTtc,
    currency: draft.currency.trim().toUpperCase() || 'EUR',
    quantity: draft.quantity,
    unit: draft.unit.trim() || null,
    comments: draft.comments.trim() || null,
    chargeable: draft.chargeable,
    included_in_client_invoice: draft.includedInClientInvoice,
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
  period: ProjectBillingPeriod;
  expenses: ProjectChargeableExpense[];
  operations: ProjectPlanningOccurrenceRecord[];
  startDate: string;
  endDate: string;
}

function daysInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function billingOperationRows(input: BillingExportInput): Array<[string, string, string, string]> {
  return input.operations.flatMap((operation) => {
    const start = operation.startsOn > input.startDate ? operation.startsOn : input.startDate;
    const end = operation.endsOn < input.endDate ? operation.endsOn : input.endDate;
    if (!start || !end || end < start) return [];
    const dailyHire = operation.charterHire ?? input.contract?.charterHire ?? 0;
    return daysInclusive(start, end).map((date): [string, string, string, string] => [
      new Intl.DateTimeFormat('fr-FR').format(new Date(`${date}T12:00:00Z`)),
      operation.description || '24/24 Operation',
      `${dailyHire.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${operation.hireCurrency || input.contract?.hireCurrency || 'EUR'}`,
      operation.primaryVesselName || input.project.primaryVesselName,
    ]);
  });
}

export async function generateBillingPdf(input: BillingExportInput): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ compress: true, orientation: 'landscape', unit: 'mm', format: 'a4' });
  const money = (value: number) => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`;
  const operationRows = billingOperationRows(input);
  const hiresTotal = operationRows.reduce((sum, row) => {
    const raw = row[2].replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return sum + Number(raw || 0);
  }, 0);
  const expenses = input.expenses.filter((expense) => expense.chargeable);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amountHt, 0);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Éléments de facturation', 148.5, 15, { align: 'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${input.project.projectCode} - ${input.project.title}`, 15, 23);
  pdf.text(`Période : ${input.startDate} au ${input.endDate}`, 205, 23);
  pdf.text(`Navire : ${input.project.primaryVesselName || 'Non renseigné'}`, 205, 28);
  pdf.text(`Référence client : ${input.period.clientReference || '—'}`, 205, 33);
  autoTable(pdf, {
    startY: 39,
    head: [['Date', 'Opérations', 'Loyer journalier HT', 'Navire']],
    body: operationRows.length ? operationRows : [['—', 'Aucune opération sur la période', '0,00 €', '—']],
    margin: { left: 15, right: 151 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [20, 64, 112] },
  });
  autoTable(pdf, {
    startY: 39,
    head: [['Date facture', 'N° facture', 'Type de service', 'Société', 'Montant HT']],
    body: expenses.length ? expenses.map((expense) => [
      expense.invoiceDate,
      expense.invoiceNumber || '—',
      expense.category === 'other' ? expense.nature : ({ fuel: 'Gasoil', port: 'Frais de port', water: 'Eau' }[expense.category]),
      expense.supplier,
      money(expense.amountHt),
    ]) : [['—', '—', 'Aucun frais imputable', '—', money(0)]],
    margin: { left: 151, right: 15 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [20, 64, 112] },
  });
  const y = 160;
  autoTable(pdf, {
    startY: y,
    body: [
      ['Total des loyers journaliers', money(hiresTotal)],
      ['Total des frais imputables', money(expenseTotal)],
      ['Total du mois hors taxes', money(hiresTotal + expenseTotal)],
    ],
    margin: { left: 175, right: 15 },
    styles: { fontSize: 9, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
    theme: 'grid',
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
