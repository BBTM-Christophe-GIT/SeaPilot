import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { useMemo } from 'react';
import {
  workingTimeStatusCalculation,
  workingTimeViolationDetails,
  workingTimeViolationText,
  workingTimeViolationWindowText,
} from './workingTimeCompliance';
import type { WorkingTimeCalculationWindow, WorkingTimeInterval } from './workingTimeModel';
import { workingTimeIntervalMinutes } from './workingTimeModel';
import type { WorkingTimePhaseInput, WorkingTimePolicyThresholds, WorkingTimeVesselOption } from './workingTimeQueries';
import './workingTimeMonthlyGraphs.css';
import type { WorkingTimeCoverageDayStatus } from './workingTimeCoverage';

interface WorkingTimeMonthlyViewProps {
  calculations: WorkingTimeCalculationWindow[];
  intervals: WorkingTimeInterval[];
  nonCompliantDates: string[];
  onSelectDay: (day: string) => void;
  periodEnd: string;
  periodStart: string;
  policies: WorkingTimePolicyThresholds[];
  vessels: WorkingTimeVesselOption[];
  pendingPhases?: readonly WorkingTimePhaseInput[];
  pendingTimezoneName?: string;
  editingIntervalId?: number | null;
  editingIntervalIds?: readonly number[];
  coverageByDay?: Record<string, WorkingTimeCoverageDayStatus>;
}

const pad = (value: number) => String(value).padStart(2, '0');

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function periodDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end && days.length < 31; day = addDays(day, 1)) days.push(day);
  return days;
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(`${value}T12:00:00`))
    .replace('.', '');
}

