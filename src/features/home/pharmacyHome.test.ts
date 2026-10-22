import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { PharmacyNotification } from '../pharmacy/pharmacyModel';
import {
  buildManagerHomeAssignmentScope,
  buildManagerHomeItems,
  fetchManagerHomeDashboard,
  filterManagerHomeSourcesForScope,
  type ManagerHomeAssignmentRow,
  type ManagerHomeSourceRows,
} from './managerHomeData';
import { buildManagerHomeVessels } from './managerHomeVessels';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';

const TODAY = new Date('2026-10-20T12:00:00Z');
const ASSIGNMENT: ManagerHomeAssignmentRow = {
  vessel_id: 10, crew_person_id: 42, captain_person_id: 42,
  watch_group: 'A', vessels: { name: 'GOURY' },
};

function notification(overrides: Partial<PharmacyNotification> = {}): PharmacyNotification {
  return {
    id: 'item-1', kind: 'item', vessel_id: 10, vessel_name: 'GOURY', title: 'PARACETAMOL',
    expires_on: '2026-11-19', days_until_expiry: 30, item_id: 1, ...overrides,
  };
}

function sources(rows: PharmacyNotification[] = []): ManagerHomeSourceRows {
  return {
    purchases: [], procedures: [], fleetCertificates: [], people: [],
    hrDocuments: [], workingTimeCalculations: [], pharmacyNotifications: rows,
  };
}

// The profile fixtures use the real loader and pharmacy RPC adapter, without preview roles.
function clientFor(rows: PharmacyNotification[] = [], options: {
  assignments?: ManagerHomeAssignmentRow[];
  fleetCertificates?: ManagerHomeSourceRows['fleetCertificates'];
  pharmacyError?: boolean;
  assignmentError?: boolean;
} = {}) {
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query), order: vi.fn(() => query),
      in: vi.fn(() => query), eq: vi.fn(() => query), neq: vi.fn(() => query),
      lte: vi.fn(() => query), gte: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === 'planning_assignments' ? options.assignments || []
          : table === 'fleet_certificates' ? options.fleetCertificates || [] : [],
        error: table === 'planning_assignments' && options.assignmentError ? { message: 'Affectation indisponible' } : null,
      }).then(resolve),
    };
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'pharmacy_notifications' ? rows : [],
    error: name === 'pharmacy_notifications' && options.pharmacyError ? { message: 'Pharmacie indisponible' } : null,
  }));
  return { client: { from, rpc } as unknown as SupabaseClient, rpc };
}

