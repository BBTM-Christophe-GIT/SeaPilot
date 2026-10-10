import {
  billingExportRawLines,
  billingExportServices,
  billingInvoiceTotal,
  billingOperationKey,
  billingOperationRows,
  billingServicesTotal,
  billingRawLinesTotal,
  completeBillingDprs,
  missingBillingDates,
  type BillingExportInput,
  type BillingOperationRow,
  type BillingPeriodMode,
  type ProjectBillingDpr,
  type ProjectBillingPeriod,
  type ProjectBillingRawLine,
  type ProjectBillingService,
  type ProjectChargeableExpense,
} from '../projectBilling';
import { billingReferenceScope } from '../projectBillingReferences';
import type {
  ProjectContractRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
} from '../projectQueries';

export const DEMO_OPERATION_STATUSES = ['Non validé', 'Validé', 'Stand-by météo', 'Facturé'] as const;

export interface DemoOperation extends ProjectPlanningOccurrenceRecord {
  title: string;
  documentCount: number;
}

export interface DemoExpense extends ProjectChargeableExpense {
  attachmentName: string;
}

export interface DemoProject {
  project: ProjectRecord;
  contract: ProjectContractRecord;
  operations: DemoOperation[];
  dprs: ProjectBillingDpr[];
  period: ProjectBillingPeriod;
  expenses: DemoExpense[];
  services: ProjectBillingService[];
  rawLines: ProjectBillingRawLine[];
}

export interface BillingDemoOptions {
  periodMode: BillingPeriodMode;
  month: string;
  startDate: string;
  endDate: string;
  vesselName: string;
  clientReference: string;
  completeMissingDays?: boolean;
}

export interface BillingDemoRow extends BillingOperationRow {
  dpr: ProjectBillingDpr;
  key: string;
  included: boolean;
}

export interface BillingDemoView {
  startDate: string;
  endDate: string;
  rows: BillingDemoRow[];
  selectedRows: BillingDemoRow[];
  expenses: DemoExpense[];
  services: ProjectBillingService[];
  rawLines: ProjectBillingRawLine[];
  selectedRawLines: ProjectBillingRawLine[];
  operationTotal: number;
  expenseTotal: number;
  serviceTotal: number;
  rawTotal: number;
  totalsByCurrency: Map<string, number>;
  expenseTotalsByCurrency: Map<string, number>;
  /** EUR subtotal, retained for the initial EUR-only demonstration. */
  totalHt: number;
  missingDates: string[];
  exportInput: BillingExportInput;
}

export const INITIAL_BILLING_OPTIONS: BillingDemoOptions = {
  periodMode: 'custom',
  month: '2026-10',
  startDate: '2026-10-05',
  endDate: '2026-10-08',
  vesselName: 'GOURY',
  clientReference: 'DEMO-P264-2026',
  completeMissingDays: false,
};

/** The preview opens on the user's current calendar month; fixture dates stay stable. */
export function createCurrentBillingOptions(today = new Date()): BillingDemoOptions {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const options: BillingDemoOptions = { ...INITIAL_BILLING_OPTIONS, month, periodMode: 'calendar-month' };
  return { ...options, ...billingDemoRange(options) };
}

function makeProject(id: number, title: string, clientName: string, status: string): ProjectRecord {
  return {
    id,
    title,
    projectCode: `P${id}`,
    clientId: null,
    clientSharePointItemId: '',
    clientName,
    primaryVesselId: 1,
    primaryVesselSharePointItemId: '',
    primaryVesselName: 'GOURY',
    secondaryVesselId: null,
    secondaryVesselSharePointItemId: '',
    secondaryVesselName: '',
    startsOn: '2026-10-05',
    endsOn: '2026-10-23',
    deliveryAt: '2026-10-05T08:00',
    redeliveryAt: '2026-10-23T18:00',
    charterStartsAt: '2026-10-05T08:00',
    charterEndsAt: '2026-10-23T18:00',
    deliveryPort: 'Cherbourg',
    redeliveryPort: 'Cherbourg',
    contractType: 'BIMCO',
    operationArea: 'Manche',
    isRovSupport: false,
    isDivingSupport: false,
    status,
    description: 'Dossier de démonstration pour la préversion du module Projet.',
    sourceLabel: 'Démonstration locale',
    sharePointListTitle: '',
    sharePointItemId: '',
    sourceModifiedAt: '',
    archivedAt: '',
    updatedAt: '2026-10-08T10:00:00Z',
  };
}

