// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  billingExportServices, fetchProjectBillingData, fetchProjectServiceCatalog, generateBillingPdf,
  resolveBillingServiceQuantity, saveProjectBillingService, saveProjectServiceCatalogEntry,
  type BillingExportInput, type BillingServiceQuantityContext, type ProjectBillingDpr, type ProjectBillingService,
} from './projectBilling';

const service: ProjectBillingService = {
  id: 1, billingPeriodId: 16, serviceCatalogId: 7, category: 'Spread Antipollution', descriptionHtml: '', unitAmountHt: 10, quantity: 2.5,
};
const dpr = (id: number, reportDate: string, operation: string, vesselId: number | null = 3, vesselName = 'GOURY'): ProjectBillingDpr => ({
  id, reportDate, operation, vesselId, vesselName, amountHt: null, vesselStatus: '', arrivalAt: '', departureAt: '', fuelLiters: null,
});
const context: BillingServiceQuantityContext = {
  project: { projectCode: 'P144' }, periodMonth: '2026-10-01', startDate: '2026-10-24', endDate: '2026-10-26',
  dprs: [
    dpr(1, '2026-10-24', '24/24 Operation'), dpr(2, '2026-10-24', '24/24 Crew Change'),
    dpr(3, '2026-10-25', '24/24 Weather Stand-by'), dpr(4, '2026-10-25', '24/24 Operation'),
    dpr(5, '2026-10-25', '24/24 Crew Change', 4, 'LE ROZEL'), dpr(6, '2026-10-26', '24/24 Crew Change'),
    dpr(7, '2026-10-27', '24/24 Operation'), dpr(8, '2026-10-23', '24/24 Operation'),
    dpr(0, '2026-10-26', '24/24 Operation'), dpr(-1, '2026-10-26', '24/24 Operation', 4, 'LE ROZEL'),
  ],
  excludedOperationKeys: ['dpr:6'],
  monthlyDprs: [dpr(20, '2026-10-01', '24/24 Weather Stand-by'), dpr(21, '2026-10-02', '24/24 Weather Stand-by')],
};

beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Logo unavailable in quantity test'))));
afterEach(() => vi.unstubAllGlobals());

describe('configurable service quantities', () => {
  it.each([0, 2.5, 97])('keeps an explicit manual P144 quantity of %s instead of applying the historical formula', (quantity) => {
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'manual', quantity }, context)).toBe(quantity);
  });

  it('counts selected civil days inclusively across the Paris daylight-saving change and a month boundary', () => {
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'period' }, context)).toBe(3);
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'period' }, { ...context, startDate: '2026-10-30', endDate: '2026-11-02' })).toBe(4);
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'period' }, { ...context, startDate: '2026-11-02', endDate: '2026-10-30' })).toBe(0);
  });

  it.each([['2026-02', 28], ['2028-02', 29], ['2026-09', 30], ['2026-10', 31]])('counts all %s days independently of the selected subrange or missing DPRs', (periodMonth, expected) => {
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'month' }, { ...context, periodMonth, dprs: [] })).toBe(expected);
  });

  it('counts the union of selected types once per real vessel/day, respecting the range and exclusions', () => {
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'operations', quantityOperationTypes: [' 24/24   operation ', '24/24 crew change', '24/24 OPERATION'] }, context)).toBe(3);
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'operations', quantityOperationTypes: [] }, context)).toBe(0);
  });

  it('supports custom operation labels and normalizes historical vessel-name fallbacks', () => {
    expect(resolveBillingServiceQuantity({ ...service, quantityMode: 'operations', quantityOperationTypes: ['Inspection client'] }, {
      ...context, dprs: [dpr(30, '2026-10-24', ' inspection   CLIENT ', null, ' Goury '), dpr(31, '2026-10-24', 'Inspection client', null, 'GOURY')],
    })).toBe(1);
  });

  it('retains the old P144 month-minus-weather formula only for historical undefined modes', () => {
    expect(resolveBillingServiceQuantity(service, context)).toBe(29);
    expect(resolveBillingServiceQuantity(service, { ...context, project: { projectCode: 'P145' } })).toBe(2.5);
    expect(resolveBillingServiceQuantity({ ...service, category: 'Assistance' }, context)).toBe(2.5);
  });
});

