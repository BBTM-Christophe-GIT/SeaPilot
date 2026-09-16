import { describe, expect, it } from 'vitest';
import { actionAssetKey, actionCategory, actionTreatmentSummary, buildActionAssetGroups } from './actionPlanNavigation';
import { compareFleetAssets, fleetDisplayName, fleetLength } from '../fleet/fleetDisplay';
import type { ActionItemRecord, ActionTypeCatalogRecord, VesselOption } from './actionPlanQueries';

const action = (id: number, vesselName: string, patch: Partial<ActionItemRecord> = {}) => ({ id, vesselName, vesselId: null, categoryKey: 'action', actionTypeKey: '', ...patch }) as ActionItemRecord;

describe('action plan fleet navigation', () => {
  it.each([
    [0, 0, 'red'], [74, 74, 'red'], [75, 75, 'orange'], [90, 90, 'orange'], [91, 91, 'green'], [100, 100, 'green'],
  ])('uses strict treatment thresholds with %i closed reports', (closed, percentage, tone) => {
    const rows = Array.from({ length: 100 }, (_, i) => action(i, 'GOURY', { status: i < closed ? 'Ecart Soldé' : 'Ecart Non Soldé', closedOn: '' }));
    expect(actionTreatmentSummary(rows)).toEqual({ open: 100 - closed, percentage, tone });
  });

  it('handles empty groups and historical closure dates using the same closure rule as the filters', () => {
    expect(actionTreatmentSummary([])).toEqual({ open: 0, percentage: 0, tone: 'red' });
    expect(actionTreatmentSummary([action(1, 'GOURY', { status: '', closedOn: '2026-09-16' })])).toEqual({ open: 0, percentage: 100, tone: 'green' });
  });

  it('orders vessels by decreasing length, then the Yard and offices, omitting assets with no accessible reports', () => {
    const vessels: VesselOption[] = [{ id: 7, name: 'ECREHOUEL', lengthOverall: '50 m' }];
    const rows = ['Bureaux', 'KROKDUR', 'YARD - Le Havre', 'LE ROZEL', 'GOURY', 'SUROIT'].map((name, i) => action(i, name));
    const groups = buildActionAssetGroups(rows, vessels);
    expect(groups.map((group) => group.name)).toEqual(['GOURY', 'LE ROZEL', 'SUROIT', 'KROKDUR', 'Yard - LE HAVRE', 'Bureaux']);
    expect(groups.map((group) => group.actions.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(groups.every((group) => group.image)).toBe(true);
  });

  it('uses registered decimal lengths ahead of brochure fallbacks, keeping unknown lengths last', () => {
    expect(fleetLength({ name: 'LE ROZEL', lengthOverall: '32,25 m' })).toBe(32.25);
    expect([{ name: 'Unknown' }, { name: 'GOURY' }, { name: 'LE ROZEL', lengthOverall: '32,25 m' }].sort(compareFleetAssets).map((v) => v.name)).toEqual(['LE ROZEL', 'GOURY', 'Unknown']);
    expect(fleetLength({ name: 'GOURY', lengthOverall: 'not known' })).toBe(30.62);
  });

  it('resolves renamed vessels by ID and legacy rows by normalized name without mixing two IDs', () => {
    const vessels = [{ id: 10, name: 'GOURY' }, { id: 11, name: 'GOURY' }];
    const rows = [action(1, 'Ancien nom', { vesselId: 10 }), action(2, ' goury '), action(3, 'GOURY', { vesselId: 11 })];
    expect(buildActionAssetGroups(rows, vessels).map((group) => group.actions.map((item) => item.id))).toEqual([[1, 2], [3]]);
    expect(actionAssetKey(rows[0], vessels)).toBe('vessel:10');
  });

  it('retains historical, unknown and unassigned reports instead of losing them', () => {
    const rows = [action(1, 'GOURY'), action(2, ''), action(3, 'Navire sorti', { vesselId: 404 })];
    const groups = buildActionAssetGroups(rows, []);
    expect(groups.reduce((total, group) => total + group.actions.length, 0)).toBe(3);
    expect(groups.at(-1)?.key).toBe('unassigned');
    expect(buildActionAssetGroups([], [{ id: 1, name: 'GOURY' }])).toEqual([]);
  });

  it('uses the catalog family for renamed and legacy event types and retains every fallback category', () => {
    const types = [{ key: 'near_miss', family: 'event', label: 'Presqu’accident' }] as ActionTypeCatalogRecord[];
    expect(actionCategory(action(1, '', { actionTypeKey: 'near_miss', categoryKey: 'action' }), types)).toBe('event');
    expect(['audit', 'hse_visit', 'hse_event', '', 'unknown'].map((categoryKey) => actionCategory(action(1, '', { categoryKey }), []))).toEqual(['audit', 'visit', 'event', 'action', 'action']);
    expect(fleetDisplayName({ name: 'YARD - Le Havre' })).toBe('Yard - LE HAVRE');
  });
});
