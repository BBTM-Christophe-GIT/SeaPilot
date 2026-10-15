import { describe, expect, it } from 'vitest';
import { buildWorkingTimeEntryAnalysis } from './workingTimeEntryAnalysis';
import type { WorkingTimePhaseInput, WorkingTimePolicyThresholds } from './workingTimeQueries';

const phase = (date: string, start: string, end: string, endDate = date): WorkingTimePhaseInput => ({
  startsAt: `${date}T${start}:00`, endsAt: `${endDate}T${end}:00`,
});

const policy: WorkingTimePolicyThresholds = {
  id: 5, name: 'Politique compagnie applicable', maxWork24h: 12, minRest24h: 10,
  maxWork7d: 84, minRest7d: 77, minConsecutiveRestHours: 6, maxRestPeriods24h: 2,
  maxAmplitudeHours: 14, maxIntervalBetweenRestsHours: 14, maxNightWork24h: 8,
};
const history = [phase('2026-10-13', '06:00', '12:00'), phase('2026-10-13', '13:00', '18:30')];
const phases = [
  phase('2026-10-14', '02:00', '07:00'), phase('2026-10-14', '08:00', '12:00'),
  phase('2026-10-14', '18:00', '22:00'),
];
type AnalysisInput = Parameters<typeof buildWorkingTimeEntryAnalysis>[0];
const analyze = (overrides: Partial<AnalysisInput> = {}) => buildWorkingTimeEntryAnalysis({
  selectedDate: '2026-10-14', history, phases, policy,
  coverage: { startsAt: '2026-10-01T00:00:00', endsAt: '2026-11-01T00:00:00' },
  ...overrides,
});

