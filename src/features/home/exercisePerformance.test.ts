import { describe, expect, it } from 'vitest';
import { buildExercisePerformance, validateExerciseSnapshot, type ExercisePerformanceMonth, type ExercisePerformanceSnapshot, type ExercisePerformanceUnit } from './exercisePerformance';
import type { ProcessPerformanceScope } from './processPerformanceScope';

const company: ProcessPerformanceScope = { kind: 'company', label: 'Compagnie', personId: 99, personIds: [], vesselIds: [], vesselNames: [], watchGroups: [] };
const unitScope = (vesselId: number): ProcessPerformanceScope => ({ ...company, kind: 'watch', label: 'Navire', vesselIds: [vesselId], personIds: [] });
const monthlyTypes: ExercisePerformanceSnapshot['exerciseTypes'] = [
  { key: 'fire-protection', label: 'Incendie', cadenceMonths: 1 }, { key: 'abandon-ship', label: 'Abandon', cadenceMonths: 1 },
];
const other = { key: 'anti-pollution', label: 'Antipollution', cadenceMonths: 2 as const };
const counts = (fire = 0, abandon = 0, anti = 0) => ({ 'fire-protection': fire, 'abandon-ship': abandon, 'anti-pollution': anti });
function unit(vesselId: number, exerciseCounts = counts(), presenceDays = 1, tbtCount = 0): ExercisePerformanceUnit {
  return { vesselId, counts: exerciseCounts, fireCount: exerciseCounts['fire-protection'], abandonCount: exerciseCounts['abandon-ship'], presenceDays, tbtCount };
}
function month(personId: number, monthNumber: number, units = [unit(1)], presenceDays = Math.max(0, ...units.map((entry) => entry.presenceDays))): ExercisePerformanceMonth {
  const exerciseCounts = Object.fromEntries(Object.keys(counts()).map((key) => [key, units.reduce((sum, entry) => sum + entry.counts[key], 0)]));
  return { personId, personName: 'Personne ' + personId, month: monthNumber, units, counts: exerciseCounts,
    fireCount: exerciseCounts['fire-protection'], abandonCount: exerciseCounts['abandon-ship'], presenceDays,
    tbtCount: units.reduce((sum, entry) => sum + entry.tbtCount, 0) };
}
function snapshot(personMonths: ExercisePerformanceMonth[] = [], asOf = '2026-03-01'): ExercisePerformanceSnapshot {
  return { schemaVersion: 2, scope: 'fleet', year: 2026, asOf,
    vessels: [{ id: 1, name: 'GOURY' }, { id: 2, name: 'SUROIT' }], exerciseTypes: [...monthlyTypes, other].map((type) => ({ ...type })), personMonths, crewDays: [] };
}
function monthlyOnly(value: ExercisePerformanceSnapshot): ExercisePerformanceSnapshot {
  return { ...value, exerciseTypes: monthlyTypes.map((type) => ({ ...type })), personMonths: value.personMonths.map((entry) => ({ ...entry,
    counts: { 'fire-protection': entry.fireCount, 'abandon-ship': entry.abandonCount },
    units: entry.units.map((row) => ({ ...row, counts: { 'fire-protection': row.fireCount, 'abandon-ship': row.abandonCount } })),
  })) };
}
const build = (value: ExercisePerformanceSnapshot, scope = company, today = value.asOf) => buildExercisePerformance(value, scope, today);

