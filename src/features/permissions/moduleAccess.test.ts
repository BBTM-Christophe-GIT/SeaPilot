import { describe, expect, it } from 'vitest';
import { canAccessModule, getVisibleModules } from './moduleAccess';

describe('module access', () => {
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
    expect(getVisibleModules(['admin']).map((module) => module.key)).toContain('projects');
  });
});
