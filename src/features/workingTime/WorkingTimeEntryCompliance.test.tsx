import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkingTimeEntryCompliance } from './WorkingTimeEntryCompliance';
import type { WorkingTimeAssignmentCoverage, WorkingTimePolicyThresholds } from './workingTimeQueries';

const policy: WorkingTimePolicyThresholds = {
  id: 1, name: 'Politique de la compagnie', maxWork24h: 12, minRest24h: 10,
  minConsecutiveRestHours: 6, maxWork7d: 84, minRest7d: 77, maxRestPeriods24h: 2,
  maxNightWork24h: 8, maxAmplitudeHours: 14, maxIntervalBetweenRestsHours: 14,
};
const coverage: WorkingTimeAssignmentCoverage = {
  assignmentId: 1, scopeStartsAt: '2026-10-13T04:00:00Z', scopeEndsAt: '2026-10-14T22:00:00Z', status: 'covered',
  windows: [
    { startsAt: '2026-10-12T22:00:00Z', endsAt: '2026-10-13T22:00:00Z' },
    { startsAt: '2026-10-13T22:00:00Z', endsAt: '2026-10-14T22:00:00Z' },
  ], uncoveredRanges: [],
};

describe('whole-assignment compatibility panel', () => {
  it('shows the continuous chain rather than asserting compatibility from independent work periods', () => {
    const { container } = render(<WorkingTimeEntryCompliance policy={policy} coverages={[coverage]} canManagePolicy={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Affectation couverte sans interruption');
    expect(screen.getByText('2 fenêtres de 24 h compatibles')).toBeInTheDocument();
    expect(screen.getByText('Travail de nuit sur 24 h')).toBeInTheDocument();
    expect(screen.getByText('Repos total sur 24 h')).toBeInTheDocument();
    expect(container.querySelector('.working-time-live-rule.is-deviation')).toBeNull();
    expect(screen.queryByText(/écart provoqué/i)).not.toBeInTheDocument();
  });

  it.each(['projected', 'unknown'] as const)('keeps %s coverage neutral', (status) => {
    render(<WorkingTimeEntryCompliance policy={policy} coverages={[{ ...coverage, status }]} canManagePolicy={false} />);
    expect(screen.getByRole('status')).toHaveClass('is-unknown');
    expect(screen.getByRole('status')).toHaveTextContent('Couverture à confirmer');
  });

  it('alerts only on an actual uncovered gap and clears the verdict while a new analysis is pending', () => {
    const { rerender } = render(<WorkingTimeEntryCompliance policy={policy} coverages={[{ ...coverage,
      status: 'uncovered', uncoveredRanges: [{ startsAt: '2026-10-13T20:00:00Z', endsAt: '2026-10-13T22:00:00Z' }],
    }]} canManagePolicy={false} />);
    expect(screen.getByRole('status')).toHaveClass('is-deviation');
    expect(screen.getByText('Intervalle sans couverture compatible :')).toBeInTheDocument();
    rerender(<WorkingTimeEntryCompliance policy={policy} loading canManagePolicy={false} />);
    expect(screen.getByRole('status')).toHaveClass('is-unknown');
    expect(screen.queryByText('Intervalle sans couverture compatible :')).not.toBeInTheDocument();
  });

  it('does not invent amplitude and interval limits when the policy omits them', () => {
    render(<WorkingTimeEntryCompliance policy={{ ...policy, maxAmplitudeHours: null, maxIntervalBetweenRestsHours: undefined }} canManagePolicy={false} />);
    expect(screen.getAllByText('Non paramétré')).toHaveLength(2);
  });
});
