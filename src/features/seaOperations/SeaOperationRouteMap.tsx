import { Eye, MapPin } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { buildSeaOperationRouteMap, routeMapViewportContainingPositions, type RouteMapViewport, type SeaOperationRouteMapGeometry } from './seaOperationRouteMapGeometry';
import { resolveSeaOperationMapPorts, seaOperationMapPlaces, type SeaOperationMapPort } from './seaOperationMapPlaces';
import { seaWaypointPosition, type SeaPosition } from './seaOperationNavigation';
import { formatSeaLatitude, formatSeaLongitude } from './seaOperationCoordinates';
import { formatProjectPort } from '../projects/projectPorts';
import { buildSeaOperationRouteLegs, formatSeaOperationVoyageDuration, seaOperationVoyageTiming } from './seaOperationRouteLegs';
import './seaOperationRouteMap.css';
import { seaOperationMapExtraPositions, seaOperationMapLayers, seaOperationZonePositions, type SeaOperationMapZone } from './seaOperationMapLayers';
import { projectSeaOperationMapPlace } from './seaOperationMapPlaces';

const NO_ISOLATED_POINTS: readonly SeaOperationWaypoint[] = [];
const NO_ZONES: readonly SeaOperationMapZone[] = [];

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

function vigilanceLabel(indices: number[]) {
  return indices.length ? `Vigilance : trafic dense, risque de collision · ${indices.length === 1 ? 'Waypoint' : 'Waypoints'} ${indices.join(', ')}` : '';
}

function documentZoneLabels(geometry: SeaOperationRouteMapGeometry, layers: ReturnType<typeof seaOperationMapLayers>, zones: readonly SeaOperationMapZone[]) {
  type Box = { west: number; east: number; north: number; south: number };
  const occupied: Box[] = geometry.points.map(point => ({ west: point.x - 38, east: point.x + 38, north: point.y - 26, south: point.y + 48 }));
  for (const point of layers.isolated) occupied.push({ west: point.x - 22, east: point.x + 22, north: point.y - 20, south: point.y + 20 });
  for (const polygon of layers.polygons) for (const vertex of polygon.vertices) occupied.push({ west: vertex.x - 5, east: vertex.x + 38, north: vertex.y - 18, south: vertex.y + 5 });
  const overlaps = (a: Box, b: Box) => a.west < b.east + 3 && a.east > b.west - 3 && a.north < b.south + 3 && a.south > b.north - 3;
  const offsets = [0, -22, 22, -44, 44, -66, 66].flatMap(y => [0, -36, 36, -72, 72].map(x => ({ x, y })))
    .sort((a, b) => a.x ** 2 + a.y ** 2 - b.x ** 2 - b.y ** 2);
  const labels = new Map<string, { text: string; x: number; y: number; width: number }>();
  for (const { zone, vertices } of layers.polygons) {
    const text = `Z${zones.findIndex(item => item.id === zone.id) + 1}`, width = Math.max(28, text.length * 6 + 12);
    const center = { x: vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length, y: vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length };
    const candidates = offsets.map(offset => {
      const x = Math.max(width / 2 + 5, Math.min(geometry.width - width / 2 - 5, center.x + offset.x));
      const y = Math.max(14, Math.min(geometry.height - 14, center.y + offset.y));
      return { x, y, box: { west: x - width / 2, east: x + width / 2, north: y - 9, south: y + 9 } };
    });
    const placed = candidates.find(candidate => occupied.every(box => !overlaps(candidate.box, box))) || candidates[0];
    labels.set(zone.id, { text, x: placed.x, y: placed.y, width }); occupied.push(placed.box);
  }
  return labels;
}

function directionArrow(from: Position, to: Position): string | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 32) return null;
  const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
  const ux = dx / length, uy = dy / length;
  return `${x + ux * 5},${y + uy * 5} ${x - ux * 4 - uy * 3.5},${y - uy * 4 + ux * 3.5} ${x - ux * 4 + uy * 3.5},${y - uy * 4 - ux * 3.5}`;
}

