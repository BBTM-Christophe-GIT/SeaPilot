import type { SupabaseClient } from '@supabase/supabase-js';
import { isSeaPilotPreviewDeployment } from '../preview/previewMode';
import { isShomChart, type ShomChartLookup } from './seaOperationHydroModel';
import { sameSeaOperationTransitContext, type SeaOperationTransitRequestContext } from './seaOperationWeatherModel';

export interface SeaOperationChartInput { projectId: string; transit?: SeaOperationTransitRequestContext; pointId: string; latitude: number; longitude: number }
export interface SeaOperationPointCharts extends ShomChartLookup, SeaOperationChartInput {}
const messages: Record<string, string> = {
  CHARTS_AUTHENTICATION_REQUIRED: 'Reconnectez-vous pour rechercher les cartes.',
  CHARTS_ACCESS_DENIED: 'Vous n’avez pas accès aux cartes de ce projet.',
  CHARTS_RATE_LIMIT: 'Trop de recherches de cartes. Réessayez dans une minute.',
  CHARTS_BUSY: 'Le catalogue est occupé. Réessayez dans un instant.',
};

export async function fetchSeaOperationPointCharts(client: SupabaseClient, input: SeaOperationChartInput,
  options: { signal?: AbortSignal; preview?: boolean } = {}): Promise<SeaOperationPointCharts> {
  options.signal?.throwIfAborted();
  if (options.preview && !isSeaPilotPreviewDeployment()) throw new Error('La démonstration est réservée à la préversion.');
  let actorId: string | undefined;
  let jwt: string | undefined;
  if (!options.preview) {
    const session = await client.auth.getSession();
    actorId = session.data.session?.user.id;
    jwt = session.data.session?.access_token;
    if (session.error || !jwt || !actorId) throw new Error(messages.CHARTS_AUTHENTICATION_REQUIRED);
  }
  const response = await fetch(`/api/sea-operation-charts${options.preview ? '?preview=1' : ''}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: options.signal });
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; }
  catch { throw new Error('Le catalogue SHOM est temporairement indisponible. Réessayez.'); }
  if (!response.ok) throw new Error(messages[String(data?.error)] || 'Le catalogue SHOM est temporairement indisponible. Réessayez.');
  if (!options.preview) {
    const session = await client.auth.getSession();
    if (session.error || session.data.session?.user.id !== actorId) throw new Error(messages.CHARTS_AUTHENTICATION_REQUIRED);
  }
  if (data.pointId !== input.pointId || data.projectId !== input.projectId || data.latitude !== input.latitude || data.longitude !== input.longitude
    || !sameSeaOperationTransitContext(data.transit, input.transit)
    || !Array.isArray(data.charts) || data.charts.length > 400 || !data.charts.every(isShomChart)
    || typeof data.truncated !== 'boolean' || typeof data.fetchedAt !== 'string' || !Number.isFinite(Date.parse(data.fetchedAt))
    || data.sourceUrl !== 'https://services.data.shom.fr/INSPIRE/wfs') throw new Error('La réponse du catalogue ne correspond pas au point demandé.');
  return data as unknown as SeaOperationPointCharts;
}