describe('live working-time entry analysis adapter', () => {
  it('closes the nine-hour calculation day at noon and starts the next four-hour day at the same rest boundary', () => {
    const { projection, graph } = analyze();
    expect(projection.calculationDays).toMatchObject([
      { startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-14T12:00:00', workHours: 9, status: 'closed' },
      { startsAt: '2026-10-14T12:00:00', endsAt: '2026-10-14T22:00:00', workHours: 4, restHours: 6, status: 'open' },
    ]);
    expect(projection.latestCalculationDay?.precedingRest).toMatchObject({
      startsAt: '2026-10-14T12:00:00', endsAt: '2026-10-14T18:00:00', hours: 6,
    });
    expect(projection.window24.workHours).toBe(13);
    expect(projection.rules.find((rule) => rule.key === 'max_work_24h')).toMatchObject({ actual: 9, limit: 12, status: 'ok' });
    expect(graph.workTotalLabel).toBe('Cumul : 4 h 00');
    expect(graph.workLimitMarkerMinute).toBeNull();
    expect(graph.excessRanges).toEqual([]);
    expect(graph.excessLabel).toBeNull();
    expect(graph.contextNotes).toEqual(expect.arrayContaining([
      expect.stringContaining('Journée clôturée :'), expect.stringContaining('9 h 00 de travail'),
      expect.stringContaining('Repos au départ :'), expect.stringContaining('(6 h 00)'),
    ]));
    expect(graph.phaseLabels).toEqual([
      { startMinute: 120, endMinute: 420, label: '02:00–07:00', isPending: true },
      { startMinute: 480, endMinute: 720, label: '08:00–12:00', isPending: true },
      { startMinute: 1080, endMinute: 1320, label: '18:00–22:00', isPending: true },
    ]);
  });

  it('applies persisted custom work, rest, amplitude and interval limits rather than the demo defaults', () => {
    const { projection, graph } = analyze({ policy: {
      ...policy, maxWork24h: 8, minRest24h: 11.5, maxWork7d: 20, minRest7d: 147,
      maxRestPeriods24h: 4, maxAmplitudeHours: 9, maxIntervalBetweenRestsHours: 4,
    } });
    expect(projection.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'max_work_24h', actual: 9, limit: 8, deviation: 1, status: 'deviation' }),
      expect.objectContaining({ key: 'min_rest_24h', actual: 11, limit: 11.5, deviation: 0.5, status: 'deviation' }),
      expect.objectContaining({ key: 'max_work_7d', limit: 20, status: 'deviation' }),
      expect.objectContaining({ key: 'min_rest_7d', limit: 147, status: 'deviation' }),
      expect.objectContaining({ key: 'max_rest_periods', actual: 3, limit: 4, status: 'ok' }),
      expect.objectContaining({ key: 'max_amplitude', actual: 10, limit: 9, deviation: 1, status: 'deviation' }),
      expect.objectContaining({ key: 'max_interval_between_rests', actual: 5, limit: 4, deviation: 1, status: 'deviation' }),
    ]));
    // The still-visible closed day's excess is retained after the six-hour reset.
    expect(graph.workTotalLabel).toBe('Cumul : 4 h 00');
    expect(graph.workLimitMarkerMinute).toBe(660);
    expect(graph.excessRanges).toEqual([{ startMinute: 660, endMinute: 720 }]);
    expect(graph.excessLabel).toBe('Journée précédente : dépassement +1 h 00');
  });

  it('uses the configured long-rest duration when identifying the calculation-day boundary', () => {
    const { projection, graph } = analyze({ policy: { ...policy, minConsecutiveRestHours: 7 } });
    expect(projection.latestCalculationDay).toMatchObject({
      startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-14T22:00:00', workHours: 13,
    });
    expect(graph.workTotalLabel).toBe('Cumul : 13 h 00');
    expect(graph.workLimitMarkerMinute).toBe(1260);
    expect(projection.rules.find((rule) => rule.key === 'min_continuous_rest')).toMatchObject({ limit: 7, status: 'deviation' });
  });

  it('retains compatibility limits when older policy fixtures omit the new fields', () => {
    const { maxAmplitudeHours: _amplitude, maxIntervalBetweenRestsHours: _interval, ...legacyPolicy } = policy;
    void _amplitude; void _interval;
    const { projection } = analyze({ policy: legacyPolicy });
    expect(projection.policy.maxAmplitudeHours).toBe(14);
    expect(projection.policy.maxIntervalBetweenRestsHours).toBe(14);
  });

  it('keeps incomplete history unconfirmed even when the observed work stays below the cap', () => {
    const { projection, graph } = analyze({
      history: [], phases: [phase('2026-10-14', '08:00', '12:00')],
      coverage: { startsAt: '2026-10-14T08:00:00', endsAt: '2026-10-14T12:00:00' },
    });
    expect(projection.coverageComplete).toBe(false);
    expect(projection.latestCalculationDay?.historyCovered).toBe(false);
    expect(projection.rules.find((rule) => rule.key === 'max_work_24h')?.status).toBe('unknown');
    expect(graph.contextNotes).toContain('Historique incomplet · début et valeurs à confirmer.');
    expect(graph.workLimitMarkerMinute).toBeNull();
    expect(graph.analysisStatusLabel).toBe('Projection des plages · contrôles serveur à l’enregistrement');
  });

  it('projects a correction after the caller excludes the interval being replaced', () => {
    const recorded = [
      ...history.map((range, index) => ({ ...range, id: index + 1 })),
      { ...phases[0], id: 3 }, { ...phase('2026-10-14', '08:00', '20:00'), id: 4 },
    ];
    const { projection, graph } = analyze({ history: recorded.filter((range) => range.id !== 4), phases: phases.slice(1) });
    expect(projection.dailyWorkHours).toBe(13);
    expect(projection.latestCalculationDay?.workHours).toBe(4);
    expect(graph.phaseLabels).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '02:00–07:00', isPending: false }),
      expect.objectContaining({ label: '08:00–12:00', isPending: true }),
    ]));
    expect(graph.phaseLabels).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: '08:00–20:00' })]));
    expect(graph.workLimitMarkerMinute).toBeNull();
  });

  it('clips saved and pending cross-midnight labels to the selected date without losing elapsed work', () => {
    const { projection, graph } = analyze({
      history: [phase('2026-10-13', '18:00', '20:00'), phase('2026-10-13', '23:00', '01:00', '2026-10-14')],
      phases: [phase('2026-10-14', '22:00', '02:00', '2026-10-15')],
    });
    expect(projection.latestCalculationDay?.workHours).toBe(4);
    expect(graph.phaseLabels).toEqual([
      { startMinute: 0, endMinute: 60, label: '00:00–01:00', isPending: false },
      { startMinute: 1320, endMinute: 1440, label: '22:00–24:00', isPending: true },
    ]);
    expect(graph.workTotalLabel).toBe('Cumul : 4 h 00');
    expect(graph.workLimitMarkerMinute).toBeNull();
  });

  it('clips an excess carried from the previous date without inventing a threshold marker at midnight', () => {
    const { graph } = analyze({
      history: [phase('2026-10-13', '06:00', '10:00')],
      phases: [phase('2026-10-13', '11:00', '04:00', '2026-10-14')],
    });
    expect(graph.excessRanges).toEqual([{ startMinute: 0, endMinute: 240 }]);
    expect(graph.workLimitMarkerMinute).toBeNull();
    expect(graph.phaseLabels).toEqual([{ startMinute: 0, endMinute: 240, label: '00:00–04:00', isPending: true }]);
  });

  it('opens the attested rest-only calculation day before work resumes', () => {
    const { projection, graph } = analyze({ phases: [] });
    expect(projection.latestCalculationDay).toMatchObject({
      startsAt: '2026-10-13T18:30:00', endsAt: '2026-10-15T00:00:00',
      status: 'open', workHours: 0, historyCovered: true,
    });
    expect(graph.isProjected).toBe(false);
    expect(graph.workTotalLabel).toBe('Cumul : 0 h 00');
    expect(graph.phaseLabels).toEqual([]);
  });

  it('does not infer a calculation day from an empty date without recorded history', () => {
    const { projection, graph } = analyze({ history: [], phases: [] });
    expect(projection.latestCalculationDay).toBeNull();
    expect(graph.windowLabel).toBe('Journée de calcul : début à confirmer');
    expect(graph.summaryLabel).toBe('Aucune journée de calcul identifiable pour ce jour.');
  });

  it('accepts leap-day entry and rejects a normalized impossible date', () => {
    const { graph } = analyze({ selectedDate: '2028-02-29', history: [],
      phases: [phase('2028-02-29', '22:00', '02:00', '2028-03-01')],
      coverage: { startsAt: '2028-02-01T00:00:00', endsAt: '2028-03-02T00:00:00' },
    });
    expect(graph.workTotalLabel).toBe('Cumul : 4 h 00');
    expect(graph.phaseLabels?.[0]).toMatchObject({ startMinute: 1320, endMinute: 1440 });
    expect(() => analyze({ selectedDate: '2026-02-29' })).toThrow('Date de saisie invalide.');
  });
});
