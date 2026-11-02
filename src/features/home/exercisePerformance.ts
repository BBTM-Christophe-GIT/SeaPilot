import type { ProcessPerformance, ProcessPerformanceCriterion, ProcessPerformanceTask } from './processPerformance';
import type { ProcessPerformanceScope } from './processPerformanceScope';

export interface ExercisePerformanceUnit {
  vesselId: number;
  fireCount: number;
  abandonCount: number;
  counts: Record<string, number>;
  tbtCount: number;
  presenceDays: number;
}
export interface ExercisePerformanceMonth {
  personId: number;
  personName: string;
  month: number;
  fireCount: number;
  abandonCount: number;
  counts: Record<string, number>;
  tbtCount: number;
  presenceDays: number;
  units: ExercisePerformanceUnit[];
}
export interface ExercisePerformanceSnapshot {
  schemaVersion: 2;
  scope: 'fleet' | 'watch' | 'self';
  year: number;
  asOf: string;
  vessels: Array<{ id: number; name: string }>;
  exerciseTypes: Array<{ key: string; label: string; cadenceMonths: 1 | 2 }>;
  personMonths: ExercisePerformanceMonth[];
  crewDays: Array<{ vesselId: number; on: string; count: number }>;
}

const MONTHLY = new Set(['fire-protection', 'abandon-ship']);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown): value is number => count(value) && value > 0;
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const endOfMonth = (year: number, month: number): string => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
const invalid = (): never => { throw new Error('Données des obligations d’exercices v2 invalides ou incomplètes.'); };

/** Reject legacy or incomplete payloads instead of awarding a score from a partial population. */
export function validateExerciseSnapshot(data: unknown, year: number): ExercisePerformanceSnapshot {
  if (!object(data) || data.schemaVersion !== 2 || !id(year) || year < 1000 || year > 9999 || data.year !== year
    || !['fleet', 'watch', 'self'].includes(String(data.scope)) || !validDate(data.asOf)
    || !Array.isArray(data.vessels) || !Array.isArray(data.exerciseTypes) || !Array.isArray(data.personMonths) || !Array.isArray(data.crewDays)) invalid();
  const value = data as unknown as ExercisePerformanceSnapshot;
  const vessels = new Set<number>();
  for (const vessel of value.vessels) {
    if (!object(vessel) || !id(vessel.id) || typeof vessel.name !== 'string' || !vessel.name.trim() || vessels.has(vessel.id)) invalid();
    vessels.add(vessel.id);
  }
  const keys = new Set<string>();
  for (const type of value.exerciseTypes) {
    if (!object(type) || typeof type.key !== 'string' || !type.key.trim() || type.key === 'tbt' || keys.has(type.key)
      || typeof type.label !== 'string' || !type.label.trim() || type.cadenceMonths !== (MONTHLY.has(type.key) ? 1 : 2)) invalid();
    keys.add(type.key);
  }
  if ([...MONTHLY].some((key) => !keys.has(key))) invalid();
  function validCounts(row: ExercisePerformanceUnit | ExercisePerformanceMonth, maxDays: number): boolean {
    return object(row.counts) && Object.keys(row.counts).length === keys.size && [...keys].every((key) => count(row.counts[key]))
      && count(row.fireCount) && count(row.abandonCount) && row.fireCount === row.counts['fire-protection'] && row.abandonCount === row.counts['abandon-ship']
      && count(row.tbtCount) && count(row.presenceDays) && row.presenceDays <= maxDays
      && (row.presenceDays > 0 || (row.tbtCount === 0 && Object.values(row.counts).every((amount) => amount === 0)));
  }
  const people = new Set<string>();
  for (const month of value.personMonths) {
    if (!object(month) || !id(month.personId) || typeof month.personName !== 'string' || !Number.isInteger(month.month)
      || month.month < 1 || month.month > 12 || !Array.isArray(month.units) || people.has(month.personId + ':' + month.month)) invalid();
    const maxDays = Number(endOfMonth(year, month.month).slice(-2));
    if (!validCounts(month, maxDays)) invalid();
    const units = new Set<number>();
    for (const unit of month.units) {
      if (!object(unit) || !id(unit.vesselId) || !vessels.has(unit.vesselId) || units.has(unit.vesselId) || !validCounts(unit, maxDays)) invalid();
      units.add(unit.vesselId);
    }
    if ([...keys].some((key) => month.counts[key] !== month.units.reduce((sum, unit) => sum + unit.counts[key], 0))
      || month.tbtCount !== month.units.reduce((sum, unit) => sum + unit.tbtCount, 0)
      || month.presenceDays > month.units.reduce((sum, unit) => sum + unit.presenceDays, 0)
      || month.units.some((unit) => unit.presenceDays > month.presenceDays)) invalid();
    people.add(month.personId + ':' + month.month);
  }
  const days = new Set<string>();
  for (const day of value.crewDays) {
    if (!object(day) || !id(day.vesselId) || !vessels.has(day.vesselId) || !validDate(day.on) || Number(day.on.slice(0, 4)) !== year
      || !count(day.count) || days.has(day.vesselId + ':' + day.on)) invalid();
    days.add(day.vesselId + ':' + day.on);
  }
  return value;
}

