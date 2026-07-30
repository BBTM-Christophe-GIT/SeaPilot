import { describe, expect, it } from 'vitest';
import { billingOperationRows, type BillingExportInput } from './projectBilling';

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
  operations: [{
    id: 13,
    projectId: 144,
    startsOn: '2024-06-01',
    endsOn: '2026-08-31',
    primaryVesselId: 1,
    primaryVesselName: 'GOURY',
    status: 'Validé',
    description: '24/24 Operation',
    charterHire: 4227.5,
    hireCurrency: 'EUR',
    hireUnit: 'jour',
    sourceLabel: 'test',
    createdAt: '',
  }],
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

describe('billing operation export', () => {
  it('creates one line per billable day in the requested period', () => {
    const rows = billingOperationRows(input);
    expect(rows).toHaveLength(30);
    expect(rows[0]).toEqual(['01/06/2026', '24/24 Operation', '4 227,50 EUR', 'GOURY']);
    expect(rows.at(-1)?.[0]).toBe('30/06/2026');
  });

  it('uses the hire snapshot of the operation before the contract default', () => {
    const rows = billingOperationRows({
      ...input,
      operations: [{ ...input.operations[0], charterHire: 4450 }],
    });
    expect(rows[0][2]).toBe('4 450,00 EUR');
  });
});
