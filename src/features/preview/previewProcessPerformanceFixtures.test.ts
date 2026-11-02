import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from './previewSupabaseClient';
import { fetchProcessPerformance } from '../home/processPerformanceQueries';
import { performanceToday } from '../home/processPerformance';

describe('administrator design preview for process performance', () => {
  it('shows coherent canonical register data, a real multi-axis polygon and synthetic interview evidence states', async () => {
    // Design fixtures only: role and tenant authorization are tested separately with real-profile fixtures.
    const processes = await fetchProcessPerformance(previewSupabaseClient, ['admin'], performanceToday(), 9301,
      ['humanResources', 'annualReviews', 'purchaseRequests', 'internalAudits', 'certificates', 'procedures',
        'chemicals', 'emergencyExercises', 'lsa', 'pharmacy', 'lifting', 'medicalLogbook']);
    expect(processes).toHaveLength(11);
    expect(processes.every((process) => process.unavailableSources.length === 0)).toBe(true);
    expect(processes.filter((process) => process.score !== null).length).toBeGreaterThanOrEqual(8);
    expect(processes.find((process) => process.key === 'humanResources')?.summary).toContain('1 entretien réalisé · 2 planifiés');
    expect(processes.find((process) => process.key === 'medicalLogbook')?.score).toBeNull();
    expect(processes.find((process) => process.key === 'emergencyExercises')?.score).toBeNull();
    expect(JSON.stringify(processes)).not.toMatch(/ADAM|DEBORDEAUX|LEPRETRE|HARACHE/);
  });

  it('applies filters and pagination on the newly exposed read-only fixture tables', async () => {
    const { data, error } = await previewSupabaseClient.from('annual_reviews').select('*')
      .is('manager_validated_at', null).order('id').range(1, 1);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ id: 9903, employee_person_id: 9304, status: 'scheduled' });
    const own = await previewSupabaseClient.from('annual_reviews').select('*').in('employee_person_id', [9303]);
    expect(own.data).toHaveLength(1);
    expect(own.data?.[0].employee_name_snapshot).toBe('Luc MARTIN');
  });

  it('rejects writes and leaves the canonical preview inventory unchanged', async () => {
    const before = await previewSupabaseClient.from('hr_action_plans').select('*');
    const write = await previewSupabaseClient.from('hr_action_plans').insert({ person_id: 9303, title: 'Unexpected write' });
    expect(write.error?.message).toContain('lecture seule');
    const after = await previewSupabaseClient.from('hr_action_plans').select('*');
    expect(after.data).toEqual(before.data);
  });
});
