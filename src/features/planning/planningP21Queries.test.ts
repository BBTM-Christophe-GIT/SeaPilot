import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { PlanningAssistantSuggestion } from './planningP21';
import { fetchPlanningAssistantAccess, mapPlanningAssistantAccess } from './planningP21Access';
import {
  mapPlanningAssistantPilots,
  mapPlanningAssistantReviews,
  recordPlanningAssistantReview,
  setPlanningAssistantPilot,
} from './planningP21Queries';

function rpcClient(result: unknown = 12) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const suggestion: PlanningAssistantSuggestion = {
  key: 'vacancy:test', type: 'vacant_position', title: 'Poste vacant', summary: 'Capitaine manquant',
  criteriaUsed: ['Période'], dataChecked: ['Affectations'], rulesApplied: ['Matrice'], conflictsDetected: ['Poste vacant'],
  unavailableData: [], confidence: { level: 'high', score: 91 }, justification: 'Effectif insuffisant', suggestedSteps: ['Vérifier'],
  candidates: [], vesselId: 1, personId: null, humanValidationRequired: true,
};

describe('Planning P2.1 query contracts', () => {
  it('maps denied, pilot and administrator access without trusting client roles', async () => {
    expect(mapPlanningAssistantAccess([])).toMatchObject({ hasAccess: false, accessMode: 'none' });
    const rows = [{ has_access: true, access_mode: 'pilot' as const, expires_on: '2026-12-31', can_manage_pilots: false }];
    expect(mapPlanningAssistantAccess(rows)).toMatchObject({ hasAccess: true, accessMode: 'pilot', expiresOn: '2026-12-31' });
    const { client, rpc } = rpcClient(rows);
    await expect(fetchPlanningAssistantAccess(client)).resolves.toMatchObject({ accessMode: 'pilot' });
    expect(rpc).toHaveBeenCalledWith('get_planning_assistant_access');
  });

  it('maps immutable reviews and office pilot candidates', () => {
    expect(mapPlanningAssistantReviews([{ id: 1, suggestion_key: 'test', suggestion_type: 'handover', decision: 'refused', comment: 'Non pertinent', vessel_id: 2, person_id: null, generated_for_start: '2026-08-01', generated_for_end: '2026-08-31', reviewed_by: 'user', reviewed_by_name: 'Admin', reviewed_at: '2026-08-01T10:00:00Z' }])[0]).toMatchObject({ suggestionKey: 'test', decision: 'refused', reviewedByName: 'Admin' });
    expect(mapPlanningAssistantPilots([{ pilot_id: null, user_id: 'user', display_name: 'Bureau', email: 'bureau@example.com', role_keys: ['armement'], enabled: false, valid_until: null, reason: null, updated_at: null }])[0]).toMatchObject({ pilotId: null, roleKeys: ['armement'], enabled: false });
  });

  it('records only the human decision with the complete evidence snapshot', async () => {
    const { client, rpc } = rpcClient(18);
    await recordPlanningAssistantReview(client, { suggestion, decision: 'accepted', comment: 'Validé par le bureau', range: { start: '2026-08-01', end: '2026-08-31' } });
    expect(rpc).toHaveBeenCalledWith('record_planning_assistant_review', expect.objectContaining({
      p_suggestion_key: 'vacancy:test', p_decision: 'accepted', p_comment: 'Validé par le bureau',
      p_suggestion_snapshot: expect.objectContaining({ human_validation_required: true, criteria_used: ['Période'] }),
    }));
    expect(() => recordPlanningAssistantReview(client, { suggestion, decision: 'refused', comment: 'x', range: { start: '2026-08-01', end: '2026-08-31' } })).toThrow('3 caractères');
  });

  it('keeps pilot grants server-authorized and validates the administrative reason', async () => {
    const { client, rpc } = rpcClient(4);
    await setPlanningAssistantPilot(client, { userId: '00000000-0000-0000-0000-000000000001', enabled: true, validUntil: '2026-12-31', reason: 'Pilote bureau validé' });
    expect(rpc).toHaveBeenCalledWith('set_planning_assistant_pilot', expect.objectContaining({ p_enabled: true, p_valid_until: '2026-12-31' }));
    expect(() => setPlanningAssistantPilot(client, { userId: 'user', enabled: false, validUntil: '', reason: 'court' })).toThrow('10 caractères');
  });
});
