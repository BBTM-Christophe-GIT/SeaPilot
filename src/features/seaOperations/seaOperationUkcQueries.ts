import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaOperationCopernicusEstimate, validateSeaOperationCopernicusInput, type SeaOperationCopernicusEstimate,
  type SeaOperationCopernicusInput } from './seaOperationCopernicusModel';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';

const messages: Record<string, string> = {
  UKC_NOT_CONFIGURED: 'La connexion Copernicus Marine n’est pas encore configurée. Contactez l’Armement.',
  UKC_ACCESS_DENIED: 'Vous n’avez pas accès au calcul UKC de ce projet et de ce navire.',
  UKC_AUTHENTICATION_REQUIRED: 'Reconnectez-vous pour consulter l’UKC.',
  UKC_RATE_LIMIT: 'Trop de demandes UKC. Réessayez dans une minute.',
  UKC_BUSY: 'Le calcul UKC est occupé. Réessayez dans un instant.',
  UKC_DRAFT_CHANGED: 'Le tirant d’eau du navire a changé. Rechargez la fiche avant de recalculer l’UKC.',
  UKC_DRAFT_REQUIRED: 'Renseignez le tirant d’eau du navire dans Navires avant de calculer l’UKC.',
  UKC_AUTH_NOT_CONFIGURED: 'Le service UKC SeaPilot n’est pas encore configuré. Contactez l’Armement.',
  UKC_SERVICE_UNAVAILABLE: 'Les données Copernicus sont temporairement indisponibles. Réessayez.',
  UKC_INVALID_REQUEST: 'Vérifiez le projet, le navire, les coordonnées et l’ETA du waypoint.',
};

/** Credentials stay on the server; the browser sends only its existing SeaPilot session and waypoint. */
export async function fetchSeaOperationWaypointUkc(client: SupabaseClient, input: SeaOperationCopernicusInput,
  options: { signal?: AbortSignal } = {}): Promise<SeaOperationCopernicusEstimate> {
  const point = validateSeaOperationCopernicusInput(input);
  options.signal?.throwIfAborted();
  const session = await client.auth.getSession();
  const actorId = session.data.session?.user.id, jwt = session.data.session?.access_token;
  if (session.error || !jwt || !actorId) throw new Error(messages.UKC_AUTHENTICATION_REQUIRED);
  const response = await fetch('/api/sea-operation-ukc', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(point), signal: options.signal });
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new Error('Le calcul UKC est temporairement indisponible. Réessayez.'); }
  if (!response.ok) throw new Error(messages[String(data?.error)] || 'Le calcul UKC est indisponible. Réessayez.');
  const current = await client.auth.getSession();
  if (current.error || current.data.session?.user.id !== actorId) throw new Error(messages.UKC_AUTHENTICATION_REQUIRED);
  if (!isSeaOperationCopernicusEstimate(data) || data.projectId !== point.projectId || data.pointId !== point.pointId
    || data.vesselId !== point.vesselId || data.draftMeters !== point.draftMeters
    || data.latitude !== point.latitude || data.longitude !== point.longitude || Date.parse(data.etaUtc) !== Date.parse(seaOperationEtaUtc(point.eta))) {
    throw new Error('La réponse UKC ne correspond pas au waypoint, au navire ou au tirant d’eau demandé.');
  }
  return data;
}
