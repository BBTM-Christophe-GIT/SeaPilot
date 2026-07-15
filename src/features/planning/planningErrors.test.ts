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

  it('explains rotation overlaps and blocking assignment controls', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => throwPlanningDataError('save-rotation', 'Échec.', {
      code: '23P01',
      message: 'PLANNING_ROTATION_OVERLAP: marin deja affecte du 2026-07-14 au 2026-07-28.',
    })).toThrow('possède déjà une affectation');
    expect(() => throwPlanningDataError('save-rotation', 'Échec.', {
      code: 'P0001',
      message: 'PLANNING_CONTROL_BLOCKED: crew_absence',
    })).toThrow('absence validée');
    expect(() => throwPlanningDataError('save-rotation', 'Échec.', {
      code: 'P0001',
      message: 'PLANNING_CONTROL_BLOCKED: expired_medical',
    })).toThrow('visite médicale');
    consoleError.mockRestore();
  });

  it('explains invalid rotation inputs and interrupted network requests', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => throwPlanningDataError('save-rotation', 'Échec.', {
      code: '22023',
      message: 'PLANNING_ROTATION_PATTERN_MISMATCH',
    })).toThrow('rythme ou les dates');
    expect(() => throwPlanningDataError('save-rotation', 'Échec.', {
      message: 'Failed to fetch',
    })).toThrow('connexion au service Planning');
    consoleError.mockRestore();
  });
});