interface Obligation {
  personId: number;
  personName: string;
  firstMonth: number;
  lastMonth: number;
  covered: boolean;
  vesselIds: Set<number>;
}

export function buildExercisePerformance(snapshot: ExercisePerformanceSnapshot, scope: ProcessPerformanceScope, today: string): ProcessPerformance {
  validateExerciseSnapshot(snapshot, snapshot.year);
  if (!validDate(today)) invalid();
  const asOf = today < snapshot.asOf ? today : snapshot.asOf;
  const currentYear = Number(asOf.slice(0, 4));
  const currentMonth = Number(asOf.slice(5, 7));
  const lastMonth = snapshot.year < currentYear ? 12 : snapshot.year === currentYear ? currentMonth : 0;
  const horizon = lastMonth ? endOfMonth(snapshot.year, lastMonth) : '';
  const allowedVessels = new Set(scope.vesselIds);
  const vessels = snapshot.vessels.filter((vessel) => scope.kind === 'company' || allowedVessels.has(vessel.id));
  const vesselNames = new Map(vessels.map((vessel) => [vessel.id, vessel.name]));
  const roster = snapshot.personMonths.flatMap((month) => {
    if (month.month > lastMonth || (scope.kind === 'self' && month.personId !== scope.personId)) return [];
    const units = month.units.filter((unit) => vesselNames.has(unit.vesselId) && unit.presenceDays > 0);
    if (!units.length || month.presenceDays === 0) return [];
    return [{ ...month, units,
      counts: scope.kind === 'company' ? month.counts : Object.fromEntries(snapshot.exerciseTypes.map((type) => [type.key, units.reduce((sum, unit) => sum + unit.counts[type.key], 0)])),
      tbtCount: scope.kind === 'company' ? month.tbtCount : units.reduce((sum, unit) => sum + unit.tbtCount, 0),
    }];
  });
  const tasks: ProcessPerformanceTask[] = [];
  const totals: Array<{ key: string; label: string; cadence: 1 | 2; covered: number; closed: number; open: number }> = [];
  for (const type of snapshot.exerciseTypes) {
    const obligations = new Map<string, Obligation>();
    for (const month of roster) {
      const firstMonth = Math.floor((month.month - 1) / type.cadenceMonths) * type.cadenceMonths + 1;
      const key = month.personId + ':' + firstMonth;
      const obligation = obligations.get(key) || { personId: month.personId, personName: month.personName || 'Collaborateur autorisé',
        firstMonth, lastMonth: firstMonth + type.cadenceMonths - 1, covered: false, vesselIds: new Set<number>() };
      obligation.covered ||= month.counts[type.key] > 0;
      month.units.forEach((unit) => obligation.vesselIds.add(unit.vesselId));
      obligations.set(key, obligation);
    }
    let closed = 0; let covered = 0; let open = 0;
    for (const obligation of obligations.values()) {
      const dueOn = endOfMonth(snapshot.year, obligation.lastMonth);
      const isClosed = dueOn < asOf;
      if (isClosed) { closed += 1; if (obligation.covered) covered += 1; }
      if (obligation.covered) continue;
      if (!isClosed) open += 1;
      const query = new URLSearchParams({ year: String(snapshot.year), person: String(obligation.personId) });
      if (obligation.vesselIds.size === 1) query.set('vessel', String([...obligation.vesselIds][0]));
      const period = obligation.firstMonth === obligation.lastMonth ? String(obligation.firstMonth).padStart(2, '0')
        : String(obligation.firstMonth).padStart(2, '0') + '–' + String(obligation.lastMonth).padStart(2, '0');
      tasks.push({ id: 'exercise-' + type.key + '-' + obligation.personId + '-' + obligation.firstMonth,
        title: type.label + ' · ' + period + '/' + snapshot.year,
        context: obligation.personName + ' · ' + [...obligation.vesselIds].map((vesselId) => vesselNames.get(vesselId)).join(' / '),
        state: isClosed ? 'overdue' : 'unplanned', dueOn, scheduledOn: '', location: '', to: '/modules/emergencyExercises?' + query,
      });
    }
    totals.push({ key: type.key, label: type.label, cadence: type.cadenceMonths, covered, closed, open });
  }
  const closed = totals.reduce((sum, type) => sum + type.closed, 0);
  const covered = totals.reduce((sum, type) => sum + type.covered, 0);
  const bonusTbt = roster.reduce((sum, month) => sum + month.tbtCount, 0);
  const criteria: ProcessPerformanceCriterion[] = totals.map((type) => ({ id: type.key, label: type.label,
    weight: closed ? Math.round(10000 * type.closed / closed) / 100 : 0,
    score: type.closed ? Math.round(100 * type.covered / type.closed) : null,
    detail: type.covered + '/' + type.closed + ' obligations closes couvertes ; ' + type.closed + '/' + closed + ' obligations closes du score total. '
      + (type.cadence === 1 ? '1 exercice par personne et par mois' : '1 exercice par personne et par période fixe de 2 mois (janv.–févr., mars–avr., etc.)')
      + ' dès 1 jour de présence. ' + type.open + ' à organiser avant la fin de la période ouverte.',
  }));
  const months = vessels.flatMap((vessel) => {
    const populated = new Map<number, { people: Set<number>; presenceDays: number }>();
    for (let month = 1; month <= lastMonth; month += 1) populated.set(month, { people: new Set<number>(), presenceDays: 0 });
    for (const month of roster) {
      const unit = month.units.find((row) => row.vesselId === vessel.id);
      if (!unit) continue;
      const entry = populated.get(month.month) || { people: new Set<number>(), presenceDays: 0 };
      entry.people.add(month.personId); entry.presenceDays += unit.presenceDays; populated.set(month.month, entry);
    }
    return [...populated.entries()].sort(([a], [b]) => a - b).map(([month, entry]) => ({ vesselId: vessel.id, month, people: entry.people.size, presenceDays: entry.presenceDays }));
  });
  // A fleet/watch daily aggregate cannot be transformed into personal days without inventing them.
  const days = scope.kind === 'self' && snapshot.scope !== 'self' ? []
    : snapshot.crewDays.filter((day) => vesselNames.has(day.vesselId) && day.on <= horizon);
  const result = { key: 'emergencyExercises' as const, label: 'Exercices d’urgence', shortLabel: 'Exercices', to: '/modules/emergencyExercises',
    score: closed ? Math.round(100 * covered / closed) : null,
    summary: covered + '/' + closed + ' obligations closes couvertes · ' + tasks.filter((task) => task.state === 'overdue').length
      + ' à régulariser · ' + tasks.filter((task) => task.state === 'unplanned').length + ' à organiser · ' + bonusTbt + ' participation(s) TBT en complément, sans points',
    criteria, tasks: tasks.sort((a, b) => Number(b.state === 'overdue') - Number(a.state === 'overdue') || a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id)),
    unavailableSources: [], exercisePresence: { year: snapshot.year, asOf, vessels, days, months, bonusTbt },
  };
  return result;
}
