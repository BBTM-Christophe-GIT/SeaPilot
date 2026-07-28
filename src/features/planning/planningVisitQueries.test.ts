import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  mapPlanningVisitRows,
  planningVisitTypeLabel,
  savePlanningVesselVisit,
} from './planningVisitQueries';

describe('planning vessel visit contracts', () => {
  it('keeps the requested visit types in French alphabetical order', () => {
    const labels = [
      'Analyse d’Eau',
      'Audit Client',
      'Audit IMCA',
      'Audit Interne',
      'Visite ANFR',
      'Visite annuelle - Affaires Maritimes',
      'Visite annuelle - Société de Classification',
      'Visite Bossoir',
      'Visite Grue',
      'Visite Incendie',
      'Visite QHSE',
    ];
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right, 'fr')));
    expect(planningVisitTypeLabel('annual_classification_society')).toBe('Visite annuelle - Société de Classification');
  });

  it('maps multiple occurrences on the same day and provider contact details', () => {
    const [visit] = mapPlanningVisitRows([{
      id: 4,
      vessel_id: 2,
      visit_type: 'crane_visit',
      provider_id: 8,
      comments: 'Préparer le registre.',
      created_at: '2026-07-23T08:00:00Z',
      updated_at: '2026-07-23T08:00:00Z',
      provider: {
        id: 8,
        name: 'APAVE',
        category: 'Prestataire',
        service_type: 'Visite Grue',
        activity: 'Contrôle',
        address: '235 Route du Mesnil',
        city: 'Montivilliers',
        phone: '02 32 79 56 46',
        company_email: 'contact@apave.example',
        contact_name: 'Clément NOEL',
        contact_role: 'Inspecteur',
        contact_phone: '06 00 00 00 00',
        contact_email: 'clement@apave.example',
      },
      occurrences: [
        { id: 2, scheduled_at: '2026-08-11T12:00:00Z' },
        { id: 1, scheduled_at: '2026-08-11T07:00:00Z' },
      ],
      attachments: [],
    }]);

    expect(visit.provider).toMatchObject({ name: 'APAVE', contactName: 'Clément NOEL' });
    expect(visit.occurrences.map((occurrence) => occurrence.scheduledOn)).toEqual(['2026-08-11', '2026-08-11']);
    expect(visit.occurrences[0].scheduledAt).toBe('2026-08-11T07:00:00Z');
  });

  it('sends all local visit slots to the secured save RPC in UTC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 14, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(savePlanningVesselVisit(client, {
      vesselId: 2,
      visitType: 'imca_audit',
      providerId: 8,
      comments: 'Deux passages.',
      scheduledAt: ['2026-08-11T09:00', '2026-08-11T14:00'],
    })).resolves.toBe(14);
    expect(rpc).toHaveBeenCalledWith('save_vessel_visit', expect.objectContaining({
      p_vessel_id: 2,
      p_provider_id: 8,
      p_visit_type: 'imca_audit',
      p_scheduled_at: ['2026-08-11T07:00:00.000Z', '2026-08-11T12:00:00.000Z'],
    }));
  });
});
