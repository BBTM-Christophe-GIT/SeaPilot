import { Anchor, MapPin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { buildSeaOperationRouteMap, type RouteMapViewport, type SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';
import { seaOperationMapPlaces } from './seaOperationMapPlaces';
import { seaWaypointPosition } from './seaOperationNavigation';
import { formatSeaLatitude, formatSeaLongitude } from './seaOperationCoordinates';
import { formatProjectPort } from '../projects/projectPorts';
import './seaOperationRouteMap.css';

interface Position { x: number; y: number }
type MapPoint = ReturnType<typeof buildSeaOperationRouteMap>['points'][number];

function groupCoincidentPoints(points: MapPoint[]) {
  const groups = new Map<string, { x: number; y: number; points: MapPoint[] }>();
  for (const point of points) {
    const key = `${point.x}:${point.y}`;
    const group = groups.get(key);
    if (group) group.points.push(point);
    else groups.set(key, { x: point.x, y: point.y, points: [point] });
  }
  return [...groups.values()];
}

function directionArrow(from: Position, to: Position): string | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 32) return null;
  const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
  const ux = dx / length, uy = dy / length;
  return `${x + ux * 5},${y + uy * 5} ${x - ux * 4 - uy * 3.5},${y - uy * 4 + ux * 3.5} ${x - ux * 4 + uy * 3.5},${y - uy * 4 - ux * 3.5}`;
}

