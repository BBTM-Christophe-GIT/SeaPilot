import { isPlanningDate } from './planningDates';

export function planningEntityId(value: string | number | null | undefined, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} est obligatoire et doit référencer une donnée existante.`);
  }
  return parsed;
}

export function optionalPlanningEntityId(value: string | number | null | undefined, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  return planningEntityId(value, label);
}

export function requiredPlanningText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim() || '';
  if (!normalized) throw new Error(`${label} est obligatoire.`);
  return normalized;
}

export function assertPlanningDateRange(startsOn: string, endsOn: string): void {
  if (!startsOn || !endsOn) throw new Error('Les dates de début et de fin sont obligatoires.');
  if (!isPlanningDate(startsOn) || !isPlanningDate(endsOn)) {
    throw new Error('Les dates doivent être valides et utiliser le format YYYY-MM-DD.');
  }
  if (endsOn < startsOn) throw new Error('La date de fin doit être postérieure ou égale à la date de début.');
}

export function assertSinglePlanningDay(startsOn: string, endsOn: string): void {
  assertPlanningDateRange(startsOn, endsOn);
  if (startsOn !== endsOn) {
    throw new Error('Une journée isolée ne peut pas être étendue. Créez une affectation pour une période.');
  }
}
