import type { SupabaseClient } from '@supabase/supabase-js';
import { fleetIllustration } from '../fleet/fleetDisplay';
import type { ExerciseCount, ExerciseRoster } from './emergencyExercisesModel';

// Demonstration only. Role verification uses authenticated database fixtures.
export function createExercisePreviewClient(): SupabaseClient {
  const roster: ExerciseRoster = {
    scope: 'fleet',
    people: [{ id: 1, name: 'Alex MARTIN', current: true, former: false }, { id: 2, name: 'Camille DURAND', current: false, former: true }],
    vessels: ['LE ROZEL', 'SUROIT', 'GOURY', 'LANDEMER', 'KROKDUR', 'HIRONDELLE DE LA MANCHE', 'HOLENN EUSA', 'BBTM TENDER 1']
      .map((name, index) => ({ id: index + 1, name, iconUrl: fleetIllustration({ name }) || null })),
  };
  const names = ["Protection contre l'incendie", 'Évacuation et abandon du navire', 'ANTIPOLLUTION', 'Sauvetage en mer'];
  return { rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'emergency_exercises_people') return { data: roster, error: null };
    const counts: ExerciseCount[] = names.flatMap((label, i) => [1, 3, 5, 7, 8].map((month) => ({
      exercise_key: String(i), exercise_name: label, month, count: args.target_vessel_id ? 1 : i % 2 + 1,
    })));
    return { data: { person: roster.people.find((p) => p.id === args.target_person_id) || null,
      vessel: roster.vessels.find((v) => v.id === args.target_vessel_id) || null,
      year: args.target_year, counts: args.target_year === new Date().getFullYear() ? counts : [] }, error: null };
  } } as unknown as SupabaseClient;
}
