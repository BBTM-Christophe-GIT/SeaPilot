import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { formatPlanningDate } from './planningDates';
import type { PlanningTimelineDay } from './planningModel';
import './planningColumnHighlights.css';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Local state only: no persistence, and no rerender of the operational rows on selection.
export function PlanningColumnHighlights({ days, today, label, children }: {
  days: PlanningTimelineDay[];
  today: string;
  label: string;
  children: ReactNode;
}) {
  const [selectedDates, setSelectedDates] = useState<ReadonlySet<string>>(() => new Set());
  const drag = useRef<{ start: number; selected: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const finish = () => { drag.current = null; };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
  }, []);

  function toggle(date: string) {
    setSelectedDates((previous) => {
      const next = new Set(previous);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const bands = days.flatMap((day, index) => selectedDates.has(day.date) ? [
    `linear-gradient(to right, transparent calc(${index} * var(--planning-day-width)), rgb(65 145 240 / 18%) calc(${index} * var(--planning-day-width)), rgb(65 145 240 / 18%) calc(${index + 1} * var(--planning-day-width)), transparent calc(${index + 1} * var(--planning-day-width)))`,
  ] : []);

  return <div className="planning-column-highlights" style={{ '--planning-column-highlight': bands.join(', ') || 'none' } as CSSProperties}>
    <div className="planning-calendar-grid planning-calendar-days">
      <div className="planning-calendar-corner planning-calendar-label-heading">{label}</div>
      {days.map((day, index) => <button
        aria-label={`Surligner la colonne du ${formatPlanningDate(day.date)}`}
        aria-pressed={selectedDates.has(day.date)}
        className={`planning-day-heading${day.isWeekend ? ' is-weekend' : ''}${day.date === today ? ' is-today' : ''}${selectedDates.has(day.date) ? ' is-highlighted' : ''}`}
        key={day.date}
        onClick={(event) => {
          if (event.detail === 0 || !suppressClick.current) toggle(day.date);
          suppressClick.current = false;
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          suppressClick.current = false;
          drag.current = { start: index, selected: !selectedDates.has(day.date) };
        }}
        onPointerEnter={(event) => {
          const gesture = drag.current;
          if (!gesture || event.buttons !== 1 || index === gesture.start) return;
          suppressClick.current = true;
          setSelectedDates((previous) => {
            const next = new Set(previous);
            for (let cursor = Math.min(gesture.start, index); cursor <= Math.max(gesture.start, index); cursor += 1) {
              if (gesture.selected) next.add(days[cursor].date);
              else next.delete(days[cursor].date);
            }
            return next;
          });
        }}
        title="Cliquer pour surligner ou retirer la surbrillance. Glisser pour sélectionner plusieurs jours."
        type="button"
      ><span>{WEEKDAY_LABELS[day.weekday]}</span><strong>{day.day}</strong></button>)}
    </div>
    <div className="planning-calendar-body">{children}</div>
  </div>;
}
