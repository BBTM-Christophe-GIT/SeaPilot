import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaPilotPreviewDeployment } from '../preview/previewMode';
import { isSeaOperationWaypointWeather, loadSeaOperationForecast, seaOperationEtaUtc, validateSeaOperationWeatherInput, type SeaOperationWeatherInput, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';
export type { SeaOperationWeatherInput, SeaOperationWaypointWeather, SeaOperationTransitRequestContext } from './seaOperationWeatherModel';

const messages: Record<string, string> = {
  WEATHER_NOT_CONFIGURED: 'Le service météo n’est pas encore activé. Contactez l’Armement.',
  WEATHER_ACCESS_DENIED: 'Vous n’avez pas accès à la météo de ce projet.',
  WEATHER_AUTHENTICATION_REQUIRED: 'Reconnectez-vous pour consulter la météo.',
  WEATHER_RATE_LIMIT: 'Trop de demandes météo. Réessayez dans une minute.',
  WEATHER_BUSY: 'Le service météo est occupé. Réessayez dans un instant.',
};

export async function fetchSeaOperationWaypointWeather(client: SupabaseClient, input: SeaOperationWeatherInput,
  options: { signal?: AbortSignal; preview?: boolean } = {}): Promise<SeaOperationWaypointWeather> {
  const point = validateSeaOperationWeatherInput(input);
  options.signal?.throwIfAborted();
  if (options.preview) {
    if (!isSeaPilotPreviewDeployment()) throw new Error('L’API publique de démonstration est réservée à la préversion.');
    // Vite does not serve server functions; keep its explicitly local evaluation separate.
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return loadSeaOperationForecast(point, { signal: options.signal });
  }
  let actorId: string | undefined;
  let jwt: string | undefined;
  if (!options.preview) {
    const session = await client.auth.getSession();
    actorId = session.data.session?.user.id;
    jwt = session.data.session?.access_token;
    if (session.error || !jwt || !actorId) throw new Error(messages.WEATHER_AUTHENTICATION_REQUIRED);
  }
  const response = await fetch(`/api/sea-operation-weather${options.preview ? '?preview=1' : ''}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(point), signal: options.signal });
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new Error('Le service météo est temporairement indisponible. Réessayez.'); }
  if (!response.ok) throw new Error(messages[String(data?.error)] || 'La météo du point est indisponible. Réessayez.');
  if (!options.preview) {
    const current = await client.auth.getSession();
    if (current.error || current.data.session?.user.id !== actorId) throw new Error(messages.WEATHER_AUTHENTICATION_REQUIRED);
  }
  if (!isSeaOperationWaypointWeather(data) || data.pointId !== point.pointId || data.latitude !== point.latitude || data.longitude !== point.longitude
    || data.etaUtc !== seaOperationEtaUtc(point.eta)) {
    throw new Error('La réponse météo ne correspond pas au point demandé.');
  }
  return data;
}