function formatTime(value: string, timezoneName: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezoneName,
  }).format(new Date(value));
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)}`;
}

interface MonthlyGraphSegment {
  startMinute: number;
  endMinute: number;
  label: string;
  isPending: boolean;
  clockFold: boolean;
}

interface MonthlyGraphRange extends WorkingTimePhaseInput {
  timezoneName: string;
  isPending: boolean;
}

/** Wall-clock bands use each record's timezone, independently of the viewer's timezone. */
export function buildWorkingTimeMonthlyGraphRows(days: readonly string[], ranges: readonly MonthlyGraphRange[]): Map<string, MonthlyGraphSegment[]> {
  const formatters = new Map<string, Intl.DateTimeFormat>();
  const localized = ranges.flatMap((range) => {
    const startsAt = Date.parse(range.startsAt);
    const endsAt = Date.parse(range.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return [];
    let formatter = formatters.get(range.timezoneName);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: range.timezoneName, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      });
      formatters.set(range.timezoneName, formatter);
    }
    const local = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
      const minute = Number(parts.hour) * 60 + Number(parts.minute);
      const offset = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(instant / 1000) * 1000;
      return { day: `${parts.year}-${parts.month}-${parts.day}`, minute, offset };
    };
    return [{ start: local(startsAt), end: local(endsAt), isPending: range.isPending }];
  });
  const clock = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
  return new Map(days.map((day) => [day, localized.flatMap(({ start, end, isPending }) => {
    if (start.day > day || end.day < day || (end.day === day && end.minute === 0 && start.day < day)) return [];
    const startMinute = start.day < day ? 0 : start.minute;
    const endMinute = end.day > day ? 1440 : end.minute;
    const clockFold = end.offset < start.offset;
    return [{ startMinute, endMinute, isPending, clockFold, label: clockFold
      ? `${clock(startMinute)} → ${clock(endMinute)} · heure répétée`
      : `${clock(startMinute)}–${clock(endMinute)}` }];
  })]));
}

const hours = Array.from({ length: 25 }, (_, hour) => hour);
const halfHours = Array.from({ length: 48 }, (_, slot) => slot);

function MonthlyDayGraph({ day, segments }: { day: string; segments: MonthlyGraphSegment[] }) {
  const saved = segments.filter((segment) => !segment.isPending);
  const pending = segments.filter((segment) => segment.isPending);
  const labels = (values: MonthlyGraphSegment[]) => values.map((segment) => segment.label).join(', ');
  return <>
    <div className="working-time-month-graph" role="img" aria-label={`${formatDay(day)} — enregistré : ${labels(saved) || 'aucune période'}${pending.length ? ` ; à enregistrer : ${labels(pending)}` : ''}${segments.length ? '' : ' ; repos non attesté'}`}>
      <div className="working-time-month-graph-slots" aria-hidden="true">{halfHours.map((slot) => <span key={slot} />)}</div>
      {segments.map((segment, index) => <span
        aria-hidden="true"
        className={`working-time-month-graph-phase${segment.isPending ? ' is-pending' : ''}${segment.clockFold ? ' is-clock-fold' : ''}`}
        key={index}
        style={{ left: `${Math.min(segment.startMinute, segment.endMinute) / 14.4}%`, width: `${Math.abs(segment.endMinute - segment.startMinute) / 14.4}%` }}
        title={`${segment.isPending ? 'À enregistrer' : 'Enregistré'} : ${segment.label}`}
      >{Math.abs(segment.endMinute - segment.startMinute) >= 90 ? segment.label : null}</span>)}
    </div>
    {pending.length ? <small className="working-time-month-graph-pending">À enregistrer : {labels(pending)}</small> : null}
    {segments.some((segment) => segment.clockFold) ? <small className="working-time-month-graph-note">Heure répétée : la bande indique les bornes locales ; le total conserve la durée réelle.</small> : null}
  </>;
}

export function WorkingTimeMonthlyView({
  calculations,
  intervals,
  nonCompliantDates,
  onSelectDay,
  periodEnd,
  periodStart,
  policies,
  vessels,
  pendingPhases = [],
  pendingTimezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  editingIntervalId = null,
  editingIntervalIds = [],
  coverageByDay,
}: WorkingTimeMonthlyViewProps) {
  const days = periodDays(periodStart, periodEnd);
  const graphRows = useMemo(() => buildWorkingTimeMonthlyGraphRows(periodDays(periodStart, periodEnd), [
    ...intervals.filter((interval) => interval.id !== editingIntervalId && !editingIntervalIds.includes(interval.id)).map((interval) => ({ ...interval, isPending: false })),
    ...pendingPhases.map((phase) => ({ ...phase, timezoneName: pendingTimezoneName, isPending: true })),
  ]), [periodStart, periodEnd, intervals, pendingPhases, pendingTimezoneName, editingIntervalId, editingIntervalIds]);
  const nonCompliant = new Set(nonCompliantDates);
  const vesselNames = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
  const monthMinutes = intervals
    .filter((interval) => interval.localWorkDate >= periodStart && interval.localWorkDate <= periodEnd)
    .reduce((sum, interval) => sum + workingTimeIntervalMinutes(interval), 0);

  return (
    <section aria-labelledby="working-time-monthly-title" className="working-time-monthly-view">
      <header>
        <div>
          <p>Vue mensuelle</p>
          <h4 id="working-time-monthly-title">Détail des heures du registre</h4>
        </div>
        <strong>{formatDuration(monthMinutes * 60)} sur le mois</strong>
      </header>
      <div className="working-time-month-graph-legend"><span><i />Enregistré</span><span><i className="is-pending" />À enregistrer</span><small>Horaires locaux · une case vide n’atteste pas un repos.</small></div>
      <div className="working-time-monthly-table-wrap" tabIndex={0} role="region" aria-label="Tableau mensuel du temps de travail, défilement horizontal">
        <table>
          <thead><tr><th scope="col">Date</th><th scope="col" className="working-time-month-graph-column"><span>Phases de travail</span><div className="working-time-month-graph-axis" aria-hidden="true">{hours.map((hour) => <span key={hour} style={{ left: `${hour / 24 * 100}%` }}>{pad(hour)}h</span>)}</div></th><th scope="col">Total</th><th scope="col">Navire / bordée</th><th scope="col">Repos 24 h</th><th scope="col">Travail 7 jours</th><th scope="col">Statut / motif</th></tr></thead>
          <tbody>
            {days.map((day) => {
              const dayIntervals = intervals.filter((interval) => interval.localWorkDate === day)
                .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
              const calculation = workingTimeStatusCalculation(calculations, intervals, day);
              const violations = workingTimeViolationDetails(calculations, intervals, day, policies);
              const dayMinutes = dayIntervals.reduce((sum, interval) => sum + workingTimeIntervalMinutes(interval), 0);
              const assignments = Array.from(new Set(dayIntervals.map((interval) => {
                const vessel = interval.vesselId ? vesselNames.get(interval.vesselId) : 'Sans navire';
                return `${vessel || 'Sans navire'}${interval.watchGroup ? ` · ${interval.watchGroup}` : ''}`;
              })));
              const isNonCompliant = nonCompliant.has(day);
              const coverage = coverageByDay?.[day];
              return (
                <tr className={isNonCompliant ? 'is-non-compliant' : ''} key={day}>
                  <td><button onClick={() => onSelectDay(day)} type="button">{formatDay(day)}</button></td>
                  <td className="working-time-month-graph-column"><MonthlyDayGraph day={day} segments={graphRows.get(day) || []} /><small className="working-time-month-graph-recorded">{dayIntervals.length ? dayIntervals.map((interval) => `${formatTime(interval.startsAt, interval.timezoneName)}–${formatTime(interval.endsAt, interval.timezoneName)}`).join(', ') : <span className="is-empty">Aucune heure</span>}</small></td>
                  <td><strong>{formatDuration(dayMinutes * 60)}</strong></td>
                  <td>{assignments.join(', ') || '—'}</td>
                  <td>{formatDuration(coverageByDay ? undefined : calculation?.rest24hSeconds)}</td>
                  <td>{formatDuration(coverageByDay ? undefined : calculation?.work7dSeconds)}</td>
                  <td>{coverage ? coverage === 'uncovered'
                    ? <span className="working-time-month-status is-non-compliant"><AlertTriangle aria-hidden="true" size={14} />Couverture interrompue</span>
                    : coverage === 'covered'
                      ? <span className="working-time-month-status is-compliant"><CheckCircle2 aria-hidden="true" size={14} />Couvert</span>
                      : <span className="working-time-month-status"><Clock3 aria-hidden="true" size={14} />À confirmer</span>
                    : isNonCompliant
                    ? <div className="working-time-month-status-detail">
                      <span className="working-time-month-status is-non-compliant"><AlertTriangle aria-hidden="true" size={14} />Non conforme</span>
                      {violations.map((violation) => <span className="working-time-month-violation" key={violation.code}>
                        <strong>{workingTimeViolationText(violation)}</strong>
                        <small>{workingTimeViolationWindowText(violation)}</small>
                      </span>)}
                    </div>
                    : calculation?.isCompliant === true
                      ? <span className="working-time-month-status is-compliant"><CheckCircle2 aria-hidden="true" size={14} />Conforme</span>
                      : <span className="working-time-month-status"><Clock3 aria-hidden="true" size={14} />À calculer</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
