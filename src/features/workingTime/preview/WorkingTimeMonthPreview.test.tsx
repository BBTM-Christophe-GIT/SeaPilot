import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildWorkingTimeMonthRows, WorkingTimeMonthPreview } from './WorkingTimeMonthPreview';

describe('monthly factual working-time register', () => {
  it('splits a period crossing midnight into both days and merges overlapping hours', () => {
    const rows = buildWorkingTimeMonthRows(['2026-10-13', '2026-10-14'], [
      { startsAt: '2026-10-13T22:00', endsAt: '2026-10-14T02:00' },
      { startsAt: '2026-10-14T01:00', endsAt: '2026-10-14T04:00' },
    ], [
      { startsAt: '2026-10-14T03:00', endsAt: '2026-10-14T05:00' },
      { startsAt: '2026-10-14T04:30', endsAt: '2026-10-14T05:30' },
    ]);

    expect(rows[0].recorded.map((range) => range.label)).toEqual(['22:00–24:00']);
    expect(rows[0].workHours).toBe(2);
    expect(rows[1].recorded.map((range) => range.label)).toEqual(['00:00–04:00']);
    expect(rows[1].pending.map((range) => range.label)).toEqual(['03:00–05:30']);
    expect(rows[1].recordedHours).toBe(4);
    expect(rows[1].pendingHours).toBe(2.5);
    expect(rows[1].workHours).toBe(5.5);
  });

  it('clips cross-month work without inventing work for empty days or invalid drafts', () => {
    const rows = buildWorkingTimeMonthRows(['2026-10-01', '2026-10-02'], [
      { startsAt: '2026-09-30T22:00', endsAt: '2026-10-01T03:00' },
    ], [
      { startsAt: 'invalid', endsAt: '2026-10-02T03:00' },
      { startsAt: '2026-10-02T06:00', endsAt: '2026-10-02T05:00' },
    ]);

    expect(rows[0].recorded.map((range) => range.label)).toEqual(['00:00–03:00']);
    expect(rows[0].workHours).toBe(3);
    expect(rows[1]).toMatchObject({ recorded: [], pending: [], workHours: 0 });
  });

  it('renders hourly graduations, 48 slots per day, source distinction and day navigation', async () => {
    const user = userEvent.setup();
    const onChooseDay = vi.fn();
    const { container } = render(<WorkingTimeMonthPreview
      days={['2026-10-13', '2026-10-14']}
      recorded={[{ startsAt: '2026-10-13T06:00', endsAt: '2026-10-13T12:00' }]}
      pending={[{ startsAt: '2026-10-13T13:00', endsAt: '2026-10-13T18:30' }]}
      selectedDay="2026-10-13" onChooseDay={onChooseDay}
    />);

    const table = screen.getByRole('table', { name: /Détail des heures du registre/ });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(container.querySelectorAll('.wtp-month-slot')).toHaveLength(96);
    expect(container.querySelectorAll('.wtp-month-hour-axis span')).toHaveLength(25);
    expect(container.querySelector('.wtp-month-hour-axis span:last-child')).toHaveTextContent('24h');
    expect(screen.getByRole('img', { name: /mar. 13 oct. — enregistré : 06:00–12:00 ; à enregistrer : 13:00–18:30 ; total : 11 h 30/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /mer. 14 oct.*aucune période saisie, repos non attesté/ })).toBeInTheDocument();
    expect(screen.getByText('dont 5 h 30 à enregistrer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ouvrir le mer. 14 oct./ }));
    expect(onChooseDay).toHaveBeenLastCalledWith('2026-10-14');
    await user.click(screen.getByRole('button', { name: /Saisir le mar. 13 oct./ }));
    expect(onChooseDay).toHaveBeenLastCalledWith('2026-10-13');
  });

  it('keeps both actual local boundaries visible when the clock goes back, without inventing a later end', () => {
    const recorded = [{ startsAt: '2026-10-25T02:45:00+02:00', endsAt: '2026-10-25T02:15:00+01:00' }];
    const pending = [{ startsAt: '2026-10-25T02:30:00+02:00', endsAt: '2026-10-25T02:30:00+01:00' }];
    const rows = buildWorkingTimeMonthRows(['2026-10-25', '2026-10-26'], recorded, pending, 'Europe/Paris');
    expect(rows[0].recorded[0]).toMatchObject({ startMinute: 165, endMinute: 135, clockFold: true, label: '02:45 → 02:15 · heure répétée' });
    expect(rows[0].recordedHours).toBe(0.5);
    expect(rows[0].pending[0]).toMatchObject({ startMinute: 150, endMinute: 150, clockFold: true, label: '02:30 → 02:30 · heure répétée' });
    expect(rows[0].pendingHours).toBe(1);
    expect(rows[0].workHours).toBe(1);

    const { container } = render(<WorkingTimeMonthPreview days={['2026-10-25', '2026-10-26']} recorded={recorded} pending={pending} selectedDay="2026-10-25" onChooseDay={vi.fn()} timezoneName="Europe/Paris" />);
    const foldBands = container.querySelectorAll<HTMLElement>('.wtp-month-phase.is-clock-fold');
    expect(foldBands).toHaveLength(2);
    expect(foldBands[0].style.left).toBe('9.375%');
    expect(foldBands[0].style.width).toBe(`${30 / 14.4}%`);
    expect(foldBands[1].style.width).toBe('0%');
    expect(foldBands[0].title).toBe('Enregistré : 02:45 → 02:15 · heure répétée');
    expect(screen.getByRole('img', { name: /dim. 25 oct.*02:45 → 02:15 · heure répétée.*02:30 → 02:30 · heure répétée.*total : 1 h 00/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.wtp-month-clock-note')).toHaveLength(1);
    expect(screen.getByText(/Horaires locaux ·.*02:45 → 02:15.*0 h 30.*02:30 → 02:30.*1 h 00/)).toBeInTheDocument();
    expect(screen.queryByText(/03:15|03:30/)).not.toBeInTheDocument();
    expect(buildWorkingTimeMonthRows(['2026-10-25'], recorded, pending, 'UTC')[0].recorded[0]).toMatchObject({
      startMinute: 45, endMinute: 75, clockFold: false, label: '00:45–01:15',
    });
  });

  it.each([
    ['2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 23],
    ['2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 25],
  ])('clips civil-day boundaries in the explicit zone on the %s clock change', (day, startsAt, endsAt, hours) => {
    const [row] = buildWorkingTimeMonthRows([day], [{ startsAt, endsAt }], [], 'Europe/Paris');
    expect(row.workHours).toBe(hours);
    expect(row.recorded[0]).toMatchObject({ startMinute: 0, endMinute: 1440 });
    expect(row.recorded[0].startsAt).toBe(Date.parse(startsAt));
    expect(row.recorded[0].endsAt).toBe(Date.parse(endsAt));
  });
});
