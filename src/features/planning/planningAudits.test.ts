import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningAudits, mapPlanningAudits, planningAuditKey, planningAuditUrl, withPlanningAuditLanes, type PlanningAudit } from './planningAudits';
import type { PlanningFleetLane } from './planningViews';
import type { PlanningCrewRow } from './planningModel';

const audit: PlanningAudit = { id: 'audit-1', kind: 'internal_ism', siteId: '32', siteName: 'LE ROZEL', vesselId: 32,
  plannedOn: '2026-10-01', performedOn: null, title: 'Grille LE ROZEL', status: 'planned', canOpen: true };
const range = { start: '2026-10-01', end: '2026-10-31' };
const filters = { vesselName: '', personName: '' };

describe('Audits in the global Planning', () => {
  it.each(['internal_ism', 'ovid', 'ecmid', 'external_ism', 'client'] as const)('maps %s dates without a timestamp conversion', (kind) => {
    const mapped = mapPlanningAudits([{ ...audit, kind, plannedOn: '2026-10-25' }]);
    expect(mapped[0].plannedOn).toBe('2026-10-25');
    expect(planningAuditKey(mapped[0])).toBe(`audit-${kind}-audit-1`);
  });
  it('uses a minimal read RPC and reports failure instead of silently dropping audits', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [audit], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Access denied' } });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await fetchPlanningAudits(client)).toEqual([audit]);
    expect(rpc).toHaveBeenCalledWith('planning_audits_overview');
    await expect(fetchPlanningAudits(client)).rejects.toThrow("Vous n'avez pas l'autorisation d'effectuer cette opération.");
  });
  it.each([null, [{ ...audit, plannedOn: '2026-02-30' }], [{ ...audit, kind: 'other' }], [{ ...audit, vesselId: -1 }]])('rejects an incomplete or invalid feed', (data) => {
    expect(() => mapPlanningAudits(data)).toThrow();
  });
  it('keeps metadata visible without granting an audit content link', () => {
    expect(mapPlanningAudits([{ ...audit, canOpen: undefined }])[0].canOpen).toBe(false);
  });
  it('adds a vessel with an audit even when there is no crew or operation', () => {
    const layout = withPlanningAuditLanes([], [], [audit], range, filters);
    expect(layout.lanes[0]).toMatchObject({ vesselId: 32, vessel: 'LE ROZEL', projects: [] });
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0]).toMatchObject({ type: 'vessel', vesselId: 32, label: 'LE ROZEL' });
  });
  it('keeps shore sites separate and excludes audits outside the period or selected vessel', () => {
    const shore = { ...audit, id: 'shore', siteId: '33', siteName: 'Armement - CHERBOURG', vesselId: null };
    const yard = { ...shore, id: 'yard', siteId: '34', siteName: 'Yard - LE HAVRE' };
    const layout = withPlanningAuditLanes([], [], [shore, yard, { ...audit, plannedOn: '2026-11-01' }], range, filters);
    expect(layout.rows.map((row) => row.vessel)).toEqual(expect.arrayContaining(['Armement - CHERBOURG', 'Yard - LE HAVRE']));
    expect(layout.lanes).toHaveLength(2);
    expect(withPlanningAuditLanes([], [], [shore, audit], range, { ...filters, vesselName: 'LE ROZEL' }).rows).toHaveLength(1);
    expect(withPlanningAuditLanes([], [], [audit], range, { ...filters, personName: 'Paul MARTIN' }).rows).toHaveLength(0);
  });
  it('does not duplicate a vessel and keeps its boards and crew grouped', () => {
    const lane: PlanningFleetLane = { key: 'lane32', vesselId: 32, vessel: 'LE ROZEL', label: 'LE ROZEL', detail: '', projects: [], assignments: [], locations: [] };
    const vesselRow: PlanningCrewRow = { key: 'v32', type: 'vessel', personId: null, vesselId: 32, label: 'LE ROZEL', vessel: 'LE ROZEL',
      board: '', functionLabel: '', boardRowId: null, hasAnyRecords: false, vesselKey: 'v32', boardKey: '', events: [], projects: [] };
    const personRow = { ...vesselRow, key: 'crew', type: 'person' as const, personId: 2, label: 'Paul MARTIN' };
    const layout = withPlanningAuditLanes([lane], [vesselRow, personRow], [audit, { ...audit, kind: 'ovid' }], range, filters);
    expect(layout.lanes).toEqual([lane]); expect(layout.rows).toEqual([vesselRow, personRow]);
  });
  it.each([
    ['internal_ism', 'internalAudits'], ['ovid', 'ovid'], ['ecmid', 'ecmid'],
    ['external_ism', 'externalIsmAudits'], ['client', 'clientAudits'],
  ] as const)('links %s to its source module and preserves the audit ID', (kind, module) => {
    expect(planningAuditUrl({ id: 'audit&id', kind })).toBe(`/modules/${module}?audit=audit%26id`);
  });
});
