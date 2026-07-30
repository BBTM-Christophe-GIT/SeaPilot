import { describe, expect, it } from 'vitest';
import {
  billingExpenseAttachmentName,
  billingServicesTotal,
  billingDprComment,
  billingOperationRows,
  completeBillingDprs,
  countDailyOperations,
  defaultProjectClientReference,
  missingBillingDates,
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
    charterHire: 4227.5,
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

  it('uses the DPR amount before the contract default', () => {
    const rows = billingOperationRows({
      ...input,
      dprs: [{ ...input.dprs[0], amountHt: 4450 }],
    });
    expect(rows[0].amountHt).toBe(4450);
  });

  it('falls back to the contract hire only when the DPR has no amount', () => {
    const rows = billingOperationRows({
      ...input,
      dprs: [{ ...input.dprs[0], amountHt: null }],
    });
    expect(rows[0].amountHt).toBe(4227.5);
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
    expect(billingServicesTotal([{
      id: 1,
      billingPeriodId: 1,
      category: 'spread_antipollution',
      unitAmountHt: 350,
      quantity: 29,
    }])).toBe(10150);
  });

  it('renames service attachments with date, invoice and category', () => {
    const file = new File(['test'], 'source.pdf', { type: 'application/pdf' });
    const renamed = billingExpenseAttachmentName(file, {
      id: 1,
      billingPeriodId: 1,
      category: 'port',
      nature: '',
      supplier: 'Port',
      invoiceDate: '2026-06-10',
      invoiceNumber: 'R202600790',
      amountHt: 72.01,
      amountTtc: null,
      currency: 'EUR',
      quantity: null,
      unit: '',
      comments: '',
      chargeable: true,
      includedInClientInvoice: false,
      dprReportId: null,
    });
    expect(renamed.name).toBe('2026-06-10 - R202600790 - Frais de port.pdf');
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