let clientNumber = 0;
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function apiFixture() {
  const requests: { table: string; method: string; body?: Record<string, unknown> }[] = [];
  let savedService: Record<string, unknown> | null = null;
  let savedCatalog: Record<string, unknown> = { id: 7, company_id: 1, category: 'Assistance', unit_amount_ht: 10, description_html: '', quantity_mode: null, default_quantity: null };
  const fetch = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const table = new URL(String(request)).pathname.split('/').pop()!;
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ table, method, body });
    if (table === 'projects') return respond({ company_id: 1 });
    if (table === 'project_service_catalog') {
      if (body) { savedCatalog = { ...savedCatalog, ...body }; return respond(savedCatalog); }
      return respond([savedCatalog]);
    }
    if (table === 'project_billing_services') {
      if (body) { savedService = { ...savedService, ...body, id: 1 }; return respond(savedService); }
      return respond(savedService ? [savedService] : [{ id: 1, billing_period_id: 16, quantity: 2.5, category: 'Spread Antipollution', quantity_mode: null }]);
    }
    return respond([]);
  });
  const client = createClient('https://billing-quantity.example.invalid', 'fixture-publishable-key', {
    global: { fetch }, auth: { storageKey: `billing-quantity-${++clientNumber}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, requests, fetch };
}

describe('quantity configuration persistence', () => {
  it('saves and reloads catalog defaults, including manual zero and a trimmed client reference', async () => {
    const { client, requests } = apiFixture();
    const saved = await saveProjectServiceCatalogEntry(client, { category: 'Assistance', unitAmountHt: 10, descriptionHtml: '',
      quantityMode: 'manual', quantityOperationTypes: [], defaultQuantity: 0, clientReference: ' PO-42 ' });
    expect(saved).toMatchObject({ quantityMode: 'manual', defaultQuantity: 0, quantityOperationTypes: [], clientReference: 'PO-42' });
    expect(requests[0].body).toMatchObject({ quantity_mode: 'manual', default_quantity: 0, quantity_operation_types: [], client_reference: 'PO-42' });
    expect((await fetchProjectServiceCatalog(client))[0]).toMatchObject({ quantityMode: 'manual', defaultQuantity: 0, clientReference: 'PO-42' });
  });

  it('preserves saved service settings and references when the source catalog is changed later', async () => {
    const { client, requests } = apiFixture();
    const saved = await saveProjectBillingService(client, 2, 16, { serviceCatalogId: 7, category: 'Assistance', descriptionHtml: 'Snapshot', unitAmountHt: 10, quantity: 3,
      quantityMode: 'operations', quantityOperationTypes: ['24/24 Operation', ' 24/24  crew change ', '24/24 OPERATION'], clientReference: ' SERVICE-PO ' });
    expect(saved).toMatchObject({ quantityMode: 'operations', quantityOperationTypes: ['24/24 Operation', '24/24 crew change'], clientReference: 'SERVICE-PO' });
    await saveProjectServiceCatalogEntry(client, { id: 7, category: 'Assistance renommée', unitAmountHt: 999, descriptionHtml: '', quantityMode: 'month', defaultQuantity: 7, clientReference: 'OTHER-PO' });
    const data = await fetchProjectBillingData(client, 2);
    expect(data.services[0]).toMatchObject({ category: 'Assistance', unitAmountHt: 10, quantity: 3, quantityMode: 'operations', clientReference: 'SERVICE-PO' });
    expect(requests.filter((request) => request.table === 'project_billing_services' && request.method !== 'GET')).toHaveLength(1);
  });

  it('updates an existing service to manual zero and does not drop its reference', async () => {
    const { client, requests } = apiFixture();
    await saveProjectBillingService(client, 2, 16, { serviceCatalogId: 7, category: 'Spread Antipollution', descriptionHtml: '', unitAmountHt: 10, quantity: 0,
      quantityMode: 'manual', quantityOperationTypes: [], clientReference: 'REF-ZERO' }, 1);
    expect(requests.find((request) => request.table === 'project_billing_services')).toMatchObject({ method: 'PATCH', body: { quantity: 0, quantity_mode: 'manual', client_reference: 'REF-ZERO' } });
  });

  it('leaves absent legacy settings unset rather than silently selecting a new mode/default', async () => {
    const { client, requests } = apiFixture();
    const catalog = (await fetchProjectServiceCatalog(client))[0];
    expect(catalog.quantityMode).toBeUndefined(); expect(catalog.defaultQuantity).toBeUndefined();
    expect((await fetchProjectBillingData(client, 2)).services[0].quantityMode).toBeUndefined();
    await saveProjectServiceCatalogEntry(client, { id: 7, category: 'Assistance', unitAmountHt: 10, descriptionHtml: '' });
    expect(requests.at(-1)?.body).not.toHaveProperty('quantity_mode');
    expect(requests.at(-1)?.body).not.toHaveProperty('default_quantity');
  });

  it.each([
    { quantityMode: 'operations' as const, quantityOperationTypes: [] },
    { quantityMode: 'operations' as const, quantityOperationTypes: [' '] },
    { quantityMode: 'manual' as const, defaultQuantity: -1 },
    { quantityMode: 'manual' as const, defaultQuantity: 100000000000 },
    { quantityMode: 'manual' as const, clientReference: 'x'.repeat(201) },
  ])('rejects invalid catalog settings before contacting Supabase: %j', async (settings) => {
    const { client, fetch } = apiFixture();
    await expect(saveProjectServiceCatalogEntry(client, { category: 'Assistance', unitAmountHt: 10, descriptionHtml: '', ...settings })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

function pdfInput(): BillingExportInput {
  return {
    project: { id: 2, projectCode: 'P144', title: 'GUARD VESSEL EMDT', clientName: 'EMDT' } as BillingExportInput['project'],
    period: { id: 16, projectId: 2, companyId: 1, periodMonth: '2026-10-01', clientReference: 'HEADER-PO', invoiceNumber: '', invoiceIssuedOn: '', invoiceSentOn: '', paymentDueOn: '', paidOn: '', amountHt: 0, comments: '', excludedOperationKeys: context.excludedOperationKeys },
    operations: [], expenses: [], services: [{ ...service, category: 'Assistance', quantityMode: 'manual', quantity: 2, clientReference: 'PO-2026 <EMDT> & 42' }],
    dprs: context.dprs, monthlyDprs: context.monthlyDprs, selectedVesselName: 'GOURY', startDate: context.startDate, endDate: context.endDate,
  };
}

it('exports each saved service reference as plain PDF text alongside its own computed quantity', async () => {
  const input = pdfInput();
  expect(billingExportServices(input)[0]).toMatchObject({ quantity: 2, clientReference: 'PO-2026 <EMDT> & 42' });
  const task = getDocument({ data: new Uint8Array(await (await generateBillingPdf(input)).arrayBuffer()), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const texts: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      texts.push(...content.items.filter((item) => 'str' in item).map((item) => item.str));
    }
    const text = texts.join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('PO-2026 <EMDT> & 42');
    expect(text).toContain('HEADER-PO');
    expect(text).toContain('20,00');
  } finally { await task.destroy(); }
});