function makeContract(projectId: number, charterHire: number): ProjectContractRecord {
  return {
    id: projectId,
    projectId,
    ownerIdentity: 'BBTM — démonstration',
    vesselAssignmentLimit: '',
    extensionCount: null,
    extensionDuration: null,
    extensionUnit: '',
    autoExtensionPeriod: '',
    maxExtensionDays: null,
    mobilisationFee: null,
    demobilisationFee: null,
    feeCurrency: 'EUR',
    charterHire,
    extensionHire: null,
    hireCurrency: 'EUR',
    hireUnit: 'jour',
    maxAuditPeriod: '',
    supplytimeSchemaVersion: '',
    supplytimeData: {},
    sourceLabel: 'Démonstration locale',
    sharePointListTitle: '',
    sharePointItemId: '',
    sourceModifiedAt: '',
    archivedAt: '',
    hirePeriods: [{
      id: projectId,
      projectId,
      contractId: projectId,
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      charterHire,
      standbyHire: charterHire * 0.75,
      weatherStandbyHire: charterHire * 0.5,
      hireCurrency: 'EUR',
      hireUnit: 'jour',
    }],
  };
}

function makeOperation(
  projectId: number,
  id: number,
  title: string,
  startsOn: string,
  endsOn: string,
  charterHire: number,
  status: string,
  documentCount: number,
  charterHireOverride?: boolean,
): DemoOperation {
  return {
    id,
    projectId,
    title,
    startsOn,
    endsOn,
    primaryVesselId: 1,
    primaryVesselName: 'GOURY',
    vesselIds: [1],
    vesselNames: ['GOURY'],
    status,
    description: title,
    charterHire,
    hireCurrency: 'EUR',
    hireUnit: 'jour',
    charterHireOverride,
    sourceLabel: 'Démonstration locale',
    createdAt: '2026-10-01T08:00:00Z',
    documentCount,
  };
}

function makePeriod(projectId: number): ProjectBillingPeriod {
  return {
    id: projectId,
    projectId,
    companyId: 0,
    periodMonth: '2026-10-01',
    clientReference: `DEMO-P${projectId}-2026`,
    invoiceNumber: '',
    invoiceIssuedOn: '',
    invoiceSentOn: '',
    paymentDueOn: '',
    paidOn: '',
    amountHt: 0,
    comments: '',
    includeOperationsInPdf: true,
    includeExpensesInPdf: true,
    includeBbtmInPdf: true,
    includeRawInPdf: true,
    excludedOperationKeys: [],
  };
}

function makeDpr(id: number, reportDate: string, operation = '24/24 Operation'): ProjectBillingDpr {
  return {
    id,
    reportDate,
    vesselId: 1,
    vesselName: 'GOURY',
    operation,
    amountHt: null,
    vesselStatus: 'En opération',
    arrivalAt: '',
    departureAt: '',
    fuelLiters: null,
  };
}

function makeExpense(
  id: number,
  billingPeriodId: number,
  category: DemoExpense['category'],
  supplier: string,
  amountHt: number,
  invoiceDate: string,
  invoiceNumber: string,
): DemoExpense {
  return {
    id,
    billingPeriodId,
    category,
    nature: '',
    supplier,
    supplierSpecialties: [category === 'fuel' ? 'Gasoil' : 'Frais de port'],
    invoiceDate,
    invoiceNumber,
    amountHt,
    amountTtc: null,
    currency: 'EUR',
    quantity: null,
    unit: '',
    comments: '',
    dprReportId: null,
    includeInPdf: true,
    attachmentName: `${invoiceDate} - ${invoiceNumber} - ${category === 'fuel' ? 'Gasoil' : 'Frais de port'}.pdf`,
  };
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    project: makeProject(264, 'Assistance offshore', 'Client Démonstration', 'Validé'),
    contract: makeContract(264, 2400),
    operations: [
      makeOperation(264, 2641, 'Assistance offshore', '2026-10-05', '2026-10-09', 2400, 'Validé', 2),
      makeOperation(264, 2642, 'Relève d’équipe', '2026-10-12', '2026-10-16', 2650, 'Non validé', 1, true),
      makeOperation(264, 2643, 'Assistance finale', '2026-10-19', '2026-10-23', 2400, 'Non validé', 0),
    ],
    dprs: [
      makeDpr(26401, '2026-10-05'),
      makeDpr(26402, '2026-10-06'),
      makeDpr(26403, '2026-10-07'),
      makeDpr(26404, '2026-10-08'),
      makeDpr(26405, '2026-10-12', '24/24 Crew Change'),
      makeDpr(26406, '2026-10-19'),
    ],
    period: makePeriod(264),
    expenses: [
      makeExpense(26401, 264, 'fuel', 'Fournisseur Démonstration', 675, '2026-10-06', 'DEMO-068'),
      makeExpense(26402, 264, 'port', 'Port Démonstration', 340, '2026-10-07', 'DEMO-104'),
    ],
    services: [{
      id: 26401,
      billingPeriodId: 264,
      serviceCatalogId: null,
      category: 'Suivi opérationnel',
      descriptionHtml: '<p>Prestation BBTM de démonstration.</p>',
      unitAmountHt: 85,
      quantity: 4,
      includeInPdf: true,
    }],
    rawLines: [],
  },
  {
    project: { ...makeProject(263, 'Remorquage côtier', 'Client Atlantique', 'Non validé'), contractType: 'Remorquage' },
    contract: makeContract(263, 1800),
    operations: [makeOperation(263, 2631, 'Remorquage côtier', '2026-10-05', '2026-10-08', 1800, 'Non validé', 1)],
    dprs: [makeDpr(26301, '2026-10-05'), makeDpr(26302, '2026-10-06')],
    period: makePeriod(263),
    expenses: [],
    services: [],
    rawLines: [],
  },
  {
    project: makeProject(262, 'Inspection de quai', 'Client Littoral', 'Facturé'),
    contract: makeContract(262, 1250),
    operations: [
      makeOperation(262, 2621, 'Inspection initiale', '2026-10-05', '2026-10-06', 1250, 'Facturé', 1),
      makeOperation(262, 2622, 'Inspection finale', '2026-10-07', '2026-10-08', 1250, 'Validé', 1),
    ],
    dprs: [makeDpr(26201, '2026-10-05'), makeDpr(26202, '2026-10-07')],
    period: makePeriod(262),
    expenses: [],
    services: [],
    rawLines: [],
  },
];

