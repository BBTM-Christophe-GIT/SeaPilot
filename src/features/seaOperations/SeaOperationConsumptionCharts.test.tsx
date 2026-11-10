import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeaOperationConsumptionSpeedProfile } from './SeaOperationConsumptionCharts';
import type { SeaOperationConsumptionTrace } from './seaOperationConsumptionTrace';

const trace: SeaOperationConsumptionTrace = {
  startedAt: '2026-11-09T04:42:00.000Z',
  endedAt: '2026-11-09T20:00:00.000Z',
  durationMinutes: 918,
  distanceNm: 67.98,
  averageSpeedKnots: 4.4431,
  pointCount: 12,
  segmentCount: 3,
  gapCount: 2,
  reorderedPointCount: 0,
  excludedPointCount: 0,
  profile: [
    { elapsedMinutes: 0.5, speedKnots: 3.2 },
    { elapsedMinutes: 1.5, speedKnots: 8.4 },
    { elapsedMinutes: 30, speedKnots: null },
    { elapsedMinutes: 60.5, speedKnots: 12.5 },
    { elapsedMinutes: 61.5, speedKnots: 12.7 },
    { elapsedMinutes: 900, speedKnots: null },
    { elapsedMinutes: 917.5, speedKnots: 5.5 },
  ],
};

describe('SeaOperationConsumptionSpeedProfile', () => {
  it('labels the real Paris start, each hour and exact end and keeps gaps between measured runs', () => {
    render(<SeaOperationConsumptionSpeedProfile trace={trace} />);
    const chart = screen.getByRole('img', { name: /Profil de vitesse GPS, maximum 12,7/ });
    const axis = within(chart);
    expect(axis.getByText('05:42')).toHaveTextContent('(0 min)');
    expect(axis.getByText('06:42')).toHaveTextContent('(60 min)');
    expect(axis.getByText('20:42')).toHaveTextContent('(900 min)');
    expect(axis.getByText('21:00')).toHaveTextContent('(918 min)');
    expect(axis.getByText('13')).toBeInTheDocument();
    expect(axis.getByText('Vitesse (nd)')).toBeInTheDocument();
    expect(chart.querySelector('.so-consumption-chart-line')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
    expect(chart.querySelector('path[fill^="url("]')?.getAttribute('d')?.match(/Z/g)).toHaveLength(2);
    expect(chart.querySelectorAll('.so-consumption-chart-point')).toHaveLength(1);
  });

  it('allows inspection of recorded measurements with the keyboard and indicates interruptions', () => {
    render(<SeaOperationConsumptionSpeedProfile trace={trace} />);
    const explorer = screen.getByRole('slider', { name: 'Mesures du profil GPS' });
    fireEvent.focus(explorer);
    expect(screen.getByRole('tooltip')).toHaveTextContent('09/11/2026 05:42:30');
    expect(explorer).toHaveAttribute('aria-valuetext', expect.stringContaining('3,2 nd'));
    fireEvent.keyDown(explorer, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('1,5 min');
    expect(screen.getByRole('tooltip')).toHaveTextContent('8,4 nd');
    fireEvent.keyDown(explorer, { key: 'ArrowRight' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Interruption de trace GPS');
    fireEvent.keyDown(explorer, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
