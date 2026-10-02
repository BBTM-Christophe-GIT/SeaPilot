import type { SupabaseClient } from '@supabase/supabase-js';
import { planningDateFromTimestamp } from './planningDates';
import { validatePlanningLeaveCounterPeriod, validatePlanningLeaveRightsPeriod, type PlanningAbsenceBalanceContext, type PlanningLeaveCounterPeriodDraft, type PlanningLeaveRightsPeriodDraft } from './planningAbsenceBalance';
import type { PlanningAbsenceRecord, PlanningAbsenceType } from './planningP12';
import { mapPlanningAssignmentOverviewRows, mapPlanningDayRows, mapPlanningPeriodRows } from './planningQueries';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Les informations de solde sont incomplètes. Réessayez.');
  return value as Record<string, unknown>;
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Les informations de solde sont incomplètes. Réessayez.');
  return value;
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function number(value: unknown): number {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) throw new Error('Les informations de solde sont incomplètes. Réessayez.');
  return Number(value);
}
function absence(value: unknown, personId: number): PlanningAbsenceRecord {
  const row = object(value);
  const type = row.absence_type === 'unavailability' ? 'leave' : row.absence_type;
  if (!['leave', 'rtt', 'illness', 'training', 'medical_visit', 'recovery'].includes(String(type))
    || !['requested', 'approved', 'rejected', 'cancelled'].includes(String(row.status))) throw new Error('Les informations de solde sont incomplètes. Réessayez.');
  const startsAt = text(row.starts_at);
  const endsAt = text(row.ends_at);
  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error('Les dates des absences sont invalides.');
  return { id: number(row.id), personId, absenceType: type as PlanningAbsenceType, startsAt, endsAt,
    startsOn: planningDateFromTimestamp(startsAt), endsOn: planningDateFromTimestamp(new Date(Date.parse(endsAt) - 1).toISOString()),
    status: row.status as PlanningAbsenceRecord['status'], updatedAt: text(row.updated_at), reason: '', requestedBy: '', reviewedBy: '', reviewedAt: '', reviewComment: '', createdAt: '' };
}

export async function fetchPlanningAbsenceBalanceContext(client: SupabaseClient, personId: number): Promise<PlanningAbsenceBalanceContext> {
  if (!Number.isSafeInteger(personId) || personId <= 0) throw new Error('Choisissez une personne pour afficher son solde.');
  const { data, error } = await client.rpc('get_planning_absence_balance_context', { p_person_id: personId });
  if (error) throw new Error(error.code === '42501' ? 'Votre profil ne peut pas consulter ce solde.' : 'Impossible de charger le solde. Réessayez.', { cause: error });
  const result = object(data);
  const person = object(result.person);
  if (number(person.id) !== personId || !['leave_rtt', 'crew'].includes(String(result.kind))) throw new Error('Le solde reçu ne correspond pas à la personne sélectionnée.');
  const sources = object(result.crew_sources);
  return {
    kind: result.kind as PlanningAbsenceBalanceContext['kind'],
    person: { id: personId, firstName: text(person.first_name), lastName: text(person.last_name), hiredOn: text(person.hired_on), departedOn: text(person.departed_on), active: person.active === true,
      functionLabel: '', gradeLabel: '', roleLabel: '', contractType: '' },
    counterPeriods: rows(result.counter_periods).map((item) => {
      const row = object(item);
      const draft = validatePlanningLeaveCounterPeriod({ personId, counterType: row.counter_type as PlanningLeaveCounterPeriodDraft['counterType'], startsOn: text(row.starts_on), endsOn: text(row.ends_on), entitlement: number(row.entitlement) });
      return { id: number(row.id), counterType: draft.counterType, startsOn: draft.startsOn, endsOn: draft.endsOn, entitlement: draft.entitlement };
    }),
    absences: rows(result.absences).map((item) => absence(item, personId)),
    crewCheckpoints: rows(result.crew_checkpoints).map((item) => { const row = object(item); if (number(row.person_id) !== personId) throw new Error('Le solde reçu ne correspond pas à la personne sélectionnée.'); return { personId, asOf: text(row.as_of), balance: number(row.balance) }; }),
    crewSources: {
      assignments: mapPlanningAssignmentOverviewRows(rows(sources.assignments) as Parameters<typeof mapPlanningAssignmentOverviewRows>[0]),
      periods: mapPlanningPeriodRows(rows(sources.periods) as Parameters<typeof mapPlanningPeriodRows>[0]),
      days: mapPlanningDayRows(rows(sources.days) as Parameters<typeof mapPlanningDayRows>[0]),
    },
  };
}

export async function savePlanningLeaveCounterPeriod(client: SupabaseClient, draft: PlanningLeaveCounterPeriodDraft): Promise<void> {
  const value = validatePlanningLeaveCounterPeriod(draft);
  const { error } = await client.rpc('save_planning_leave_counter_period', {
    p_person_id: value.personId, p_counter_type: value.counterType, p_starts_on: value.startsOn, p_ends_on: value.endsOn, p_entitlement: value.entitlement,
  });
  if (error) throw new Error(error.code === '23P01' ? 'Cette période chevauche une période de droits déjà enregistrée pour ce compteur.'
    : error.code === '42501' ? 'Votre profil ne peut pas modifier ces droits.' : 'Les droits n’ont pas été enregistrés. Réessayez.', { cause: error });
}

export async function savePlanningLeaveRightsPeriod(client: SupabaseClient, draft: PlanningLeaveRightsPeriodDraft): Promise<void> {
  const value = validatePlanningLeaveRightsPeriod(draft);
  const { error } = await client.rpc('save_planning_leave_rights_period', {
    p_person_id: value.personId, p_starts_on: value.startsOn, p_ends_on: value.endsOn,
    p_leave_entitlement: value.leaveEntitlement, p_rtt_entitlement: value.rttEntitlement,
  });
  if (error) throw new Error(error.code === '23P01' ? 'Cette période chevauche des droits déjà enregistrés. Ajustez la période existante.'
    : error.code === '42501' ? 'Votre profil ne peut pas modifier ces droits.'
      : error.code === '22023' ? 'Renseignez les droits Congés et RTT du 1er juin au 31 mai de l’année suivante.'
        : 'Les droits n’ont pas été enregistrés. Réessayez.', { cause: error });
}
