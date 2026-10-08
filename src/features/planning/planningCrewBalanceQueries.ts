import type { SupabaseClient } from '@supabase/supabase-js';
import { isPlanningDate } from './planningDates';
import type { PlanningCrewBalanceCheckpoint } from './planningCrewBalance';

export async function fetchPlanningCrewBalances(client: SupabaseClient): Promise<PlanningCrewBalanceCheckpoint[]> {
  const rows: PlanningCrewBalanceCheckpoint[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from('planning_crew_balance_checkpoints')
      .select('id,person_id,as_of,balance').order('id').range(start, start + 499);
    if (error) throw new Error('Impossible de charger les soldes équipage. Réessayez.', { cause: error });
    const page = data || [];
    rows.push(...page.map((row) => ({ personId: Number(row.person_id), asOf: String(row.as_of), balance: Number(row.balance) })));
    if (page.length < 500) return rows;
  }
}

export async function savePlanningCrewBalance(client: SupabaseClient, checkpoint: PlanningCrewBalanceCheckpoint): Promise<void> {
  if (!isPlanningDate(checkpoint.asOf) || !Number.isFinite(checkpoint.balance) || !Number.isSafeInteger(checkpoint.personId)
    || Math.abs(checkpoint.balance) >= 1e8 || Math.abs(checkpoint.balance * 100 - Math.round(checkpoint.balance * 100)) > 1e-6) {
    throw new Error('Renseignez une date et un solde valides, avec deux décimales au maximum.');
  }
  const { error } = await client.rpc('save_planning_crew_balance', { p_person_id: checkpoint.personId, p_as_of: checkpoint.asOf, p_balance: checkpoint.balance });
  if (error) throw new Error('Le solde n’a pas été enregistré. Vérifiez vos droits ou réessayez.', { cause: error });
}