function routeLegLabels(geometry: SeaOperationRouteMapGeometry, legs: ReturnType<typeof buildSeaOperationRouteLegs>['legs'], places: ReturnType<typeof seaOperationMapPlaces> | null) {
  if (geometry.width < 600) return [];
  const occupied = geometry.points.map(point => ({ west: point.x - 72, east: point.x + 72, north: point.y - 24, south: point.y + 45 }));
  for (const marker of places?.markers || []) occupied.push({ west: marker.x - 16, east: marker.x + 16, north: marker.y - 16, south: marker.y + 16 });
  occupied.push({ west: geometry.width - 248, east: geometry.width, north: geometry.height - 164, south: geometry.height });
  const labels: Array<{ x: number; y: number; width: number; text: string; leg: typeof legs[number] }> = [];
  for (const leg of legs) {
    const from = geometry.points.find(point => point.index === leg.fromIndex), to = geometry.points.find(point => point.index === leg.toIndex);
    if (!from || !to || Math.abs(from.x - to.x) > geometry.width * .8) continue;
    const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
    const text = `${leg.distanceLabel} · ${leg.durationLabel || 'Durée indisponible'}`, width = Math.min(250, text.length * 6.3 + 16);
    const box = { west: x - width / 2, east: x + width / 2, north: y - 11, south: y + 11 };
    if (box.west < 4 || box.east > geometry.width - 4 || box.north < 4 || box.south > geometry.height - 4
      || occupied.some(other => box.west < other.east + 4 && box.east > other.west - 4 && box.north < other.south + 4 && box.south > other.north - 4)) continue;
    occupied.push(box); labels.push({ x, y, width, text, leg });
  }
  return labels;
}