export function createDemoProjects(): DemoProject[] {
  return structuredClone(DEMO_PROJECTS);
}

/** Calendar inputs only: parse without local-time shifts and reject invalid dates. */
export function billingDemoRange(options: BillingDemoOptions): { startDate: string; endDate: string } {
  if (options.periodMode === 'custom') {
    return { startDate: options.startDate, endDate: options.endDate };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.month)) return { startDate: '', endDate: '' };
  const [year, month] = options.month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: `${options.month}-01`, endDate: `${options.month}-${lastDay}` };
}

function currencyCode(currency: string): string {
  return currency.trim().toUpperCase() || 'EUR';
}

function expenseCurrencyTotals(input: BillingExportInput): Map<string, number> {
  const totals = new Map<string, number>();
  if (input.period.includeExpensesInPdf !== false) {
    input.expenses.filter((expense) => expense.includeInPdf !== false).forEach((expense) => {
      const currency = currencyCode(expense.currency);
      totals.set(currency, (totals.get(currency) || 0) + expense.amountHt);
    });
  }
  return totals;
}

/** Same currency grouping as generateBillingPdf: no exchange rate or mixed-currency sum. */
export function billingCurrencyTotals(input: BillingExportInput): Map<string, number> {
  const totals = expenseCurrencyTotals(input);
  const add = (currency: string, amount: number) => totals.set(currency, (totals.get(currency) || 0) + amount);
  if (input.period.includeOperationsInPdf !== false) {
    add(currencyCode(input.contract?.hireCurrency || 'EUR'), billingOperationRows(input).reduce((sum, row) => sum + row.amountHt, 0));
  }
  const servicesTotal = billingServicesTotal(billingExportServices(input));
  const rawLines = billingExportRawLines(input);
  if (servicesTotal || rawLines.length) add('EUR', servicesTotal + billingRawLinesTotal(rawLines));
  if (!totals.size) totals.set('EUR', 0);
  return new Map([...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => [currency, Number(amount.toFixed(2))]));
}

/**
 * This preview uses the same hire precedence and PDF totals as the live module.
 * Custom dates scope the DPR lines; expenses and services belong to the saved month,
 * exactly as in ProjectBillingPanel. No server data is read or written here.
 */
