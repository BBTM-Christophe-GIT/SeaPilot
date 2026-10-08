import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanningCrewEvent } from './planningModel';
import { planningEventFunctionOnDate } from './planningFunctions';
import { comparePlanningRevision } from './planningSourcePriority';

function functionKey(value: string): string {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ({
    CHEFMECANICIENNE: 'CHEFMECANICIEN',
    SECONDCAPITAINE: '2NDCAPITAINE',
    '2EMECAPITAINE': '2NDCAPITAINE',
    SECONDMECANICIEN: '2NDMECANICIEN',
    '2EMEMECANICIEN': '2NDMECANICIEN',
    BOSCO: 'MAITREDEQUIPAGE',
    MATELOTPOLYVALENTPONTMACHINE: 'MATELOTPOLYVALENT',
    MATELOTQUALIFIEPONT: 'MATELOTQUALIFIE',
  } as Record<string, string>)[key] || key;
}

export function normalizePlanningFleetFunctionOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) return [];
    const label = entry.trim();
    const key = functionKey(label);
    if (seen.has(key)) return [];
    seen.add(key);
    return [label];
  });
}

// Unlisted functions share the final rank; the existing planning comparator
// supplies the stable posting/function/name order inside that group.
export function comparePlanningFleetFunctions(left: string, right: string, functionOrder: readonly string[]): number {
  const rank = (label: string) => {
    const index = functionOrder.findIndex((entry) => functionKey(entry) === functionKey(label));
    return index < 0 ? functionOrder.length : index;
  };
  return rank(left) - rank(right);
}

export function planningFleetEffectiveFunction(events: readonly PlanningCrewEvent[], referenceDate: string, hrFunction: string): string {
  const activeEvents = events.filter((event) => event.kind !== 'annualReview'
    && event.confirmationStatus !== 'cancelled' && event.startsOn <= referenceDate && event.endsOn >= referenceDate)
    .sort((left, right) => comparePlanningRevision(
      { ...right, sourceId: right.assignmentId }, { ...left, sourceId: left.assignmentId },
    ) || left.id.localeCompare(right.id));
  const event = activeEvents.find((candidate) => candidate.kind === 'assignment' || candidate.assignmentId !== undefined)
    || activeEvents.find((candidate) => candidate.kind === 'day') || activeEvents[0];
  if (event) {
    const label = planningEventFunctionOnDate(event, referenceDate).trim();
    // Imported planning events can contain departments instead of functions.
    if (label && (event.dailyFunctionLabels?.[referenceDate]?.trim()
      || !['PONT', 'MACHINE', 'EQUIPAGE', 'CREW'].includes(functionKey(label)))) return label;
  }
  return hrFunction;
}

export async function fetchPlanningFleetOrder(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('planning_fleet_display_settings').select('function_order').maybeSingle();
  if (error) throw new Error('Impossible de charger l’ordre des fonctions de la vue Flotte.');
  return normalizePlanningFleetFunctionOrder(data?.function_order);
}

export async function savePlanningFleetOrder(client: SupabaseClient, functionOrder: readonly string[]): Promise<string[]> {
  const order = normalizePlanningFleetFunctionOrder(functionOrder);
  const { data, error } = await client.rpc('save_planning_fleet_display_settings', { p_function_order: order });
  if (error) throw new Error('Impossible d’enregistrer l’ordre des fonctions de la vue Flotte.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Array.isArray(row.function_order)) throw new Error('L’ordre des fonctions enregistré n’a pas été renvoyé.');
  return normalizePlanningFleetFunctionOrder(row.function_order);
}
