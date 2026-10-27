import type { SupabaseClient } from '@supabase/supabase-js';
import { Map, RefreshCw } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { fetchSeaOperationPointCharts, type SeaOperationPointCharts } from './seaOperationChartQueries';
import { addShomChartReferences, type ShomChart } from './seaOperationHydroModel';
import { formatSeaPosition } from './seaOperationCoordinates';
import { isSeaOperationTransitRequestContext, type SeaOperationTransitRequestContext } from './seaOperationWeatherModel';
import './seaOperationNavigation.css';

interface Props { client: SupabaseClient; projectId: string; transit?: SeaOperationTransitRequestContext; waypoints: readonly SeaOperationWaypoint[]; charts: string; onChartsChange: (value: string) => void; canEdit?: boolean; preview?: boolean; active?: boolean }
type Result = { lookup?: SeaOperationPointCharts; error?: string };

function ChartList({ matches }: { matches: ShomChart[] }) {
  return <ul className="so-chart-list">{matches.map((chart) =>
    <li key={chart.id}><div><a href={chart.catalogueUrl} target="_blank" rel="noopener noreferrer">{chart.number} · {chart.title}</a><small>Échelle 1:{new Intl.NumberFormat('fr-FR').format(chart.scale)}</small></div></li>,
  )}</ul>;
}

export function SeaOperationChartsPanel({ client, projectId, transit, waypoints, charts, onChartsChange, canEdit = true, preview = false, active = true }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; client: SupabaseClient; results: Record<string, Result>; loading: boolean } | null>(null);
  const currentClient = useRef(client);
  currentClient.current = client;
  const hasContext = Boolean(projectId || isSeaOperationTransitRequestContext(transit));
  const inputKey = JSON.stringify({ projectId, ...(transit ? { transit } : {}), preview, points: waypoints.map(({ id, latitude, longitude }) => ({ id, latitude, longitude })) });
  const current = state?.key === inputKey && state.client === client ? state : null;
  const identifiedNumbersKey = JSON.stringify(current && !current.loading
    ? waypoints.flatMap((point, index) => current.results[`${index}:${point.id}`]?.lookup?.charts.map((chart) => chart.number) ?? [])
    : []);
  const retainIdentifiedCharts = useEffectEvent((numbers: string[]) => {
    const next = addShomChartReferences(charts, numbers);
    if (next !== charts) onChartsChange(next);
  });
  useEffect(() => {
    if (active && canEdit && identifiedNumbersKey !== '[]') retainIdentifiedCharts(JSON.parse(identifiedNumbersKey) as string[]);
  }, [active, canEdit, identifiedNumbersKey]);
  useEffect(() => {
    if (!active || !hasContext) return;
    const input = JSON.parse(inputKey) as { projectId: string; transit?: SeaOperationTransitRequestContext; preview: boolean; points: Pick<SeaOperationWaypoint, 'id' | 'latitude' | 'longitude'>[] };
    const controller = new AbortController();
    let cancelled = false;
    const results: Record<string, Result> = {};
    const pending = input.points.map((point, index) => {
      const position = seaWaypointPosition(point);
      const key = `${index}:${point.id}`;
      if (!position) { results[key] = { error: 'Renseignez la latitude et la longitude pour rechercher les cartes.' }; return null; }
      return { key, point: { projectId: input.projectId, ...(input.transit ? { transit: input.transit } : {}), pointId: point.id, ...position } };
    }).filter((entry) => entry !== null);
    const publish = (loading: boolean) => {
      if (!cancelled && currentClient.current === client) setState({ key: inputKey, client, results: { ...results }, loading });
    };
    const timer = window.setTimeout(() => {
      publish(pending.length > 0);
      let next = 0;
      const worker = async () => {
        while (!cancelled && next < pending.length) {
          const entry = pending[next++];
          try { results[entry.key] = { lookup: await fetchSeaOperationPointCharts(client, entry.point, { preview: input.preview, signal: controller.signal }) }; }
          catch (error) { if (!cancelled) results[entry.key] = { error: error instanceof Error ? error.message : 'Recherche des cartes indisponible. Réessayez.' }; }
          publish(true);
        }
      };
      void Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker)).finally(() => publish(false));
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [active, client, inputKey, hasContext, attempt]);

  return <section className="so-charts-panel" aria-label="Cartes SHOM aux points de passage">
    <div className="so-weather-heading"><h3><Map size={17} aria-hidden="true" />Cartes SHOM aux points de passage</h3><button type="button" className="sp-button sp-button--secondary" disabled={!hasContext || !waypoints.length || current?.loading} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" />Actualiser les cartes</button></div>
    <p className="so-help">Recherche automatique à partir de la latitude et de la longitude, sans attendre l’ETA. Les cartes sont classées de l’échelle la plus détaillée à la plus générale.</p>
    {!hasContext ? <p>Sélectionnez le projet du planning ou le navire et la date du Transit pour rechercher les cartes.</p> : !waypoints.length ? <p>Ajoutez un point de passage avec ses coordonnées.</p> : <ul className="so-chart-points">{waypoints.map((point, index) => {
      const result = current?.results[`${index}:${point.id}`];
      const lookup = result?.lookup;
      return <li key={`${index}:${point.id}`}><details open={waypoints.length === 1}>
        <summary>Point {point.number || index + 1}{lookup ? ` · ${lookup.charts.length} carte${lookup.charts.length > 1 ? 's' : ''}` : ''}</summary>
        <p className="so-help">{formatSeaPosition(point)}</p>
        {result?.error ? <p role="status">{result.error}</p> : !lookup ? <p role="status">Recherche des cartes…</p> : <>
          {lookup.charts.length ? <><ChartList matches={lookup.charts.slice(0, 5)} />{lookup.charts.length > 5 && <details className="so-other-charts"><summary>Autres cartes à plus petite échelle ({lookup.charts.length - 5})</summary><ChartList matches={lookup.charts.slice(5)} /></details>}</> : <p>Aucune carte papier SHOM trouvée dans le catalogue à cette position.</p>}
          {lookup.truncated && <p role="status">Résultat incomplet : vérifiez le catalogue SHOM.</p>}
          <small className="so-weather-retrieved">Catalogue SHOM consulté le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lookup.fetchedAt))}.</small>
        </>}
      </details></li>;
    })}</ul>}
    <p className="so-help">Les emprises du catalogue indiquent les cartes candidates au waypoint. Vérifiez leur édition, leurs corrections et la couverture de tout le trajet.{canEdit && ' Les numéros identifiés sont ajoutés automatiquement aux références de la fiche, séparés par « - », puis enregistrés et exportés avec elle.'}</p>
  </section>;
}
