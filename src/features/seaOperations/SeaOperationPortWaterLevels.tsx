import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSeaPosition } from './seaOperationCoordinates';
import { resolveSeaOperationMapPorts } from './seaOperationMapPlaces';
import type { SeaOperationPayload } from './seaOperationModel';
import { isPortWaterLevel, PORT_WATER_LEVEL_ROLES, PORT_WATER_LEVEL_SOURCES, portWaterLevelDistanceKm, portWaterLevelInput, portWaterLevelText,
  retainedPortWaterLevel, type PortWaterLevelRole, type PortWaterLevelSnapshot } from './seaOperationPortWaterLevel';

const roles = { departure: 'Départ', arrival: 'Arrivée' };
const distance = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const localTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

function portRequests(departurePort: string, arrivalPort: string, etd: string, eta: string) {
  const references = resolveSeaOperationMapPorts(departurePort, arrivalPort);
  const vessel = { departurePort, arrivalPort, etd, eta };
  return PORT_WATER_LEVEL_ROLES.map(role => {
    const port = references.ports.find(item => item.roles.includes(role));
    const time = portWaterLevelInput(vessel, role);
    return { role, ...time, portKey: port?.key, location: port?.location };
  });
}

export function SeaOperationPortWaterLevels({ client, payload, active, disabled, onCapture }: {
  client: SupabaseClient;
  payload: SeaOperationPayload;
  active: boolean;
  disabled: boolean;
  onCapture: (role: PortWaterLevelRole, level: PortWaterLevelSnapshot, sourceClient: SupabaseClient) => void;
}) {
  const { vessel, planning, transit } = payload;
  const { departurePort, arrivalPort, etd, eta, id: vesselId } = vessel;
  const projectId = planning?.projectId || '';
  const transitDate = transit?.date;
  const requests = useMemo(() => portRequests(departurePort, arrivalPort, etd, eta), [departurePort, arrivalPort, etd, eta]);
  const canRequest = Boolean(vesselId && (projectId || transitDate));
  const requestKey = JSON.stringify([projectId, transitDate, vesselId, departurePort, arrivalPort, etd, eta]);
  const [refresh, setRefresh] = useState(0);
  const [statuses, setStatuses] = useState<{ key: string; client: SupabaseClient; values: Partial<Record<PortWaterLevelRole, string>> }>();
  const appliedRefresh = useRef(0);
  const latest = useRef({ vessel, onCapture });
  latest.current = { vessel, onCapture };

  useEffect(() => {
    if (!active || !canRequest) return;
    const refreshing = appliedRefresh.current !== refresh;
    appliedRefresh.current = refresh;
    const candidates = requests.filter(request => request.location && Date.parse(request.etaUtc) > Date.now()
      && (refreshing || !retainedPortWaterLevel(latest.current.vessel, request.role)));
    if (!candidates.length) return;
    const abort = new AbortController();
    const signal = abort.signal;
    const values: Partial<Record<PortWaterLevelRole, string>> = {};
    const publish = () => {
      if (!signal.aborted) setStatuses({ key: requestKey, client, values: { ...values } });
    };
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const { role } of candidates) values[role] = 'Recherche de la hauteur d’eau…';
        publish();
        const session = await client.auth.getSession().catch(() => null);
        const jwt = session?.data.session?.access_token;
        const actor = session?.data.session?.user.id;
        if (signal.aborted) return;
        await Promise.all(candidates.map(async request => {
          const { role, portKey, portName, eta, etaUtc } = request;
          const { latitude, longitude } = request.location!;
          try {
            if (session?.error || !jwt || !actor) throw new Error('Session indisponible.');
            const response = await fetch('/api/sea-operation-ukc', {
              method: 'POST', cache: 'no-store', credentials: 'same-origin', signal,
              headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ purpose: 'port-water-level', projectId, vesselId, portKey, latitude, longitude, eta,
                ...(transitDate ? { transit: { date: transitDate, vesselId } } : {}) }),
            });
            const value: unknown = response.ok ? await response.json() : null;
            if (!isPortWaterLevel(value) || value.portKey !== portKey || value.latitude !== latitude || value.longitude !== longitude
              || Date.parse(value.etaUtc) !== Date.parse(etaUtc)) throw new Error('Hauteur d’eau indisponible.');
            const currentSession = await client.auth.getSession();
            if (signal.aborted || currentSession.error || currentSession.data.session?.user.id !== actor) return;
            latest.current.onCapture(role, { ...value, portName }, client);
            delete values[role];
          } catch {
            values[role] = 'Hauteur d’eau indisponible à l’heure prévue.';
          }
          publish();
        }));
      })();
    }, 600);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [active, canRequest, client, projectId, refresh, requestKey, requests, transitDate, vesselId]);

  if (!requests.some(request => request.portName)) return null;
  const current = statuses?.key === requestKey && statuses.client === client ? statuses.values : {};
  return <section className="so-wide so-port-water-levels" aria-label="Hauteurs d’eau aux ports">
    <h4>Hauteurs d’eau prévues aux ports</h4>
    <dl className="so-grid">
      {requests.filter(request => request.portName).map(request => {
        const { role, portName, etaUtc, location } = request;
        const level = retainedPortWaterLevel(vessel, role);
        const status = current[role] || (!location ? 'Port non localisé dans le catalogue.' : !etaUtc ? 'Renseignez la date et l’heure prévues.'
          : Date.parse(etaUtc) <= Date.now() || !active || !canRequest ? 'Hauteur d’eau indisponible.' : 'Recherche de la hauteur d’eau…');
        return <div key={role}><dt><strong>{roles[role]} · {portName}</strong></dt><dd>
          {level ? <>
            <span>{portWaterLevelText(level)} · {localTime.format(new Date(level.etaUtc))}</span>
            <details><summary>Source et position de la prévision</summary>
              <a href={level.sourceUrl} target="_blank" rel="noreferrer">{PORT_WATER_LEVEL_SOURCES[level.source].name}</a>
              <p className="so-help">Position interrogée {formatSeaPosition({ latitude: level.sampleLatitude, longitude: level.sampleLongitude })} · à {distance.format(portWaterLevelDistanceKm(level))} km du port.<br />
                Prévision consultée le {localTime.format(new Date(level.fetchedAt))}.</p>
            </details>
          </> : <span role="status">{status}</span>}
        </dd></div>;
      })}
    </dl>
    {requests.some(request => retainedPortWaterLevel(vessel, request.role)) && <p className="so-help">Hauteurs d’eau de modèle, exprimées dans leur référentiel. Pour la navigation, vérifiez les hauteurs officielles du port.</p>}
    {active && canRequest && requests.some(request => request.location && Date.parse(request.etaUtc) > Date.now()) &&
      <button type="button" className="sp-button sp-button--secondary" disabled={disabled || Object.values(current).some(value => value.startsWith('Recherche'))}
        onClick={() => setRefresh(value => value + 1)}>Actualiser les hauteurs d’eau</button>}
  </section>;
}
