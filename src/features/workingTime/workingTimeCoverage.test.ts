import { describe, expect, it } from 'vitest';
import { workingTimeCoverageDayStatuses } from './workingTimeCoverage';
import type { WorkingTimeAssignmentCoverage } from './workingTimeQueries';

const coverage: WorkingTimeAssignmentCoverage = {
  assignmentId: 1, scopeStartsAt: '2026-10-12T22:00:00Z', scopeEndsAt: '2026-10-16T22:00:00Z',
  status: 'uncovered', windows: [],
  uncoveredRanges: [{ startsAt: '2026-10-13T22:00:00Z', endsAt: '2026-10-14T22:00:00Z' }],
};

describe('assignment coverage on daily and monthly views', () => {
  it('marks only the actual uncovered date and handles exclusive midnight bounds in the registry timezone', () => {
    expect(workingTimeCoverageDayStatuses([coverage], '2026-10-12', '2026-10-17', 'Europe/Paris')).toEqual({
      '2026-10-12': 'unknown', '2026-10-13': 'covered', '2026-10-14': 'uncovered',
      '2026-10-15': 'covered', '2026-10-16': 'covered', '2026-10-17': 'unknown',
    });
  });

  it('keeps future or incomplete scopes neutral even when one independent scope is covered', () => {
    expect(workingTimeCoverageDayStatuses([
      { ...coverage, status: 'covered', uncoveredRanges: [] },
      { ...coverage, assignmentId: 2, status: 'projected', uncoveredRanges: [] },
    ], '2026-10-13', '2026-10-13', 'Europe/Paris')['2026-10-13']).toBe('projected');
    expect(workingTimeCoverageDayStatuses([{ ...coverage, status: 'unknown', uncoveredRanges: [] }],
      '2026-10-13', '2026-10-13', 'Europe/Paris')['2026-10-13']).toBe('unknown');
  });
});
