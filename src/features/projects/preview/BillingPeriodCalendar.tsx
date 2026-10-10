import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './BillingPeriodCalendar.css';

export interface BillingPeriodCalendarProps {
  month: string;
  startDate: string;
  endDate: string;
  disabled?: boolean;
  onRangeChange: (startDate: string, endDate: string) => void;
}

const weekdays = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const shortDateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric',
});

function adjacentMonths(month: string) {
  const anchor = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(anchor.getTime())) return [];
  return [-1, 0, 1].map((offset) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1, 12);
    const year = first.getFullYear();
    const monthIndex = first.getMonth();
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const days = new Date(year, monthIndex + 1, 0, 12).getDate();
    return {
      key: prefix,
      current: offset === 0,
      label: first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      blanks: (first.getDay() + 6) % 7,
      dates: Array.from({ length: days }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`),
    };
  });
}

export default function BillingPeriodCalendar({
  month, startDate, endDate, disabled = false, onRangeChange,
}: BillingPeriodCalendarProps) {
  const [rangeStart, setRangeStart] = useState<{ month: string; date: string } | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const months = useMemo(() => adjacentMonths(month), [month]);
  const dates = months.flatMap((calendarMonth) => calendarMonth.dates);
  const focusDate = focusedDate && dates.includes(focusedDate)
    ? focusedDate : dates.includes(startDate) ? startDate : dates[0];
  const pendingRangeStart = rangeStart?.month === month
    && startDate === rangeStart.date && endDate === rangeStart.date ? rangeStart.date : null;

  function chooseDay(value: string) {
    if (!pendingRangeStart) {
      setRangeStart({ month, date: value });
      onRangeChange(value, value);
      return;
    }
    const [start, end] = [pendingRangeStart, value].sort();
    onRangeChange(start, end);
    setRangeStart(null);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = dates[Math.max(0, Math.min(dates.length - 1, dates.indexOf(value) + delta))];
    if (next) dayRefs.current.get(next)?.focus();
  }

  return <section className="pp-billing-calendar pp-period-calendar" aria-label="Calendrier de facturation">
        <div className="pp-period-calendar-months">
          {months.map((calendarMonth) => <section className="pp-period-calendar-month" key={calendarMonth.key}
            aria-labelledby={`${id}-${calendarMonth.key}`}>
            <h3 id={`${id}-${calendarMonth.key}`} className={calendarMonth.current ? 'is-current' : undefined}>
              {calendarMonth.label}
            </h3>
            <div className="pp-period-calendar-week" aria-hidden="true">
              {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="pp-period-calendar-days" role="group" aria-label={`Jours de ${calendarMonth.label}`}>
              {Array.from({ length: calendarMonth.blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
              {calendarMonth.dates.map((value) => {
                const selected = value >= startDate && value <= endDate;
                const boundary = selected && (value === startDate || value === endDate);
                return <button type="button" key={value} aria-label={dateLabel(value)} aria-pressed={selected}
                  className={`pp-period-calendar-day${selected ? ' is-selected' : ''}${boundary ? ' is-boundary' : ''}`}
                  ref={(node) => { if (node) dayRefs.current.set(value, node); else dayRefs.current.delete(value); }}
                  tabIndex={value === focusDate ? 0 : -1} disabled={disabled}
                  onFocus={() => setFocusedDate(value)} onKeyDown={(event) => moveFocus(event, value)}
                  onClick={() => chooseDay(value)}>{Number(value.slice(-2))}</button>;
              })}
            </div>
          </section>)}
        </div>
        <div className="pp-period-calendar-selection" aria-live="polite" aria-atomic="true">
          <strong>Du {shortDateLabel(startDate)} au {shortDateLabel(endDate)}</strong>
          <span>{pendingRangeStart ? 'Cliquez sur le dernier jour.' : 'Cliquez sur un début, puis une fin.'}</span>
        </div>
  </section>;
}
