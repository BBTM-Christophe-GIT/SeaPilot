// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { billingOperationRows, billingServicesTotal } from '../projectBilling';
import {
  INITIAL_BILLING_OPTIONS,
  billingDemoRange,
  buildBillingView,
  createDemoProjects,
} from './billingDemo';

describe('project billing interactive preview', () => {
  it('reuses the production totals for the selected four DPR days and monthly costs', () => {
    const demo = createDemoProjects()[0];
    const view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rows.map((row) => row.amountHt)).toEqual([2400, 2400, 2400, 2400]);
    expect(view.operationTotal).toBe(9600);
    expect(view.expenseTotal).toBe(1015);
    expect(view.serviceTotal).toBe(340);
    expect(view.totalHt).toBe(10955);
    expect(billingOperationRows(view.exportInput)).toEqual(view.selectedRows.map(({ date, operation, amountHt, comments }) => ({ date, operation, amountHt, comments })));
  });

  it('respects exclusions for each day, expense and service, plus section inclusion', () => {
    const demo = createDemoProjects()[0];
    demo.period.excludedOperationKeys = ['dpr:26402'];
    demo.expenses[0].includeInPdf = false;
    demo.services[0].includeInPdf = false;
    const view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rows).toHaveLength(4);
    expect(view.selectedRows).toHaveLength(3);
    expect(view.rows[1].included).toBe(false);
    expect(view.totalHt).toBe(7540);
    expect(billingOperationRows(view.exportInput)).toHaveLength(3);

    demo.period.includeOperationsInPdf = false;
    expect(buildBillingView(demo, INITIAL_BILLING_OPTIONS).totalHt).toBe(340);
    demo.period.includeExpensesInPdf = false;
    expect(buildBillingView(demo, INITIAL_BILLING_OPTIONS).totalHt).toBe(0);
  });

  it('scopes DPR rows by the custom range while expenses and services remain monthly', () => {
    const demo = createDemoProjects()[0];
    const view = buildBillingView(demo, { ...INITIAL_BILLING_OPTIONS, startDate: '2026-10-07', endDate: '2026-10-08' });
    expect(view.rows).toHaveLength(2);
    expect(view.operationTotal).toBe(4800);
    expect(view.expenseTotal).toBe(1015);
    expect(view.serviceTotal).toBe(340);
    expect(view.totalHt).toBe(6155);
    expect(buildBillingView(demo, { ...INITIAL_BILLING_OPTIONS, month: '2026-11', periodMode: 'calendar-month' }).totalHt).toBe(0);
  });

  it('uses the operation override before contract hire and explicit DPR amount before both', () => {
    const demo = createDemoProjects()[0];
    const options = { ...INITIAL_BILLING_OPTIONS, startDate: '2026-10-12', endDate: '2026-10-12' };
    expect(buildBillingView(demo, options).rows[0].amountHt).toBe(2650);
    demo.dprs.find((dpr) => dpr.reportDate === '2026-10-12')!.amountHt = 2800;
    expect(buildBillingView(demo, options).rows[0].amountHt).toBe(2800);
  });

  it('keeps saved operation hire snapshots when the contract hire is later changed', () => {
    const demo = createDemoProjects()[0];
    demo.contract.charterHire = 3000;
    demo.contract.hirePeriods![0].charterHire = 3000;
    expect(buildBillingView(demo, INITIAL_BILLING_OPTIONS).operationTotal).toBe(9600);
    expect(demo.operations[0].charterHire).toBe(2400);
  });

  it('uses the existing standby and weather standby hire precedence without forcing statuses', () => {
    const demo = createDemoProjects()[0];
    demo.operations[0].charterHireOverride = false;
    demo.dprs[0].operation = '24/24 Stand-by';
    demo.dprs[1].operation = 'Stand-by météo';
    const view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rows[0].amountHt).toBe(1800);
    expect(view.rows[1].amountHt).toBe(1200);
    expect(demo.operations[0].status).toBe('Validé');
    demo.operations[0].charterHireOverride = true;
    expect(buildBillingView(demo, INITIAL_BILLING_OPTIONS).rows[1].amountHt).toBe(2400);
  });

  it('keeps another vessel DPR outside the selected vessel export', () => {
    const demo = createDemoProjects()[0];
    demo.dprs.push({ ...demo.dprs[0], id: 999, vesselName: 'Autre navire', vesselId: 2, amountHt: 9999 });
    const view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rows).toHaveLength(4);
    expect(view.totalHt).toBe(10955);
  });

  it('fills missing days only when explicitly requested using the existing billing helper', () => {
    const demo = createDemoProjects()[0];
    const options = { ...INITIAL_BILLING_OPTIONS, endDate: '2026-10-09' };
    const original = buildBillingView(demo, options);
    expect(original.missingDates).toEqual(['2026-10-09']);
    expect(original.rows).toHaveLength(4);
    const completed = buildBillingView(demo, { ...options, completeMissingDays: true });
    expect(completed.rows).toHaveLength(5);
    expect(completed.operationTotal).toBe(12000);
    expect(completed.rows[4].key).toBe('date:2026-10-09:GOURY');
  });

  it('calculates service quantities with the production helper and isolates mutable fixtures', () => {
    const first = createDemoProjects();
    const second = createDemoProjects();
    first[0].services[0].quantity = 6;
    const view = buildBillingView(first[0], INITIAL_BILLING_OPTIONS);
    expect(view.serviceTotal).toBe(510);
    expect(view.serviceTotal).toBe(billingServicesTotal(view.services));
    expect(second[0].services[0].quantity).toBe(4);
  });

  it('calculates calendar months and rejects an invalid month without timezone offsets', () => {
    expect(billingDemoRange({ ...INITIAL_BILLING_OPTIONS, periodMode: 'calendar-month' })).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(billingDemoRange({ ...INITIAL_BILLING_OPTIONS, month: '2028-02', periodMode: 'calendar-month' })).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
    expect(billingDemoRange({ ...INITIAL_BILLING_OPTIONS, month: '2026-13', periodMode: 'calendar-month' })).toEqual({ startDate: '', endDate: '' });
  });
});
