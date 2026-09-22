export const EXERCISE_MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
export const EXERCISE_FOOTER = 'REP 08-A - Verifiez la liste de diffusion pour vous assurer d avoir toujours la derniere version de ce formulaire.';
export interface ExercisePerson { id: number; name: string; current: boolean; former: boolean }
export interface ExerciseVessel { id: number; name: string; iconUrl: string | null }
export interface ExerciseRoster { scope: 'fleet' | 'watch' | 'self'; people: ExercisePerson[]; vessels: ExerciseVessel[] }
export interface ExerciseCount { exercise_key: string; exercise_name: string; month: number; count: number }
export interface ExerciseReportData { person: ExercisePerson | null; vessel: ExerciseVessel | null; year: number; counts: ExerciseCount[] }
export interface ExerciseRow { key: string; name: string; months: number[]; total: number; priority: boolean }
export interface ExerciseReport { person: ExercisePerson | null; vessel: ExerciseVessel | null; year: number; rows: ExerciseRow[]; months: number[]; total: number }

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ]/g, "'").toLowerCase().trim();
function priority(name: string) {
  const index = ["protection contre l'incendie", 'evacuation et abandon du navire'].indexOf(normalized(name));
  return index < 0 ? 2 : index;
}
export function buildExerciseReport(data: ExerciseReportData): ExerciseReport {
  const grouped = new Map<string, ExerciseRow>();
  for (const item of data.counts) {
    if (!Number.isInteger(item.month) || item.month < 1 || item.month > 12 || !Number.isInteger(item.count) || item.count < 0) {
      throw new Error('Les données des exercices sont invalides. Actualisez le registre.');
    }
    const row = grouped.get(item.exercise_key) || { key: item.exercise_key, name: item.exercise_name, months: Array<number>(12).fill(0), total: 0, priority: priority(item.exercise_name) < 2 };
    row.months[item.month - 1] += item.count;
    row.total += item.count;
    grouped.set(item.exercise_key, row);
  }
  const rows = [...grouped.values()].sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name, 'fr'));
  const months = EXERCISE_MONTHS.map((_, i) => rows.reduce((sum, row) => sum + row.months[i], 0));
  return { person: data.person, vessel: data.vessel, year: data.year, rows, months, total: months.reduce((sum, n) => sum + n, 0) };
}
export function exerciseFilename(name: string, year: number): string {
  return `Exercices-Urgence-${name}-${year}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '.pdf';
}
