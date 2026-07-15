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
  const blockedRule = /PLANNING_CONTROL_BLOCKED:\s*([a-z_]+)/i.exec(details.message)?.[1]?.toLowerCase();

  let message = fallbackMessage;
  if (details.message.includes('PLANNING_LOCKED')) {
    message = 'Cette période est verrouillée. Réouvrez-la avec un motif avant de modifier le planning.';
  } else if (details.message.includes('PLANNING_ROTATION_OVERLAP')) {
    message = 'Ce marin possède déjà une affectation sur au moins une occurrence de cette rotation. Modifiez les dates ou choisissez un autre marin.';
  } else if (details.message.includes('PLANNING_ROTATION_INTERNAL_OVERLAP')) {
    message = 'Les occurrences de cette rotation se chevauchent. Vérifiez le rythme et les dates.';
  } else if (blockedRule === 'crew_absence') {
    message = 'Ce marin a une absence validée pendant cette période.';
  } else if (blockedRule === 'crew_unavailability') {
    message = 'Ce marin est indisponible pendant cette période.';
  } else if (blockedRule === 'inactive_person') {
    message = "Ce marin n'est pas actif pendant toute la période sélectionnée.";
  } else if (blockedRule === 'expired_medical' || blockedRule === 'medical_unfit') {
    message = 'La visite médicale de ce marin ne permet pas cette affectation.';
  } else if (blockedRule === 'expired_certificate' || blockedRule === 'expiring_certificate') {
    message = 'Un certificat obligatoire de ce marin est invalide pendant cette période.';
  } else if (blockedRule === 'missing_qualification') {
    message = 'Ce marin ne possède pas toutes les qualifications requises.';
  } else if (blockedRule === 'function_incompatible') {
    message = "La fonction sélectionnée n'est pas compatible avec ce marin.";
  } else if (blockedRule) {
    message = "Un contrôle métier bloque cette affectation. Consultez les contrôles du marin avant de réessayer.";
  } else if (/PLANNING_ROTATION_(INVALID|PATTERN_MISMATCH|UPDATE_INVALID)/.test(details.message)) {
    message = 'Le rythme ou les dates de la rotation sont invalides.';
  } else if (details.code === '42501' || /row-level security|permission denied/i.test(details.message)) {
    message = "Vous n'avez pas l'autorisation d'effectuer cette opération.";
  } else if (details.code === '23503') {
    message = "Le navire ou le marin sélectionné n'existe plus. Actualisez le planning puis réessayez.";
  } else if (details.code === '23514' || details.code === '22007' || details.code === '22023') {
    message = 'Les données ou les dates saisies ne respectent pas les règles du planning.';
  } else if (details.code === '23505') {
    message = 'Un enregistrement équivalent existe déjà dans le planning.';
  } else if (/failed to fetch|networkerror|fetch failed/i.test(details.message)) {
    message = 'La connexion au service Planning a été interrompue. Vérifiez votre réseau puis réessayez.';
  }

  throw new PlanningDataError(operation, details.code, message, error);
}

export function planningErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