export function buildBillingView(demo: DemoProject, options: BillingDemoOptions): BillingDemoView {
  const { startDate, endDate } = billingDemoRange(options);
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const selectedPeriodMatches = demo.period.periodMonth.slice(0, 7) === options.month;
  const period: ProjectBillingPeriod = {
    ...demo.period,
    periodMonth: `${options.month}-01`,
    clientReference: options.clientReference,
    ...(selectedPeriodMatches ? {} : {
      excludedOperationKeys: [],
      includeOperationsInPdf: true,
      includeExpensesInPdf: true,
      includeBbtmInPdf: true,
      includeRawInPdf: true,
    }),
  };
  const vesselName = options.vesselName.trim().toLocaleUpperCase('fr-FR');
  const filteredDprs = validRange ? demo.dprs.filter((dpr) => (
    dpr.reportDate >= startDate
    && dpr.reportDate <= endDate
    && (!vesselName || dpr.vesselName.trim().toLocaleUpperCase('fr-FR') === vesselName)
  )) : [];
  const missingDates = validRange ? missingBillingDates(filteredDprs, startDate, endDate) : [];
  const dprs = options.completeMissingDays && validRange
    ? completeBillingDprs(filteredDprs, startDate, endDate, {
      vesselName: options.vesselName || demo.project.primaryVesselName,
      amountHt: null,
    })
    : filteredDprs;
  const expenses = selectedPeriodMatches
    ? demo.expenses.filter((expense) => expense.billingPeriodId === demo.period.id)
    : [];
  const services = selectedPeriodMatches
    ? demo.services.filter((service) => service.billingPeriodId === demo.period.id)
    : [];
  // Raw services may cover several vessels in one month; like the existing panel,
  // they follow the date range and retain their explicit vessel assignment.
  const rawLines = selectedPeriodMatches && validRange
    ? demo.rawLines.filter((line) => line.billingPeriodId === demo.period.id && line.serviceDate >= startDate && line.serviceDate <= endDate)
    : [];
  const monthRange = billingDemoRange({ ...options, periodMode: 'calendar-month' });
  const monthlyDprs = demo.dprs.filter((dpr) => dpr.reportDate >= monthRange.startDate
    && dpr.reportDate <= monthRange.endDate
    && (!vesselName || dpr.vesselName.trim().toLocaleUpperCase('fr-FR') === vesselName));
  const exportInput: BillingExportInput = {
    project: demo.project,
    contract: demo.contract,
    operations: demo.operations,
    period,
    expenses,
    services,
    rawLines,
    includeBbtmService: period.includeBbtmInPdf !== false,
    dprs,
    monthlyDprs,
    selectedVesselName: options.vesselName || demo.project.primaryVesselName,
    startDate,
    endDate,
  };
  const allRows = billingOperationRows({ ...exportInput, period: { ...period, excludedOperationKeys: [] } });
  const sortedDprs = [...dprs].sort((left, right) => left.reportDate.localeCompare(right.reportDate) || left.id - right.id);
  const rows: BillingDemoRow[] = allRows.map((row, index) => {
    const dpr = sortedDprs[index];
    const key = billingOperationKey(dpr);
    return { ...row, dpr, key, included: !(period.excludedOperationKeys || []).includes(key) };
  });
  const selectedRows = rows.filter((row) => row.included);
  const operationTotal = period.includeOperationsInPdf === false
    ? 0
    : selectedRows.reduce((sum, row) => sum + row.amountHt, 0);
  const expenseTotal = period.includeExpensesInPdf === false
    ? 0
    : expenses.filter((expense) => expense.includeInPdf !== false).reduce((sum, expense) => sum + expense.amountHt, 0);
  const selectedServices = billingExportServices(exportInput);
  const displayServices = billingExportServices({
    ...exportInput,
    includeBbtmService: true,
    period: { ...period, includeBbtmInPdf: true },
  });
  const serviceTotal = billingServicesTotal(selectedServices);
  const selectedRawLines = billingExportRawLines(exportInput);
  const rawTotal = billingRawLinesTotal(selectedRawLines);
  const expenseTotalsByCurrency = expenseCurrencyTotals(exportInput);
  return {
    startDate,
    endDate,
    rows,
    selectedRows,
    expenses,
    services: displayServices,
    rawLines,
    selectedRawLines,
    operationTotal,
    expenseTotal,
    serviceTotal,
    rawTotal,
    expenseTotalsByCurrency,
    totalsByCurrency: billingCurrencyTotals(exportInput),
    totalHt: billingInvoiceTotal(currencyCode(demo.contract.hireCurrency) === 'EUR' ? operationTotal : 0,
      expenseTotalsByCurrency.get('EUR') || 0, selectedServices, period.includeBbtmInPdf !== false,
      selectedRawLines, period.includeRawInPdf !== false),
    missingDates,
    exportInput,
  };
}

/** References follow the PDF content for a project, independently of its billing month. */
export function billingDemoReferenceKey(demo: DemoProject, options: BillingDemoOptions): string {
  const input = buildBillingView(demo, options).exportInput;
  const scope = billingReferenceScope({
    ...input.period,
    includeRawInPdf: input.period.includeRawInPdf !== false && (input.rawLines?.length ?? 0) > 0,
  });
  return `${demo.project.id}:${scope}`;
}
