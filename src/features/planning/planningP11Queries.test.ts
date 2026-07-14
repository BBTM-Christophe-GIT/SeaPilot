import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  mapPlanningMatrixRows,
  mapPlanningOccurrenceRows,
  mapPlanningRotationRows,
  mapPlanningStcwCertificateRows,
  mapPlanningTemplateRows,
  savePlanningManningMatrix,
  savePlanningRotation,
  savePlanningTemplate,
  updatePlanningRotationOccurrence,
} from './planningP11Queries';

describe('planning P1.1 query mappers', () => {
  it('attaches occurrences to their rotation in chronological order', () => {
    const occurrences = mapPlanningOccurrenceRows([
      { id: 2, series_id: 5, assignment_id: 12, occurrence_number: 2, starts_on: '2026-08-29', ends_on: '2026-09-11', rest_starts_on: '2026-09-12', rest_ends_on: '2026-09-25', handover_at: '2026-08-29T06:00:00Z', is_override: true },
      { id: 1, series_id: 5, assignment_id: 11, occurrence_number: 1, starts_on: '2026-08-01', ends_on: '2026-08-14', rest_starts_on: '2026-08-15', rest_ends_on: '2026-08-28', handover_at: '2026-08-01T06:00:00Z', is_override: false },
    ]);
    const rotations = mapPlanningRotationRows([{
      id: 5, vessel_id: 1, crew_person_id: 2, captain_person_id: null, name: '14 / 14', pattern_key: '14_14',
      starts_on: '2026-08-01', onboard_days: 14, rest_days: 14, occurrence_count: 2,
      assignment_role: 'Matelot', watch_group: 'A', handover_minutes: 60, confirmation_status: 'confirmed', active: true,
    }], occurrences);
    expect(rotations[0].occurrences.map((item) => item.id)).toEqual([1, 2]);
    expect(rotations[0].occurrences[1].isOverride).toBe(true);
  });

  it('maps reusable templates and matrix requirements without losing arrays', () => {
    expect(mapPlanningTemplateRows([{ id: 1, vessel_id: null, name: 'Soutage', template_kind: 'bunkering', description: null, default_duration_days: 1, default_status: 'planned', configuration: { port: 'Cherbourg' }, active: true }])[0]).toMatchObject({ templateKind: 'bunkering', configuration: { port: 'Cherbourg' } });
    const matrices = mapPlanningMatrixRows([{ id: 2, vessel_id: 9, name: 'Matrice', effective_from: '2026-01-01', effective_to: null, status: 'active', notes: null, version: 3 }], [{ id: 4, matrixId: 2, functionLabel: 'Chef mécanicien', minimumCount: 1, targetCount: 1, requiredCertificates: ['Chef 3000'], requiredQualifications: [], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }]);
    expect(matrices[0]).toMatchObject({ vesselId: 9, version: 3, requirements: [{ requiredCertificates: ['Chef 3000'] }] });
  });

  it('maps the SharePoint STCW catalogue used by the multi-select', () => {
    expect(mapPlanningStcwCertificateRows([{
      id: 7,
      source_item_id: 34,
      name: 'Chef de Quart 500',
      category: 'Pont',
      stcw_rules: ['II/3'],
    }])).toEqual([{ id: 7, sourceItemId: 34, name: 'Chef de Quart 500', category: 'Pont', stcwRules: ['II/3'] }]);
  });
});

describe('planning P1.1 RPC contracts', () => {
  function rpcClient(result: unknown = 42) {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  }

  it('sends the complete 14/14 rotation to the atomic server function', async () => {
    const { client, rpc } = rpcClient(12);
    await expect(savePlanningRotation(client, { vesselId: 1, crewPersonId: 2, captainPersonId: 3, name: 'Rotation A', patternKey: '14_14', startsOn: '2026-08-01', onboardDays: 14, restDays: 14, occurrenceCount: 6, assignmentRole: 'Matelot', watchGroup: 'A', handoverMinutes: 60, confirmationStatus: 'confirmed' })).resolves.toBe(12);
    expect(rpc).toHaveBeenCalledWith('save_planning_rotation_series', expect.objectContaining({ p_pattern_key: '14_14', p_occurrence_count: 6, p_handover_minutes: 60 }));
  });

  it('makes the occurrence edit scope explicit', async () => {
    const { client, rpc } = rpcClient(3);
    await updatePlanningRotationOccurrence(client, { occurrenceId: 8, scope: 'following', startsOn: '2026-09-01', endsOn: '2026-09-14', vesselId: 2, assignmentRole: 'Second', watchGroup: 'B' });
    expect(rpc).toHaveBeenCalledWith('update_planning_rotation_occurrence', expect.objectContaining({ p_occurrence_id: 8, p_scope: 'following', p_vessel_id: 2 }));
  });

  it('persists templates and matrices through validated RPCs', async () => {
    const { client, rpc } = rpcClient(7);
    await savePlanningTemplate(client, { vesselId: null, name: 'Transit', templateKind: 'transit', description: '', defaultDurationDays: 2, defaultStatus: 'planned', configuration: {} });
    await savePlanningManningMatrix(client, { vesselId: 1, name: 'Matrice', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', requirements: [{ functionLabel: 'Capitaine', minimumCount: 1, targetCount: 1, requiredCertificates: [], requiredQualifications: [], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }] });
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_planning_template', expect.objectContaining({ p_template_kind: 'transit' }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_planning_manning_matrix', expect.objectContaining({ p_status: 'active', p_requirements: expect.any(Array) }));
  });
});
