import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  billingExpenseAttachmentName,
  billingExpenseSpecialtyLabel,
  billingInvoiceTotal,
  billingOperationHire,
  billingServicesTotal,
  billingDprComment,
  billingOperationRows,
  completeBillingDprs,
  countDailyOperations,
  defaultProjectClientReference,
  fetchProjectBillingDprs,
  missingBillingDates,
  resolveBillingDprOperation,
  type BillingExportInput,
  type ProjectBillingDpr,
} from './projectBilling';

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
    sourceLabel: 'SeaPilot',
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

  it('derives SeaPilot DPR operations from port-call reasons instead of the daily description', async () => {
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

  it('keeps the explicit P144 operation before port-call-derived defaults', () => {
    expect(resolveBillingDprOperation('24/24 Weather Stand-by', ['crew-change']))
      .toBe('24/24 Weather Stand-by');
    expect(resolveBillingDprOperation('', ['weather-standby']))
      .toBe('24/24 Weather Stand-by');
  });
});

describe('monthly billing completion', () => {
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
    expect(countDailyOperations(completed)).toBe(2);
  });

  it('calculates the BBTM subtotal from editable unit amounts and quantities', () => {
    const services = [{
      id: 1,
      billingPeriodId: 1,
      category: 'spread_antipollution',
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

  it('does not show an arrival when the vessel is not at port', () => {
    expect(billingDprComment({
      ...base,
      vesselStatus: 'Navire en Opération - On hire',
    })).toBe('Refueling : 7 200 L\nAppareillage du quai à 14h20');
  });
});
