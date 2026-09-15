import { addPlanningDays, formatPlanningDate } from './planningDates';
import { formatPlanningPerson, normalizePlanningText, type PlanningDateRange } from './planningModel';
import { PLANNING_ASSIGNMENT_NOTE_SOURCE, PLANNING_VESSEL_LOCATION_SOURCE, type PlanningOverview, type PlanningPerson } from './planningQueries';
import type { PlanningAbsenceRecord } from './planningP12';
import { latestPlanningSources } from './planningSourcePriority';

export interface PlanningCrewBalanceCheckpoint { personId: number; asOf: string; balance: number }
export interface PlanningCrewBalanceDay { value: number | null; explanation: string }
export type PlanningCrewBalanceDays = ReadonlyMap<string, PlanningCrewBalanceDay>;

export function planningCrewDayCents(status: string): number | null {
  const key = normalizePlanningText(status);
  if (['ENMER', 'EMBARQUE', 'EMBARQUEMENT'].includes(key)) return 105;
  if (['ATERRE', 'FORMATION'].includes(key)) return 50;
  if (['ARRETMALADIE', 'ACCIDENTDUTRAVAIL'].includes(key)) return 0;
  if (['', 'EXTRA', 'REPOS', 'ENREPOS', 'CONGE', 'CONGES', 'VACANCE', 'VACANCES', 'DEBARQUE', 'DEBARQUEMENT'].includes(key)) return -100;
  return null;
}

export const formatPlanningCrewBalance = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildPlanningCrewBalanceDays(
  person: PlanningPerson, overview: PlanningOverview, absences: PlanningAbsenceRecord[],
  checkpoints: PlanningCrewBalanceCheckpoint[], range: PlanningDateRange,
): Map<string, PlanningCrewBalanceDay> {
  const results = new Map<string, PlanningCrewBalanceDay>();
  const refs = checkpoints.filter((ref) => ref.personId === person.id && ref.asOf <= range.end).sort((a, b) => a.asOf.localeCompare(b.asOf));
  const before = refs.filter((ref) => ref.asOf <= range.start).at(-1);
  const start = before?.asOf || range.start;
  const byDate = new Map(refs.map((ref) => [ref.asOf, ref]));
  const matches = (id: number | null, name: string) => id === person.id || (id === null && [
    normalizePlanningText(formatPlanningPerson(person)), normalizePlanningText(`${person.lastName} ${person.firstName}`),
  ].includes(normalizePlanningText(name)));
  const assignments = overview.assignments.filter((item) => item.crewPersonId === person.id && item.confirmationStatus !== 'cancelled');
  const periods = overview.periods.filter((item) => matches(item.personId, item.crewName));
  const days = overview.days.filter((item) => matches(item.personId, item.crewName) && item.sourceLabel !== PLANNING_VESSEL_LOCATION_SOURCE);
  const leave = absences.filter((item) => item.personId === person.id && item.status === 'approved');
  let cents: number | null = null;
  let explanation = 'Solde à initialiser';
  for (let date = start; date <= range.end; date = addPlanningDays(date, 1)) {
    const checkpoint = byDate.get(date);
    if (checkpoint) {
      cents = Math.round(checkpoint.balance * 100);
      explanation = `Solde saisi en fin de journée du ${formatPlanningDate(date)}`;
    } else if ((person.hiredOn && date < person.hiredOn) || (person.departedOn && date > person.departedOn)) {
      if (date >= range.start) results.set(date, { value: null, explanation: 'Hors période d’emploi' });
      continue;
    } else if (cents !== null) {
      const activeAssignments = latestPlanningSources(assignments.filter((item) => item.startsOn <= date && item.endsOn >= date)
        .map((item) => ({ ...item, priority: 2, sourceId: item.id, status: item.statusLabel })));
      const candidates = latestPlanningSources([
        ...periods.filter((item) => item.startsOn <= date && item.endsOn >= date).map((item) => ({ vesselId: item.vesselId, status: item.sailorStatus, priority: 1, sourceId: item.id })),
        ...activeAssignments,
        ...days.filter((item) => item.workDate === date && (item.sourceLabel !== PLANNING_ASSIGNMENT_NOTE_SOURCE
          || activeAssignments.some((assignment) => item.slot365 === `assignment:${assignment.id}`)))
          .map((item) => ({ vesselId: item.vesselId, status: item.sailorStatus || item.dayStatus, priority: 3, sourceId: item.id })),
        ...leave.filter((item) => item.startsOn <= date && item.endsOn >= date).map((item) => ({ vesselId: null, priority: 4, sourceId: item.id, updatedAt: item.updatedAt,
          status: ({ leave: 'Congés', illness: 'Arrêt Maladie', training: 'Formation', recovery: 'Repos', medical_visit: 'Visite médicale' })[item.absenceType] })),
      ]);
      const priority = Math.max(...candidates.map((item) => item.priority));
      const effective = candidates.filter((item) => item.priority === priority);
      const weights = new Set(effective.map((item) => planningCrewDayCents(item.status)));
      const delta = effective.length ? [...weights][0] : -100;
      if (delta === null || weights.size > 1 || new Set(effective.map((item) => item.vesselId)).size > 1) {
        cents = null;
        explanation = `À préciser depuis le ${formatPlanningDate(date)} : ${effective.map((item) => item.status || 'statut vide').join(' / ')}`;
      } else {
        cents += delta;
        explanation = `${effective[0]?.status || 'Case vide'} : ${formatPlanningCrewBalance(delta / 100)} · solde en fin de journée`;
      }
    }
    if (date >= range.start) results.set(date, { value: cents === null ? null : cents / 100, explanation });
  }
  return results;
}
