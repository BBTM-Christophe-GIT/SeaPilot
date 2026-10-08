import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanningCrewEvent } from './planningModel';
import { assertPlanningDateRange } from './planningValidation';
import { throwPlanningDataError } from './planningErrors';

export interface GenericCrewPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  status: string;
  comments: string;
}

export interface GenericCrewRow {
  id: number;
  vesselId: number;
  watchGroup: string;
  functionLabel: string;
  revision: number;
  periods: GenericCrewPeriod[];
}

export interface GenericCrewRowData {
  id: number; vessel_id: number; watch_group: string; function_label: string;
  revision: number; periods: GenericCrewPeriod[];
}

function mapRow(row: GenericCrewRowData): GenericCrewRow {
  return { id: row.id, vesselId: row.vessel_id, watchGroup: row.watch_group,
    functionLabel: row.function_label, revision: row.revision, periods: row.periods };
}

export async function fetchGenericCrewRows(client: SupabaseClient): Promise<GenericCrewRow[]> {
  const rows: GenericCrewRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from('planning_generic_crew_rows')
      .select('id,vessel_id,watch_group,function_label,revision,periods').order('id').range(offset, offset + 999);
    if (error) throwPlanningDataError('read-generic-crew', 'Impossible de charger les postes fictifs.', error);
    rows.push(...((data || []) as GenericCrewRowData[]).map(mapRow));
    if (!data || data.length < 1000) return rows;
  }
}

function genericError(error: { code?: string; message?: string }): never {
  if (['40001', 'P0002', '22023', '23505'].includes(error.code || '') && error.message) throw new Error(error.message);
  throwPlanningDataError('save-generic-crew', 'Impossible d’enregistrer le poste fictif.', error);
}

export async function saveGenericCrewRow(client: SupabaseClient,
  input: Pick<GenericCrewRow, 'vesselId' | 'watchGroup' | 'functionLabel'> & Partial<Pick<GenericCrewRow, 'id' | 'revision' | 'periods'>>,
): Promise<GenericCrewRow> {
  const periods = input.periods || [];
  for (const period of periods) assertPlanningDateRange(period.startsOn, period.endsOn);
  const { data, error } = await client.rpc('planning_save_generic_crew_row', {
    p_vessel_id: input.vesselId, p_watch_group: input.watchGroup, p_function_label: input.functionLabel,
    p_row_id: input.id ?? null, p_expected_revision: input.revision ?? null, p_periods: periods,
  });
  if (error) genericError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('Le poste fictif n’a pas été confirmé par le serveur.');
  return mapRow(row);
}

export async function resolveGenericCrewRow(client: SupabaseClient, row: GenericCrewRow, personId?: number, referenceMonth?: string): Promise<number | null> {
  const { data, error } = await client.rpc('planning_resolve_generic_crew_row', {
    p_row_id: row.id, p_expected_revision: row.revision, p_person_id: personId ?? null, p_reference_month: referenceMonth ?? null,
  });
  if (error) genericError(error);
  if (personId && typeof data !== 'number') throw new Error('Le remplacement n’a pas été confirmé par le serveur.');
  return data;
}

export function genericCrewEvents(row: GenericCrewRow, vessel: string): PlanningCrewEvent[] {
  return row.periods.map((period) => ({
    id: `generic-${row.id}-${period.id}`, kind: 'period', personId: null, vesselId: row.vesselId,
    person: row.functionLabel, vessel, board: row.watchGroup, functionLabel: row.functionLabel,
    status: period.status, confirmationStatus: 'provisional', responsible: '', rhythm: '',
    startsOn: period.startsOn, endsOn: period.endsOn, startsAt: '', endsAt: '', comments: period.comments,
    sourceLabel: 'generic-crew',
  }));
}
