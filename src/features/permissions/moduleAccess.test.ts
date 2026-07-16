import { describe, expect, it } from 'vitest';
import { NAVIGATION_MODULES, canAccessModule, getVisibleModules } from './moduleAccess';

describe('module access', () => {
  it.each([
    ['admin', true],
    ['direction', true],
    ['armement', false],
    ['capitaine', false],
    ['marin', false],
  ] as const)('applies the validated Projects role matrix to %s', (role, expected) => {
    expect(canAccessModule([role], 'projects')).toBe(expected);
  });

  it('hides projects from marins', () => {
    expect(canAccessModule(['marin'], 'projects')).toBe(false);
  });

  it('allows marins to read operational modules', () => {
    expect(canAccessModule(['marin'], 'planning')).toBe(true);
    expect(canAccessModule(['marin'], 'dpr')).toBe(true);
  });

  it('treats roles as cumulative', () => {
    expect(canAccessModule(['marin', 'direction'], 'projects')).toBe(true);
  });

  it('shows every module to admin', () => {
    expect(getVisibleModules(['admin'])).toHaveLength(NAVIGATION_MODULES.length);
    expect(getVisibleModules(['admin']).map((module) => module.key)).toContain('projects');
  });

  it('matches the spreadsheet navigation hierarchy', () => {
    const navigation = NAVIGATION_MODULES.map((module) => [module.family, module.label, module.navigationKind]);

    expect(navigation).toEqual([
      ['Accueil', 'Accueil', 'direct'],
      ['QHSE', 'KPI', 'submenu'],
      ['QHSE', 'Certificats flotte', 'submenu'],
      ['QHSE', 'Procédures QHSE', 'submenu'],
      ['QHSE', "Plan d'Action", 'submenu'],
      ['Opérations', 'Daily Progress Report', 'submenu'],
      ['Opérations', 'Projets', 'submenu'],
      ['Achats', "Demande d'Achat", 'submenu'],
      ['Planning', 'Planning', 'direct'],
      ['Ressources Humaines', 'RH / Brevets', 'submenu'],
      ['Ressources Humaines', 'Suivi du Temps de travail', 'submenu'],
      ['Maintenance', 'Marad', 'submenu'],
      ['Maintenance', 'Documents Techniques', 'submenu'],
      ['Levage', 'Levage', 'direct'],
      ['Administration', 'Administration', 'direct'],
    ]);
  });
});
