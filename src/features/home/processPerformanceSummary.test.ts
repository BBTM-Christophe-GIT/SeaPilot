import { describe, expect, it } from 'vitest';
import type { ProcessPerformance } from './processPerformance';
import { summarizeProcessPerformance } from './processPerformanceSummary';

function process(key: ProcessPerformance['key'], score: number | null, overrides: Partial<ProcessPerformance> = {}): ProcessPerformance {
  return { key, score, label: key, shortLabel: key, summary: '', to: `/modules/${key}`, criteria: [], tasks: [], unavailableSources: [], ...overrides };
}

describe('overall process performance summary', () => {
  it('averages rated processes with equal weights, retaining a measured zero and explicit coverage', () => {
    const input = [process('humanResources', 100, { criteria: [{ id: 'medical', label: 'Médical', weight: 100, score: 100, detail: '' }] }),
      process('purchases', 0), process('fleet', 80), process('emergencyExercises', null)];
    const summary = summarizeProcessPerformance(input);
    expect(summary).toMatchObject({ score: 60, ratedCount: 3, totalCount: 4, notApplicableCount: 1, unavailableCount: 0, coverageRate: 75 });
    expect(summary.methodology).toContain('à poids égaux');
    expect(summary.processes).toEqual(input);
    expect(summary.processes).not.toBe(input);
  });

  it('suspends the overall score if any authorized process source is unavailable', () => {
    const summary = summarizeProcessPerformance([process('humanResources', 100), process('pharmacy', null, { unavailableSources: ['Inventaire pharmacie'] })]);
    expect(summary).toMatchObject({ score: null, ratedCount: 1, totalCount: 2, unavailableCount: 1, coverageRate: 50 });
    expect(summary.unavailableSources).toEqual(['Inventaire pharmacie']);
    const stale = summarizeProcessPerformance([process('humanResources', 100, { unavailableSources: ['Collaborateurs'] })]);
    expect(stale.score).toBeNull();
    expect(stale.ratedCount).toBe(0);
  });

  it('keeps no applicable scores and an unloaded empty list distinct from zero performance', () => {
    expect(summarizeProcessPerformance([])).toMatchObject({ score: null, ratedCount: 0, totalCount: 0, coverageRate: null });
    expect(summarizeProcessPerformance([process('lsa', null)])).toMatchObject({ score: null, totalCount: 1, notApplicableCount: 1, coverageRate: 0 });
    expect(summarizeProcessPerformance([process('lsa', 0)])).toMatchObject({ score: 0, ratedCount: 1, totalCount: 1, coverageRate: 100 });
  });

  it('removes the medical logbook from scoring, coverage and listing even in an old cached snapshot', () => {
    const input = [process('humanResources', 75), process('medicalLogbook', 0, { label: 'Registre médical', unavailableSources: ['Confidentiel'] })];
    const summary = summarizeProcessPerformance(input);
    expect(summary).toMatchObject({ score: 75, ratedCount: 1, totalCount: 1, unavailableCount: 0, unavailableSources: [] });
    expect(summary.processes.map((entry) => entry.key)).toEqual(['humanResources']);
    expect(input).toHaveLength(2);
    expect(summarizeProcessPerformance([input[1]])).toMatchObject({ score: null, totalCount: 0, coverageRate: null });
  });

  it('does not turn invalid numeric evidence into a favorable average', () => {
    const summary = summarizeProcessPerformance([process('purchases', 100), process('fleet', Number.NaN)]);
    expect(summary).toMatchObject({ score: null, ratedCount: 1, unavailableCount: 1 });
    expect(summary.unavailableSources).toEqual(['Score indisponible : fleet']);
  });
});
