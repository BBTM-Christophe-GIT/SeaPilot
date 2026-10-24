import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudSun, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { fetchSeaOperationWaypointWeather, type SeaOperationWaypointWeather } from './seaOperationWeatherQueries';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { preservedWaypointWeather, waypointWeatherSnapshot, type SeaOperationWeatherCaptureContext } from './seaOperationWaypointSnapshots';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { SeaOperationWeatherObservationCard } from './SeaOperationWeatherObservationCard';
import { weatherRequestKey, type WeatherRequestStatus } from './seaOperationWeatherStatus';
import { seaOperationWeatherLocation } from './seaOperationWeatherLocation';
import { formatSeaPosition } from './seaOperationCoordinates';
import './seaOperationNavigation.css';

interface Props {
  client: SupabaseClient; projectId: string; waypoints: readonly SeaOperationWaypoint[]; preview?: boolean; active?: boolean;
  readOnly?: boolean; validatedAt?: string | null;
  observations?: readonly ObservationResult[];
  onStatusChange?: (statuses: Record<string, WeatherRequestStatus>, sourceClient: SupabaseClient) => void;
  onWeatherLoaded?: (weather: SeaOperationWaypointWeather, context: SeaOperationWeatherCaptureContext, sourceClient: SupabaseClient) => void;
}
type PointResult = { weather?: SeaOperationWaypointWeather; error?: string; loading?: boolean };
const number = (value: number | null, digits = 1) => value === null ? 'Indisponible' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
const utc = (value: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

/** Forecasts are contextual assistance, never an automatic safety answer or a signed-form mutation. */
export function SeaOperationWeatherPanel({ client, projectId, waypoints, preview = false, active = true, readOnly = false, validatedAt, observations, onWeatherLoaded, onStatusChange }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{ key: string; client: SupabaseClient; results: Record<string, PointResult>; loading: boolean } | null>(null);
  const currentClient = useRef(client);
  const currentWaypoints = useRef(waypoints);
  const capture = useRef(onWeatherLoaded);
  const statusChange = useRef(onStatusChange);
  const lastRefresh = useRef(0);
  currentClient.current = client;
  currentWaypoints.current = waypoints;
  capture.current = onWeatherLoaded;
  statusChange.current = onStatusChange;
  const inputKey = JSON.stringify({ projectId, preview, readOnly, points: waypoints.map(({ id, latitude, longitude, eta }) => ({ id, latitude, longitude, eta })) });
  const current = state?.key === inputKey && state.client === client ? state : null;

  useEffect(() => {
    if (readOnly || !active || !projectId) return;
    const input = JSON.parse(inputKey) as { projectId: string; preview: boolean; points: Pick<SeaOperationWaypoint, 'id' | 'latitude' | 'longitude' | 'eta'>[] };
    const controller = new AbortController();
    let cancelled = false;
    const refreshing = lastRefresh.current !== refresh;
    lastRefresh.current = refresh;
    const results: Record<string, PointResult> = {};
    const pending = input.points.map((point, index) => {
      const position = seaWaypointPosition(point);
      const key = `${index}:${point.id}`;
      if (!position) { results[key] = { error: 'Renseignez la latitude et la longitude.' }; return null; }
      try { seaOperationEtaUtc(point.eta); } catch (error) { results[key] = { error: (error as Error).message }; return null; }
      const stored = currentWaypoints.current[index];
      const weather = stored?.id === point.id ? waypointWeatherSnapshot(stored) : undefined;
      if (weather) { results[key] = { weather }; if (!refreshing && (weather.wind || weather.waves)) return null; }
      results[key] = { ...results[key], loading: true };
      return { key, point: { projectId: input.projectId, pointId: point.id, ...position, eta: point.eta }, context: { projectId: input.projectId, pointId: point.id, latitude: point.latitude, longitude: point.longitude, eta: point.eta } };
    }).filter((entry) => entry !== null);
    const publish = (loading: boolean) => {
      if (!cancelled && currentClient.current === client) {
        setState({ key: inputKey, client, results: { ...results }, loading });
        statusChange.current?.(Object.fromEntries(input.points.map((point, index) => {
          const result = results[`${index}:${point.id}`];
          return [weatherRequestKey(input.projectId, point), { loading: result?.loading === true, ...(result?.error ? { error: result.error } : {}) }];
        })), client);
      }
    };
    const timer = window.setTimeout(() => {
      publish(pending.length > 0);
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < pending.length) {
          const entry = pending[next++];
          try {
            const weather = await fetchSeaOperationWaypointWeather(client, entry.point, { preview: input.preview, signal: controller.signal });
            if (!cancelled && currentClient.current === client) {
              const point = currentWaypoints.current.find((point) => point.id === entry.context.pointId
                && point.latitude === entry.context.latitude && point.longitude === entry.context.longitude && point.eta === entry.context.eta);
              const retained = point && preservedWaypointWeather(point, weather);
              if (retained) {
                results[entry.key] = { weather: retained, loading: false };
                capture.current?.(retained, entry.context, client);
              } else results[entry.key] = { loading: false, error: 'La prévision reçue ne correspond pas à ce waypoint. Actualisez la météo.' };
            }
          }
          catch (error) { if (!cancelled) results[entry.key] = { ...results[entry.key], loading: false, error: error instanceof Error ? error.message : 'La prévision est indisponible. Réessayez.' }; }
          publish(true);
        }
      };
      void Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker)).finally(() => publish(false));
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [active, client, inputKey, projectId, readOnly, refresh]);

  return <section className="so-weather-panel" aria-label="Prévisions météo du Passage Plan">
    <div className="so-weather-heading"><h3><CloudSun size={17} aria-hidden="true" />Prévisions aux points de passage</h3>{!readOnly && <button type="button" className="sp-button sp-button--secondary" disabled={!projectId || !waypoints.length || current?.loading} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" />Actualiser la météo</button>}</div>
    <p className="so-help">ETA saisies à l’heure de Paris. Prévisions horaires : l’heure du modèle est affichée en UTC, au plus près de l’ETA (30 min maximum). {readOnly ? 'Les prévisions enregistrées sont conservées avec la décision signée.' : 'Les conditions météo restent à valider par le Capitaine.'}</p>
    {readOnly && validatedAt && Number.isFinite(Date.parse(validatedAt)) && <p className="so-help">Décision du Capitaine validée le {utc(validatedAt)} UTC.</p>}
    {!projectId ? <p>Sélectionnez le projet du planning pour consulter la météo.</p> : !waypoints.length ? <p>Ajoutez un point avec ses coordonnées et sa date / heure d’arrivée.</p> : <ul className="so-weather-points">{waypoints.map((point, index) => {
      const result = current?.results[`${index}:${point.id}`] ?? { weather: waypointWeatherSnapshot(point) };
      const weather = result?.weather;
      return <li className="so-weather-point" key={`${index}:${point.id}`}>
        <h4>Point {point.number || index + 1}</h4>
        {result?.error && <p role="status">{result.error}</p>}
        {!weather ? !result?.error && <p role="status">{readOnly ? 'Prévisions météo non enregistrées pour cette position et cette ETA lors de la validation.' : 'Préparation de la prévision…'}</p> : <>
          <p className="so-help">ETA : {utc(weather.etaUtc)} UTC · {formatSeaPosition(point)}</p>
          <div className="so-weather-cards"><div className="so-weather-card"><strong>Vent moyen à 10 m</strong>{weather.wind ? <><span>{number(weather.wind.speedKnots)} nd · de {number(weather.wind.directionDegrees, 0)}°</span><small>Heure modèle : {utc(weather.wind.time)} UTC</small></> : <span>{weather.windMessage || 'Prévision de vent indisponible à cette ETA.'}</span>}</div>
            <div className="so-weather-card"><strong>Houle significative (Hs)</strong>{weather.waves ? <><span>Hs {number(weather.waves.heightMeters, 2)} m · Période moyenne : {number(weather.waves.periodSeconds)} s</span><span>Provenance : {number(weather.waves.directionDegrees, 0)}°</span><small>Heure modèle : {utc(weather.waves.time)} UTC</small></> : <span>{weather.wavesMessage || 'Prévision de houle indisponible à cette ETA.'}</span>}</div></div>
          <small className="so-weather-retrieved">Source : <a href={weather.sourceUrl} target="_blank" rel="noopener noreferrer">{weather.attribution}</a>{weather.attribution === 'Open-Meteo' ? ' / DWD' : ''}{weather.model ? ` · ${weather.model.name} · réseau du ${utc(weather.model.referenceTime)} UTC · maille ${formatSeaPosition(weather.model)}` : ''}</small>
          <small className="so-weather-retrieved">Consultée le {utc(weather.fetchedAt)} UTC</small>
          {weather.model && <small className="so-weather-retrieved">{seaOperationWeatherLocation(weather)}</small>}
        </>}
        {readOnly && <SeaOperationWeatherObservationCard point={point} observations={observations} />}
      </li>;
    })}</ul>}
    <p className="so-help">Hs de la houle seule, hors mer du vent. Sans donnée marine à la maille du waypoint, la maille marine disponible la plus proche est recherchée à 10 km maximum, à la même échéance. Sa position et sa distance sont affichées. Les dates hors horizon ou sans donnée proche restent indisponibles. Les prévisions disponibles sont conservées à l’enregistrement du brouillon et à la validation du Capitaine. Une consultation en direct ne modifie jamais une fiche signée.</p>
  </section>;
}
