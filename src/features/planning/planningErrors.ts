interface SupabaseErrorLike {
  code?: unknown;
  message?: unknown;
}

export class PlanningDataError extends Error {
  readonly code: string;
  readonly operation: string;

  constructor(operation: string, code: string, message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'PlanningDataError';
    this.operation = operation;
    this.code = code;
  }
}

function errorDetails(error: unknown): { code: string; message: string } {
  const candidate = typeof error === 'object' && error !== null ? error as SupabaseErrorLike : {};
  return {
    code: typeof candidate.code === 'string' ? candidate.code : '',
    message: typeof candidate.message === 'string' ? candidate.message : String(error || ''),
  };
}

export function reportPlanningTechnicalError(operation: string, error: unknown, level: 'error' | 'warning' = 'error'): void {
  const details = errorDetails(error);
  const payload = { module: 'planning', operation, code: details.code || 'unknown', message: details.message || 'Erreur inconnue' };
  if (level === 'warning') console.warn('[Planning]', payload);
  else console.error('[Planning]', payload);
}

export function throwPlanningDataError(operation: string, fallbackMessage: string, error: unknown): never {
  const details = errorDetails(error);
  reportPlanningTechnicalError(operation, error);

  let message = fallbackMessage;
  if (details.message.includes('PLANNING_LOCKED')) {
    message = 'Cette période est verrouillée. Réouvrez-la avec un motif avant de modifier le planning.';
  } else if (details.code === '42501' || /row-level security|permission denied/i.test(details.message)) {
    message = "Vous n'avez pas l'autorisation d'effectuer cette opération.";
  } else if (details.code === '23503') {
    message = "Le navire ou le marin sélectionné n'existe plus. Actualisez le planning puis réessayez.";
  } else if (details.code === '23514' || details.code === '22007') {
    message = 'Les données ou les dates saisies ne respectent pas les règles du planning.';
  } else if (details.code === '23505') {
    message = 'Un enregistrement équivalent existe déjà dans le planning.';
  }

  throw new PlanningDataError(operation, details.code, message, error);
}

export function planningErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
