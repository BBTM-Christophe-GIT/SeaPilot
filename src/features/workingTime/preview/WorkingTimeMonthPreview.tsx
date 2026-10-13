import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import type { WorkingTimePhaseInput } from '../workingTimeQueries';
import { previewAddDays, previewDuration } from './workingTimePreviewData';
import './workingTimeMonthPreview.css';

interface MonthSegment {
  startsAt: number;
  endsAt: number;
  startMinute: number;
  endMinute: number;
  label: string;
  clockFold: boolean;
}

export interface WorkingTimeMonthRow {
  day: string;
  recorded: MonthSegment[];
  pending: MonthSegment[];
  workHours: number;
  recordedHours: number;
  pendingHours: number;
}

type TimeRange = { startsAt: number; endsAt: number };
type LocalClock = { minute: number; offsetMilliseconds: number };

function monthClock(timezoneName: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneName, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return (instant: number): LocalClock => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const localTimestamp = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return { minute: Number(parts.hour) * 60 + Number(parts.minute), offsetMilliseconds: localTimestamp - Math.floor(instant / 1000) * 1000 };
  };
}

/** Resolve civil-day boundaries in the selected zone, including 23/25-hour days. */
function monthDayStart(day: string, localClock: (instant: number) => LocalClock): number {
  const [year, month, date] = day.split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, date);
  let instant = localMidnight;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = localMidnight - localClock(instant).offsetMilliseconds;
    if (next === instant) break;
    instant = next;
  }
  return instant;
}

function mergeRanges(phases: readonly WorkingTimePhaseInput[]): TimeRange[] {
  const ranges = phases.map((phase) => ({ startsAt: Date.parse(phase.startsAt), endsAt: Date.parse(phase.endsAt) }))
    .filter((range) => Number.isFinite(range.startsAt) && Number.isFinite(range.endsAt) && range.endsAt > range.startsAt)
    .sort((left, right) => left.startsAt - right.startsAt);
  return ranges.reduce<TimeRange[]>((merged, range) => {
    const last = merged.at(-1);
    if (last && range.startsAt <= last.endsAt) last.endsAt = Math.max(last.endsAt, range.endsAt);
    else merged.push({ ...range });
    return merged;
  }, []);
}

function clockMinute(instant: number, dayStart: number, dayEnd: number, localClock: (instant: number) => LocalClock): number {
  if (instant <= dayStart) return 0;
  if (instant >= dayEnd) return 1440;
  return localClock(instant).minute;
}

function clockLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function clippedSegments(ranges: readonly TimeRange[], dayStart: number, dayEnd: number, localClock: (instant: number) => LocalClock): MonthSegment[] {
  return ranges.filter((range) => range.startsAt < dayEnd && range.endsAt > dayStart).map((range) => {
    const startsAt = Math.max(range.startsAt, dayStart);
    const endsAt = Math.min(range.endsAt, dayEnd);
    const startMinute = clockMinute(startsAt, dayStart, dayEnd, localClock);
    const endMinute = clockMinute(endsAt, dayStart, dayEnd, localClock);
    const clockFold = localClock(endsAt).offsetMilliseconds < localClock(startsAt).offsetMilliseconds;
    const label = clockFold
      ? `${clockLabel(startMinute)} → ${clockLabel(endMinute)} · heure répétée`
      : `${clockLabel(startMinute)}–${clockLabel(endMinute)}`;
    return { startsAt, endsAt, startMinute, endMinute, label, clockFold };
  });
}

function elapsedHours(ranges: readonly TimeRange[]): number {
  return ranges.reduce((hours, range) => hours + (range.endsAt - range.startsAt) / 3_600_000, 0);
}

/** The month is a factual register: no repeated rolling-window compliance analysis. */
export function buildWorkingTimeMonthRows(days: readonly string[], recorded: readonly WorkingTimePhaseInput[], pending: readonly WorkingTimePhaseInput[], timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone): WorkingTimeMonthRow[] {
  const recordedRanges = mergeRanges(recorded);
  const pendingRanges = mergeRanges(pending);
  const combinedRanges = mergeRanges([...recorded, ...pending]);
  const localClock = monthClock(timezoneName);
  return days.map((day) => {
    const dayStart = monthDayStart(day, localClock);
    const dayEnd = monthDayStart(previewAddDays(day, 1), localClock);
    const saved = clippedSegments(recordedRanges, dayStart, dayEnd, localClock);
    const draft = clippedSegments(pendingRanges, dayStart, dayEnd, localClock);
    return {
      day, recorded: saved, pending: draft,
      workHours: elapsedHours(clippedSegments(combinedRanges, dayStart, dayEnd, localClock)),
      recordedHours: elapsedHours(saved), pendingHours: elapsedHours(draft),
    };
  });
}

