import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets, normalizeFleetName } from '../fleet/fleetDisplay';
import { buildExerciseReport, type ExerciseReportData, type ExerciseRoster } from './emergencyExercisesModel';

export async function fetchExerciseRoster(client: SupabaseClient): Promise<ExerciseRoster> {
  const { data, error } = await client.rpc('emergency_exercises_people');
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.vessels) || !['fleet', 'watch', 'self'].includes(data.scope)) throw new Error('Le registre est indisponible.');
  const roster = data as ExerciseRoster;
  const names = new Set<string>();
  const vessels = [...roster.vessels].sort((a, b) => a.id - b.id).filter((vessel) => {
    const name = normalizeFleetName(vessel.name);
    if (names.has(name)) return false;
    names.add(name);
    return true;
  });
  return { ...roster, vessels: vessels.sort(compareFleetAssets) };
}
export async function fetchExerciseReport(client: SupabaseClient, personId: number | null, year: number, vesselId: number | null, population: string) {
  const { data, error } = await client.rpc('emergency_exercises_report', { target_person_id: personId, target_year: year, target_vessel_id: vesselId, target_population: population });
  if (error) throw new Error(error.message);
  if (!data || !Array.isArray(data.counts) || (data.person?.id ?? null) !== personId || (data.vessel?.id ?? null) !== vesselId || data.year !== year) throw new Error('Le carnet reçu ne correspond pas à votre sélection.');
  return buildExerciseReport(data as ExerciseReportData);
}
