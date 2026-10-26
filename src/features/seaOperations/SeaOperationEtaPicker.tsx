import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { addPlanningDays, isPlanningDate, parsePlanningDate, shiftPlanningMonths, startOfPlanningWeek } from '../planning/planningDates';
import { seaOperationToday } from './seaOperationModel';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import './seaOperationEtaPicker.css';

const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdays = [['Lu', 'Lundi'], ['Ma', 'Mardi'], ['Me', 'Mercredi'], ['Je', 'Jeudi'], ['Ve', 'Vendredi'], ['Sa', 'Samedi'], ['Di', 'Dimanche']];
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
const validDate = (value: string) => isPlanningDate(value) && value >= '1000-01-01';

function readEta(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match && validDate(match[1]) ? { date: match[1], time: match[2] } : null;
}

function calendarWeeks(month: string) {
  const first = parsePlanningDate(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first); last.setUTCMonth(first.getUTCMonth() + 1, 0);
  const count = last.getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => index >= offset && index < offset + count ? addPlanningDays(month, index - offset) : null);
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

/** Local Paris wall-clock ETA. Calendar edits never publish a partial value. */
export function SeaOperationEtaPicker({ value, onChange, label, disabled = false, inline = false }: {
  value: string; onChange: (value: string) => void; label: string; disabled?: boolean; inline?: boolean;
}) {
  const panelId = useId(), titleId = useId(), helpId = useId();
  const wrapper = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const hourSelect = useRef<HTMLSelectElement>(null);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const source = useRef(value), openRef = useRef(inline), pendingFocus = useRef(false);
  const [open, setOpen] = useState(inline);
  const [selectedDate, setSelectedDate] = useState(() => inline ? readEta(value)?.date || '' : '');
  const [time, setTime] = useState(() => inline ? readEta(value)?.time || '' : '');
  const [month, setMonth] = useState(() => monthOf(inline ? readEta(value)?.date || seaOperationToday() : seaOperationToday()));
  const [focusDate, setFocusDate] = useState(() => inline ? readEta(value)?.date || seaOperationToday() : seaOperationToday());
  const [error, setError] = useState('');
  const current = readEta(value);
  const today = seaOperationToday();
  const summary = current ? `${current.date.split('-').reverse().join('/')} · ${current.time}` : value || 'Choisir date et heure';
  const close = useCallback((restoreFocus = true) => {
    if (inline) {
      const initial = readEta(value), initialFocus = initial?.date || seaOperationToday();
      source.current = value; pendingFocus.current = false;
      setSelectedDate(initial?.date || ''); setTime(initial?.time || '');
      setMonth(monthOf(initialFocus)); setFocusDate(initialFocus); setError('');
      return;
    }
    if (!openRef.current) return;
    openRef.current = false; setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }, [inline, value]);

  useEffect(() => { if (disabled || source.current !== value) close(false); }, [disabled, value, close]);
  useEffect(() => {
    if (!open || inline) return;
    const document = wrapper.current?.ownerDocument;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !wrapper.current?.contains(event.target)) close(false); };
    document?.addEventListener('pointerdown', outside, true);
    return () => document?.removeEventListener('pointerdown', outside, true);
  }, [open, inline, close]);
  useEffect(() => {
    if ((inline || open) && pendingFocus.current) { pendingFocus.current = false; dayButtons.current.get(focusDate)?.focus({ preventScroll: true }); }
  }, [inline, open, month, focusDate]);

  function canEdit() { return !disabled && !(trigger.current || timeInput.current || hourSelect.current)?.matches(':disabled') && !wrapper.current?.closest('[inert]'); }
  function show() {
    if (!canEdit() || openRef.current) return;
    const initial = readEta(value), initialFocus = initial?.date || seaOperationToday();
    source.current = value;
    setSelectedDate(initial?.date || ''); setTime(initial?.time || '');
    setMonth(monthOf(initialFocus)); setFocusDate(initialFocus); setError('');
    pendingFocus.current = true; openRef.current = true; setOpen(true);
  }
  function choose(date: string) { if (canEdit()) { setSelectedDate(date); setFocusDate(date); setError(''); } }
  function changeTimePart(part: 0 | 1, value: string) {
    if (!canEdit()) return;
    const parts = time.split(':');
    parts[part] = value;
    setTime(`${parts[0] || ''}:${parts[1] || ''}`); setError('');
  }
  function moveFocus(date: string) {
    if (!canEdit() || !validDate(date)) return;
    pendingFocus.current = true; setFocusDate(date); setMonth(monthOf(date));
  }
  function navigate(amount: number) {
    const next = shiftPlanningMonths(focusDate, amount);
    if (validDate(next)) moveFocus(next);
  }
  function dayKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let next: string | undefined;
    if (event.key === 'ArrowLeft') next = addPlanningDays(date, -1);
    else if (event.key === 'ArrowRight') next = addPlanningDays(date, 1);
    else if (event.key === 'ArrowUp') next = addPlanningDays(date, -7);
    else if (event.key === 'ArrowDown') next = addPlanningDays(date, 7);
    else if (event.key === 'Home') next = startOfPlanningWeek(date);
    else if (event.key === 'End') next = addPlanningDays(startOfPlanningWeek(date), 6);
    else if (event.key === 'PageUp') next = shiftPlanningMonths(date, -1);
    else if (event.key === 'PageDown') next = shiftPlanningMonths(date, 1);
    if (next) { event.preventDefault(); event.stopPropagation(); moveFocus(next); }
  }
  function apply() {
    if (!canEdit() || !validDate(selectedDate) || !timePattern.test(time)) return;
    const original = readEta(source.current);
    if (original?.date === selectedDate && original.time === time) { close(); return; }
    const next = `${selectedDate}T${time}`;
    try { seaOperationEtaUtc(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Choisissez une date et une heure de Paris valides.'); return; }
    onChange(next); if (!inline) close();
  }

  return <div className={`so-eta-picker${inline ? ' is-inline' : ''}`} ref={wrapper} onKeyDownCapture={(event) => {
    if (event.key === 'Escape' && (inline || openRef.current || event.repeat)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat && canEdit()) close(); }
    else if ((inline || openRef.current) && event.key === 'Enter' && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) { event.preventDefault(); event.stopPropagation(); }
  }}>
    {!inline && <button type="button" className="sp-button sp-button--secondary so-eta-trigger" ref={trigger} aria-label={label} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open && !disabled ? panelId : undefined} disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={(event) => {
      if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); if (!event.repeat) { if (open) close(); else show(); } }
    }}><CalendarDays size={15} aria-hidden="true" /><span>{summary}</span><ChevronDown size={14} aria-hidden="true" /></button>}
    {(inline || (open && !disabled)) && <div className="so-eta-panel" role={inline ? 'group' : 'dialog'} aria-modal={inline ? undefined : 'false'} aria-label={inline ? label : undefined} aria-labelledby={inline ? undefined : titleId} aria-describedby={helpId} id={panelId}>
      <div className="so-eta-date-pane"><header className="so-eta-navigation"><button type="button" className="sp-button sp-button--secondary" aria-label="Mois précédent" disabled={disabled || month === '1000-01-01'} onClick={() => navigate(-1)}><ChevronLeft size={17} aria-hidden="true" /></button><h3><span id={titleId}>Choisir l’ETA</span><strong aria-live="polite">{monthLabel.format(parsePlanningDate(month))}</strong></h3><button type="button" className="sp-button sp-button--secondary" aria-label="Mois suivant" disabled={disabled || month === '9999-12-01'} onClick={() => navigate(1)}><ChevronRight size={17} aria-hidden="true" /></button></header>
      <div className="so-eta-calendar" role="grid" aria-label={`Calendrier · ${monthLabel.format(parsePlanningDate(month))}`}>
        <div role="row" className="so-eta-week">{weekdays.map(([short, full]) => <span key={full} role="columnheader" aria-label={full}>{short}</span>)}</div>
        {calendarWeeks(month).map((week, index) => <div className="so-eta-week" role="row" key={index}>{week.map((date, column) => date ? <div role="gridcell" aria-selected={date === selectedDate} key={date}><button type="button" disabled={disabled} className={`so-eta-day${date === selectedDate ? ' is-selected' : ''}`} ref={(node) => { if (node) dayButtons.current.set(date, node); else dayButtons.current.delete(date); }} tabIndex={date === focusDate ? 0 : -1} aria-label={dayLabel.format(parsePlanningDate(date))} aria-current={date === today ? 'date' : undefined} onClick={() => choose(date)} onKeyDown={(event) => dayKeyDown(event, date)}>{parsePlanningDate(date).getUTCDate()}</button></div> : <span key={`empty-${column}`} role="gridcell" />)}</div>)}
      </div></div>
      <div className="so-eta-controls">{inline ? <div className="so-eta-time" role="group" aria-label="Heure de l’ETA (Paris)"><span><Clock3 size={14} aria-hidden="true" />Heure (Paris)</span>
        <div className="so-eta-time-parts"><select ref={hourSelect} aria-label="Heures de l’ETA (Paris)" disabled={disabled} value={time.split(':')[0] || ''} onChange={event => changeTimePart(0, event.target.value)}><option value="">HH</option>{hours.map(hour => <option value={hour} key={hour}>{hour}</option>)}</select><span aria-hidden="true">:</span>
        <select aria-label="Minutes de l’ETA (Paris)" disabled={disabled} value={time.split(':')[1] || ''} onChange={event => changeTimePart(1, event.target.value)}><option value="">mm</option>{minutes.map(minute => <option value={minute} key={minute}>{minute}</option>)}</select></div>
      </div> : <label className="so-eta-time"><span><Clock3 size={15} aria-hidden="true" />Heure de l’ETA (Paris)</span><input ref={timeInput} disabled={disabled} type="time" step={60} value={time} onChange={(event) => { if (canEdit()) { setTime(event.target.value); setError(''); } }} /></label>}
      <p className="so-eta-help" id={helpId}>{inline ? 'Date et heure locale · Europe/Paris' : 'Sélectionnez une date et une heure. Heure locale Europe/Paris.'}</p>
      {error && <p className="so-eta-error" role="alert">{error}</p>}
      <footer className="so-eta-actions"><button type="button" className="sp-button sp-button--secondary so-eta-quiet-action" disabled={disabled || !value} onClick={() => { if (canEdit()) { onChange(''); close(); } }}>Effacer</button><button type="button" className="sp-button sp-button--secondary so-eta-quiet-action" disabled={disabled} onClick={() => { if (canEdit()) close(); }}>Annuler</button><button type="button" className="sp-button sp-button--primary" disabled={disabled || !selectedDate || !timePattern.test(time)} onClick={apply}>Appliquer</button></footer></div>
    </div>}
  </div>;
}
