import { describe, expect, it } from 'vitest';
import { buildPlanningTimeline, type PlanningCrewEvent } from './planningModel';
import type { PlanningHrDocumentRecord } from './planningQueries';
import { planningCrewContextsByDate, planningTimelineDocumentsByPerson } from './planningTimelineData';

const days = buildPlanningTimeline('2026-10-19', 'week');
function event(id: string, startsOn: string, endsOn: string, overrides: Partial<PlanningCrewEvent> = {}): PlanningCrewEvent {
  return { id, kind: 'assignment', personId: 1, person: 'Marin', vesselId: 1, vessel: 'GOURY', board: 'Bordée 1',
    functionLabel: 'Capitaine', status: 'En Mer', confirmationStatus: 'confirmed', startsOn, endsOn,
    startsAt: '', endsAt: '', responsible: '', rhythm: '', comments: '', sourceLabel: '', ...overrides };
}

describe('timeline lane indexes', () => {
  it('uses the preceding ship for empty days and the next ship before the first assignment', () => {
    const past = event('past', '2026-10-20', '2026-10-21');
    const future = event('future', '2026-10-24', '2026-10-25', { vesselId: 2, vessel: 'LANDEMER' });
    const contexts = planningCrewContextsByDate([future, past], days);
    expect(contexts.get('2026-10-19')).toBe(past);
    expect(contexts.get('2026-10-22')).toBe(past);
    expect(contexts.get('2026-10-23')).toBe(past);
  });

  it('preserves stable tie order and ignores HR reviews or events without a ship', () => {
    const first = event('first', '2026-10-15', '2026-10-18');
    const sameEnd = event('same-end', '2026-10-16', '2026-10-18');
    const review = event('review', '2026-10-19', '2026-10-20', { kind: 'annualReview' });
    const noShip = event('no-ship', '2026-10-19', '2026-10-21', { vesselId: null });
    const contexts = planningCrewContextsByDate([first, sameEnd, review, noShip], days);
    expect([...contexts.values()]).toEqual(days.map(() => first));
    const nextFirst = event('next-first', '2026-10-24', '2026-10-25');
    const nextSecond = event('next-second', '2026-10-24', '2026-10-26');
    expect(planningCrewContextsByDate([nextFirst, nextSecond], days).get('2026-10-19')).toBe(nextFirst);
  });

  it('advances to the most recently ended assignment without reordering the original events', () => {
    const earlier = event('earlier', '2026-10-17', '2026-10-19');
    const later = event('later', '2026-10-18', '2026-10-21');
    const input = [later, earlier];
    const contexts = planningCrewContextsByDate(input, days);
    expect(contexts.get('2026-10-20')).toBe(earlier);
    expect(contexts.get('2026-10-22')).toBe(later);
    expect(input).toEqual([later, earlier]);
  });

  it('indexes document snapshots by real person and does not reuse a previous account snapshot', () => {
    const document = (id: number, personId: number | null) => ({ id, personId } as PlanningHrDocumentRecord);
    const first = document(1, 4), second = document(2, 5), third = document(3, 4);
    const snapshot = [first, second, document(4, null), third];
    const indexed = planningTimelineDocumentsByPerson(snapshot);
    expect(indexed.get(4)).toEqual([first, third]);
    expect(indexed.get(5)).toEqual([second]);
    expect(indexed.size).toBe(2);
    expect(planningTimelineDocumentsByPerson(snapshot)).toBe(indexed);
    expect(planningTimelineDocumentsByPerson([second]).has(4)).toBe(false);
  });
});
