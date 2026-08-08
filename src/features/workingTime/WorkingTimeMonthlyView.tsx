import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import type { WorkingTimeCalculationWindow, WorkingTimeInterval } from './workingTimeModel';
import { workingTimeIntervalMinutes } from './workingTimeModel';
import type { WorkingTimeVesselOption } from './workingTimeQueries';

interface WorkingTimeMonthlyViewProps {
  calculations: WorkingTimeCalculationWindow[];
  intervals: WorkingTimeInterval[];
  nonCompliantDates: string[];
  onSelectDay: (day: string) => void;
  periodEnd: string;
  periodStart: string;
  vessels: WorkingTimeVesselOption[];
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

export function WorkingTimeMonthlyView({
  calculations,
  intervals,
  nonCompliantDates,
  onSelectDay,
  periodEnd,
  periodStart,
  vessels,
}: WorkingTimeMonthlyViewProps) {
  const days = periodDays(periodStart, periodEnd);
  const nonCompliant = new Set(nonCompliantDates);
  const latestCalculationByDay = new Map<string, WorkingTimeCalculationWindow>();
  calculations.forEach((calculation) => {
    const previous = latestCalculationByDay.get(calculation.localWindowEndDate);
    if (!previous || calculation.windowEnd > previous.windowEnd) {
      latestCalculationByDay.set(calculation.localWindowEndDate, calculation);
    }
  });
  const vesselNames = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
  const monthMinutes = intervals.reduce((sum, interval) => sum + workingTimeIntervalMinutes(interval), 0);

  return (
    <section aria-labelledby="working-time-monthly-title" className="working-time-monthly-view">
      <header>
        <div>
          <p>Vue mensuelle</p>
          <h4 id="working-time-monthly-title">Détail des heures du registre</h4>
        </div>
        <strong>{formatDuration(monthMinutes * 60)} sur le mois</strong>
      </header>
      <div className="working-time-monthly-table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Phases de travail</th><th>Total</th><th>Navire / bordée</th><th>Repos 24 h</th><th>Travail 7 jours</th><th>Statut</th></tr></thead>
          <tbody>
            {days.map((day) => {
              const dayIntervals = intervals.filter((interval) => interval.localWorkDate === day)
                .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
              const calculation = latestCalculationByDay.get(day);
              const dayMinutes = dayIntervals.reduce((sum, interval) => sum + workingTimeIntervalMinutes(interval), 0);
              const assignments = Array.from(new Set(dayIntervals.map((interval) => {
                const vessel = interval.vesselId ? vesselNames.get(interval.vesselId) : 'Sans navire';
                return `${vessel || 'Sans navire'}${interval.watchGroup ? ` · ${interval.watchGroup}` : ''}`;
              })));
              const isNonCompliant = nonCompliant.has(day);
              return (
                <tr className={isNonCompliant ? 'is-non-compliant' : ''} key={day}>
                  <td><button onClick={() => onSelectDay(day)} type="button">{formatDay(day)}</button></td>
                  <td>{dayIntervals.length ? dayIntervals.map((interval) => `${formatTime(interval.startsAt, interval.timezoneName)}–${formatTime(interval.endsAt, interval.timezoneName)}`).join(', ') : <span className="is-empty">Aucune heure</span>}</td>
                  <td><strong>{formatDuration(dayMinutes * 60)}</strong></td>
                  <td>{assignments.join(', ') || '—'}</td>
                  <td>{formatDuration(calculation?.rest24hSeconds)}</td>
                  <td>{formatDuration(calculation?.work7dSeconds)}</td>
                  <td>{isNonCompliant
                    ? <span className="working-time-month-status is-non-compliant"><AlertTriangle aria-hidden="true" size={14} />Non conforme</span>
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
