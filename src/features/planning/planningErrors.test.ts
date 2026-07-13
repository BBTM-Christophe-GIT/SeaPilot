import { describe, expect, it, vi } from 'vitest';
import { PlanningDataError, throwPlanningDataError } from './planningErrors';

describe('planning Supabase errors', () => {
  it('maps permission and relation failures to understandable messages', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => throwPlanningDataError('update-event', 'Échec.', { code: '42501', message: 'row-level security' }))
      .toThrow("Vous n'avez pas l'autorisation");
    expect(() => throwPlanningDataError('create-assignment', 'Échec.', { code: '23503', message: 'foreign key' }))
      .toThrow("n'existe plus");
    consoleError.mockRestore();
  });

  it('retains a stable operation and Supabase code for technical diagnosis', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      throwPlanningDataError('load-vessels', 'Impossible de charger les navires.', { code: 'PGRST001', message: 'timeout' });
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningDataError);
      expect(error).toMatchObject({ operation: 'load-vessels', code: 'PGRST001' });
    }
    consoleError.mockRestore();
  });
});
