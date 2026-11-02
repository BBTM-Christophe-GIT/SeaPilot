import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { previewSupabaseClient } from './previewSupabaseClient';
import { fetchProcessPerformance, fetchProcessPerformanceDashboard } from '../home/processPerformanceQueries';
import { performanceToday } from '../home/processPerformance';
import { createLsaPreviewClient } from '../lsa/lsaPreview';
import { loadRegisterPerformance } from '../home/processPerformanceRegisters';
import type { ProcessPerformanceScope } from '../home/processPerformanceScope';

const MODULES = ['humanResources', 'annualReviews', 'purchaseRequests', 'internalAudits', 'certificates', 'procedures',
  'chemicals', 'emergencyExercises', 'lsa', 'pharmacy', 'lifting', 'medicalLogbook'] as const;

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

  it('reuses each canonical inventory in the matching dashboard unit without mixing native fixture IDs', async () => {
    const today = performanceToday();
    const dashboard = await fetchProcessPerformanceDashboard(previewSupabaseClient, ['admin'], today, 9301, [...MODULES]);
    const goury = dashboard.entities.find((entity) => entity.name === 'GOURY')!;
    const demo = dashboard.entities.find((entity) => entity.name === 'M/V Démonstration')!;
    const office = dashboard.entities.find((entity) => entity.assetKind === 'office')!;
    const quay = dashboard.entities.find((entity) => entity.assetKind === 'quay')!;
    expect(goury.id).toBe(1);
    for (const key of ['lsa', 'pharmacy', 'lifting', 'internalAudits']) {
      expect(goury.processes.find((process) => process.key === key)?.score, key).toEqual(expect.any(Number));
    }
    expect(goury.processes.every((process) => process.unavailableSources.length === 0)).toBe(true);
    expect(demo.processes.find((process) => process.key === 'humanResources')?.score).toEqual(expect.any(Number));
    expect(demo.processes.find((process) => process.key === 'chemicals')?.summary).toContain('FDS absente');
    expect(office.processes.find((process) => process.key === 'internalAudits')?.score).toEqual(expect.any(Number));
    expect(quay.processes.find((process) => process.key === 'internalAudits')?.score).toEqual(expect.any(Number));

    const nativeClient = createLsaPreviewClient();
    const { data: nativeVessels } = await nativeClient.rpc('lsa_available_vessels');
    const nativeGoury = (nativeVessels as { id: number; name: string }[]).find((vessel) => vessel.name === 'GOURY')!;
    const scope: ProcessPerformanceScope = { kind: 'watch', label: 'GOURY', personId: null, personIds: [], vesselIds: [nativeGoury.id], vesselNames: ['GOURY'], watchGroups: [] };
    const [nativeLsa] = await loadRegisterPerformance(nativeClient, ['lsa'], scope, today);
    const dashboardLsa = goury.processes.find((process) => process.key === 'lsa')!;
    expect(dashboardLsa.score).toBe(nativeLsa.score);
    expect(dashboardLsa.criteria).toEqual(nativeLsa.criteria);
    expect(dashboardLsa.tasks.map(({ title, dueOn, state }) => ({ title, dueOn, state })))
      .toEqual(nativeLsa.tasks.map(({ title, dueOn, state }) => ({ title, dueOn, state })));
    expect(goury.id).toBe(1);
    expect(dashboardLsa.tasks.every((task) => task.to.includes(`vessel=${nativeGoury.id}&`))).toBe(true);
    const fleetLsa = dashboard.processes.find((process) => process.key === 'lsa')!;
    expect(fleetLsa.tasks.filter((task) => task.context === 'GOURY').map((task) => task.id)).toEqual(dashboardLsa.tasks.map((task) => task.id));
  });

  it('keeps normal-client links untouched and adapts only preview task URLs while retaining canonical comparisons', async () => {
    const { from, rpc } = previewSupabaseClient;
    const normalClient = { from, rpc } as unknown as SupabaseClient;
    const today = performanceToday();
    const canonical = await fetchProcessPerformanceDashboard(normalClient, ['admin'], today, 9301, [...MODULES]);
    const preview = await fetchProcessPerformanceDashboard(previewSupabaseClient, ['admin'], today, 9301, [...MODULES]);
    const canonicalGoury = canonical.entities.find((entity) => entity.name === 'GOURY')!;
    const previewGoury = preview.entities.find((entity) => entity.name === 'GOURY')!;
    expect(previewGoury.id).toBe(canonicalGoury.id);
    expect(previewGoury.id).toBe(1);
    expect(previewGoury.processes.map((process) => [process.key, process.score, process.criteria]))
      .toEqual(canonicalGoury.processes.map((process) => [process.key, process.score, process.criteria]));
    const sourceTask = canonicalGoury.processes.find((process) => process.key === 'lsa')!.tasks[0];
    const previewTask = previewGoury.processes.find((process) => process.key === 'lsa')!.tasks[0];
    expect(new URL(sourceTask.to, 'https://example.invalid').searchParams.get('vessel')).toBe('1');
    expect(new URL(previewTask.to, 'https://example.invalid').searchParams.get('vessel')).toBe('91001');
    expect(new URL(previewTask.to, 'https://example.invalid').searchParams.get('item'))
      .toBe(new URL(sourceTask.to, 'https://example.invalid').searchParams.get('item'));
    const demo = preview.entities.find((entity) => entity.name === 'M/V Démonstration')!;
    expect(demo.processes.find((process) => process.key === 'chemicals')!.tasks[0].to).toContain('vessel=90001&product=demo-product');
    const auditTask = previewGoury.processes.find((process) => process.key === 'internalAudits')!.tasks[0];
    expect(auditTask.to).toBe(canonicalGoury.processes.find((process) => process.key === 'internalAudits')!.tasks[0].to);
  });
});
