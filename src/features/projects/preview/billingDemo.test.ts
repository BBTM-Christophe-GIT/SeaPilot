// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { billingOperationRows, billingServicesTotal, type ProjectBillingRawLine } from '../projectBilling';
import {
  INITIAL_BILLING_OPTIONS,
  billingDemoReferenceKey,
  billingDemoRange,
  buildBillingView,
  createDemoProjects,
} from './billingDemo';

describe('project billing interactive preview', () => {
  it('shares a reference for an empty raw section whether selected or not and across months', () => {
    const demo = createDemoProjects()[0];
    demo.period.includeRawInPdf = true;
    const key = billingDemoReferenceKey(demo, INITIAL_BILLING_OPTIONS);
    expect(key).toBe('264:7');
    demo.period.includeRawInPdf = false;
    expect(billingDemoReferenceKey(demo, INITIAL_BILLING_OPTIONS)).toBe(key);
    expect(billingDemoReferenceKey(demo, { ...INITIAL_BILLING_OPTIONS, month: '2026-11', periodMode: 'calendar-month' })).toBe(key);
  });

  it('scopes a raw reference only when its selected lines fall inside the export period', () => {
    const demo = createDemoProjects()[0];
    demo.period.includeRawInPdf = true;
    demo.rawLines = [{
      id: 1, billingPeriodId: demo.period.id, serviceCatalogId: null,
      vesselName: 'JERSEY', vesselId: 2, serviceDate: '2026-10-07',
      designation: 'Service local', unitAmountHt: 15, quantity: 1,
    }];
    expect(billingDemoReferenceKey(demo, INITIAL_BILLING_OPTIONS)).toBe('264:15');
    expect(billingDemoReferenceKey(demo, { ...INITIAL_BILLING_OPTIONS, endDate: '2026-10-06' })).toBe('264:7');
    demo.period.includeRawInPdf = false;
    expect(billingDemoReferenceKey(demo, INITIAL_BILLING_OPTIONS)).toBe('264:7');
  });

  it('isolates references belonging to different projects with the same PDF content', () => {
    const [first, second] = createDemoProjects();
    expect(billingDemoReferenceKey(first, INITIAL_BILLING_OPTIONS)).toBe('264:7');
    expect(billingDemoReferenceKey(second, INITIAL_BILLING_OPTIONS)).toBe('263:7');
  });

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

  it('keeps currency totals separate in both mixed-expense and foreign-hire scenarios', () => {
    const demo = createDemoProjects()[0];
    demo.expenses[0].currency = ' usd ';
    let view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect([...view.totalsByCurrency]).toEqual([['EUR', 10280], ['USD', 675]]);
    expect([...view.expenseTotalsByCurrency]).toEqual([['USD', 675], ['EUR', 340]]);
    expect(view.totalHt).toBe(10280);
    demo.contract.hireCurrency = 'GBP';
    view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect([...view.totalsByCurrency]).toEqual([['EUR', 680], ['GBP', 9600], ['USD', 675]]);
    expect(view.totalHt).toBe(680);
    demo.period.includeExpensesInPdf = false;
    expect([...buildBillingView(demo, INITIAL_BILLING_OPTIONS).totalsByCurrency]).toEqual([['EUR', 340], ['GBP', 9600]]);
  });

  it('calculates selected raw lines with production rounding and the saved month/date boundaries', () => {
    const demo = createDemoProjects()[0];
    const line: ProjectBillingRawLine = {
      id: 1, billingPeriodId: demo.period.id, serviceCatalogId: null,
      vesselName: 'JERSEY', vesselId: 2, serviceDate: '2026-10-07', designation: 'Service local', unitAmountHt: 15, quantity: 0.333,
    };
    demo.rawLines = [line, { ...line, id: 2, unitAmountHt: 0.1, quantity: 3 },
      { ...line, id: 3, serviceDate: '2026-10-09', unitAmountHt: 1000 },
      { ...line, id: 4, billingPeriodId: 999, unitAmountHt: 1000 }];
    let view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    // Raw rows retain each vessel's assignment; the existing panel only filters their dates.
    expect(view.rawLines.map((item) => item.id)).toEqual([1, 2]);
    expect(view.rawTotal).toBe(5.3);
    expect(view.totalHt).toBe(10960.3);
    expect(view.exportInput.rawLines).toEqual(view.rawLines);
    demo.period.includeRawInPdf = false;
    view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rawLines).toHaveLength(2);
    expect(view.selectedRawLines).toHaveLength(0);
    expect(view.rawTotal).toBe(0);
    expect(view.totalHt).toBe(10955);
  });

  it('uses full-month weather DPRs for automatic P144 quantities even in a short export range', () => {
    const demo = createDemoProjects()[0];
    demo.project.projectCode = 'P144';
    demo.services[0].category = 'SPREAD ANTIPOLLUTION';
    demo.services[0].quantity = 1;
    demo.dprs.push({ ...demo.dprs[0], id: 99, reportDate: '2026-10-20', operation: '24/24 Weather Stand-by' });
    const view = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(view.rows).toHaveLength(4);
    expect(view.services[0].quantity).toBe(30);
    expect(view.serviceTotal).toBe(2550);
    expect(view.exportInput.monthlyDprs).toHaveLength(7);
    expect(demo.services[0].quantity).toBe(1);
    expect(view.totalHt).toBe(13165);
    demo.period.includeBbtmInPdf = false;
    const excluded = buildBillingView(demo, INITIAL_BILLING_OPTIONS);
    expect(excluded.services).toHaveLength(1);
    expect(excluded.services[0].quantity).toBe(30);
    expect(excluded.serviceTotal).toBe(0);
    expect(excluded.totalHt).toBe(10615);
  });
});
