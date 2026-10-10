import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BillingPeriodCalendar from './BillingPeriodCalendar';

afterEach(cleanup);

function CalendarHarness({ onChange }: { onChange: (start: string, end: string) => void }) {
  const [range, setRange] = useState(['2026-10-01', '2026-10-31']);
  return <BillingPeriodCalendar month="2026-10" startDate={range[0]} endDate={range[1]}
    onRangeChange={(start, end) => { onChange(start, end); setRange([start, end]); }} />;
}

describe('three-month billing calendar', () => {
  it('shows the previous, current and following month with the controlled current-month range selected', async () => {
    const onChange = vi.fn();
    render(<CalendarHarness onChange={onChange} />);
    const calendar = screen.getByRole('region', { name: 'Calendrier de facturation' });
    expect(within(calendar).getByRole('heading', { name: 'septembre 2026' })).toBeInTheDocument();
    expect(within(calendar).getByRole('heading', { name: 'octobre 2026' })).toBeInTheDocument();
    expect(within(calendar).getByRole('heading', { name: 'novembre 2026' })).toBeInTheDocument();
    expect(within(calendar).getAllByRole('button', { pressed: true })).toHaveLength(31);
    expect(within(calendar).getByRole('button', { name: 'jeudi 1 octobre 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(calendar).getByRole('button', { name: 'samedi 31 octobre 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects an inclusive range across months in either click order, then restarts on the next day click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarHarness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'lundi 2 novembre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-02', '2026-11-02');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'mercredi 30 septembre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-09-30', '2026-11-02');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(34);
    expect(screen.getByText('Du 30 septembre 2026 au 2 novembre 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'jeudi 15 octobre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15', '2026-10-15');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('renders leap-day and adjacent-year dates without changing them through UTC conversion', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<BillingPeriodCalendar month="2024-02" startDate="2024-02-01"
      endDate="2024-02-29" onRangeChange={onChange} />);
    expect(screen.getByRole('button', { name: 'jeudi 29 février 2024' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(29);
    rerender(<BillingPeriodCalendar month="2026-12" startDate="2026-12-01"
      endDate="2026-12-31" onRangeChange={onChange} />);
    expect(screen.getByRole('heading', { name: 'janvier 2027' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'vendredi 1 janvier 2027' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01-01', '2027-01-01');
  });

  it('uses one Tab stop and arrow navigation for keyboard selection without opening a dialog', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CalendarHarness onChange={onChange} />);
    await user.tab();
    const first = screen.getByRole('button', { name: 'jeudi 1 octobre 2026' });
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const second = screen.getByRole('button', { name: 'vendredi 2 octobre 2026' });
    expect(second).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-02', '2026-10-02');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'vendredi 9 octobre 2026' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('2026-10-02', '2026-10-09');
    expect(screen.getByRole('button', { name: 'vendredi 9 octobre 2026' })).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the calendar visible while disabling editing, then supports re-enabling it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<BillingPeriodCalendar month="2026-10" startDate="2026-10-01" endDate="2026-10-31"
      disabled onRangeChange={onChange} />);
    expect(screen.getByRole('region', { name: 'Calendrier de facturation' })).toBeInTheDocument();
    const day = screen.getByRole('button', { name: 'lundi 5 octobre 2026' });
    expect(day).toBeDisabled();
    await user.click(day);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<BillingPeriodCalendar month="2026-10" startDate="2026-10-01" endDate="2026-10-31"
      onRangeChange={onChange} />);
    await user.click(day);
    expect(onChange).toHaveBeenCalledWith('2026-10-05', '2026-10-05');
  });

  it('starts a new selection after the month or date fields change externally', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<BillingPeriodCalendar month="2026-10" startDate="2026-10-01"
      endDate="2026-10-31" onRangeChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'lundi 5 octobre 2026' }));
    rerender(<BillingPeriodCalendar month="2026-10" startDate="2026-10-05"
      endDate="2026-10-05" onRangeChange={onChange} />);
    rerender(<BillingPeriodCalendar month="2026-11" startDate="2026-11-01"
      endDate="2026-11-30" onRangeChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'mercredi 4 novembre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-04', '2026-11-04');
    rerender(<BillingPeriodCalendar month="2026-11" startDate="2026-11-04"
      endDate="2026-11-04" onRangeChange={onChange} />);
    rerender(<BillingPeriodCalendar month="2026-11" startDate="2026-11-01"
      endDate="2026-11-10" onRangeChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'jeudi 5 novembre 2026' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11-05', '2026-11-05');
  });
});
