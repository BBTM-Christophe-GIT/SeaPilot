import { describe, expect, it } from 'vitest';
import {
  assertPlanningDateRange,
  assertSinglePlanningDay,
  optionalPlanningEntityId,
  planningEntityId,
  requiredPlanningText,
} from './planningValidation';

describe('planning validation', () => {
  it('accepts a valid single-day and multi-day event', () => {
    expect(() => assertPlanningDateRange('2026-07-01', '2026-07-14')).not.toThrow();
    expect(() => assertSinglePlanningDay('2026-07-01', '2026-07-01')).not.toThrow();
  });

  it('rejects an event whose end precedes its start', () => {
    expect(() => assertPlanningDateRange('2026-07-14', '2026-07-01')).toThrow(
      'La date de fin doit être postérieure ou égale à la date de début.',
    );
  });

  it('rejects invalid dates and an extended isolated day', () => {
    expect(() => assertPlanningDateRange('2026-02-30', '2026-03-01')).toThrow('format YYYY-MM-DD');
    expect(() => assertSinglePlanningDay('2026-07-01', '2026-07-02')).toThrow('Une journée isolée');
  });

  it('normalizes required values without accepting invalid relations', () => {
    expect(planningEntityId('12', 'Le marin')).toBe(12);
    expect(optionalPlanningEntityId('', 'Le capitaine')).toBeNull();
    expect(requiredPlanningText('  En Mer  ', 'Le statut')).toBe('En Mer');
    expect(() => planningEntityId('inconnu', 'Le navire')).toThrow('Le navire est obligatoire');
  });
});
