import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import {
  automaticBillingServiceQuantity,
  billingExportServices,
  billingExportRawLines,
  billingExpenseAttachmentName,
  billingExpenseSpecialtyLabel,
  billingInvoiceTotal,
  billingOperationHire,
  billingServicesTotal,
  billingRawLineTotal,
  billingRawLinesTotal,
  billingDprComment,
  billingOperationRows,
  completeBillingDprs,
  countDailyOperations,
  defaultProjectClientReference,
  ensureProjectBillingPeriod,
  fetchProjectBillingDprs,
  fetchProjectBillingData,
  fetchProjectServiceCatalog,
  generateBillingPdf,
  missingBillingDates,
  resolveBillingDprOperation,
  saveProjectBillingRawLine,
  saveProjectServiceCatalogEntry,
  deleteProjectBillingRawLine,
  saveProjectBillingPdfSelection,
  setProjectBillingRawLinePdfInclusion,
  type BillingExportInput,
  type BillingPeriodDraft,
  type ProjectBillingDpr,
  type ProjectBillingRawLine,
} from './projectBilling';

describe('ensureProjectBillingPeriod', () => {
  const draft: BillingPeriodDraft = {
    periodMonth: '2026-09', clientReference: ' Nouvelle référence ', invoiceNumber: '',
    invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0, comments: '',
    includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: true, excludedOperationKeys: [],
  };
  const invoicedRow = {
    id: 77, company_id: 1, project_id: 42, period_month: '2026-09-01', client_reference: 'Référence existante',
    invoice_number: 'F-77', invoice_issued_on: '2026-09-01', invoice_sent_on: '2026-09-02',
    payment_due_on: '2026-09-30', paid_on: '2026-09-28', amount_ht: 2800, comments: 'Facture réglée',
    include_operations_in_pdf: false, include_expenses_in_pdf: false, include_bbtm_in_pdf: true,
    excluded_operation_keys: ['dpr:12'],
  };
  type Row = Record<string, unknown>;
  let clientNumber = 0;
  function fixture(options: { row?: Row; beforeInsert?: () => Row | undefined; simultaneousReads?: number; fail?: 'read' | 'insert' | 'reread' } = {}) {
    let row = options.row;
    let reads = 0;
    let failed = false;
    let releaseReads: () => void = () => {};
    const initialReads = new Promise<void>((resolve) => { releaseReads = resolve; });
    const respond = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith('/projects')) return respond({ company_id: 1 });
      expect(url.pathname).toBe('/rest/v1/project_billing_periods');
      if (init?.method === 'POST') {
        if (options.fail === 'insert' && !failed) {
          failed = true;
          return respond({ message: 'Création indisponible', code: 'temporary' }, 409);
        }
        row ||= options.beforeInsert?.();
        const incoming = JSON.parse(String(init.body)) as Row;
        const ignored = new Headers(init.headers).get('Prefer')?.includes('resolution=ignore-duplicates');
        if (!row) row = { ...incoming, id: 77 };
        else if (!ignored) row = { ...row, ...incoming };
        return respond(null, 201);
      }
      expect(url.searchParams.get('company_id')).toBe('eq.1');
      expect(url.searchParams.get('project_id')).toBe('eq.42');
      expect(url.searchParams.get('period_month')).toBe('eq.2026-09-01');
      reads += 1;
      if (!failed && (options.fail === 'read' || options.fail === 'reread' && reads === 2)) {
        failed = true;
        return respond({ message: 'Lecture indisponible', code: 'temporary' }, 409);
      }
      const snapshot = row;
      if (options.simultaneousReads && reads <= options.simultaneousReads) {
        if (reads === options.simultaneousReads) releaseReads();
        await initialReads;
      }
      return respond(new Headers(init?.headers).get('Accept')?.includes('pgrst.object') ? snapshot : snapshot ? [snapshot] : []);
    });
    const client = () => createClient('https://billing.example.invalid', 'fixture-publishable-key', {
      global: { fetch }, auth: { storageKey: `billing-fixture-${++clientNumber}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { client, fetch, row: () => row };
  }

  it('returns an existing invoiced month without changing its invoice, reference or PDF choices', async () => {
    const server = fixture({ row: { ...invoicedRow } });
    const period = await ensureProjectBillingPeriod(server.client(), 42, draft);
    expect(period).toMatchObject({
      id: 77, invoiceNumber: 'F-77', invoiceIssuedOn: '2026-09-01', invoiceSentOn: '2026-09-02',
      paymentDueOn: '2026-09-30', paidOn: '2026-09-28', amountHt: 2800, comments: 'Facture réglée',
      clientReference: 'Référence existante', includeOperationsInPdf: false, includeExpensesInPdf: false,
      includeBbtmInPdf: true, excludedOperationKeys: ['dpr:12'],
    });
    expect(server.row()).toEqual(invoicedRow);
    expect(server.fetch.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
  });

  it('reads a competing session’s new invoice intact after a conflict instead of overwriting it', async () => {
    const server = fixture({ beforeInsert: () => ({ ...invoicedRow }) });
    const period = await ensureProjectBillingPeriod(server.client(), 42, draft);
    expect(period).toMatchObject({ invoiceNumber: 'F-77', amountHt: 2800, clientReference: 'Référence existante' });
    expect(server.row()).toEqual(invoicedRow);
    const insert = server.fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(new Headers(insert[1]?.headers).get('Prefer')).toContain('resolution=ignore-duplicates');
    expect(new URL(String(insert[0])).searchParams.get('on_conflict')).toBe('company_id,project_id,period_month');
  });

  it('lets simultaneous sessions converge on the same month and the first saved values', async () => {
    const server = fixture({ simultaneousReads: 2 });
    const periods = await Promise.all([
      ensureProjectBillingPeriod(server.client(), 42, draft),
      ensureProjectBillingPeriod(server.client(), 42, { ...draft, clientReference: 'Autre session', amountHt: 900 }),
    ]);
    expect(periods[0]).toEqual(periods[1]);
    expect(periods[0].clientReference).toBe(server.row()?.client_reference);
    expect(periods[0].amountHt).toBe(server.row()?.amount_ht);
    expect(server.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });

  it.each(['read', 'insert', 'reread'] as const)('propagates a %s failure and allows the same client to retry', async (fail) => {
    const server = fixture({ fail });
    const client = server.client();
    await expect(ensureProjectBillingPeriod(client, 42, draft)).rejects.toMatchObject({ code: 'temporary' });
    await expect(ensureProjectBillingPeriod(client, 42, draft)).resolves.toMatchObject({
      id: 77, periodMonth: '2026-09-01', clientReference: 'Nouvelle référence', amountHt: 0,
    });
  });
});

const input: BillingExportInput = {
  project: {
    id: 144,
    title: 'GUARD VESSEL EMDT',
    projectCode: 'P144',
    clientId: 1,
    clientSharePointItemId: '',
    clientName: 'EMDT',
    primaryVesselId: 1,
    primaryVesselSharePointItemId: '',
    primaryVesselName: 'GOURY',
    secondaryVesselId: null,
    secondaryVesselSharePointItemId: '',
    secondaryVesselName: '',
    startsOn: '2024-06-01',
    endsOn: '2026-08-31',
    deliveryAt: '',
    redeliveryAt: '',
    charterStartsAt: '',
    charterEndsAt: '',
    deliveryPort: '',
    redeliveryPort: '',
    contractType: 'Affrètement',
    operationArea: '',
    isRovSupport: false,
    isDivingSupport: false,
    status: 'Facturé',
    description: '',
    sourceLabel: 'test',
    sharePointListTitle: '',
    sharePointItemId: '',
    sourceModifiedAt: '',
    archivedAt: '',
    updatedAt: '',
  },
  contract: {
    id: 1,
    projectId: 144,
    ownerIdentity: '',
    vesselAssignmentLimit: '',
    extensionCount: null,
    extensionDuration: null,
    extensionUnit: '',
    autoExtensionPeriod: '',
    maxExtensionDays: null,
    mobilisationFee: null,
    demobilisationFee: null,
    feeCurrency: 'EUR',
    charterHire: 4450,
    extensionHire: null,
    hireCurrency: 'EUR',
    hireUnit: 'jour',
    maxAuditPeriod: '',
    supplytimeSchemaVersion: '',
    supplytimeData: {},
    sourceLabel: 'test',
    sharePointListTitle: '',
    sharePointItemId: '',
    sourceModifiedAt: '',
    archivedAt: '',
  },
  operations: [{
    id: 13,
    projectId: 144,
    startsOn: '2024-06-01',
    endsOn: '2026-08-31',
    primaryVesselId: 1,
    primaryVesselName: 'GOURY',
    status: 'Validé',
    description: '',
    charterHire: 4227.5,
    hireCurrency: 'EUR',
    hireUnit: 'Journalier',
    sourceLabel: 'BBTM',
    createdAt: '2026-07-20T00:00:00Z',
  }],
  period: {
    id: 1,
    projectId: 144,
    companyId: 1,
    periodMonth: '2026-06-01',
    clientReference: '',
    invoiceNumber: '',
    invoiceIssuedOn: '',
    invoiceSentOn: '',
    paymentDueOn: '',
    paidOn: '',
    amountHt: 0,
    comments: '',
  },
  expenses: [],
  services: [],
  includeBbtmService: true,
  dprs: [{
    id: 838,
    reportDate: '2026-06-01',
    vesselId: 1,
    vesselName: 'GOURY',
    operation: '24/24 Crew Change',
    amountHt: 4227.5,
    vesselStatus: 'Navire au Port',
    arrivalAt: '2026-06-01T22:20:00Z',
    departureAt: '2026-06-02T12:20:00Z',
    fuelLiters: 7200,
  }],
  selectedVesselName: 'GOURY',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

describe('billing operation export', () => {
  it('creates only the lines backed by DPRs in the requested period', () => {
    const rows = billingOperationRows(input);
    expect(rows).toEqual([{
      date: '01/06/2026',
      operation: '24/24 Crew Change',
      amountHt: 4227.5,
      comments: 'Accosté au port à 00h20\nRefueling : 7 200 L\nAppareillage du quai à 14h20',
    }]);
  });

  it('uses the DPR amount before the operation and contract defaults', () => {
    const rows = billingOperationRows({
      ...input,
      dprs: [{ ...input.dprs[0], amountHt: 4450 }],
    });
    expect(rows[0].amountHt).toBe(4450);
  });

  it('uses the operation hire before the current contract hire when the DPR has no amount', () => {
    const rows = billingOperationRows({
      ...input,
      dprs: [
        {
          ...input.dprs[0],
          id: 994,
          reportDate: '2026-07-28',
          operation: '24/24 Crew Change',
          amountHt: null,
        },
        {
          ...input.dprs[0],
          id: 995,
          reportDate: '2026-07-29',
          operation: '24/24 Operation',
          amountHt: null,
        },
      ],
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
    expect(rows.map(({ date, operation, amountHt }) => ({ date, operation, amountHt }))).toEqual([
      { date: '28/07/2026', operation: '24/24 Crew Change', amountHt: 4227.5 },
      { date: '29/07/2026', operation: '24/24 Operation', amountHt: 4227.5 },
    ]);
  });

  it('resolves the hire from the operation active for the vessel and date', () => {
    expect(billingOperationHire([
      ...input.operations,
      {
        ...input.operations[0],
        id: 40,
        startsOn: '2026-08-10',
        endsOn: '2026-08-20',
        primaryVesselName: 'LE ROZEL',
        charterHire: 3600,
      },
    ], '2026-08-12', 'LE ROZEL')).toBe(3600);
  });

  it('falls back to the contract hire when no operation covers the DPR', () => {
    const rows = billingOperationRows({
      ...input,
      operations: [],
      dprs: [{ ...input.dprs[0], amountHt: null }],
    });
    expect(rows[0].amountHt).toBe(4450);
  });

  it('uses the contract rate applicable to each day across a tariff change', () => {
    const scheduledContract = {
      ...input.contract!,
      hirePeriods: [
        { id: 1, projectId: 144, contractId: 1, startsOn: '2026-06-01', endsOn: '2026-06-15', charterHire: 4000, standbyHire: 3000, weatherStandbyHire: 2000, hireCurrency: 'EUR', hireUnit: 'jour' },
        { id: 2, projectId: 144, contractId: 1, startsOn: '2026-06-16', endsOn: '', charterHire: 4750, standbyHire: 3750, weatherStandbyHire: 2750, hireCurrency: 'EUR', hireUnit: 'jour' },
      ],
    };
    const rows = billingOperationRows({
      ...input,
      contract: scheduledContract,
      operations: input.operations.map((operation) => ({ ...operation, charterHireOverride: false })),
      dprs: [
        { ...input.dprs[0], id: 1, reportDate: '2026-06-15', amountHt: null },
        { ...input.dprs[0], id: 2, reportDate: '2026-06-16', amountHt: null },
      ],
    });
    expect(rows.map((row) => row.amountHt)).toEqual([4000, 4750]);
  });

  it('uses the Stand-by and Weather Stand-by contract rates for each DPR day', () => {
    const scheduledContract = {
      ...input.contract!,
      hirePeriods: [{
        id: 1,
        projectId: 144,
        contractId: 1,
        startsOn: '2026-06-01',
        endsOn: '',
        charterHire: 4000,
        standbyHire: 3000,
        weatherStandbyHire: 2000,
        hireCurrency: 'EUR',
        hireUnit: 'jour',
      }],
    };
    const rows = billingOperationRows({
      ...input,
      contract: scheduledContract,
      operations: input.operations.map((operation) => ({ ...operation, charterHireOverride: false })),
      dprs: [
        { ...input.dprs[0], id: 1, operation: '24/24 Stand-by', amountHt: null },
        { ...input.dprs[0], id: 2, reportDate: '2026-06-02', operation: '24/24 Weather Stand-by', amountHt: null },
      ],
    });
    expect(rows.map((row) => row.amountHt)).toEqual([3000, 2000]);
  });

  it('keeps a manual operation override and excludes deselected PDF lines', () => {
    const rows = billingOperationRows({
      ...input,
      period: { ...input.period, excludedOperationKeys: ['dpr:2'] },
      operations: input.operations.map((operation) => ({ ...operation, charterHire: 5100, charterHireOverride: true })),
      dprs: [
        { ...input.dprs[0], id: 1, amountHt: null },
        { ...input.dprs[0], id: 2, reportDate: '2026-06-02', amountHt: null },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].amountHt).toBe(5100);
  });

  it('keeps selected operation rows when their financial amounts are hidden', () => {
    const rows = billingOperationRows({
      ...input,
      period: { ...input.period, includeOperationsInPdf: false },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '01/06/2026',
      operation: '24/24 Crew Change',
      comments: expect.stringContaining('Refueling'),
    });
  });

  it('renders a multiline operation as a single PDF table line', () => {
    const rows = billingOperationRows({
      ...input,
      dprs: [{
        ...input.dprs[0],
        operation: '03H00 LARGUE\n04H00 LARGUE BOIS A.\n08H25 AS',
      }],
    });
    expect(rows[0].operation).toBe('03H00 LARGUE 04H00 LARGUE BOIS A. 08H25 AS');
  });

  it('derives BBTM DPR operations from port-call reasons instead of the daily description', async () => {
    const reportOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 994,
          report_date: '2026-07-28',
          vessel_id: null,
          description: '11H30 START MP\n12H20 LARGUE QUAI DU MAROC',
          source_payload: null,
        },
        {
          id: 995,
          report_date: '2026-07-29',
          vessel_id: null,
          description: '04H00 - QUART BOIS A.\n08H25 - ASSISTANCE TRAVAUX',
          source_payload: null,
        },
      ],
      error: null,
    });
    const reportSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({ order: reportOrder }),
            }),
          }),
        }),
      }),
    });
    const callSelect = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              dpr_id: 994,
              arrival_at: null,
              departure_at: '2026-07-28T12:20:00Z',
              display_order: 0,
              dpr_port_call_reasons: [{ reason_type_key: 'crew-change' }],
            },
            {
              dpr_id: 995,
              arrival_at: null,
              departure_at: null,
              display_order: 0,
              dpr_port_call_reasons: [],
            },
          ],
          error: null,
        }),
      }),
    });
    const supplySelect = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const from = vi.fn((table: string) => {
      if (table === 'dpr_reports') return { select: reportSelect };
      if (table === 'dpr_port_calls') return { select: callSelect };
      if (table === 'dpr_supplies') return { select: supplySelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const dprs = await fetchProjectBillingDprs(
      { from } as unknown as SupabaseClient,
      2,
      '2026-07-28',
      '2026-07-29',
    );

    expect(callSelect).toHaveBeenCalledWith(
      'dpr_id,arrival_at,departure_at,display_order,dpr_port_call_reasons(reason_type_key)',
    );
    expect(dprs.map((dpr) => dpr.operation)).toEqual([
      '24/24 Crew Change',
      '24/24 Operation',
    ]);
  });

  it('uses the exact normalized fuel value before rounded legacy P144 fields', async () => {
    const reportOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 1058,
          report_date: '2026-08-11',
          vessel_id: null,
          description: '',
          source_payload: {
            P144_x002d_FAC_x002d_Fuel_x0020_: '8000',
            P144_x002d_FAC_x002d_Fuel_x0028_: '8',
          },
        },
        {
          id: 1059,
          report_date: '2026-08-12',
          vessel_id: null,
          description: '',
          source_payload: { P144_x002d_FAC_x002d_Fuel_x0020_: '8000' },
        },
      ],
      error: null,
    });
    const reportSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({ order: reportOrder }),
            }),
          }),
        }),
      }),
    });
    const callSelect = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    const supplySelect = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [{ dpr_id: 1058, fuel_m3: '8.052' }], error: null }),
    });
    const from = vi.fn((table: string) => {
      if (table === 'dpr_reports') return { select: reportSelect };
      if (table === 'dpr_port_calls') return { select: callSelect };
      if (table === 'dpr_supplies') return { select: supplySelect };
      throw new Error(`Unexpected table ${table}`);
    });

    const [dpr, legacyDpr] = await fetchProjectBillingDprs(
      { from } as unknown as SupabaseClient,
      144,
      '2026-08-11',
      '2026-08-12',
    );

    expect(dpr.fuelLiters).toBe(8_052);
    expect(billingDprComment(dpr)).toBe('Refueling : 8 052 L');
    expect(legacyDpr.fuelLiters).toBe(8_000);
  });

  it('keeps the explicit P144 operation before port-call-derived defaults', () => {
    expect(resolveBillingDprOperation('24/24 Weather Stand-by', ['crew-change']))
      .toBe('24/24 Weather Stand-by');
    expect(resolveBillingDprOperation('', ['weather-standby']))
      .toBe('24/24 Weather Stand-by');
  });
});

describe('monthly billing completion', () => {
  it('uses 30 calendar days minus one weather standby for P144 even when a DPR is missing', () => {
    const dprs = Array.from({ length: 29 }, (_, index) => ({ ...input.dprs[0], id: index + 1, reportDate: `2026-09-${String(index + 1).padStart(2, '0')}`, operation: index === 0 ? '24/24 Weather Stand-by' : index === 7 || index === 21 ? '24/24 Crew Change' : '24/24 Operation' }));
    expect(countDailyOperations(dprs)).toBe(28);
    expect(automaticBillingServiceQuantity(input.project, 'Spread Antipollution', '2026-09-01', dprs)).toBe(29);
    const services = billingExportServices({ ...input, period: { ...input.period, periodMonth: '2026-09-01', includeOperationsInPdf: false, excludedOperationKeys: ['dpr:1'] }, dprs, services: [{ id: 1, billingPeriodId: 1, serviceCatalogId: 7, category: 'Spread Antipollution', descriptionHtml: '', unitAmountHt: 92.58, quantity: 28 }] });
    expect(services[0].quantity).toBe(29);
    expect(billingServicesTotal(services)).toBeCloseTo(2684.82, 2);
  });
  it.each([['2026-01', 31], ['2026-02', 28], ['2028-02', 29], ['2026-09', 30]])('uses the calendar length of %s', (month, days) => {
    expect(automaticBillingServiceQuantity(input.project, 'Spread Antipollution', month, [])).toBe(days);
  });
  it('subtracts only distinct weather dates of the billing month, retaining all other days', () => {
    const dprs = [
      { reportDate: '2026-08-31', operation: '24/24 Weather Stand-by' },
      { reportDate: '2026-09-01', operation: '24/24 Weather Stand-by' },
      { reportDate: '2026-09-01', operation: ' 24/24  weather stand-by ' },
      { reportDate: '2026-09-02', operation: '24/24 Crew Change' },
      { reportDate: '2026-09-03', operation: 'Contractual Maintenance Day' },
      { reportDate: '2026-09-04', operation: '24/24 Stand-by' },
      { reportDate: '2026-10-01', operation: '24/24 Weather Stand-by' },
    ];
    expect(automaticBillingServiceQuantity(input.project, 'spread_antipollution', '2026-09-01', dprs)).toBe(29);
    expect(automaticBillingServiceQuantity(input.project, 'Spread Antipollution', '2026-09', Array.from({ length: 30 }, (_, index) => ({ reportDate: `2026-09-${String(index + 1).padStart(2, '0')}`, operation: '24/24 Weather Stand-by' })))).toBe(0);
  });
  it('keeps the monthly rule for a shorter export and preserves manual quantities on other services and projects', () => {
    const service = { id: 1, billingPeriodId: 1, serviceCatalogId: 7, category: 'Spread Antipollution', descriptionHtml: '', unitAmountHt: 92.58, quantity: 28 };
    const exportInput = { ...input, period: { ...input.period, periodMonth: '2026-09-01' }, startDate: '2026-09-15', endDate: '2026-09-30', dprs: [], monthlyDprs: [{ ...input.dprs[0], reportDate: '2026-09-01', operation: '24/24 Weather Stand-by' }], services: [service, { ...service, id: 2, category: 'Assistance', quantity: 3 }] };
    expect(billingExportServices(exportInput).map((row) => row.quantity)).toEqual([29, 3]);
    expect(billingExportServices({ ...exportInput, project: { ...input.project, projectCode: 'P145' } }).map((row) => row.quantity)).toEqual([28, 3]);
    expect(billingExportServices({ ...exportInput, period: { ...exportInput.period, includeBbtmInPdf: false } })).toEqual([]);
    expect(billingExportServices({ ...exportInput, services: [{ ...service, includeInPdf: false }] })).toEqual([]);
  });
  it('uses the P144 client reference by default', () => {
    expect(defaultProjectClientReference(input.project)).toBe('TRE-PO-000503');
  });

  it('identifies and completes missing dates with the operation hire', () => {
    expect(missingBillingDates(input.dprs, '2026-06-01', '2026-06-03')).toEqual([
      '2026-06-02',
      '2026-06-03',
    ]);
    const completed = completeBillingDprs(input.dprs, '2026-06-01', '2026-06-03', {
      vesselName: 'GOURY',
      amountHt: 4227.5,
    });
    expect(completed).toHaveLength(3);
    expect(completed[2]).toMatchObject({
      reportDate: '2026-06-03',
      vesselName: 'GOURY',
      operation: '24/24 Operation',
      amountHt: 4227.5,
    });
    expect(countDailyOperations(completed)).toBe(3);
  });

  it('calculates the BBTM subtotal from editable unit amounts and quantities', () => {
    const services = [{
      id: 1,
      billingPeriodId: 1,
      serviceCatalogId: 7,
      category: 'Spread Antipollution',
      descriptionHtml: '<p>Prestation</p>',
      unitAmountHt: 350,
      quantity: 29,
    }] as const;
    expect(billingServicesTotal([...services])).toBe(10150);
    expect(billingInvoiceTotal(126825, 18996.46, [...services], true)).toBe(155971.46);
    expect(billingInvoiceTotal(126825, 18996.46, [...services], false)).toBe(145821.46);
  });

  it('renames service attachments with date, invoice and category', () => {
    const file = new File(['test'], 'source.pdf', { type: 'application/pdf' });
    const renamed = billingExpenseAttachmentName(file, {
      id: 1,
      billingPeriodId: 1,
      category: 'port',
      nature: '',
      supplier: 'Port',
      supplierSpecialties: ['Frais de port'],
      invoiceDate: '2026-06-10',
      invoiceNumber: 'R202600790',
      amountHt: 72.01,
      amountTtc: null,
      currency: 'EUR',
      quantity: null,
      unit: '',
      comments: '',
      dprReportId: null,
    });
    expect(renamed.name).toBe('2026-06-10 - R202600790 - Frais de port.pdf');
  });

  it('uses the saved supplier specialties before legacy expense values', () => {
    expect(billingExpenseSpecialtyLabel({
      supplierSpecialties: ['Inspection', 'Radeaux'],
      nature: 'Ancienne nature',
      category: 'other',
    })).toBe('Inspection · Radeaux');
    expect(billingExpenseSpecialtyLabel({
      supplierSpecialties: [],
      nature: 'Frais de port',
      category: 'port',
    })).toBe('Frais de port');
  });
});

describe('Power BI P144 comments formula', () => {
  const base: ProjectBillingDpr = {
    id: 1,
    reportDate: '2026-06-01',
    vesselId: 1,
    vesselName: 'GOURY',
    operation: '24/24 Crew Change',
    amountHt: 4227.5,
    vesselStatus: 'Navire au Port',
    arrivalAt: '2026-06-01T22:20:00Z',
    departureAt: '2026-06-02T12:20:00Z',
    fuelLiters: 7200,
  };

  it('keeps the exact Crew Change line order and UTC+2 conversion', () => {
    expect(billingDprComment(base)).toBe(
      'Accosté au port à 00h20\nRefueling : 7 200 L\nAppareillage du quai à 14h20',
    );
  });

  it('applies the port movement comment logic to Weather Stand-by', () => {
    expect(billingDprComment({
      ...base,
      operation: '24/24 Weather Stand-by',
      fuelLiters: null,
    })).toBe('Accosté au port à 00h20\nAppareillage du quai à 14h20');
  });

  it('returns only refueling for a regular operation', () => {
    expect(billingDprComment({
      ...base,
      operation: '24/24 Operation',
    })).toBe('Refueling : 7 200 L');
  });

  it('keeps a saved arrival when the legacy vessel status is stale', () => {
    expect(billingDprComment({
      ...base,
      vesselStatus: 'Navire en Opération - On hire',
    })).toBe('Accosté au port à 00h20\nRefueling : 7 200 L\nAppareillage du quai à 14h20');
  });
});

describe('raw billing lines', () => {
  const rawLine: ProjectBillingRawLine = {
    id: 1, billingPeriodId: 1, serviceCatalogId: null, serviceDate: '2026-06-02',
    vesselId: null, vesselName: '',
    designation: 'Spread Antipollution', unitAmountHt: 0.29, quantity: 1.5, includeInPdf: true,
  };

  it('rounds each line to cents before summing decimal quantities and includes legacy deselected lines', () => {
    expect(billingRawLineTotal(rawLine)).toBe(0.44);
    expect(billingRawLineTotal({ unitAmountHt: 92.58, quantity: 1.125 })).toBe(104.15);
    expect(billingRawLineTotal({ unitAmountHt: 0.1, quantity: 0.05 })).toBe(0.01);
    expect(billingRawLineTotal({ unitAmountHt: 500, quantity: 0 })).toBe(0);
    const lines = [rawLine, { ...rawLine, id: 2 }, { ...rawLine, id: 3, unitAmountHt: 900, includeInPdf: false }];
    expect(billingRawLinesTotal(lines)).toBe(1350.88);
    expect(billingInvoiceTotal(100, 0.1, [], false, lines)).toBe(1450.98);
    expect(billingInvoiceTotal(100, 0.1, [], false, lines, false)).toBe(100.1);
  });

  it.each([NaN, Infinity, -1, 1e21])('keeps the live total usable for an invalid numeric draft (%s)', (value) => {
    expect(billingRawLineTotal({ unitAmountHt: value, quantity: 1 })).toBe(0);
    expect(billingRawLineTotal({ unitAmountHt: 1, quantity: value })).toBe(0);
  });

  it('keeps manual quantities on P144 even when the designation is an automatically calculated catalogue category', () => {
    const lines = billingExportRawLines({ ...input, rawLines: [
      { ...rawLine, id: 2, serviceCatalogId: 7 },
      { ...rawLine, serviceDate: '2026-06-01' },
      { ...rawLine, id: 3, includeInPdf: false },
    ] });
    expect(lines.map((line) => [line.id, line.quantity, line.unitAmountHt, line.serviceCatalogId]))
      .toEqual([[1, 1.5, 0.29, null], [2, 1.5, 0.29, 7], [3, 1.5, 0.29, null]]);
    expect(billingExportRawLines({ ...input, period: { ...input.period, includeRawInPdf: false }, rawLines: [rawLine] })).toEqual([]);
    expect(billingExportRawLines(input)).toEqual([]);
  });

  let clientNumber = 0;
  function clientWithFetch(fetch: typeof globalThis.fetch) {
    return createClient('https://raw-billing.example.invalid', 'fixture-publishable-key', {
      global: { fetch },
      auth: { storageKey: `raw-billing-${++clientNumber}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  const respond = (data: unknown, status = 200) => new Response(data === null ? null : JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  const rawDbLine = {
    id: 1, billing_period_id: 1, service_catalog_id: null, service_date: '2026-06-02',
    designation: 'Spread Antipollution', unit_amount_ht: '0.29', quantity: '1.5', include_in_pdf: true,
  };

  it('loads every raw line beyond the PostgREST 1,000-row response limit and maps the period choice', async () => {
    const requests: URL[] = [];
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      expect(url.searchParams.get('project_id')).toBe('eq.144');
      if (url.pathname.endsWith('/project_billing_periods')) return respond([{
        id: 1, company_id: 1, project_id: 144, period_month: '2026-06-01', include_raw_in_pdf: false,
      }]);
      if (!url.pathname.endsWith('/project_billing_raw_lines')) return respond([]);
      requests.push(url);
      expect(url.searchParams.get('order')).toBe('service_date.asc,id.asc');
      expect(url.searchParams.get('limit')).toBe('1000');
      const offset = Number(url.searchParams.get('offset'));
      return respond(Array.from({ length: offset === 0 ? 1_000 : 27 }, (_, index) => ({
        ...rawDbLine, id: offset + index + 1,
      })));
    });
    const data = await fetchProjectBillingData(clientWithFetch(fetch), 144);
    expect(requests.map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
    expect(data.rawLines).toHaveLength(1_027);
    expect(data.rawLines?.at(-1)).toEqual({ ...rawLine, id: 1_027 });
    expect(data.periods[0].includeRawInPdf).toBe(false);
  });

  it('propagates a later page failure rather than returning an incomplete list', async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (!url.pathname.endsWith('/project_billing_raw_lines')) return respond([]);
      if (url.searchParams.get('offset') === '0') return respond(Array.from({ length: 1_000 }, () => rawDbLine));
      return respond({ code: 'raw_page_failed', message: 'Page indisponible' }, 409);
    });
    await expect(fetchProjectBillingData(clientWithFetch(fetch), 144)).rejects.toMatchObject({ code: 'raw_page_failed' });
  });

  it('saves a manually entered catalogue name without linking it, changing its price or calculating its quantity', async () => {
    const payloads: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(request));
      if (url.pathname.endsWith('/projects')) return respond({ company_id: 1 });
      expect(url.pathname).toBe('/rest/v1/project_billing_raw_lines');
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      payloads.push(payload);
      return respond({ ...payload, id: 17 });
    });
    const client = clientWithFetch(fetch);
    const draft = { serviceCatalogId: null, serviceDate: '2026-06-02', designation: ' Spread Antipollution ', unitAmountHt: 32.5, quantity: 2.125 };
    await expect(saveProjectBillingRawLine(client, 144, 1, draft)).resolves.toMatchObject({
      id: 17, designation: 'Spread Antipollution', unitAmountHt: 32.5, quantity: 2.125, serviceCatalogId: null, includeInPdf: true,
    });
    await expect(saveProjectBillingRawLine(client, 144, 1, { ...draft, serviceCatalogId: 7, vesselId: 42, vesselName: ' Navire figé ', quantity: 1.5, includeInPdf: false }, 17))
      .resolves.toMatchObject({ vesselId: 42, vesselName: 'Navire figé' });
    expect(payloads[0]).toMatchObject({
      company_id: 1, project_id: 144, billing_period_id: 1, service_catalog_id: null,
      designation: 'Spread Antipollution', unit_amount_ht: 32.5, quantity: 2.125, include_in_pdf: true,
      vessel_id: null, vessel_name: '',
    });
    expect(payloads[1]).toMatchObject({ service_catalog_id: 7, vessel_id: 42, vessel_name: 'Navire figé', quantity: 1.5, include_in_pdf: true });
    const updateRequest = fetch.mock.calls.at(-1)!;
    expect(updateRequest[1]?.method).toBe('PATCH');
    expect(new URL(String(updateRequest[0])).searchParams.get('id')).toBe('eq.17');
  });

  it('maps selected vessels and historical raw vessel names without looking up the current fleet or catalogue', async () => {
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL(String(request));
      if (!url.pathname.endsWith('/project_billing_raw_lines')) return respond([]);
      return respond([
        { ...rawDbLine, vessel_id: '42', vessel_name: 'Nom historique du navire' },
        { ...rawDbLine, id: 2 },
      ]);
    });
    const data = await fetchProjectBillingData(clientWithFetch(fetch), 144);
    expect(data.rawLines).toEqual([
      { ...rawLine, vesselId: 42, vesselName: 'Nom historique du navire' },
      { ...rawLine, id: 2 },
    ]);
    expect(fetch.mock.calls.every(([request]) => !String(request).includes('/vessels') && !String(request).includes('/project_service_catalog'))).toBe(true);
  });

  it('keeps identical catalogue categories for separate vessels and saves the selected vessel snapshot', async () => {
    const catalogueRows = [
      { id: 7, company_id: 1, category: 'Mobilisation', unit_amount_ht: 200, vessel_id: '42', vessel_name: 'Navire A', active: true },
      { id: 8, company_id: 1, category: 'Mobilisation', unit_amount_ht: 300, vessel_id: 43, vessel_name: 'Navire B', active: true },
      { id: 9, company_id: 1, category: 'Mobilisation', unit_amount_ht: 100, active: true },
    ];
    const payloads: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(request)).pathname).toBe('/rest/v1/project_service_catalog');
      if (init?.method !== 'POST' && init?.method !== 'PATCH') return respond(catalogueRows);
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      payloads.push(payload);
      return respond({ ...payload, id: 10, company_id: 1 });
    });
    const client = clientWithFetch(fetch);
    const entries = await fetchProjectServiceCatalog(client);
    expect(entries.map((entry) => [entry.category, entry.vesselId, entry.vesselName, entry.unitAmountHt])).toEqual([
      ['Mobilisation', 42, 'Navire A', 200], ['Mobilisation', 43, 'Navire B', 300], ['Mobilisation', null, '', 100],
    ]);
    await expect(saveProjectServiceCatalogEntry(client, {
      category: ' Assistance ', unitAmountHt: 75, vesselId: 42, vesselName: ' Navire A ', descriptionHtml: '',
    })).resolves.toMatchObject({ category: 'Assistance', vesselId: 42, vesselName: 'Navire A', unitAmountHt: 75 });
    expect(payloads[0]).toMatchObject({ category: 'Assistance', vessel_id: 42, vessel_name: 'Navire A', unit_amount_ht: 75 });
    await saveProjectServiceCatalogEntry(client, { id: 10, category: 'Assistance', unitAmountHt: 50, descriptionHtml: '' });
    expect(payloads[1]).toMatchObject({ vessel_id: null, vessel_name: '' });
    expect(fetch.mock.calls.at(-1)?.[1]?.method).toBe('PATCH');
  });

  it('preserves the legacy line flag API, persists the global choice and deletes only the requested raw line', async () => {
    const fetch = vi.fn(async () => respond(null));
    const client = clientWithFetch(fetch);
    await setProjectBillingRawLinePdfInclusion(client, 17, false);
    await saveProjectBillingPdfSelection(client, 1, {
      includeOperationsInPdf: true, includeExpensesInPdf: true, includeBbtmInPdf: false,
      includeRawInPdf: false, excludedOperationKeys: [],
    });
    await deleteProjectBillingRawLine(client, 17);
    const calls = fetch.mock.calls as unknown as [RequestInfo | URL, RequestInit][];
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({ include_in_pdf: false });
    expect(JSON.parse(String(calls[1][1]?.body))).toMatchObject({ include_raw_in_pdf: false });
    expect(calls[2][1]?.method).toBe('DELETE');
    expect(new URL(String(calls[2][0])).searchParams.get('id')).toBe('eq.17');
  });

  async function readPdf(blob: Blob) {
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    const pages = pdf.getPages().map((page) => {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      return streams.map((ref) => {
        const stream = pdf.context.lookup(ref);
        return stream instanceof PDFRawStream ? new TextDecoder('windows-1252').decode(decodePDFRawStream(stream).decode()) : '';
      }).join('\n');
    });
    const elements = pages.flatMap((content, pageIndex) => [...content.matchAll(/\bBT\s*\n([\s\S]*?)\nET\b/g)].flatMap((block) => {
      const origin = block[1].match(/([-\d.]+)\s+([-\d.]+)\s+Td/);
      if (!origin) return [];
      const leading = Number(block[1].match(/([-\d.]+)\s+TL/)?.[1] || 0);
      let previousEnd = 0;
      let line = 0;
      return [...block[1].matchAll(/\(((?:\\[\s\S]|[^\\()])*)\)\s*Tj/g)].map((item) => {
        line += (block[1].slice(previousEnd, item.index).match(/T\*/g) || []).length;
        previousEnd = item.index! + item[0].length;
        const value = item[1].replace(/\\([0-7]{1,3}|[\\()nrtbf])/g, (_, escaped: string) => {
          if (/^[0-7]+$/.test(escaped)) return String.fromCharCode(parseInt(escaped, 8));
          return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[escaped] ?? escaped;
        });
        return { value, x: Number(origin[1]), y: Number(origin[2]) - line * leading, pageIndex };
      });
    }));
    return { pdf, pages, text: pages.join('\n'), elements, visibleText: elements.map((element) => element.value).join(' ').replace(/\s+/g, ' ').trim() };
  }

  function expectSingleLandscapeA4(pdf: PDFDocument) {
    expect(pdf.getPageCount()).toBe(1);
    const size = pdf.getPage(0).getSize();
    expect(size.width).toBeCloseTo(841.89, 1);
    expect(size.height).toBeCloseTo(595.28, 1);
  }

  it('preserves a complete 31-day month, 95 details, supplier fields, DPR comments and currency totals in the synthetic layout', async () => {
    const dprs = Array.from({ length: 31 }, (_, index) => ({
      ...input.dprs[0], id: index + 1, reportDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
      operation: index === 0 ? '24/24 Crew Change' : `OPERATION-JOUR-${String(index + 1).padStart(3, '0')}`,
      amountHt: 100,
    }));
    const rawLines = Array.from({ length: 95 }, (_, index) => ({
      ...rawLine, id: index + 1, serviceDate: '2026-01-15', designation: `DETAIL-COMPLET-${String(index + 1).padStart(3, '0')}`,
      vesselId: 42, vesselName: 'NAVIRE-HISTORIQUE-COMPLET',
    }));
    const expenses = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1, billingPeriodId: 1, category: 'port' as const, nature: '',
      supplier: `FOURNISSEUR-UNIQUE-${String(index + 1).padStart(3, '0')}`,
      supplierSpecialties: [`SPECIALITE-${String(index + 1).padStart(3, '0')} ${'Libellé complet '.repeat(6)}`],
      invoiceDate: '2026-01-15', invoiceNumber: `FACTURE-UNIQUE-${String(index + 1).padStart(3, '0')}`,
      amountHt: index + 1, amountTtc: null, currency: index === 1 ? 'USD' : 'EUR',
      quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
    }));
    const services = [{
      id: 1, billingPeriodId: 1, serviceCatalogId: 1, category: 'SERVICE-BBTM-DROITE', descriptionHtml: '',
      unitAmountHt: 7, quantity: 3, includeInPdf: true,
    }];
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText, elements } = await readPdf(await generateBillingPdf({
        ...input, project: { ...input.project, projectCode: 'P145' },
        contract: { ...input.contract!, hireCurrency: 'USD' },
        startDate: '2026-01-01', endDate: '2026-01-31',
        period: { ...input.period, periodMonth: '2026-01-01', clientReference: 'REFERENCE-CONSERVEE' },
        dprs, rawLines, expenses, services,
      }));
      expectSingleLandscapeA4(pdf);
      expect(visibleText).toContain("Loyers d'Affrètement");
      expect(visibleText).toContain('Détail des Opérations');
      expect(visibleText).toContain('Frais imputables');
      expect(visibleText).toContain('Prestations BBTM');
      expect(visibleText).toContain('REFERENCE-CONSERVEE');
      for (const day of Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, '0')}/01/2026`)) expect(visibleText).toContain(day);
      for (const dpr of dprs.slice(1)) expect(visibleText.split(dpr.operation)).toHaveLength(2);
      for (const line of rawLines) expect(visibleText.split(line.designation)).toHaveLength(2);
      for (const expense of expenses) {
        expect(visibleText.split(expense.supplier)).toHaveLength(2);
        expect(visibleText.split(expense.invoiceNumber)).toHaveLength(2);
        expect(visibleText).toContain(expense.supplierSpecialties[0].trim());
      }
      for (const comment of billingDprComment(dprs[0]).split('\n')) expect(visibleText).toContain(comment);
      expect(visibleText).toContain('3 102,00 USD');
      expect(visibleText).toContain('165,80 €');
      expect(visibleText).toContain('41,80 €');
      expect(visibleText).toContain('21,00 €');
      expect(visibleText).not.toContain('3 267,80 €');
      for (const removed of ['Saisie brute', 'Loyers et DPR', 'Justificatifs', 'TABLEAU SYNTHÉTIQUE', 'Montants HT par devise', 'sans conversion', 'données fictives']) expect(visibleText.toLocaleLowerCase('fr-FR')).not.toContain(removed.toLocaleLowerCase('fr-FR'));

      const pageSize = pdf.getPage(0).getSize();
      const expensesTitle = elements.find((element) => element.value === 'Frais imputables')!;
      const servicesTitle = elements.find((element) => element.value === 'Prestations BBTM')!;
      const service = elements.find((element) => element.value === 'SERVICE-BBTM-DROITE')!;
      expect(expensesTitle).toBeDefined();
      expect(servicesTitle).toBeDefined();
      expect(service).toBeDefined();
      expect(expensesTitle.x).toBeGreaterThan(pageSize.width / 2);
      expect(servicesTitle.x).toBeGreaterThan(pageSize.width / 2);
      expect(service.x).toBeGreaterThan(pageSize.width / 2);
      expect(servicesTitle.y).toBeLessThan(expensesTitle.y);
      const detailsTitleIndex = elements.findIndex((element) => element.value === 'Détail des Opérations');
      const detailHeaders = elements.slice(detailsTitleIndex + 1);
      const dateHeader = detailHeaders.find((element) => element.value === 'Date')!;
      const totalHeader = detailHeaders.find((element) => /^(Prix Total HT|Total HT)$/.test(element.value))!;
      expect(dateHeader).toBeDefined();
      expect(totalHeader).toBeDefined();
      expect(dateHeader.x).toBeLessThan(pageSize.width * 0.15);
      expect(totalHeader.x).toBeGreaterThan(pageSize.width * 0.85);
      for (const element of elements) {
        expect(element.x).toBeGreaterThanOrEqual(0);
        expect(element.x).toBeLessThanOrEqual(pageSize.width);
        expect(element.y).toBeGreaterThanOrEqual(0);
        expect(element.y).toBeLessThanOrEqual(pageSize.height);
      }
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps all 95 operation details, long vessel snapshots and rounded totals on one landscape A4 page', async () => {
    const longProjectTitle = 'Campagne maritime très longue '.repeat(8);
    const rawLines = Array.from({ length: 95 }, (_, index) => ({
      ...rawLine, id: index + 1, designation: `SAISIE-UNIQUE-${String(index + 1).padStart(3, '0')}`,
      vesselId: index + 1, vesselName: `NAVIRE-UNIQUE-${String(index + 1).padStart(3, '0')} ${'Nom maritime très long '.repeat(7)}`,
    }));
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, pages, text, visibleText } = await readPdf(await generateBillingPdf({
        ...input, project: { ...input.project, title: longProjectTitle }, dprs: [], period: { ...input.period, includeOperationsInPdf: false, includeExpensesInPdf: false, includeBbtmInPdf: false },
        rawLines: [...rawLines, { ...rawLine, id: 999, designation: 'EXCLUE-DU-PDF', includeInPdf: false }],
      }));
      expectSingleLandscapeA4(pdf);
      expect(visibleText).toContain(longProjectTitle.trim());
      expect(visibleText).toContain('Détail des Opérations');
      for (const column of ['Date', 'Navire', 'Désignation']) expect(visibleText).toContain(column);
      expect(visibleText).toMatch(/Prix unitaire HT|PU HT/);
      expect(visibleText).toMatch(/Quantité|Qté/);
      expect(visibleText).toMatch(/Prix Total HT|Total HT/);
      for (const line of rawLines) {
        expect(text.split(line.designation)).toHaveLength(2);
        expect(text.split(line.vesselName.split(' ')[0])).toHaveLength(2);
      }
      expect(visibleText.match(/Nom maritime très long/g)).toHaveLength(95 * 7);
      expect(text.split('EXCLUE-DU-PDF')).toHaveLength(2);
      expect(pages[0]).not.toContain('(GOURY)');
      expect(pages[0]).toContain('42,24');
      expect(pages[0]).toContain('02/06/2026');
      expect(pages[0]).toContain('0,44');
      expect(visibleText).not.toContain('Saisie brute');
    } finally {
      fetch.mockRestore();
    }
  });

  it.each(['empty', 'excluded', 'included'] as const)('shows the top-right vessel header only when raw lines are not exported (%s)', async (mode) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, pages, visibleText } = await readPdf(await generateBillingPdf({
        ...input, dprs: [], selectedVesselName: 'NAVIRE-EN-TETE',
        period: { ...input.period, includeRawInPdf: mode !== 'excluded' },
        rawLines: mode === 'empty' ? [] : [{ ...rawLine, vesselId: 42, vesselName: 'NAVIRE-DE-LIGNE' }],
      }));
      expectSingleLandscapeA4(pdf);
      if (mode === 'included') {
        expect(pages[0]).not.toContain('NAVIRE-EN-TETE');
        expect(visibleText).toContain('Navire');
        expect(visibleText).toContain('NAVIRE-DE-LIGNE');
        expect(visibleText).toContain('Détail des Opérations');
      } else {
        expect(visibleText).toContain('Navire');
        expect(pages[0]).toContain('NAVIRE-EN-TETE');
        expect(visibleText).not.toContain('NAVIRE-DE-LIGNE');
      }
    } finally {
      fetch.mockRestore();
    }
  });

  it('preserves every fragment of a very long vessel name without clipping or duplicating the billed line', async () => {
    const vesselFragments = Array.from({ length: 120 }, (_, index) => `FRAGMENT-NAVIRE-${String(index + 1).padStart(3, '0')}`);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, pages, text, visibleText } = await readPdf(await generateBillingPdf({
        ...input, dprs: [],
        period: { ...input.period, includeOperationsInPdf: false, includeExpensesInPdf: false, includeBbtmInPdf: false },
        rawLines: [{ ...rawLine, vesselId: 42, vesselName: vesselFragments.join('\n'), designation: 'LIGNE-LONG-NAVIRE', unitAmountHt: 11.25, quantity: 2 }],
      }));
      expectSingleLandscapeA4(pdf);
      expect(text.split('LIGNE-LONG-NAVIRE')).toHaveLength(2);
      for (const fragment of vesselFragments) expect(text.split(fragment)).toHaveLength(2);
      expect(visibleText).toContain('Détail des Opérations');
      expect(pages[0]).toContain('22,50');
    } finally {
      fetch.mockRestore();
    }
  });

  it('omits the raw table and raw invoice amount when the global export option is off', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, text } = await readPdf(await generateBillingPdf({
        ...input, period: { ...input.period, includeRawInPdf: false }, rawLines: [{ ...rawLine, designation: 'RAW-EXCLUDED', unitAmountHt: 999 }],
      }));
      expectSingleLandscapeA4(pdf);
      expect(text).not.toContain('Détail des Opérations');
      expect(text).not.toContain('RAW-EXCLUDED');
      expect(text).toContain('4 227,50');
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([
    { includeHires: true, includeBbtm: true },
    { includeHires: true, includeBbtm: false },
    { includeHires: false, includeBbtm: true },
    { includeHires: false, includeBbtm: false },
  ])('shows hire DPR details only when hires or BBTM are included (hires=$includeHires, BBTM=$includeBbtm)', async ({ includeHires, includeBbtm }) => {
    const expense = {
      id: 25, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: 'FRAIS-RESTE', supplierSpecialties: ['Gasoil'],
      invoiceDate: '2026-06-03', invoiceNumber: 'FACTURE-RESTE', amountHt: 20, amountTtc: null, currency: 'EUR',
      quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
    };
    const exportInput: BillingExportInput = {
      ...input, project: { ...input.project, projectCode: 'P145' }, contract: { ...input.contract!, hireCurrency: 'USD' },
      period: { ...input.period, includeOperationsInPdf: includeHires, includeBbtmInPdf: includeBbtm },
      dprs: [{ ...input.dprs[0], amountHt: 100 }], expenses: [expense],
      services: [{ id: 1, billingPeriodId: 1, serviceCatalogId: 1, category: 'BBTM-RESTE', descriptionHtml: '', unitAmountHt: 7, quantity: 3, includeInPdf: true }],
      rawLines: [{ ...rawLine, designation: 'DETAIL-RESTE', vesselName: 'NAVIRE-DE-LIGNE', unitAmountHt: 50, quantity: 1 }],
    };
    const snapshot = JSON.stringify(exportInput);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText, elements } = await readPdf(await generateBillingPdf(exportInput));
      expectSingleLandscapeA4(pdf);
      for (const retained of ['Frais imputables', 'FRAIS-RESTE', 'FACTURE-RESTE', 'Détail des Opérations', 'DETAIL-RESTE', 'NAVIRE-DE-LIGNE', '20,00 €', '50,00 €', 'Total facture du mois HT']) expect(visibleText).toContain(retained);
      expect(visibleText).toContain(includeBbtm ? '91,00 €' : '70,00 €');
      expect(visibleText.includes('BBTM-RESTE')).toBe(includeBbtm);
      expect(visibleText.includes('100,00 USD')).toBe(includeHires);
      const hireTitleIndex = elements.findIndex((element) => element.value === "Loyers d'Affrètement");
      if (includeHires || includeBbtm) {
        expect(hireTitleIndex).toBeGreaterThanOrEqual(0);
        const expensesTitleIndex = elements.findIndex((element) => element.value === 'Frais imputables');
        const hireSection = elements.slice(hireTitleIndex, expensesTitleIndex).map((element) => element.value);
        for (const retained of ['Date', 'Opération', 'Commentaires', '01/06/2026', '24/24 Crew Change']) expect(hireSection).toContain(retained);
        expect(hireSection.includes('Montant HT')).toBe(includeHires);
        for (const comment of billingDprComment(exportInput.dprs[0]).split('\n')) expect(visibleText).toContain(comment);
      } else {
        for (const omitted of ["Loyers d'Affrètement", '24/24 Crew Change', 'Accosté au port', 'Refueling', 'Appareillage', 'Aucune opération DPR sur la période']) expect(visibleText).not.toContain(omitted);
        for (const removedHeader of ['Opération', 'Commentaires']) expect(elements.some((element) => element.value === removedHeader)).toBe(false);
        const emptyDprPdf = await readPdf(await generateBillingPdf({ ...exportInput, dprs: [] }));
        expectSingleLandscapeA4(emptyDprPdf.pdf);
        expect(emptyDprPdf.visibleText).not.toContain("Loyers d'Affrètement");
        expect(emptyDprPdf.visibleText).not.toContain('Aucune opération DPR sur la période');
        for (const retained of ['FRAIS-RESTE', 'FACTURE-RESTE', 'DETAIL-RESTE', '70,00 €']) expect(emptyDprPdf.visibleText).toContain(retained);
      }
      expect(JSON.stringify(exportInput)).toBe(snapshot);
    } finally {
      fetch.mockRestore();
    }
  });

  it('hides DPR details when the legacy BBTM override is off even if its period option remains selected', async () => {
    const exportInput: BillingExportInput = {
      ...input, includeBbtmService: false,
      period: { ...input.period, includeOperationsInPdf: false, includeBbtmInPdf: true },
      services: [{ id: 1, billingPeriodId: 1, serviceCatalogId: 1, category: 'BBTM-OVERRIDE-OFF', descriptionHtml: '', unitAmountHt: 700, quantity: 1 }],
      rawLines: [{ ...rawLine, designation: 'DETAIL-OVERRIDE', unitAmountHt: 50, quantity: 1 }],
    };
    const snapshot = JSON.stringify(exportInput);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText, elements } = await readPdf(await generateBillingPdf(exportInput));
      expectSingleLandscapeA4(pdf);
      for (const omitted of ["Loyers d'Affrètement", 'Prestations BBTM', 'BBTM-OVERRIDE-OFF', '24/24 Crew Change', 'Refueling', 'Commentaires']) expect(visibleText).not.toContain(omitted);
      expect(elements.some((element) => element.value === 'Opération')).toBe(false);
      expect(visibleText).toContain('DETAIL-OVERRIDE');
      expect(visibleText).toContain('50,00 €');
      expect(visibleText).not.toContain('750,00 €');
      expect(JSON.stringify(exportInput)).toBe(snapshot);
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([true, false])('preserves expense, BBTM and global detail exclusions in the one-page PDF (sections included: %s)', async (includeSections) => {
    const expense = {
      id: 25, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: 'FRAIS-INCLUS', supplierSpecialties: [],
      invoiceDate: '2026-06-01', invoiceNumber: 'FACTURE-INCLUSE', amountHt: 20, amountTtc: null, currency: 'EUR',
      quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
    };
    const service = { id: 1, billingPeriodId: 1, serviceCatalogId: 1, category: 'BBTM-INCLUSE', descriptionHtml: '', unitAmountHt: 7, quantity: 3, includeInPdf: true };
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText } = await readPdf(await generateBillingPdf({
        ...input, project: { ...input.project, projectCode: 'P145' },
        period: { ...input.period, includeExpensesInPdf: includeSections, includeBbtmInPdf: includeSections, includeRawInPdf: includeSections, excludedOperationKeys: ['dpr:999'] },
        dprs: [{ ...input.dprs[0], amountHt: 100 }, { ...input.dprs[0], id: 999, operation: 'DPR-EXCLU', amountHt: 900 }],
        expenses: [expense, { ...expense, id: 26, supplier: 'FRAIS-EXCLUS', invoiceNumber: 'FACTURE-EXCLUE', amountHt: 900, includeInPdf: false }],
        services: [service, { ...service, id: 2, category: 'BBTM-EXCLUE', unitAmountHt: 900, includeInPdf: false }],
        rawLines: [{ ...rawLine, designation: 'DETAIL-GLOBAL', unitAmountHt: 50, quantity: 1, includeInPdf: false }],
      }));
      expectSingleLandscapeA4(pdf);
      const searchableText = visibleText.replace(/\s/g, '');
      for (const omitted of ['DPR-EXCLU', 'FRAIS-EXCLUS', 'FACTURE-EXCLUE', 'BBTM-EXCLUE']) expect(searchableText).not.toContain(omitted);
      if (includeSections) {
        for (const retained of ['FRAIS-INCLUS', 'FACTURE-INCLUSE', 'BBTM-INCLUSE', 'DETAIL-GLOBAL', '191,00 €']) expect(searchableText).toContain(retained.replace(/\s/g, ''));
      } else {
        for (const omitted of ['FRAIS-INCLUS', 'FACTURE-INCLUSE', 'BBTM-INCLUSE', 'DETAIL-GLOBAL', 'Détail des Opérations']) expect(searchableText).not.toContain(omitted.replace(/\s/g, ''));
        expect(visibleText).toContain('100,00 €');
        expect(visibleText).not.toContain('191,00 €');
      }
    } finally {
      fetch.mockRestore();
    }
  });

  it.each([0, 30])('keeps 100 USD of hire and %s USD of expenses separate from 50 EUR of raw lines', async (expenseAmount) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const expenses = expenseAmount ? [{
        id: 25, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: 'PORT USD', supplierSpecialties: [],
        invoiceDate: '2026-06-01', invoiceNumber: 'USD-1', amountHt: expenseAmount, amountTtc: null, currency: 'USD',
        quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
      }] : [];
      const { pdf, pages, text, visibleText } = await readPdf(await generateBillingPdf({
        ...input, contract: { ...input.contract!, hireCurrency: 'USD' },
        period: { ...input.period, includeBbtmInPdf: false },
        dprs: [{ ...input.dprs[0], amountHt: 100 }], expenses,
        rawLines: [{ ...rawLine, unitAmountHt: 50, quantity: 1 }],
      }));
      expectSingleLandscapeA4(pdf);
      expect(pages[0]).toContain('(100,00 USD)');
      expect(pages[0]).toContain(`(${100 + expenseAmount},00 USD)`);
      expect(pages[0]).toContain('(50,00 €)');
      expect(text).not.toContain(`(${150 + expenseAmount},00 €)`);
      expect(pages[0]).not.toContain('(100,00 €)');
      if (expenseAmount) expect(pages[0]).toContain('(30,00 USD)');
      expect(visibleText).toContain('Détail des Opérations');
    } finally {
      fetch.mockRestore();
    }
  });

  it('sorts expenses by their displayed French specialties and supplier without changing totals or source data', async () => {
    const source = [
      { supplier: 'Transporteur', specialties: ['Transport / Manutention'], invoice: 'TRANSP', amount: 70, currency: 'EUR' },
      { supplier: 'Port 10', specialties: ['FRAIS DE PORT'], invoice: 'P10-PORT', amount: 40, currency: 'EUR' },
      { supplier: 'Livraison multi', specialties: ['Gasoil', 'Frais de port'], invoice: 'G-MULTI', amount: 50, currency: 'USD' },
      { supplier: 'Éclair', specialties: ['frais de pórt'], invoice: 'E-PORT', amount: 30, currency: 'EUR' },
      { supplier: 'Livraison simple', specialties: ['Gasoil'], invoice: 'G-SOLO', amount: 60, currency: 'EUR' },
      { supplier: 'Port 2', specialties: ['Frais de port'], invoice: 'P2-PORT', amount: 20, currency: 'EUR' },
      { supplier: 'Armateur', specialties: [], invoice: 'A-PORT', amount: 10, currency: 'EUR' },
    ];
    const expenses = source.map((entry, index) => ({
      id: index + 1, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: entry.supplier,
      supplierSpecialties: entry.specialties, invoiceDate: '2026-06-01', invoiceNumber: entry.invoice,
      amountHt: entry.amount, amountTtc: null, currency: entry.currency,
      quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
    }));
    for (const expense of expenses) {
      Object.freeze(expense.supplierSpecialties);
      Object.freeze(expense);
    }
    Object.freeze(expenses);
    const exportInput = Object.freeze({
      ...input, dprs: [], expenses,
      period: { ...input.period, includeOperationsInPdf: false, includeExpensesInPdf: true, includeBbtmInPdf: false },
    });
    const snapshot = JSON.stringify(exportInput);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText, elements } = await readPdf(await generateBillingPdf(exportInput));
      expectSingleLandscapeA4(pdf);
      const invoiceIds = new Set(source.map((entry) => entry.invoice));
      const renderedInvoices = elements.filter((element) => invoiceIds.has(element.value)).map((element) => element.value);
      expect([...renderedInvoices].sort()).toEqual([...invoiceIds].sort());
      const specialtyLabels = new Set(['Frais de port', 'frais de pórt', 'FRAIS DE PORT', 'Gasoil', 'Gasoil · Frais de port', 'Transport / Manutention']);
      const renderedSpecialties = elements.filter((element) => specialtyLabels.has(element.value)).map((element) => element.value);
      expect([...renderedSpecialties.slice(0, 3)].sort()).toEqual(['Frais de port', 'frais de pórt', 'FRAIS DE PORT'].sort());
      expect(renderedSpecialties.slice(3)).toEqual(['Gasoil', 'Gasoil · Frais de port', 'Transport / Manutention']);
      expect(renderedInvoices.indexOf('A-PORT')).toBeLessThan(renderedInvoices.indexOf('P2-PORT'));
      const sameSpecialty = source.filter((entry) => entry.specialties[0] === 'Frais de port' || !entry.specialties.length);
      expect(elements.filter((element) => sameSpecialty.some((entry) => entry.supplier === element.value)).map((element) => element.value)).toEqual(['Armateur', 'Port 2']);
      expect(elements.some((element) => element.value === 'Société' || element.value === 'Spécialités')).toBe(false);
      expect(visibleText).toContain('Gasoil · Frais de port');
      expect(visibleText).toContain('Transport / Manutention');
      expect(visibleText.match(/230,00 €/g)).toHaveLength(2);
      expect(visibleText.match(/50,00 USD/g)).toHaveLength(3);
      expect(visibleText).not.toContain('280,00 €');
      expect(JSON.stringify(exportInput)).toBe(snapshot);
      expect(expenses.map((expense) => expense.invoiceNumber)).toEqual(source.map((entry) => entry.invoice));
    } finally {
      fetch.mockRestore();
    }
  });

  it('renders specialty and company values as indented nodes with each invoice once and BBTM below the right-hand tree', async () => {
    const source = [
      { supplier: 'Société Diesel', specialties: ['Gasoil'], invoice: 'DIESEL1', date: '2026-06-02', amount: 30, currency: 'USD' },
      { supplier: 'Port 2', specialties: ['Frais de port'], invoice: 'PORT-B', date: '2026-06-04', amount: 20, currency: 'EUR' },
      { supplier: 'Transporteur', specialties: ['Transport / Manutention', 'Gasoil'], invoice: 'TR-MUL', date: '2026-06-05', amount: 50, currency: 'EUR' },
      { supplier: 'Port 10', specialties: ['Frais de port'], invoice: 'PORT-A', date: '2026-06-01', amount: 10, currency: 'EUR' },
      { supplier: 'Port 2', specialties: ['Frais de port'], invoice: 'PORT-C', date: '2026-06-03', amount: 25, currency: 'EUR' },
      { supplier: 'Société Diesel', specialties: ['Gasoil'], invoice: 'DIESEL2', date: '2026-06-06', amount: 35, currency: 'USD' },
      { supplier: 'Société Éclair', specialties: ['Gasoil'], invoice: 'DIESEL3', date: '2026-06-07', amount: 5, currency: 'EUR' },
    ];
    const expenses = source.map((entry, index) => ({
      id: index + 1, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: entry.supplier,
      supplierSpecialties: entry.specialties, invoiceDate: entry.date, invoiceNumber: entry.invoice,
      amountHt: entry.amount, amountTtc: null, currency: entry.currency,
      quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
    }));
    const services = [{
      id: 1, billingPeriodId: 1, serviceCatalogId: 1, category: 'BBTM-SOUS-ARBRE', descriptionHtml: '',
      unitAmountHt: 7, quantity: 3, includeInPdf: true,
    }];
    const snapshot = JSON.stringify(expenses);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const { pdf, visibleText, elements } = await readPdf(await generateBillingPdf({
        ...input, project: { ...input.project, projectCode: 'P145' }, dprs: [], expenses, services,
        period: { ...input.period, includeOperationsInPdf: false },
      }));
      expectSingleLandscapeA4(pdf);
      expect(elements.some((element) => element.value === 'Société' || element.value === 'Spécialités')).toBe(false);
      const specialtyLabels = ['Frais de port', 'Gasoil', 'Transport / Manutention · Gasoil'];
      expect(elements.filter((element) => specialtyLabels.includes(element.value)).map((element) => element.value)).toEqual(specialtyLabels);
      for (const supplier of ['Port 10', 'Port 2', 'Société Diesel', 'Société Éclair', 'Transporteur']) {
        expect(elements.filter((element) => element.value === supplier)).toHaveLength(1);
      }
      for (const entry of source) {
        expect(elements.filter((element) => element.value === entry.invoice)).toHaveLength(1);
        expect(visibleText).toContain(entry.date.slice(8, 10) + '/06/2026');
        expect(visibleText).toContain(`${entry.amount},00 ${entry.currency === 'EUR' ? '€' : entry.currency}`);
      }
      const node = (value: string) => {
        const element = elements.find((item) => item.value === value);
        expect(element).toBeDefined();
        return element!;
      };
      const index = (value: string) => elements.findIndex((element) => element.value === value);
      expect(index('Port 2')).toBeLessThan(index('Port 10'));
      for (const invoice of ['PORT-B', 'PORT-C']) {
        expect(index(invoice)).toBeGreaterThan(index('Port 2'));
        expect(index(invoice)).toBeLessThan(index('Port 10'));
      }
      for (const invoice of ['DIESEL1', 'DIESEL2']) {
        expect(index(invoice)).toBeGreaterThan(index('Société Diesel'));
        expect(index(invoice)).toBeLessThan(index('Société Éclair'));
      }
      const port = node('Frais de port');
      const company = node('Port 10');
      const invoiceDate = node('01/06/2026');
      expect(port.x).toBeGreaterThan(pdf.getPage(0).getWidth() / 2);
      expect(company.x).toBeGreaterThan(port.x);
      expect(invoiceDate.x).toBeGreaterThan(company.x);
      expect(company.y).toBeLessThan(port.y);
      expect(invoiceDate.y).toBeLessThan(company.y);
      expect(node('Prestations BBTM').x).toBeGreaterThan(pdf.getPage(0).getWidth() / 2);
      expect(node('Prestations BBTM').y).toBeLessThan(node('TR-MUL').y);
      expect(node('BBTM-SOUS-ARBRE').x).toBeGreaterThan(pdf.getPage(0).getWidth() / 2);
      expect(visibleText).toContain('131,00 €');
      expect(visibleText).toContain('65,00 USD');
      expect(visibleText).toContain('21,00 €');
      expect(visibleText).not.toContain('196,00 €');
      expect(JSON.stringify(expenses)).toBe(snapshot);
    } finally {
      fetch.mockRestore();
    }
  });

  it('groups mixed-currency expense subtotals and the invoice amounts by currency', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const expenses = [['USD', 30], ['EUR', 5], ['CAD', 10]].map(([currency, amount], index) => ({
        id: index + 1, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: `PORT ${currency}`, supplierSpecialties: [],
        invoiceDate: '2026-06-01', invoiceNumber: `DEV-${index}`, amountHt: Number(amount), amountTtc: null, currency: String(currency),
        quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
      }));
      const { pdf, pages } = await readPdf(await generateBillingPdf({
        ...input, contract: { ...input.contract!, hireCurrency: 'USD' },
        period: { ...input.period, includeBbtmInPdf: false },
        dprs: [{ ...input.dprs[0], amountHt: 100 }], expenses,
        rawLines: [{ ...rawLine, unitAmountHt: 50, quantity: 1 }],
      }));
      expectSingleLandscapeA4(pdf);
      expect(pages[0]).toContain('(130,00 USD)');
      expect(pages[0]).toContain('(55,00 €)');
      expect(pages[0]).toContain('(10,00 CAD)');
      expect(pages[0]).toContain('(5,00 €)');
      expect(pages[0]).not.toContain('(45,00 €)');
      expect(pages[0]).not.toContain('(195,00 €)');
    } finally {
      fetch.mockRestore();
    }
  });

  it('keeps more than three currencies separate on the single landscape A4 page', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Logo indisponible'));
    try {
      const expenses = ['USD', 'GBP', 'CAD', 'CHF', 'JPY'].map((currency, index) => ({
        id: index + 1, billingPeriodId: 1, category: 'port' as const, nature: '', supplier: `PORT ${currency}`, supplierSpecialties: [],
        invoiceDate: '2026-06-01', invoiceNumber: `DEV-${index}`, amountHt: 10, amountTtc: null, currency,
        quantity: null, unit: '', comments: '', dprReportId: null, includeInPdf: true,
      }));
      const { pdf, pages } = await readPdf(await generateBillingPdf({
        ...input, period: { ...input.period, includeOperationsInPdf: false, includeBbtmInPdf: false },
        dprs: [], expenses, rawLines: [{ ...rawLine, unitAmountHt: 50, quantity: 1 }],
      }));
      expectSingleLandscapeA4(pdf);
      for (const currency of ['USD', 'GBP', 'CAD', 'CHF', 'JPY']) expect(pages[0]).toContain(`(10,00 ${currency})`);
      expect(pages[0]).toContain('(50,00 €)');
      expect(pages[0]).not.toContain('Voir le récapitulatif par devise');
      expect(pages[0]).not.toContain('sans conversion');
      expect(pages[0]).not.toContain('(100,00 €)');
    } finally {
      fetch.mockRestore();
    }
  });
});