interface WorkingTimeMonthPreviewProps {
  days: readonly string[];
  recorded: readonly WorkingTimePhaseInput[];
  pending: readonly WorkingTimePhaseInput[];
  selectedDay: string;
  onChooseDay: (day: string) => void;
  timezoneName?: string;
}

const hourLabels = Array.from({ length: 25 }, (_, hour) => hour);
const halfHourSlots = Array.from({ length: 48 }, (_, index) => index);
const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

function DailyMonthGraph({ row, dateLabel }: { row: WorkingTimeMonthRow; dateLabel: string }) {
  const recordedLabel = row.recorded.length ? row.recorded.map((segment) => segment.label).join(', ') : 'aucune période';
  const pendingLabel = row.pending.length ? ` ; à enregistrer : ${row.pending.map((segment) => segment.label).join(', ')}` : '';
  return <div className="wtp-month-graph" role="img" aria-label={`${dateLabel} — enregistré : ${recordedLabel}${pendingLabel} ; total : ${previewDuration(row.workHours)}${row.workHours === 0 ? ' ; aucune période saisie, repos non attesté' : ''}`}>
    <div className="wtp-month-slots" aria-hidden="true">{halfHourSlots.map((slot) => <span className="wtp-month-slot" key={slot} />)}</div>
    {[...row.recorded.map((segment) => ({ segment, pending: false })), ...row.pending.map((segment) => ({ segment, pending: true }))].map(({ segment, pending }, index) => <span
      className={`wtp-month-phase${pending ? ' is-pending' : ''}${segment.clockFold ? ' is-clock-fold' : ''}`}
      key={`${pending ? 'pending' : 'recorded'}:${index}`}
      style={{ left: `${Math.min(segment.startMinute, segment.endMinute) / 14.4}%`, width: `${Math.abs(segment.endMinute - segment.startMinute) / 14.4}%` }}
      title={`${pending ? 'À enregistrer' : 'Enregistré'} : ${segment.label}`}
      aria-hidden="true"
    >{Math.abs(segment.endMinute - segment.startMinute) >= 90 ? segment.label : null}</span>)}
  </div>;
}

export function WorkingTimeMonthPreview({ days, recorded, pending, selectedDay, onChooseDay, timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone }: WorkingTimeMonthPreviewProps) {
  const rows = useMemo(() => buildWorkingTimeMonthRows(days, recorded, pending, timezoneName), [days, recorded, pending, timezoneName]);
  return <div className="wtp-month-preview">
    <div className="wtp-month-legend"><span><i className="is-recorded" />Enregistré</span><span><i className="is-pending" />À enregistrer</span><small>Pas de 30 min · une case vide n’atteste pas un repos.</small></div>
    <div className="wtp-month-scroll" tabIndex={0} role="region" aria-label="Tableau horaire mensuel, défilement horizontal">
      <table className="wtp-month-table">
        <caption className="sr-only">Détail des heures du registre, une journée par ligne</caption>
        <colgroup><col className="wtp-month-date-col" /><col /><col className="wtp-month-total-col" /><col className="wtp-month-action-col" /></colgroup>
        <thead><tr><th scope="col">Jour</th><th scope="col"><span className="sr-only">Périodes de travail de 00 h à 24 h</span><div className="wtp-month-hour-axis" aria-hidden="true">{hourLabels.map((hour) => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{String(hour).padStart(2, '0')}h</span>)}</div></th><th scope="col">Total</th><th scope="col"><span className="sr-only">Ouvrir la journée</span></th></tr></thead>
        <tbody>{rows.map((row) => {
          const label = dayFormatter.format(new Date(`${row.day}T12:00`));
          const folds = [...row.recorded, ...row.pending].filter((segment) => segment.clockFold);
          return <tr className={row.day === selectedDay ? 'is-selected' : ''} key={row.day}>
            <th scope="row"><button className="wtp-month-date" aria-label={`Ouvrir le ${label}`} onClick={() => onChooseDay(row.day)} type="button">{label}</button></th>
            <td><DailyMonthGraph row={row} dateLabel={label} />{folds.length ? <small className="wtp-month-clock-note">Horaires locaux · {folds.map((segment) => `${segment.label} (${previewDuration((segment.endsAt - segment.startsAt) / 3_600_000)})`).join(' ; ')}. La bande repère les bornes locales.</small> : null}</td>
            <td className="wtp-month-total"><strong>{previewDuration(row.workHours)}</strong>{row.pending.length ? <small>dont {previewDuration(row.pendingHours)} à enregistrer</small> : null}</td>
            <td><button className="sp-button wtp-month-open" aria-label={`Saisir le ${label}`} onClick={() => onChooseDay(row.day)} type="button">Ouvrir<ChevronRight size={14} /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