describe('pharmacy alarms on the consolidated home dashboard', () => {
  it('keeps the public demonstration home available without exposing pharmacy source data', async () => {
    const result = await fetchManagerHomeDashboard(previewSupabaseClient, TODAY, { roles: ['admin'], personId: null });
    expect(result.unavailableSources).not.toContain('les échéances pharmacie');
    expect(result.items.filter((item) => item.id.startsWith('pharmacy-'))).toEqual([]);
  });
  it('includes J-30 medication and control alarms in the existing fleet group and vessel filter', () => {
    const rows = [
      notification(),
      notification({ id: 'control-2', kind: 'control', title: 'Contrôle Pharmacie', item_id: null }),
    ];
    const items = buildManagerHomeItems(sources(rows), TODAY);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.id === 'pharmacy-item-1')).toMatchObject({
      title: 'PARACETAMOL', group: 'fleetDocuments', tags: ['documents', 'fleet'],
      context: 'Inventaire pharmacie · GOURY', queueTone: 'warning', urgent: false,
      to: '/modules/pharmacy?vessel=10&filter=expiry&item=1',
      vessels: [{ key: 'vessel:10', name: 'GOURY' }],
    });
    expect(items.find((item) => item.id === 'pharmacy-control-2')).toMatchObject({
      title: 'Contrôle Pharmacie', context: 'Contrôle pharmacie · GOURY',
      action: 'Ouvrir le contrôle pharmacie',
      to: '/modules/pharmacy?vessel=10&filter=expiry',
    });
    expect(items[0].queueVisibleDates).toEqual(['2026-11-19', '2026-10-20']);
    expect(buildManagerHomeVessels(sources(rows)).vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
  });

  it('keeps distinct historical and current articles addressable without changing vessel scope', () => {
    const items = buildManagerHomeItems(sources([
      notification({ id: 'item-41', item_id: 41, title: 'Article historique B' }),
      notification({ id: 'item-42', item_id: 42, title: 'Article courant C' }),
    ]), TODAY);
    expect(items.find((item) => item.id === 'pharmacy-item-41')).toMatchObject({
      to: '/modules/pharmacy?vessel=10&filter=expiry&item=41', vessels: [{ key: 'vessel:10', name: 'GOURY' }],
    });
    expect(items.find((item) => item.id === 'pharmacy-item-42')).toMatchObject({
      to: '/modules/pharmacy?vessel=10&filter=expiry&item=42', vessels: [{ key: 'vessel:10', name: 'GOURY' }],
    });
  });

  it('keeps expired controls visible and uses server days rather than the browser date', () => {
    const items = buildManagerHomeItems(sources([
      notification({ id: 'control-2', kind: 'control', title: 'Contrôle Pharmacie', expires_on: '2026-10-18', days_until_expiry: -2 }),
      notification({ id: 'item-3', expires_on: '2026-10-21', days_until_expiry: 1 }),
    ]), new Date('2026-10-19T22:30:00Z'));
    expect(items.find((item) => item.id === 'pharmacy-control-2')).toMatchObject({
      dueDate: '2026-10-18', deadline: 'Expiré depuis 2 j', queueTone: 'danger', urgent: true,
      queueVisibleDates: ['2026-10-18', '2026-10-20'],
    });
    expect(items.find((item) => item.id === 'pharmacy-item-3')).toMatchObject({
      deadline: 'Demain', thisWeek: true, queueVisibleDates: ['2026-10-21', '2026-10-20'],
    });
  });

  it('uses exact vessel IDs even when a foreign notification has the assigned vessel name', () => {
    const scope = buildManagerHomeAssignmentScope([ASSIGNMENT], 42);
    const filtered = filterManagerHomeSourcesForScope(sources([
      notification(), notification({ id: 'item-2', vessel_id: 11, vessel_name: 'GOURY' }),
    ]), scope);
    expect(filtered.pharmacyNotifications?.map((row) => row.id)).toEqual(['item-1']);
    expect(buildManagerHomeVessels(filtered).vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
  });

  it.each(['capitaine', 'marin'] as const)('keeps a real %s loader within their assigned vessel', async (role) => {
    const { client, rpc } = clientFor([
      notification(), notification({ id: 'item-2', vessel_id: 11, vessel_name: 'SUROIT' }),
    ], { assignments: [ASSIGNMENT] });
    const result = await fetchManagerHomeDashboard(client, TODAY, { roles: [role], personId: 42 });
    expect(rpc).toHaveBeenCalledWith('pharmacy_notifications');
    expect(result.items.map((item) => item.id)).toEqual(['pharmacy-item-1']);
    expect(result.vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
    expect(result.unavailableSources).toEqual([]);
  });

  it('does not load pharmacy alarms without a resolvable onboard assignment', async () => {
    for (const options of [{}, { assignmentError: true }]) {
      const { client, rpc } = clientFor([notification()], options);
      const result = await fetchManagerHomeDashboard(client, TODAY, { roles: ['capitaine'], personId: 42 });
      expect(result.items).toEqual([]);
      expect(result.vessels).toEqual([]);
      expect(rpc).not.toHaveBeenCalledWith('pharmacy_notifications');
    }
  });

  it('reports pharmacy source errors without constructing an alarm or foreign vessel', async () => {
    const { client } = clientFor([notification({ vessel_id: 11, vessel_name: 'SUROIT' })], {
      pharmacyError: true,
      fleetCertificates: [{
        id: 1, vessel_id: 10, vessel_name: 'GOURY', document_title: 'Classe', title: null,
        status: 'expired', expires_on: '2026-10-18', planned_on: null,
        workflow_status: null, is_active_fleet: true,
      }],
    });
    const result = await fetchManagerHomeDashboard(client, TODAY, { roles: ['admin'], personId: null });
    expect(result.items.map((item) => item.id)).toEqual(['fleet-1']);
    expect(result.vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
    expect(result.unavailableSources).toEqual(['les échéances pharmacie']);
  });

  it('accepts the permission-scoped empty result from the pharmacy RPC', async () => {
    const { client, rpc } = clientFor([]);
    const result = await fetchManagerHomeDashboard(client, TODAY, { roles: ['direction'], personId: null });
    expect(rpc).toHaveBeenCalledWith('pharmacy_notifications');
    expect(result.items).toEqual([]);
    expect(result.unavailableSources).toEqual([]);
  });
});
