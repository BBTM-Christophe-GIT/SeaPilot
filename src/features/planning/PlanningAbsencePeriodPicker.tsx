import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { addPlanningDays, isPlanningDate, isPlanningLocalDateTime, parsePlanningDate, shiftPlanningMonths, shiftPlanningYears, startOfPlanningWeek, todayPlanningDate } from './planningDates';
import { buildPlanningAbsencePeriod, planningAbsenceCalendarWeeks, planningAbsencePeriodLabel, readPlanningAbsencePeriod, type PlanningAbsencePeriodSelection } from './planningAbsencePeriodPickerModel';
import './planningAbsencePeriodPicker.css';

export interface PlanningAbsencePeriodPickerProps {
  startsAt: string;
  endsAt: string;
  disabled: boolean;
  onChange: (startsAt: string, endsAt: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, index, 1))));
const weekdays = [['Lu', 'Lundi'], ['Ma', 'Mardi'], ['Me', 'Mercredi'], ['Je', 'Jeudi'], ['Ve', 'Vendredi'], ['Sa', 'Samedi'], ['Di', 'Dimanche']];

function monthOf(date: string) { return `${date.slice(0, 7)}-01`; }

export function PlanningAbsencePeriodPicker({ startsAt, endsAt, disabled, onChange, onOpenChange }: PlanningAbsencePeriodPickerProps) {
  const panelId = useId();
  const titleId = useId();
  const helpId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const openRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  const sourceRef = useRef({ startsAt, endsAt });
  const pendingFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<PlanningAbsencePeriodSelection>(() => readPlanningAbsencePeriod(startsAt, endsAt));
  const [viewMonth, setViewMonth] = useState(() => monthOf(selection.startsOn));
  const [focusDate, setFocusDate] = useState(selection.startsOn);
  const calendarPosition = useRef({ focusDate, viewMonth });
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [twoMonths, setTwoMonths] = useState(() => typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 640px)').matches);
  const [error, setError] = useState('');
  const current = readPlanningAbsencePeriod(startsAt, endsAt);
  const hasPeriod = isPlanningLocalDateTime(startsAt) && isPlanningLocalDateTime(endsAt);
  const summary = hasPeriod ? planningAbsencePeriodLabel(current) : 'Choisir un jour ou une période';
  const today = todayPlanningDate();
  const secondMonth = shiftPlanningMonths(viewMonth, 1);
  const visibleMonths = twoMonths && isPlanningDate(secondMonth) ? [viewMonth, secondMonth] : [viewMonth];
  const year = Number(viewMonth.slice(0, 4));
  const years = [...new Set([...Array.from({ length: 201 }, (_, index) => 1900 + index), year])].sort((left, right) => left - right);

  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => { calendarPosition.current = { focusDate, viewMonth }; }, [focusDate, viewMonth]);
  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false; setOpen(false); onOpenChangeRef.current?.(false); trigger.current?.focus();
  }, []);
  useEffect(() => () => { if (openRef.current) { openRef.current = false; onOpenChangeRef.current?.(false); } }, []);
  useEffect(() => { if (disabled) close(); }, [disabled, close]);
  useEffect(() => {
    if (openRef.current && (sourceRef.current.startsAt !== startsAt || sourceRef.current.endsAt !== endsAt)) close();
  }, [startsAt, endsAt, close]);
  useEffect(() => {
    const target = wrapper.current;
    if (!target) return;
    const measure = () => {
      const width = target.getBoundingClientRect().width;
      if (width <= 0) return;
      setTwoMonths(width >= 560);
      const position = calendarPosition.current;
      if (openRef.current && width < 560 && monthOf(position.focusDate) !== position.viewMonth) {
        pendingFocus.current = true;
        setViewMonth(monthOf(position.focusDate));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const button = dayButtons.current.get(focusDate);
    if (button) { pendingFocus.current = false; button.focus(); }
  }, [open, focusDate, viewMonth, twoMonths]);

  function show() {
    if (disabled || openRef.current) return;
    const initial = readPlanningAbsencePeriod(startsAt, endsAt);
    sourceRef.current = { startsAt, endsAt }; pendingFocus.current = true;
    setSelection(initial); setViewMonth(monthOf(initial.startsOn)); setFocusDate(initial.startsOn); setAwaitingEnd(false); setError('');
    openRef.current = true; setOpen(true); onOpenChangeRef.current?.(true);
  }
  function choose(date: string) {
    if (disabled) return;
    setSelection((value) => awaitingEnd ? { ...value, startsOn: date < value.startsOn ? date : value.startsOn, endsOn: date < value.startsOn ? value.startsOn : date } : { ...value, startsOn: date, endsOn: date });
    setAwaitingEnd(!awaitingEnd); setFocusDate(date); setError('');
  }
  function navigate(month: string) {
    if (!isPlanningDate(month) || disabled) return;
    const offset = (Number(month.slice(0, 4)) - Number(focusDate.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(focusDate.slice(5, 7));
    setFocusDate(shiftPlanningMonths(focusDate, offset)); setViewMonth(month);
  }
  function moveFocus(date: string) {
    if (!isPlanningDate(date)) return;
    const month = monthOf(date);
    if ((!twoMonths && month !== viewMonth) || month < viewMonth || month > secondMonth) setViewMonth(month);
    pendingFocus.current = true; setFocusDate(date);
  }
  function dayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let next: string | undefined;
    if (event.key === 'ArrowLeft') next = addPlanningDays(date, -1);
    else if (event.key === 'ArrowRight') next = addPlanningDays(date, 1);
    else if (event.key === 'ArrowUp') next = addPlanningDays(date, -7);
    else if (event.key === 'ArrowDown') next = addPlanningDays(date, 7);
    else if (event.key === 'Home') next = startOfPlanningWeek(date);
    else if (event.key === 'End') next = addPlanningDays(startOfPlanningWeek(date), 6);
    else if (event.key === 'PageUp') next = event.shiftKey ? shiftPlanningYears(date, -1) : shiftPlanningMonths(date, -1);
    else if (event.key === 'PageDown') next = event.shiftKey ? shiftPlanningYears(date, 1) : shiftPlanningMonths(date, 1);
    if (next) { event.preventDefault(); event.stopPropagation(); moveFocus(next); }
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); }
  }
  function apply() {
    if (disabled) return;
    let value: { startsAt: string; endsAt: string };
    try { value = buildPlanningAbsencePeriod(selection); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : 'Cette période ne peut pas être appliquée.'); return; }
    onChange(value.startsAt, value.endsAt); close();
  }

  return <div className="planning-absence-period-picker is-wide" ref={wrapper} onKeyDown={keyDown}>
    <button type="button" className="planning-absence-period-picker__trigger" ref={trigger} disabled={disabled} aria-label={`Période : ${summary}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => open ? close() : show()} onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); show(); } }}>
      <CalendarDays size={20} aria-hidden="true" /><span><span className="planning-absence-period-picker__label">Période</span><strong>{summary}</strong>{hasPeriod ? <small>{current.startTime} – {current.endTime}{current.endTime === '00:00' ? ' (fin le lendemain)' : ''}</small> : null}</span><ChevronDown size={17} aria-hidden="true" />
    </button>
    {open ? <div className="planning-absence-period-picker__panel" id={panelId} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={helpId}>
      <header className="planning-absence-period-picker__header"><h3 id={titleId}>Choisir la période</h3><button type="button" className="planning-absence-period-picker__icon" aria-label="Fermer le calendrier" onClick={close}><X size={17} aria-hidden="true" /></button></header>
      <p id={helpId} className="planning-absence-period-picker__help">Choisissez un jour, ou deux dates pour une période.</p>
      <div className="planning-absence-period-picker__navigation">
        <button type="button" className="planning-absence-period-picker__icon" aria-label="Mois précédent" disabled={viewMonth === '0000-01-01'} onClick={() => navigate(shiftPlanningMonths(viewMonth, -1))}><ChevronLeft size={17} aria-hidden="true" /></button>
        <div><select aria-label="Mois affiché" value={Number(viewMonth.slice(5, 7))} onChange={(event) => navigate(`${year.toString().padStart(4, '0')}-${event.target.value.padStart(2, '0')}-01`)}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select><select aria-label="Année affichée" value={year} onChange={(event) => navigate(`${event.target.value.padStart(4, '0')}-${viewMonth.slice(5, 7)}-01`)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
        <button type="button" className="planning-absence-period-picker__icon" aria-label="Mois suivant" disabled={viewMonth === '9999-12-01'} onClick={() => navigate(shiftPlanningMonths(viewMonth, 1))}><ChevronRight size={17} aria-hidden="true" /></button>
      </div>
      <div className="planning-absence-period-picker__months" data-months={visibleMonths.length}>
        {visibleMonths.map((month) => <div key={month} className="planning-absence-period-picker__month"><h4>{monthFormatter.format(parsePlanningDate(month))}</h4><div role="grid" aria-label={`Calendrier · ${monthFormatter.format(parsePlanningDate(month))}`} className="planning-absence-period-picker__grid"><div role="row" className="planning-absence-period-picker__week">{weekdays.map(([short, full]) => <span key={full} role="columnheader" aria-label={full}>{short}</span>)}</div>{planningAbsenceCalendarWeeks(month).map((week, index) => <div key={index} role="row" className="planning-absence-period-picker__week">{week.map((date, column) => date ? <div role="gridcell" key={date} aria-selected={date >= selection.startsOn && date <= selection.endsOn} className={`planning-absence-period-picker__cell${date === selection.startsOn ? ' is-start' : ''}${date === selection.endsOn ? ' is-end' : ''}`}>
          <button type="button" className={`planning-absence-period-picker__day${date === selection.startsOn || date === selection.endsOn ? ' is-boundary' : ''}`} ref={(node) => { if (node) dayButtons.current.set(date, node); else dayButtons.current.delete(date); }} tabIndex={date === focusDate ? 0 : -1} aria-label={dayFormatter.format(parsePlanningDate(date))} aria-current={date === today ? 'date' : undefined} onClick={() => choose(date)} onKeyDown={(event) => dayKeyDown(event, date)}>{parsePlanningDate(date).getUTCDate()}</button>
        </div> : <span key={`empty-${column}`} role="gridcell" className="planning-absence-period-picker__empty" />)}</div>)}</div></div>)}
      </div>
      <p className="planning-absence-period-picker__selection" aria-live="polite">{planningAbsencePeriodLabel(selection)}{awaitingEnd ? <small>Choisissez éventuellement une seconde date.</small> : null}</p>
      <details className="planning-absence-period-picker__hours"><summary>Horaires : {selection.startTime || '…'} – {selection.endTime || '…'}</summary><div><label>Heure de début<input type="time" step={60} value={selection.startTime} onChange={(event) => { setSelection((value) => ({ ...value, startTime: event.target.value })); setError(''); }} /></label><label>Heure de fin<input type="time" step={60} value={selection.endTime} onChange={(event) => { setSelection((value) => ({ ...value, endTime: event.target.value })); setError(''); }} /></label></div>{selection.endTime === '00:00' ? <p>La fin à 00:00 correspond au lendemain du dernier jour sélectionné.</p> : null}</details>
      {error ? <p className="planning-absence-period-picker__error" role="alert">{error}</p> : null}
      <footer className="planning-absence-period-picker__footer"><button type="button" className="planning-absence-period-picker__cancel" onClick={close}>Annuler</button><button type="button" className="planning-absence-period-picker__apply" onClick={apply}><Check size={15} aria-hidden="true" />Appliquer</button></footer>
    </div> : null}
  </div>;
}
