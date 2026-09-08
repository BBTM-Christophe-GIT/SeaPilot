import { describe, expect, it } from 'vitest';
import { buildManagerHomeItems, toLocalIsoDate, type ManagerHomeSourceRows } from './managerHomeData';

const TODAY = new Date(2026, 8, 8, 12);

function expiryIn(days: number): string {
  const date = new Date(TODAY);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function sources(overrides: Partial<ManagerHomeSourceRows>): ManagerHomeSourceRows {
  return {
    purchases: [], procedures: [], fleetCertificates: [], people: [], hrDocuments: [], workingTimeCalculations: [],
    ...overrides,
  };
}

function fleetDocument(status: string, expiresOn: string | null): ManagerHomeSourceRows['fleetCertificates'][number] {
  return {
    id: 1, vessel_name: 'SUROIT', document_title: 'Life Jacket Mousse SOLAS + Lampe - 01',
    title: null, status, expires_on: expiresOn, planned_on: null, workflow_status: null, is_active_fleet: true,
  };
}

function hrDocument(status: string, expiresOn: string | null): ManagerHomeSourceRows['hrDocuments'][number] {
  return {
    id: 2, person_id: null, person_name: 'Arthur DEMO', category_key: 'medical_visit',
    title: 'Visite médicale', status, expires_on: expiresOn, medical_unfit: false,
  };
}

describe('home deadline horizon', () => {
  it.each(['valid', 'expired', 'renew_due', 'missing', 'manquant', 'pending_validation', 'À valider'])(
    'limits fleet documents with status %s to 90 days, regardless of imported status',
    (status) => {
      for (const days of [-1, 0, 90, 91, 1210]) {
        const items = buildManagerHomeItems(sources({ fleetCertificates: [fleetDocument(status, expiryIn(days))] }), TODAY);
        expect(items.map((item) => item.id), `expiry in ${days} days`).toEqual(days <= 90 ? ['fleet-1'] : []);
        if (days <= 90) expect(items[0].queueVisibleDates).toContain(toLocalIsoDate(TODAY));
      }
    },
  );

  it.each(['valid', 'expired', 'renew_due', 'missing', 'manquant', 'pending_validation'])(
    'limits HR documents with status %s to 90 days, regardless of imported status',
    (status) => {
      for (const days of [-1, 0, 90, 91, 1210]) {
        const items = buildManagerHomeItems(sources({ hrDocuments: [hrDocument(status, expiryIn(days))] }), TODAY);
        expect(items.map((item) => item.id), `expiry in ${days} days`).toEqual(days <= 90 ? ['hr-document-2'] : []);
        if (days <= 90) expect(items[0].queueVisibleDates).toContain(toLocalIsoDate(TODAY));
      }
    },
  );

  it('uses certificate expiry for the horizon even when a visit is planned earlier', () => {
    const certificate = { ...fleetDocument('missing', expiryIn(1210)), planned_on: expiryIn(7) };
    expect(buildManagerHomeItems(sources({ fleetCertificates: [certificate] }), TODAY)).toEqual([]);
  });

  it.each(['missing', 'pending_validation'])('keeps undated %s document actions visible today', (status) => {
    const items = buildManagerHomeItems(sources({
      fleetCertificates: [fleetDocument(status, null)], hrDocuments: [hrDocument(status, null)],
    }), TODAY);
    expect(items.map((item) => item.id)).toEqual(['fleet-1', 'hr-document-2']);
    for (const item of items) expect(item.queueVisibleDates).toContain(toLocalIsoDate(TODAY));
  });

  it('keeps declared medical unfitness as an immediate alert independent of expiry', () => {
    const items = buildManagerHomeItems(sources({
      hrDocuments: [{ ...hrDocument('valid', expiryIn(1210)), medical_unfit: true }],
    }), TODAY);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ deadline: 'Inaptitude déclarée', queueTone: 'danger', urgent: true });
    expect(items[0].queueVisibleDates).toContain(toLocalIsoDate(TODAY));
  });

  it.each([false, true])('limits delivery deadlines to 90 days with urgent=%s', (urgent) => {
    for (const days of [-1, 0, 90, 91, 1210]) {
      const items = buildManagerHomeItems(sources({ purchases: [{
        id: 3, request_number: '3', title: 'Pièce de rechange', requested_on: expiryIn(-10),
        requester_name: null, project_code: null, vessel_name: 'GOURY', status: 'En réception',
        approval_status: 'Approuvée', urgent, ordered_on: expiryIn(-5),
        expected_delivery_on: expiryIn(days), received_on: null,
      }] }), TODAY);
      expect(items.map((item) => item.id), `delivery in ${days} days`).toEqual(days <= 90 ? ['purchase-3'] : []);
    }
  });
});