describe('exercise obligations by actual crew presence', () => {
  it('scores 50% for eight sailors when only one of the two four-person watches completed both monthly exercises', () => {
    const data = snapshot(Array.from({ length: 8 }, (_, index) => month(index + 1, 1, [unit(1, index < 4 ? counts(1, 1) : counts())])), '2026-02-15');
    const result = build(data);
    expect(result.score).toBe(50);
    expect(result.criteria.map((criterion) => [criterion.id, criterion.score, criterion.weight])).toEqual([
      ['fire-protection', 50, 50], ['abandon-ship', 50, 50], ['anti-pollution', null, 0],
    ]);
    expect(result.summary).toContain('8/16 obligations closes couvertes');
    expect(result.tasks.filter((task) => task.state === 'overdue')).toHaveLength(8);
    expect(result.tasks.filter((task) => task.id.includes('anti-pollution')).every((task) => task.state === 'unplanned' && task.dueOn === '2026-02-28')).toBe(true);
  });

  it('uses fixed January–February / March–April pairs and caps repetitions within each obligation', () => {
    const data = snapshot([
      month(1, 1, [unit(1, counts(8, 1))]), month(1, 2, [unit(1, counts(1, 9, 7))]),
      month(1, 3, [unit(1, counts(1, 1))]), month(1, 4, [unit(1, counts(1, 1))]),
    ], '2026-05-01');
    const result = build(data);
    expect(result.score).toBe(90);
    expect(result.criteria.find((criterion) => criterion.id === 'anti-pollution')).toMatchObject({ score: 50, weight: 20, detail: expect.stringContaining('1/2 obligations closes couvertes') });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ id: 'exercise-anti-pollution-1-3', state: 'overdue', dueOn: '2026-04-30' });
  });

  it('creates an obligation from a single day in either month, without charging two months or zero-day entries', () => {
    const data = snapshot([month(1, 2, [unit(1, counts(), 1)]), month(2, 1, [], 0)], '2026-03-01');
    const result = build(data);
    expect(result.score).toBe(0);
    expect(result.criteria.map((criterion) => criterion.detail.split(' ; ')[0])).toEqual([
      '0/1 obligations closes couvertes', '0/1 obligations closes couvertes', '0/1 obligations closes couvertes',
    ]);
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks.every((task) => task.to.includes('person=1'))).toBe(true);
  });

  it('keeps the current period unscored through its deadline and excludes future months while retaining current-month forecasts', () => {
    const data = monthlyOnly(snapshot([
      month(1, 1, [unit(1, counts(1, 1))]), month(2, 11), month(3, 12),
    ], '2026-11-02'));
    data.crewDays = [{ vesselId: 1, on: '2026-11-20', count: 1 }, { vesselId: 1, on: '2026-12-01', count: 1 }];
    const result = build(data);
    expect(result.score).toBe(100);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((task) => task.state === 'unplanned' && task.dueOn === '2026-11-30' && task.to.includes('person=2'))).toBe(true);
    expect(result.exercisePresence?.days).toEqual([{ vesselId: 1, on: '2026-11-20', count: 1 }]);
    expect(result.exercisePresence?.months.some((row) => row.month === 12)).toBe(false);
    expect(build({ ...data, asOf: '2026-11-30' }).tasks.every((task) => task.state === 'unplanned')).toBe(true);
    expect(build({ ...data, asOf: '2026-12-01' }).tasks.filter((task) => task.to.includes('person=2')).every((task) => task.state === 'overdue')).toBe(true);
  });

  it('deduplicates a person globally across vessels but uses only selected-vessel participations for each unit', () => {
    const data = monthlyOnly(snapshot([month(1, 1, [unit(1, counts(1, 0), 1), unit(2, counts(0, 1), 1)], 1)]));
    expect(build(data)).toMatchObject({ score: 100, summary: expect.stringContaining('2/2 obligations closes couvertes'), tasks: [] });
    const goury = build(data, unitScope(1)); const suroit = build(data, unitScope(2));
    expect(goury.score).toBe(50); expect(suroit.score).toBe(50);
    expect(goury.tasks[0].to).toBe('/modules/emergencyExercises?year=2026&person=1&vessel=1');
    expect(suroit.tasks[0].to).toBe('/modules/emergencyExercises?year=2026&person=1&vessel=2');
    expect(goury.exercisePresence?.vessels).toEqual([{ id: 1, name: 'GOURY' }]);
    expect(goury.exercisePresence?.months[0]).toEqual({ vesselId: 1, month: 1, people: 1, presenceDays: 1 });
  });

  it('does not attach a misleading single-vessel filter to a missing obligation spanning several vessels', () => {
    const data = monthlyOnly(snapshot([month(1, 1, [unit(1), unit(2)])]));
    expect(build(data).tasks).toHaveLength(2);
    expect(build(data).tasks.every((task) => task.context === 'Personne 1 · GOURY / SUROIT' && task.to === '/modules/emergencyExercises?year=2026&person=1')).toBe(true);
  });

  it('restricts real self results to the linked person and never exposes other names, vessels or fleet daily aggregates', () => {
    const data = monthlyOnly(snapshot([month(1, 1, [unit(2, counts(1, 1), 1, 90)]), month(2, 1, [unit(1, counts(), 1, 2)])]));
    data.personMonths[0].personName = 'IDENTITÉ HORS PÉRIMÈTRE'; data.vessels[1].name = 'NAVIRE HORS PÉRIMÈTRE';
    data.crewDays = [{ vesselId: 1, on: '2026-01-01', count: 7 }, { vesselId: 2, on: '2026-01-01', count: 4 }];
    const self: ProcessPerformanceScope = { ...unitScope(1), kind: 'self', personId: 2, personIds: [2] };
    const result = build(data, self);
    expect(result.score).toBe(0); expect(result.exercisePresence?.bonusTbt).toBe(2);
    expect(result.tasks.every((task) => task.to.includes('person=2'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('HORS PÉRIMÈTRE');
    expect(result.exercisePresence?.days).toEqual([]);
    const own = { ...data, scope: 'self' as const, personMonths: [data.personMonths[1]], crewDays: [{ vesselId: 1, on: '2026-01-01', count: 1 }] };
    expect(build(own, self).exercisePresence?.days).toEqual(own.crewDays);
  });

  it('keeps TBT participations informative and never uses them to compensate missing compulsory exercises', () => {
    const result = build(monthlyOnly(snapshot([month(1, 1, [unit(1, counts(), 1, 30)])])));
    expect(result.score).toBe(0);
    expect(result.criteria.map((criterion) => criterion.score)).toEqual([0, 0]);
    expect(result.exercisePresence?.bonusTbt).toBe(30);
    expect(result.summary).toContain('30 participation(s) TBT en complément, sans points');
    expect(result.tasks).toHaveLength(2);
  });

  it('calculates the overall score from actual obligation counts, before rounding per-type scores or weights', () => {
    const data = snapshot([
      month(1, 1, [unit(1, counts(20, 1, 4))]), month(1, 2, [unit(1, counts(0, 1))]), month(1, 3),
    ], '2026-04-01');
    const result = build(data);
    expect(result.score).toBe(57);
    expect(result.summary).toContain('4/7 obligations closes couvertes');
    expect(result.criteria.map((criterion) => [criterion.score, criterion.weight])).toEqual([[33, 42.86], [67, 42.86], [100, 14.29]]);
    expect(result.criteria[0].detail).toContain('1/3 obligations closes couvertes ; 3/7 obligations closes du score total');
  });

  it('scores the entire selected past year and exposes known zero-presence months/days without inventing a perfect score', () => {
    const data = snapshot([month(1, 12)], '2027-02-01');
    data.crewDays = [{ vesselId: 2, on: '2026-02-01', count: 0 }];
    const result = build(data);
    expect(result.score).toBe(0); expect(result.tasks.every((task) => task.state === 'overdue' && task.dueOn === '2026-12-31')).toBe(true);
    expect(result.exercisePresence?.months).toHaveLength(24);
    expect(result.exercisePresence?.months.find((row) => row.vesselId === 2 && row.month === 2)).toEqual({ vesselId: 2, month: 2, people: 0, presenceDays: 0 });
    expect(result.exercisePresence?.days).toEqual(data.crewDays);
    const empty = build(snapshot([], '2026-01-15'));
    expect(empty.score).toBeNull(); expect(empty.tasks).toEqual([]);
    expect(empty.exercisePresence?.months).toEqual([{ vesselId: 1, month: 1, people: 0, presenceDays: 0 }, { vesselId: 2, month: 1, people: 0, presenceDays: 0 }]);
  });
});

describe('exercise RPC v2 validation', () => {
  const corrupt: Array<[string, (data: ExercisePerformanceSnapshot) => void]> = [
    ['legacy schema', (data) => { delete (data as Partial<ExercisePerformanceSnapshot>).schemaVersion; }],
    ['missing catalogue', (data) => { delete (data as Partial<ExercisePerformanceSnapshot>).exerciseTypes; }],
    ['missing crew days', (data) => { delete (data as Partial<ExercisePerformanceSnapshot>).crewDays; }],
    ['missing monthly counts', (data) => { delete (data.personMonths[0] as Partial<ExercisePerformanceMonth>).counts; }],
    ['missing unit presence', (data) => { delete (data.personMonths[0].units[0] as Partial<ExercisePerformanceUnit>).presenceDays; }],
    ['missing TBT count', (data) => { delete (data.personMonths[0] as Partial<ExercisePerformanceMonth>).tbtCount; }],
    ['negative count', (data) => { data.personMonths[0].counts['fire-protection'] = -1; }],
    ['fractional presence', (data) => { data.personMonths[0].presenceDays = 0.5; }],
    ['impossible month', (data) => { data.personMonths[0].month = 13; }],
    ['unknown unit', (data) => { data.personMonths[0].units[0].vesselId = 99; }],
    ['duplicate population', (data) => { data.personMonths.push(data.personMonths[0]); }],
    ['duplicate vessel', (data) => { data.vessels.push(data.vessels[0]); }],
    ['duplicate unit', (data) => { data.personMonths[0].units.push(data.personMonths[0].units[0]); }],
    ['wrong monthly cadence', (data) => { data.exerciseTypes[0].cadenceMonths = 2; }],
    ['wrong other cadence', (data) => { data.exerciseTypes[2].cadenceMonths = 1; }],
    ['TBT scored', (data) => { data.exerciseTypes.push({ key: 'tbt', label: 'TBT', cadenceMonths: 2 }); }],
    ['incomplete count categories', (data) => { delete data.personMonths[0].counts['anti-pollution']; }],
    ['inconsistent aggregate', (data) => { data.personMonths[0].counts['anti-pollution'] = 5; }],
    ['zero presence with exercises', (data) => { data.personMonths[0].units[0].presenceDays = 0; }],
    ['invalid as-of date', (data) => { data.asOf = '2026-02-30'; }],
    ['invalid day', (data) => { data.crewDays.push({ vesselId: 1, on: '2026-02-30', count: 1 }); }],
    ['unknown vessel day', (data) => { data.crewDays.push({ vesselId: 99, on: '2026-02-01', count: 1 }); }],
    ['duplicate day', (data) => { data.crewDays.push({ vesselId: 1, on: '2026-02-01', count: 1 }, { vesselId: 1, on: '2026-02-01', count: 1 }); }],
  ];
  it.each(corrupt)('rejects %s instead of falling back to a partial or v1 score', (_, mutate) => {
    const data = snapshot([month(1, 1, [unit(1, counts(1, 1))])]); mutate(data);
    expect(() => validateExerciseSnapshot(data, 2026)).toThrow('v2 invalides ou incomplètes');
  });
  it('rejects an unavailable or different-year response and accepts explicit zero daily crew', () => {
    expect(() => validateExerciseSnapshot(null, 2026)).toThrow();
    expect(() => validateExerciseSnapshot(snapshot(), 2025)).toThrow();
    const data = snapshot(); data.crewDays = [{ vesselId: 1, on: '2026-01-01', count: 0 }];
    expect(validateExerciseSnapshot(data, 2026)).toBe(data);
  });
});
