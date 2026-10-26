import type { SupabaseClient } from '@supabase/supabase-js';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SeaOperationPayload } from './seaOperationModel';
import type { SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { isVesselDraftMeters } from './seaOperationUkc';
import { fetchSeaOperationWaypointUkc } from './seaOperationUkcQueries';
import { seaOperationUkcReference, waypointUkcSnapshot, type SeaOperationUkcCaptureContext } from './seaOperationWaypointSnapshots';
import { ukcRequestKey, type SeaOperationUkcRequestStatus } from './seaOperationValidationUkc';
import './seaOperationUkcEditor.css';

interface Props {
  client: SupabaseClient; payload: SeaOperationPayload; active: boolean; readOnly?: boolean; preview?: boolean;
  onUkcLoaded?: (capture: SeaOperationCopernicusEstimate, context: SeaOperationUkcCaptureContext, sourceClient: SupabaseClient) => void;
  onStatusChange?: (statuses: Record<string, SeaOperationUkcRequestStatus>, sourceClient: SupabaseClient) => void;
}

/** Kept mounted across wizard steps; results never mutate a signed or read-only record. */
export function SeaOperationUkcPanel({ client, payload, active, readOnly = false, preview = false, onUkcLoaded, onStatusChange }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ client: SupabaseClient; key: string; loading: boolean } | null>(null);
  const latest = useRef({ client, payload, onUkcLoaded, onStatusChange }); latest.current = { client, payload, onUkcLoaded, onStatusChange };
  const lastRefresh = useRef(0);
  const reference = seaOperationUkcReference(payload);
  const inputKey = JSON.stringify({ ...reference, points: payload.waypoints.map(({ id, latitude, longitude, eta, ukcMode }) => ({ id, latitude, longitude, eta, ukcMode })) });
  const loading = state?.client === client && state.key === inputKey && state.loading;
  useEffect(() => {
    if (!active || readOnly || preview) return;
    const input = JSON.parse(inputKey) as typeof reference & { points: SeaOperationPayload['waypoints'] };
    const controller = new AbortController(); let cancelled = false;
    const refreshing = lastRefresh.current !== refresh; lastRefresh.current = refresh;
    const statuses: Record<string, SeaOperationUkcRequestStatus> = {};
    const pending = input.points.flatMap(point => {
      if (point.ukcMode !== 'automatic') return [];
      const key = ukcRequestKey(input, point);
      if (!input.projectId) { statuses[key] = { loading: false, error: 'Sélectionnez un projet du planning pour calculer l’UKC.' }; return []; }
      if (!input.vesselId || !isVesselDraftMeters(input.draftMeters)) { statuses[key] = { loading: false, error: 'Renseignez le tirant d’eau du navire dans Navires.' }; return []; }
      const position = seaWaypointPosition(point);
      if (!position) { statuses[key] = { loading: false, error: 'Renseignez la latitude et la longitude.' }; return []; }
      const existing = latest.current.payload.waypoints.find(candidate => candidate.id === point.id);
      if (!refreshing && existing && waypointUkcSnapshot(existing, input)?.status === 'available') { statuses[key] = { loading: false }; return []; }
      try {
        if (Date.parse(seaOperationEtaUtc(point.eta)) <= Date.now()) { statuses[key] = { loading: false, error: 'L’ETA est passée : les captures enregistrées restent conservées.' }; return []; }
      } catch (error) { statuses[key] = { loading: false, error: error instanceof Error ? error.message : 'Renseignez une ETA complète.' }; return []; }
      statuses[key] = { loading: true };
      return [{ key, input: { projectId: input.projectId, vesselId: input.vesselId, draftMeters: input.draftMeters, pointId: point.id, ...position, eta: point.eta },
        context: { projectId: input.projectId, vesselId: input.vesselId, draftMeters: input.draftMeters, pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta } }];
    });
    const publish = (running: boolean) => {
      if (cancelled || latest.current.client !== client) return;
      setState({ client, key: inputKey, loading: running }); latest.current.onStatusChange?.({ ...statuses }, client);
    };
    const timer = window.setTimeout(() => {
      publish(pending.length > 0); let next = 0;
      const worker = async () => {
        while (!cancelled && next < pending.length) {
          const entry = pending[next++];
          try {
            const forecast = await fetchSeaOperationWaypointUkc(client, entry.input, { signal: controller.signal });
            if (!cancelled && latest.current.client === client) {
              latest.current.onUkcLoaded?.(forecast, entry.context, client); statuses[entry.key] = { loading: false };
            }
          } catch (error) {
            if (!cancelled) statuses[entry.key] = { loading: false, error: error instanceof Error ? error.message : 'Le calcul UKC est indisponible. Réessayez.' };
          }
          publish(true);
        }
      };
      void Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker)).finally(() => publish(false));
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [active, client, inputKey, preview, readOnly, refresh]);

  if (!payload.waypoints.some(point => point.ukcMode === 'automatic')) return null;
  return <section className="so-ukc-panel" aria-label="Calcul UKC du Passage Plan">
    <div><strong>UKC indicative à l’ETA</strong>{!readOnly && <button type="button" className="sp-button sp-button--secondary" disabled={!active || preview || loading}
      onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />Actualiser l’UKC</button>}</div>
    <p className="so-help">{readOnly ? 'Estimations conservées avec cette version de la fiche.' : preview ? 'Le calcul Copernicus nécessite un compte SeaPilot connecté.' : 'NWS et IBI : profondeur et niveau d’eau du même modèle. L’estimation reste à valider par le Capitaine ; l’incertitude totale n’est pas quantifiée.'}</p>
  </section>;
}