/** Local situation map; placement is supplied explicitly by the editing wrapper. */
export function SeaOperationRouteMap({ waypoints, compact = false, viewport, onGeometry, renderOverlay, fillAvailableSpace = false, showPlaces = false, showWaypointCoordinates = false }: {
  waypoints: readonly SeaOperationWaypoint[]; compact?: boolean;
  viewport?: RouteMapViewport;
  onGeometry?: (geometry: SeaOperationRouteMapGeometry) => void;
  renderOverlay?: (geometry: SeaOperationRouteMapGeometry) => ReactNode;
  fillAvailableSpace?: boolean;
  showPlaces?: boolean;
  showWaypointCoordinates?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const svgTitleId = useId();
  const clipId = `sea-route-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 320 });
  const filling = fillAvailableSpace && !compact;
  const width = filling ? size.width : Math.max(280, Math.min(900, Math.round(size.width)));
  const height = compact ? 220 : filling ? size.height : width < 600 ? 280 : 320;
  const geometry = useMemo(() => buildSeaOperationRouteMap(waypoints, width, height, compact ? undefined : viewport), [waypoints, width, height, compact, viewport]);
  const groups = useMemo(() => groupCoincidentPoints(geometry.points), [geometry.points]);
  const places = useMemo(() => showPlaces && !compact ? seaOperationMapPlaces(geometry) : null, [showPlaces, compact, geometry]);
  const countLabel = `${geometry.points.length} point${geometry.points.length === 1 ? '' : 's'} géolocalisé${geometry.points.length === 1 ? '' : 's'}`;

  useEffect(() => { onGeometry?.(geometry); }, [geometry, onGeometry]);

  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width > 0) setSize((previous) => {
        const next = { width: entry.contentRect.width, height: entry.contentRect.height > 0 ? entry.contentRect.height : previous.height };
        return previous.width === next.width && previous.height === next.height ? previous : next;
      });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  return <figure aria-labelledby={titleId} className={`so-route-map${compact ? ' is-compact' : ''}${filling ? ' is-filling' : ''}`}>
    <header className="so-route-map-heading"><h3 id={titleId}>Carte du parcours</h3><span>{countLabel}</span></header>
    <div className="so-route-map-frame" ref={frame}>
      {geometry.projection ? <svg aria-labelledby={svgTitleId} aria-describedby={descriptionId} className="so-route-map-svg" role={!compact && renderOverlay ? 'group' : 'img'} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
        <title id={svgTitleId}>{`Carte du parcours · ${countLabel}`}</title>
        <desc id={descriptionId}>Nord en haut. Les numéros suivent l’ordre du tableau. {geometry.points.map((point) => `Point ${point.index} : ${point.label}`).join(' ; ')}. Les points aux mêmes coordonnées partagent une pastille.</desc>
        <defs><clipPath id={clipId}><rect width={geometry.width} height={geometry.height} /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}>
          <rect className="so-route-map-sea" width={geometry.width} height={geometry.height} />
          <g aria-hidden="true" className="so-route-map-land">{geometry.land.map((polygon, index) => <polygon key={index} points={polygon.map((point) => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />)}</g>
          <g aria-hidden="true" className="so-route-map-grid">{geometry.grid.map((line, index) => <g key={index}><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} vectorEffect="non-scaling-stroke" /><text x={line.labelAt.x} y={line.labelAt.y}>{line.label}</text></g>)}</g>
          {places && <g className="so-route-map-places-layer">
            <g className="so-route-map-cities">{places.cities.map(city => <g key={city.id}><title>{city.name} · Natural Earth</title><circle cx={city.x} cy={city.y} r={1.6} /><text x={city.label.x} y={city.label.y} textAnchor={city.label.anchor}>{city.name}</text></g>)}</g>
            <g className="so-route-map-ports">{places.markers.map(marker => <g key={`${marker.location.source}:${marker.location.sourceId}`} role="img"
              aria-label={`Port · ${marker.ports.map(item => item.port.port).join(' / ')}`} className="so-route-map-port">
              <title>{marker.ports.map(item => formatProjectPort(item.port)).join('\n')}{`\n${marker.location.source === 'sandre' ? 'SANDRE/SHOM' : 'NGA World Port Index'} · point de référence indicatif, précision non garantie · ne désigne ni une entrée ni un quai.`}</title>
              <g className="so-route-map-anchor" aria-hidden="true" transform={`translate(${marker.x} ${marker.y})`}><circle cx={0} cy={-5} r={2} /><path d="M0 -3V7 M-6 0V3 Q-6 7 0 7 Q6 7 6 3 V0 M-8 2 L-6 0 L-4 2 M4 2 L6 0 L8 2" /></g>
              {marker.label && <text x={marker.label.x} y={marker.label.y} textAnchor={marker.label.anchor}>{marker.ports[0].port.port}</text>}
            </g>)}</g>
          </g>}
          <g aria-hidden="true" className="so-route-map-track">{geometry.segments.map((segment, index) => {
            const arrow = directionArrow(segment.from, segment.to);
            return <g key={index}><line x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} vectorEffect="non-scaling-stroke" />{arrow && <polygon className="so-route-map-direction" points={arrow} />}</g>;
          })}</g>
          <g className="so-route-map-points">{groups.map((group) => {
            const first = group.points[0];
            const isStart = group.points.some((point) => point.index === 1);
            const isEnd = waypoints.length > 1 && group.points.some((point) => point.index === waypoints.length);
            const allOrdinals = group.points.map((point) => point.index).join('/');
            const ordinals = group.points.length > 4 ? `${first.index}/…/${group.points[group.points.length - 1].index}` : allOrdinals;
            const markerWidth = Math.max(26, Math.min(110, ordinals.length * 7 + 14));
            const label = group.points.length === 1 && first.label !== String(first.index) ? first.label : '';
            const alignEnd = group.x > geometry.width * .7;
            const position = showWaypointCoordinates && !compact ? seaWaypointPosition(waypoints[first.index - 1]) : null;
            const coordinateX = Math.max(60 - group.x, Math.min(geometry.width - group.x - 60, 0));
            const coordinateY = Math.min(21, geometry.height - group.y - 16);
            return <g className={`so-route-map-point${isStart ? ' is-start' : ''}${isEnd ? ' is-end' : ''}`} data-point-indices={allOrdinals} key={`${group.x}:${group.y}`} transform={`translate(${group.x} ${group.y})`}>
              <title>{group.points.map((point) => `Point ${point.index} · ${point.label}${point.description ? ` · ${point.description}` : ''}`).join('\n')}</title>
              {isEnd && <rect className="so-route-map-finish-ring" x={-markerWidth / 2 - 4} y={-17} width={markerWidth + 8} height={34} rx={17} vectorEffect="non-scaling-stroke" />}
              <rect className="so-route-map-pin" x={-markerWidth / 2} y={-13} width={markerWidth} height={26} rx={13} vectorEffect="non-scaling-stroke" />
              <text className="so-route-map-ordinal" textAnchor="middle" dominantBaseline="central">{ordinals}</text>
              {label && <text className="so-route-map-point-label" x={alignEnd ? -markerWidth / 2 - 7 : markerWidth / 2 + 7} y={-18} textAnchor={alignEnd ? 'end' : 'start'}>{label.length > 20 ? `${label.slice(0, 19)}…` : label}</text>}
              {position && <text className="so-route-map-point-coordinates" textAnchor="middle" x={coordinateX} y={coordinateY}><tspan x={coordinateX}>{formatSeaLatitude(position.latitude)}</tspan><tspan x={coordinateX} dy={11}>{formatSeaLongitude(position.longitude)}</tspan></text>}
            </g>;
          })}</g>
          <g aria-hidden="true" className="so-route-map-north" transform={`translate(${geometry.width - 23} 31)`}><text textAnchor="middle" y={-15}>N</text><path d="M 0 9 V -7 M -4 -2 L 0 -7 L 4 -2" vectorEffect="non-scaling-stroke" /></g>
          {geometry.scale && <g aria-hidden="true" className="so-route-map-scale"><path d={`M ${geometry.scale.from.x} ${geometry.scale.from.y - 4} V ${geometry.scale.from.y + 4} M ${geometry.scale.from.x} ${geometry.scale.from.y} H ${geometry.scale.to.x} M ${geometry.scale.to.x} ${geometry.scale.to.y - 4} V ${geometry.scale.to.y + 4}`} vectorEffect="non-scaling-stroke" /><text x={(geometry.scale.from.x + geometry.scale.to.x) / 2} y={geometry.scale.from.y - 8} textAnchor="middle">{geometry.scale.label}</text></g>}
          {!compact && renderOverlay?.(geometry)}
        </g>
      </svg> : <div className="so-route-map-empty"><MapPin aria-hidden="true" size={22} /><p>Renseignez une latitude et une longitude valides pour afficher les points de passage.</p></div>}
    </div>
    {geometry.invalidCount > 0 && <p className="so-route-map-omissions" role="status">{geometry.invalidCount === 1 ? '1 point sans coordonnées valides n’est pas représenté ; la liaison est interrompue à cet endroit.' : `${geometry.invalidCount} points sans coordonnées valides ne sont pas représentés ; les liaisons sont interrompues à ces endroits.`}</p>}
    {places && geometry.projection && <details className="so-route-map-places"><summary>Ports dans cette région · {places.ports.length}</summary>
      <div className="so-route-map-port-list">
        <p>Catalogue partagé avec Projets. Points de référence indicatifs : ni entrées de port ni positions de quai.</p>
        <ul aria-label="Ports du catalogue dans le cadre affiché">{places.ports.map(item => <li key={item.key}><Anchor size={13} aria-hidden="true" /><span>{formatProjectPort(item.port)}<small>{item.location.source === 'sandre' ? 'Point publié SANDRE/SHOM' : 'Repère NGA World Port Index · position indicative'}</small></span></li>)}</ul>
        {places.ports.length === 0 && <p>Aucun port géoréférencé du catalogue dans ce cadre.</p>}
        {places.relatedPorts.length > 0 && <><p>Rattachements statistiques aux ports visibles · {places.relatedPorts.length}. Leur position propre n’est pas disponible ; ils ne sont pas placés sur la carte.</p>
          <ul aria-label="Ports rattachés sans position propre">{places.relatedPorts.map(item => <li key={item.key}><span>{formatProjectPort(item.port)}<small>Rattachement à {item.port.locodePort || item.parent.name} · position propre non disponible</small></span></li>)}</ul></>}
        <p>Couverture géographique du catalogue : France {places.coverage.france.located}/{places.coverage.france.total} ; Angleterre {places.coverage.england.located}/{places.coverage.england.total}. Les entrées sans position ne peuvent pas être filtrées géographiquement. Les libellés de carte sont espacés pour rester lisibles ; la liste conserve tous les ports localisés dans le cadre.</p>
      </div>
    </details>}
    <figcaption className="so-route-map-caption"><span className="so-route-map-legend"><span><i className="is-start" aria-hidden="true" />Départ</span><span><i className="is-end" aria-hidden="true" />Arrivée</span><span>Numéros : ordre du tableau</span></span><span>Fond Natural Earth · Tracé indicatif</span></figcaption>
    {places && <p className="so-route-map-places-attribution">Villes : <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · Ports : <a href="https://www.data.gouv.fr/datasets/ports-espace-maritime-francais" target="_blank" rel="noopener noreferrer">SANDRE/SHOM</a> et <a href="https://msi.nga.mil/Publications/WPI" target="_blank" rel="noopener noreferrer">NGA</a>. Couverture partielle et précision non garantie. Ne pas utiliser pour naviguer.</p>}
  </figure>;
}
