import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkingTimeInterval } from './workingTimeModel';
import { buildWorkingTimeMonthlyGraphRows, WorkingTimeMonthlyView } from './WorkingTimeMonthlyView';

function interval(overrides: Partial<WorkingTimeInterval> = {}): WorkingTimeInterval {
  return {
    id: 1, registerId: 100, companyId: 1, personId: 20, localWorkDate: '2026-10-13',
    startsAt: '2026-10-13T04:00:00Z', endsAt: '2026-10-13T10:00:00Z',
    timezoneName: 'Europe/Paris', utcOffsetMinutes: 120, vesselId: 7, watchGroup: 'Bordée 1',
    comment: null, authorUserId: null, authorPersonId: null, sourceType: 'manual',
    sourceReference: null, sourceRecordKey: null, ...overrides,
  };
}

describe('production monthly working-time graphs', () => {
  it('adds 31 hourly graphs while preserving every column, recorded totals and day navigation', async () => {
    const onSelectDay = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<WorkingTimeMonthlyView
      calculations={[]} intervals={[interval()]} nonCompliantDates={[]} onSelectDay={onSelectDay}
      periodStart="2026-10-01" periodEnd="2026-10-31" policies={[]}
      vessels={[{ id: 7, name: 'GOURY', acronym: 'GOU' }]}
      pendingPhases={[{ startsAt: '2026-10-13T11:00:00Z', endsAt: '2026-10-13T16:30:00Z' }]}
      pendingTimezoneName="Europe/Paris"
    />);

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(within(table).getAllByRole('row')).toHaveLength(32);
    expect(within(table).getAllByRole('img')).toHaveLength(31);
    expect(container.querySelectorAll('.working-time-month-graph-slots span')).toHaveLength(31 * 48);
    expect(container.querySelectorAll('.working-time-month-graph-axis span')).toHaveLength(25);
    expect(container.querySelector('.working-time-month-graph-axis span:last-child')).toHaveTextContent('24h');
    expect(screen.getByRole('img', { name: /mar 13 oct\. — enregistré : 06:00–12:00 ; à enregistrer : 13:00–18:30/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /mer 14 oct\. — enregistré : aucune période ; repos non attesté/ })).toBeInTheDocument();
    expect(screen.getByText('6 h 00 sur le mois')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'mar 13 oct.' }).closest('tr')!;
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('6 h 00');
    expect(row).toHaveTextContent('GOURY · Bordée 1');
    expect(row).toHaveTextContent('À calculer');
    await user.click(screen.getByRole('button', { name: 'mer 14 oct.' }));
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-14');
    expect(screen.getByRole('region', { name: /Tableau mensuel.*défilement horizontal/ })).toHaveAttribute('tabindex', '0');
  });

  it('clips midnight crossings in the saved record timezone and ignores invalid drafts', () => {
    const rows = buildWorkingTimeMonthlyGraphRows(['2026-10-13', '2026-10-14'], [
      { startsAt: '2026-10-13T20:00:00Z', endsAt: '2026-10-14T02:00:00Z', timezoneName: 'Europe/Paris', isPending: false },
      { startsAt: '2026-10-14T22:00:00Z', endsAt: '2026-10-15T00:00:00Z', timezoneName: 'Europe/Paris', isPending: false },
      { startsAt: 'invalid', endsAt: '2026-10-14T04:00:00Z', timezoneName: 'UTC', isPending: true },
    ]);
    expect(rows.get('2026-10-13')).toEqual([{ startMinute: 1320, endMinute: 1440, label: '22:00–24:00', isPending: false, clockFold: false }]);
    expect(rows.get('2026-10-14')).toEqual([{ startMinute: 0, endMinute: 240, label: '00:00–04:00', isPending: false, clockFold: false }]);
    expect(buildWorkingTimeMonthlyGraphRows(['2026-10-13'], [{
      startsAt: '2026-10-13T04:00:00Z', endsAt: '2026-10-13T10:00:00Z', timezoneName: 'UTC', isPending: false,
    }]).get('2026-10-13')?.[0].label).toBe('04:00–10:00');
  });

  it('retains real elapsed totals and honest local boundaries across a repeated hour', () => {
    const { container } = render(<WorkingTimeMonthlyView
      calculations={[]} intervals={[interval({ localWorkDate: '2026-10-25', startsAt: '2026-10-25T02:45:00+02:00', endsAt: '2026-10-25T02:15:00+01:00' })]}
      nonCompliantDates={[]} onSelectDay={vi.fn()} periodStart="2026-10-25" periodEnd="2026-10-25" policies={[]} vessels={[]}
    />);
    expect(screen.getByRole('img', { name: /02:45 → 02:15 · heure répétée/ })).toBeInTheDocument();
    expect(screen.getByText('0 h 30 sur le mois')).toBeInTheDocument();
    const band = container.querySelector<HTMLElement>('.working-time-month-graph-phase.is-clock-fold')!;
    expect(band.style.left).toBe('9.375%');
    expect(band.style.width).toBe(`${30 / 14.4}%`);
    expect(screen.getByText(/le total conserve la durée réelle/)).toBeInTheDocument();
  });

  it('shows a pending correction instead of a duplicate band without changing the saved register total', () => {
    const { container } = render(<WorkingTimeMonthlyView
      calculations={[]} intervals={[interval()]} nonCompliantDates={[]} onSelectDay={vi.fn()}
      periodStart="2026-10-13" periodEnd="2026-10-13" policies={[]} vessels={[]} editingIntervalId={1}
      pendingTimezoneName="Europe/Paris"
      pendingPhases={[{ startsAt: '2026-10-13T05:00:00Z', endsAt: '2026-10-13T10:00:00Z' }]}
    />);
    expect(container.querySelectorAll('.working-time-month-graph-phase')).toHaveLength(1);
    expect(container.querySelector('.working-time-month-graph-phase')).toHaveClass('is-pending');
    expect(screen.getByRole('img', { name: /enregistré : aucune période ; à enregistrer : 07:00–12:00/ })).toBeInTheDocument();
    expect(screen.getByText('6 h 00 sur le mois')).toBeInTheDocument();
  });

  it('replaces pending corrections on other days without hiding their recorded totals or metadata', () => {
    const { container } = render(<WorkingTimeMonthlyView
      calculations={[]} intervals={[interval(), interval({ id: 2, localWorkDate: '2026-10-14', startsAt: '2026-10-14T04:00:00Z', endsAt: '2026-10-14T10:00:00Z' })]}
      nonCompliantDates={[]} onSelectDay={vi.fn()} periodStart="2026-10-13" periodEnd="2026-10-14" policies={[]}
      vessels={[{ id: 7, name: 'GOURY', acronym: 'GOU' }]} editingIntervalIds={[1, 2]} pendingTimezoneName="Europe/Paris"
      pendingPhases={[
        { startsAt: '2026-10-13T05:00:00Z', endsAt: '2026-10-13T10:00:00Z' },
        { startsAt: '2026-10-14T06:00:00Z', endsAt: '2026-10-14T10:00:00Z' },
      ]}
    />);
    expect(container.querySelectorAll('.working-time-month-graph-phase')).toHaveLength(2);
    expect(container.querySelectorAll('.working-time-month-graph-phase.is-pending')).toHaveLength(2);
    expect(screen.getByRole('img', { name: /mar 13 oct.*enregistré : aucune période ; à enregistrer : 07:00–12:00/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /mer 14 oct.*enregistré : aucune période ; à enregistrer : 08:00–12:00/ })).toBeInTheDocument();
    expect(screen.getByText('12 h 00 sur le mois')).toBeInTheDocument();
    for (const day of ['mar 13 oct.', 'mer 14 oct.']) {
      const row = screen.getByRole('button', { name: day }).closest('tr')!;
      expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('6 h 00');
      expect(row).toHaveTextContent('GOURY · Bordée 1');
    }
  });
});