/** Local situation map; placement is supplied explicitly by the editing wrapper. */
export function SeaOperationRouteMap({ waypoints, compact = false, viewport, ensureZonesVisible = false, onGeometry, renderOverlay, fillAvailableSpace = false, showPlaces = false, showWaypointCoordinates = false, onPortSelect, showRouteLegs = false, maxSpeedKnots, etd, eta, previewWaypoint, isolatedPoints = NO_ISOLATED_POINTS, zones = NO_ZONES, previewIsolatedPoint, previewZoneVertex, departurePort, arrivalPort }: {
  waypoints: readonly SeaOperationWaypoint[]; compact?: boolean;
  viewport?: RouteMapViewport;
  /** Document view only: widen a saved frame when its zones would be cropped. */
  ensureZonesVisible?: boolean;
  onGeometry?: (geometry: SeaOperationRouteMapGeometry) => void;
  renderOverlay?: (geometry: SeaOperationRouteMapGeometry, context: { places: ReturnType<typeof seaOperationMapPlaces> | null }) => ReactNode;
  fillAvailableSpace?: boolean;
  showPlaces?: boolean;
  showWaypointCoordinates?: boolean;
  onPortSelect?: (ports: readonly SeaOperationMapPort[]) => void;
  showRouteLegs?: boolean;
  maxSpeedKnots?: number | null;
  etd?: string;
  eta?: string;
  departurePort?: string;
  arrivalPort?: string;
  /** Visual drag preview only; totals, labels and layout retain the controlled route until release. */
  previewWaypoint?: { id: string; position: SeaPosition } | null;
  isolatedPoints?: readonly SeaOperationWaypoint[];
  zones?: readonly SeaOperationMapZone[];
  previewIsolatedPoint?: { id: string; position: SeaPosition } | null;
  previewZoneVertex?: { zoneId: string; index: number; position: SeaPosition } | null;
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
  const definedPorts = useMemo(() => resolveSeaOperationMapPorts(departurePort, arrivalPort), [departurePort, arrivalPort]);
  const extraPositions = useMemo(() => [...seaOperationMapExtraPositions(isolatedPoints, zones), ...definedPorts.ports.map(port => port.location)], [isolatedPoints, zones, definedPorts]);
  const displayViewport = useMemo(() => ensureZonesVisible
    ? routeMapViewportContainingPositions(viewport, zones.flatMap(zone => seaOperationZonePositions(zone) ?? []), width, height)
    : viewport, [ensureZonesVisible, viewport, zones, width, height]);
  // The voyage summary stays on the map; automatic fitting leaves it a clear column.
  const fitRightInset = !compact && showRouteLegs && waypoints.length > 1 && width >= 600 ? 264 : 0;
  const recordedGeometry = useMemo(() => buildSeaOperationRouteMap(waypoints, width, height, displayViewport, extraPositions, fitRightInset), [waypoints, width, height, displayViewport, extraPositions, fitRightInset]);
  const visualWaypoints = useMemo(() => !compact && previewWaypoint ? waypoints.map(point => point.id === previewWaypoint.id
    ? { ...point, latitude: String(previewWaypoint.position.latitude), longitude: String(previewWaypoint.position.longitude) } : point) : waypoints, [compact, previewWaypoint, waypoints]);
  const geometry = useMemo(() => visualWaypoints === waypoints ? recordedGeometry
    : buildSeaOperationRouteMap(visualWaypoints, width, height, displayViewport ?? recordedGeometry.viewport ?? undefined, extraPositions), [visualWaypoints, waypoints, recordedGeometry, width, height, displayViewport, extraPositions]);
  const visualIsolatedPoints = useMemo(() => !compact && previewIsolatedPoint ? isolatedPoints.map(point => point.id === previewIsolatedPoint.id
    ? { ...point, latitude: String(previewIsolatedPoint.position.latitude), longitude: String(previewIsolatedPoint.position.longitude) } : point) : isolatedPoints, [compact, isolatedPoints, previewIsolatedPoint]);
  const visualZones = useMemo(() => !compact && previewZoneVertex ? zones.map(zone => zone.id === previewZoneVertex.zoneId
    ? { ...zone, vertices: zone.vertices.map((vertex, index) => index === previewZoneVertex.index ? { latitude: String(previewZoneVertex.position.latitude), longitude: String(previewZoneVertex.position.longitude) } : vertex) } : zone) : zones, [compact, zones, previewZoneVertex]);
  const layers = useMemo(() => seaOperationMapLayers(geometry, visualIsolatedPoints, visualZones), [geometry, visualIsolatedPoints, visualZones]);
  const zoneLabels = useMemo(() => ensureZonesVisible ? documentZoneLabels(geometry, layers, visualZones) : null, [ensureZonesVisible, geometry, layers, visualZones]);
  const groups = useMemo(() => groupCoincidentPoints(geometry.points), [geometry.points]);
  const visibleDefinedPorts = useMemo(() => definedPorts.ports.flatMap(port => {
    const position = projectSeaOperationMapPlace(geometry, port.location);
    return position ? [{ ...port, ...position }] : [];
  }), [definedPorts, geometry]);
  const places = useMemo(() => showPlaces && !compact ? seaOperationMapPlaces(recordedGeometry, definedPorts.ports.flatMap(port => {
    const point = projectSeaOperationMapPlace(recordedGeometry, port.location); return point ? [point] : [];
  })) : null, [showPlaces, compact, recordedGeometry, definedPorts]);
  const route = useMemo(() => showRouteLegs && !compact ? buildSeaOperationRouteLegs(waypoints, maxSpeedKnots) : null, [showRouteLegs, compact, waypoints, maxSpeedKnots]);
  const legLabels = useMemo(() => route ? routeLegLabels(recordedGeometry, route.legs, places) : [], [recordedGeometry, route, places]);
  const voyage = route ? seaOperationVoyageTiming(etd, route.totalDurationMinutes, eta) : null;
  const showLegList = Boolean(route && route.legs.length > 0 && (geometry.width < 600 || legLabels.length < route.legs.length));
  const routeCountLabel = `${geometry.points.length} point${geometry.points.length === 1 ? '' : 's'} géolocalisé${geometry.points.length === 1 ? '' : 's'}`;
  const countLabel = [routeCountLabel, isolatedPoints.length ? `${isolatedPoints.length} point${isolatedPoints.length === 1 ? '' : 's'} isolé${isolatedPoints.length === 1 ? '' : 's'}` : '', zones.length ? `${zones.length} zone${zones.length === 1 ? '' : 's'}` : '', definedPorts.ports.length ? `${definedPorts.ports.length} port${definedPorts.ports.length === 1 ? '' : 's'} défini${definedPorts.ports.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const vigilanceDescription = vigilanceLabel(geometry.points.filter(point => waypoints[point.index - 1]?.denseTraffic).map(point => point.index));

  useEffect(() => { onGeometry?.(recordedGeometry); }, [recordedGeometry, onGeometry]);

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

  const summaryBelowMap = geometry.width < 600;
  const transitDurationFallback = Boolean(route?.totalDurationLabel && !voyage?.durationLabel);
  const voyageSummary = route && voyage && geometry.projection && waypoints.length > 1 ? <aside className={`so-route-map-voyage-summary${summaryBelowMap ? ' is-below-map' : ''}`} aria-label="Estimation du parcours">
    <strong>{route.totalDistanceLabel || 'Distance totale indisponible'}<span className="so-route-map-voyage-duration">{formatSeaOperationVoyageDuration(voyage.durationMinutes ?? route.totalDurationMinutes) || 'Durée indisponible'}</span></strong>
    <dl><div><dt>ETD</dt><dd>{voyage.etdLabel || 'À renseigner'}</dd></div><div><dt>{eta?.trim() ? 'ETA arrivée' : 'ETA estimée'}</dt><dd>{voyage.etaLabel || 'Indisponible'}</dd></div></dl>
    {voyage.etaSource === 'waypoint' && <small>Durée ETD → ETA retenue.</small>}
    {(transitDurationFallback || voyage.etaSource === 'estimated') && <small>Durée estimée à vitesse constante.</small>}
  </aside> : null;

  return <figure aria-labelledby={titleId} className={`so-route-map${compact ? ' is-compact' : ''}${filling ? ' is-filling' : ''}`}>
    <header className="so-route-map-heading"><h3 id={titleId}>Carte du parcours</h3><span>{countLabel}</span></header>
    <div className="so-route-map-frame" ref={frame}>
      {geometry.projection ? <svg aria-labelledby={svgTitleId} aria-describedby={descriptionId} className="so-route-map-svg" role={!compact && (renderOverlay || route) ? 'group' : 'img'} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
        <title id={svgTitleId}>{`Carte du parcours · ${countLabel}`}</title>
        <desc id={descriptionId}>Nord en haut. Les numéros suivent l’ordre du tableau. {geometry.points.map((point) => `Point ${point.index} : ${point.label}`).join(' ; ')}. Les points aux mêmes coordonnées partagent une pastille. {visibleDefinedPorts.map(port => `${port.roleLabel} : ${port.port.port}`).join(' ; ')} {vigilanceDescription && `${vigilanceDescription}.`} {layers.isolated.map(item => `Point isolé ${item.index} : ${item.point.descriptionVhf || item.point.number}${item.point.denseTraffic ? ' · trafic dense, risque de collision' : ''}`).join(' ; ')} {layers.polygons.map(item => `Zone : ${item.zone.name}`).join(' ; ')}</desc>
        <defs><clipPath id={clipId}><rect width={geometry.width} height={geometry.height} /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}>
          <rect className="so-route-map-sea" width={geometry.width} height={geometry.height} />
          <g aria-hidden="true" className="so-route-map-land">{geometry.land.map((polygon, index) => <polygon key={index} points={polygon.map((point) => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />)}</g>
          <g aria-hidden="true" className="so-route-map-grid">{geometry.grid.map((line, index) => <g key={index}><line x1={line.from.x} y1={line.from.y} x2={line.to.x} y2={line.to.y} vectorEffect="non-scaling-stroke" /><text x={line.labelAt.x} y={line.labelAt.y}>{line.label}</text></g>)}</g>
          <g className="so-route-map-zones">{layers.polygons.map(({ zone, vertices }) => {
            const label = zoneLabels?.get(zone.id);
            return <g key={zone.id} role="img" aria-label={`Zone : ${zone.name || 'Sans nom'}`}><title>{zone.name || 'Zone sans nom'} · {zone.vertices.length} sommets</title><polygon points={vertices.map(vertex => `${vertex.x},${vertex.y}`).join(' ')} />{label
              ? <g className="so-route-map-zone-tag"><rect x={label.x - label.width / 2} y={label.y - 9} width={label.width} height={18} rx={3} /><text x={label.x} y={label.y + 3.5} textAnchor="middle">{label.text}</text></g>
              : <text x={Math.max(12, Math.min(geometry.width - 12, vertices.reduce((sum, point) => sum + point.x, 0) / vertices.length))} y={Math.max(14, Math.min(geometry.height - 12, vertices.reduce((sum, point) => sum + point.y, 0) / vertices.length))} textAnchor="middle">{zone.name || 'Zone'}</text>}</g>;
          })}</g>
          <g className="so-route-map-zone-vertices" aria-hidden="true">{visualZones.flatMap((zone, zoneIndex) => zone.vertices.map((vertex, index) => {
            const position = seaWaypointPosition(vertex), pixel = position && projectSeaOperationMapPlace(geometry, position);
            return pixel ? <g key={`${zone.id}:${index}`}><circle cx={pixel.x} cy={pixel.y} r={3} /><text x={pixel.x + 6} y={pixel.y - 5}>Z{zoneIndex + 1}.{index + 1}</text></g> : null;
          }))}</g>
          {places && <g className="so-route-map-places-layer">
            <g className="so-route-map-cities">{places.cities.map(city => <g key={city.id}><title>{city.name} · Natural Earth</title><circle cx={city.x} cy={city.y} r={3} /><text x={city.label.x} y={city.label.y} textAnchor={city.label.anchor}>{city.name}</text></g>)}</g>
            <g className="so-route-map-ports">{places.markers.filter(marker => !definedPorts.ports.some(port => port.key === `${marker.location.source}:${marker.location.sourceId}`)).map(marker => <g key={`${marker.location.source}:${marker.location.sourceId}`} role="img"
              aria-label={`Port · ${marker.ports.map(item => item.port.port).join(' / ')}`} className="so-route-map-port">
              <title>{marker.ports.map(item => formatProjectPort(item.port)).join('\n')}{`\n${marker.location.source === 'sandre' ? 'SANDRE/SHOM' : 'NGA World Port Index'} · point de référence indicatif, précision non garantie · ne désigne ni une entrée ni un quai.`}</title>
              <circle className="so-route-map-port-dot" aria-hidden="true" cx={marker.x} cy={marker.y} r={3} />
              {marker.label && <text x={marker.label.x} y={marker.label.y} textAnchor={marker.label.anchor}>{marker.ports[0].port.port}</text>}
            </g>)}</g>
          </g>}
          <g className="so-route-map-defined-ports">{visibleDefinedPorts.map(port => {
            const coincident = geometry.points.some(point => Math.hypot(point.x - port.x, point.y - port.y) < 28)
              || layers.isolated.some(point => Math.hypot(point.x - port.x, point.y - port.y) < 28);
            const labelX = Math.max(Math.min(90, geometry.width / 2), Math.min(geometry.width - Math.min(90, geometry.width / 2), port.x));
            const above = port.y >= (coincident ? 58 : 38);
            const labelY = Math.max(14, Math.min(geometry.height - 25, port.y + (above ? coincident ? -43 : -22 : coincident ? 43 : 22)));
            const name = port.port.port.length > 28 ? `${port.port.port.slice(0, 27)}…` : port.port.port;
            return <g key={port.key} role="img" aria-label={`${port.roleLabel} : ${port.port.port}`} data-defined-port={port.roles.join(' ')}>
              <title>{port.roleLabel} : {formatProjectPort(port.port)}{`\n${port.location.source === 'sandre' ? 'SANDRE/SHOM' : 'NGA World Port Index'} · repère indicatif ; ne désigne ni une entrée ni un quai.`}</title>
              {coincident && <circle className="so-route-map-defined-port-ring" cx={port.x} cy={port.y} r={21} />}
              <circle className="so-route-map-port-dot" cx={port.x} cy={port.y} r={5} />
              <text x={labelX} y={labelY} textAnchor="middle"><tspan x={labelX} className="so-route-map-defined-port-role">{port.roleLabel}</tspan><tspan x={labelX} dy={12}>{name}</tspan></text>
            </g>;
          })}</g>
          <g aria-hidden="true" className="so-route-map-track">{geometry.segments.map((segment, index) => {
            const arrow = directionArrow(segment.from, segment.to);
            return <g key={index}><line x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} vectorEffect="non-scaling-stroke" />{arrow && <polygon className="so-route-map-direction" points={arrow} />}</g>;
          })}</g>
          <g className="so-route-map-isolated-points">{layers.isolated.map(({ point, index, x, y, position }) => <g key={point.id} data-isolated-point-id={point.id} transform={`translate(${x} ${y})`} role="img" aria-label={`Point isolé ${index} : ${point.descriptionVhf || point.number || 'Sans nom'} · ${formatSeaLatitude(position.latitude)} · ${formatSeaLongitude(position.longitude)}`}>
            <title>{point.descriptionVhf || `Point isolé ${index}`}</title><rect x={-15} y={-13} width={30} height={26} rx={4} /><text className="so-route-map-isolated-ordinal" textAnchor="middle" dominantBaseline="central">P{index}</text>
            {point.descriptionVhf && <text className="so-route-map-point-label" x={0} y={-20} textAnchor="middle">{point.descriptionVhf.length > 20 ? `${point.descriptionVhf.slice(0, 19)}…` : point.descriptionVhf}</text>}
            {showWaypointCoordinates && !compact && <text className="so-route-map-point-coordinates" textAnchor="middle" y={22}><tspan x={0}>{formatSeaLatitude(position.latitude)}</tspan><tspan x={0} dy={11}>{formatSeaLongitude(position.longitude)}</tspan></text>}
            {point.denseTraffic && <g className="so-route-map-point-vigilance" role="img" aria-label={`Vigilance : trafic dense, risque de collision · Point isolé ${index}`}><title>Traffic dense · Point isolé {index} · risque de collision</title><circle cx={x > geometry.width * .7 ? -31 : 31} cy={0} r={10} /><Eye aria-hidden="true" x={(x > geometry.width * .7 ? -31 : 31) - 7} y={-7} size={14} strokeWidth={1.8} /></g>}
          </g>)}</g>
          {legLabels.length > 0 && <g className="so-route-map-leg-labels">{legLabels.map(label => <g key={`${label.leg.fromIndex}:${label.leg.toIndex}`} transform={`translate(${label.x} ${label.y})`} role="img" aria-label={`Waypoint ${label.leg.fromIndex} vers ${label.leg.toIndex} : ${label.text}`}>
            <rect x={-label.width / 2} y={-11} width={label.width} height={22} rx={6} /><text textAnchor="middle" dominantBaseline="central">{label.text}</text>
          </g>)}</g>}
          <g className="so-route-map-points">{groups.map((group) => {
            const first = group.points[0];
            const isStart = group.points.some((point) => point.index === 1);
            const isEnd = waypoints.length > 1 && group.points.some((point) => point.index === waypoints.length);
            const allOrdinals = group.points.map((point) => point.index).join('/');
            const ordinals = group.points.length > 4 ? `${first.index}/…/${group.points[group.points.length - 1].index}` : allOrdinals;
            const markerWidth = Math.max(26, Math.min(110, ordinals.length * 7 + 14));
            const label = group.points.length === 1 && first.label !== String(first.index) ? first.label : '';
            const alignEnd = group.x > geometry.width * .7;
            const position = showWaypointCoordinates && !compact ? seaWaypointPosition(visualWaypoints[first.index - 1]) : null;
            const coordinateX = Math.max(60 - group.x, Math.min(geometry.width - group.x - 60, 0));
            const coordinateY = Math.min(21, geometry.height - group.y - 16);
            const densePoints = group.points.filter(point => waypoints[point.index - 1]?.denseTraffic).map(point => point.index);
            const vigilance = vigilanceLabel(densePoints);
            const vigilanceX = (alignEnd ? -1 : 1) * (markerWidth / 2 + 16);
            // Near the lower edge, the coordinate labels move upwards; keep the eye above both labels instead.
            const vigilanceY = position && coordinateY < 21 ? -44 : 0;
            return <g className={`so-route-map-point${isStart ? ' is-start' : ''}${isEnd ? ' is-end' : ''}`} data-point-indices={allOrdinals} key={`${group.x}:${group.y}`} transform={`translate(${group.x} ${group.y})`}>
              <title>{[group.points.map((point) => `Point ${point.index} · ${point.label}${point.description ? ` · ${point.description}` : ''}`).join('\n'), vigilance].filter(Boolean).join('\n')}</title>
              {isEnd && <rect className="so-route-map-finish-ring" x={-markerWidth / 2 - 4} y={-17} width={markerWidth + 8} height={34} rx={17} vectorEffect="non-scaling-stroke" />}
              <rect className="so-route-map-pin" x={-markerWidth / 2} y={-13} width={markerWidth} height={26} rx={13} vectorEffect="non-scaling-stroke" />
              <text className="so-route-map-ordinal" textAnchor="middle" dominantBaseline="central">{ordinals}</text>
              {label && <text className="so-route-map-point-label" x={alignEnd ? -markerWidth / 2 - 7 : markerWidth / 2 + 7} y={-18} textAnchor={alignEnd ? 'end' : 'start'}>{label.length > 20 ? `${label.slice(0, 19)}…` : label}</text>}
              {position && <text className="so-route-map-point-coordinates" textAnchor="middle" x={coordinateX} y={coordinateY}><tspan x={coordinateX}>{formatSeaLatitude(position.latitude)}</tspan><tspan x={coordinateX} dy={11}>{formatSeaLongitude(position.longitude)}</tspan></text>}
              {vigilance && <g className="so-route-map-point-vigilance" role="img" aria-label={vigilance}>
                <title>{vigilance}</title><circle cx={vigilanceX} cy={vigilanceY} r={10} />
                <Eye aria-hidden="true" x={vigilanceX - 7} y={vigilanceY - 7} size={14} strokeWidth={1.8} />
              </g>}
            </g>;
          })}</g>
          <g aria-hidden="true" className="so-route-map-north" transform={`translate(${geometry.width - 23} 31)`}><text textAnchor="middle" y={-15}>N</text><path d="M 0 9 V -7 M -4 -2 L 0 -7 L 4 -2" vectorEffect="non-scaling-stroke" /></g>
          {geometry.scale && <g aria-hidden="true" className="so-route-map-scale"><path d={`M ${geometry.scale.from.x} ${geometry.scale.from.y - 4} V ${geometry.scale.from.y + 4} M ${geometry.scale.from.x} ${geometry.scale.from.y} H ${geometry.scale.to.x} M ${geometry.scale.to.x} ${geometry.scale.to.y - 4} V ${geometry.scale.to.y + 4}`} vectorEffect="non-scaling-stroke" /><text x={(geometry.scale.from.x + geometry.scale.to.x) / 2} y={geometry.scale.from.y - 8} textAnchor="middle">{geometry.scale.label}</text></g>}
          {!compact && renderOverlay?.(geometry, { places })}
        </g>
      </svg> : <div className="so-route-map-empty"><MapPin aria-hidden="true" size={22} /><p>Renseignez une latitude et une longitude valides pour afficher les points de passage.</p></div>}
      {!summaryBelowMap && voyageSummary}
    </div>
    {summaryBelowMap && voyageSummary}
    {route && route.legs.length > 0 && <div className="so-route-map-leg-summary">
      <p>{route.cruiseSpeedKnots === null ? 'Distance directe entre points ; durée indisponible sans vitesse maximale du navire.' : `Estimations à ${route.cruiseSpeedKnots} nd : 60 % de la vitesse maximale, arrondi au nœud supérieur. Distances directes, sans routage ; horaires manuels conservés.`}</p>
      {showLegList && <ul className="so-route-map-leg-list" aria-label="Distances et durées entre les waypoints">{route.legs.map(leg => <li key={`${leg.fromIndex}:${leg.toIndex}`}><strong>{leg.fromIndex} → {leg.toIndex}</strong><span>{leg.distanceLabel} · {leg.durationLabel || 'Durée indisponible'}</span></li>)}</ul>}
      {route.invalidLegCount > 0 && <p>Parcours incomplet : les totaux restent indisponibles si des coordonnées manquent.</p>}
    </div>}
    {geometry.invalidCount > 0 && <p className="so-route-map-omissions" role="status">{geometry.invalidCount === 1 ? '1 point sans coordonnées valides n’est pas représenté ; la liaison est interrompue à cet endroit.' : `${geometry.invalidCount} points sans coordonnées valides ne sont pas représentés ; les liaisons sont interrompues à ces endroits.`}</p>}
    {definedPorts.issues.length > 0 && <p className="so-route-map-omissions" role="status">{definedPorts.issues.map(issue => `${issue.role === 'departure' ? 'Départ' : 'Arrivée'} : ${issue.input} — ${issue.reason === 'ambiguous' ? 'plusieurs ports correspondent, précisez le libellé du catalogue' : issue.reason === 'unlocated' ? 'position propre non disponible dans le catalogue' : 'port non identifié dans le catalogue'}.`).join(' ')}</p>}
    {definedPorts.ports.length > visibleDefinedPorts.length && <p className="so-route-map-omissions" role="status">{definedPorts.ports.filter(port => !visibleDefinedPorts.some(visible => visible.key === port.key)).map(port => `${port.roleLabel} : ${port.port.port} — hors du cadre conservé.`).join(' ')}</p>}
    {places && geometry.projection && <details className="so-route-map-places"><summary>Ports dans cette région · {places.ports.length}</summary>
      <div className="so-route-map-port-list">
        <p>Catalogue partagé avec Projets. Points de référence indicatifs : ni entrées de port ni positions de quai.</p>
        <ul aria-label="Ports du catalogue dans le cadre affiché">{places.ports.map(item => <li key={item.key}><i className="so-route-map-port-list-dot" aria-hidden="true" />{onPortSelect ? <button type="button" className="sp-button sp-button--secondary so-route-map-port-choice" aria-label={`Ajouter le port ${formatProjectPort(item.port)} comme waypoint`} onClick={() => onPortSelect([item])}><span>{formatProjectPort(item.port)}<small>{item.location.source === 'sandre' ? 'Point publié SANDRE/SHOM' : 'Repère NGA World Port Index · position indicative'}</small></span></button> : <span>{formatProjectPort(item.port)}<small>{item.location.source === 'sandre' ? 'Point publié SANDRE/SHOM' : 'Repère NGA World Port Index · position indicative'}</small></span>}</li>)}</ul>
        {places.ports.length === 0 && <p>Aucun port géoréférencé du catalogue dans ce cadre.</p>}
        {places.relatedPorts.length > 0 && <><p>Rattachements statistiques aux ports visibles · {places.relatedPorts.length}. Leur position propre n’est pas disponible ; ils ne sont pas placés sur la carte.</p>
          <ul aria-label="Ports rattachés sans position propre">{places.relatedPorts.map(item => <li key={item.key}><span>{formatProjectPort(item.port)}<small>Rattachement à {item.port.locodePort || item.parent.name} · position propre non disponible</small></span></li>)}</ul></>}
        <p>Couverture géographique du catalogue : France {places.coverage.france.located}/{places.coverage.france.total} ; Angleterre {places.coverage.england.located}/{places.coverage.england.total}. Les entrées sans position ne peuvent pas être filtrées géographiquement. Les libellés de carte sont espacés pour rester lisibles ; la liste conserve tous les ports localisés dans le cadre.</p>
      </div>
    </details>}
    <figcaption className="so-route-map-caption"><span className="so-route-map-legend">{(!definedPorts.ports.length || waypoints.length > 0) && <><span><i className="is-start" aria-hidden="true" />{definedPorts.ports.length ? 'Premier waypoint' : 'Départ'}</span><span><i className="is-end" aria-hidden="true" />{definedPorts.ports.length ? 'Dernier waypoint' : 'Arrivée'}</span><span>Numéros : ordre du tableau</span></>}{definedPorts.ports.length > 0 && <span><i className="is-port" aria-hidden="true" />Ports de départ / arrivée</span>}{places && <><span><i className="is-port" aria-hidden="true" />Ports</span><span><i className="is-city" aria-hidden="true" />Villes</span></>}</span><span>Fond Natural Earth · Tracé indicatif</span></figcaption>
    {ensureZonesVisible && layers.polygons.length > 0 && <p className="so-route-map-legend so-route-map-zone-legend" aria-label="Légende des zones"><span>Zones :</span>{layers.polygons.map(({ zone }) => <span key={zone.id}>Z{visualZones.findIndex(item => item.id === zone.id) + 1} — {zone.name || 'Sans nom'}</span>)}</p>}
    {(places || definedPorts.ports.length > 0) && <p className="so-route-map-places-attribution">{places && <>Villes : <a href="https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/" target="_blank" rel="noopener noreferrer">Natural Earth</a> · </>}Ports : <a href="https://www.data.gouv.fr/datasets/ports-espace-maritime-francais" target="_blank" rel="noopener noreferrer">SANDRE/SHOM</a> et <a href="https://msi.nga.mil/Publications/WPI" target="_blank" rel="noopener noreferrer">NGA</a>. Couverture partielle et précision non garantie. Ne pas utiliser pour naviguer.</p>}
  </figure>;
}
