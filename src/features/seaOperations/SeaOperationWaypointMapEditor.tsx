import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, LocateFixed, MapPin, Maximize, Minimize, Minus, Move, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import type { SeaPosition } from './seaOperationNavigation';
import { SeaOperationRouteMap } from './SeaOperationRouteMap';
import {
  buildSeaOperationRouteMap, DEFAULT_ROUTE_MAP_VIEWPORT, moveRouteMapViewport, routeMapPositionAt,
  zoomRouteMapViewport, type RouteMapViewport, type SeaOperationRouteMapGeometry,
} from './seaOperationRouteMapGeometry';
import './seaOperationWaypointMapEditor.css';
import { useSeaOperationMapFullscreen } from './useSeaOperationMapFullscreen';
import { formatSeaPosition } from './seaOperationCoordinates';
import { SEA_OPERATION_MAP_PORT_CATALOG, type SeaOperationMapPort } from './seaOperationMapPlaces';
import { formatProjectPort } from '../projects/projectPorts';

interface MapGesture {
  pointerId: number;
  clientX: number;
  clientY: number;
  element: SVGRectElement;
  bounds: DOMRect;
  geometry: SeaOperationRouteMapGeometry;
  dragging: boolean;
  cancelled: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

function mapPixelAt(svg: SVGSVGElement, geometry: SeaOperationRouteMapGeometry, clientX: number, clientY: number) {
  const matrix = svg.getScreenCTM?.();
  if (matrix && typeof svg.createSVGPoint === 'function') {
    const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
    return point.matrixTransform(matrix.inverse());
  }
  // Default SVG preserveAspectRatio is xMidYMid meet; exclude any letterboxing.
  const bounds = svg.getBoundingClientRect();
  const scale = Math.min(bounds.width / geometry.width, bounds.height / geometry.height);
  return { x: (clientX - bounds.left - (bounds.width - geometry.width * scale) / 2) / scale,
    y: (clientY - bounds.top - (bounds.height - geometry.height * scale) / 2) / scale };
}

function groupPortTargets(markers: readonly { x: number; y: number; ports: readonly SeaOperationMapPort[] }[]) {
  const groups = new Map<string, { key: string; x: number; y: number; ports: SeaOperationMapPort[] }>();
  for (const marker of markers) {
    const key = `${marker.x}:${marker.y}`, existing = groups.get(key);
    if (existing) existing.ports.push(...marker.ports.filter(port => !existing.ports.some(item => item.key === port.key)));
    else groups.set(key, { key, x: marker.x, y: marker.y, ports: [...marker.ports] });
  }
  return [...groups.values()];
}

/** Only this wrapper accepts gestures. Moving its viewport never modifies the recorded route. */
export function SeaOperationWaypointMapEditor({ waypoints, onAddWaypoint, onMoveWaypoint, onDeleteWaypoint, disabled = false, maxSpeedKnots, etd, eta }: {
  waypoints: readonly SeaOperationWaypoint[];
  onAddWaypoint: (position: SeaPosition, port?: { name: string; portKey?: string }) => void;
  onMoveWaypoint?: (id: string, position: SeaPosition) => void;
  onDeleteWaypoint?: (id: string) => void;
  disabled?: boolean;
  maxSpeedKnots?: number | null;
  etd?: string;
  eta?: string;
}) {
  const instructionsId = useId();
  const [placing, setPlacing] = useState(false);
  const [viewport, setViewport] = useState<RouteMapViewport>();
  const [announcement, setAnnouncement] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [repositioningId, setRepositioningId] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [selectedPortKeys, setSelectedPortKeys] = useState<string[]>([]);
  const [selectedPortKey, setSelectedPortKey] = useState<string | null>(null);
  const portProposalRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<SeaOperationRouteMapGeometry | null>(null);
  const surfaceRef = useRef<SVGRectElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const fullscreenToggleRef = useRef<HTMLButtonElement>(null);
  const gestureRef = useRef<MapGesture | null>(null);
  const lastPointerAdd = useRef<{ time: number; x: number; y: number } | null>(null);

  const cancelGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.holdTimer != null) clearTimeout(gesture.holdTimer);
    if (gesture?.element.hasPointerCapture?.(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId);
    setGrabbing(false);
  }, []);
  const clearPortSelection = useCallback(() => { setSelectedPortKeys([]); setSelectedPortKey(null); }, []);
  const resetInteraction = useCallback(() => { cancelGesture(); lastPointerAdd.current = null; setRepositioningId(null); }, [cancelGesture]);
  const recordGeometry = useCallback((geometry: SeaOperationRouteMapGeometry) => {
    const previous = geometryRef.current;
    if (previous && (previous.width !== geometry.width || previous.height !== geometry.height)) resetInteraction();
    geometryRef.current = geometry;
  }, [resetInteraction]);
  const fullscreen = useSeaOperationMapFullscreen(editorRef, fullscreenToggleRef, resetInteraction, toggleRef);

  useEffect(() => {
    if (disabled || !placing) { resetInteraction(); if (disabled) clearPortSelection(); }
    else surfaceRef.current?.focus({ preventScroll: true });
  }, [disabled, placing, resetInteraction, clearPortSelection]);

  useEffect(() => {
    if (!disabled && selectedPortKeys.length > 0) portProposalRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [disabled, selectedPortKeys, selectedPortKey]);

  useEffect(() => {
    const blur = () => { resetInteraction(); clearPortSelection(); };
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); resetInteraction(); };
  }, [resetInteraction, clearPortSelection]);

  useEffect(() => {
    const svg = surfaceRef.current?.ownerSVGElement;
    if (disabled || !placing || !svg) return;
    const wheel = (event: WheelEvent) => {
      const geometry = geometryRef.current;
      if (!geometry?.viewport || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
      const pixel = mapPixelAt(svg, geometry, event.clientX, event.clientY);
      const anchor = routeMapPositionAt(geometry, pixel.x, pixel.y);
      if (!anchor) return;
      event.preventDefault();
      cancelGesture(); lastPointerAdd.current = null;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? geometry.height : 1);
      const zoomed = zoomRouteMapViewport(geometry.viewport, Math.exp(-Math.max(-800, Math.min(800, delta)) * .002));
      // Solve the local latitude-dependent projection so the coordinate under the cursor stays fixed.
      let centered = zoomed;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const latitudeFactor = Math.max(.05, Math.cos(centered.centerLatitude * Math.PI / 180));
        const next = { ...geometry, viewport: centered, projection: { centerLatitude: centered.centerLatitude,
          centerLongitude: centered.centerLongitude, latitudePixelsPerDegree: geometry.width / (centered.longitudeSpan * latitudeFactor),
          longitudePixelsPerDegree: geometry.width / centered.longitudeSpan } };
        const moved = routeMapPositionAt(next, pixel.x, pixel.y);
        if (!moved) break;
        const latitudeDifference = anchor.latitude - moved.latitude;
        const longitudeDifference = ((anchor.longitude - moved.longitude + 540) % 360) - 180;
        centered = zoomRouteMapViewport({ ...centered, centerLatitude: centered.centerLatitude + latitudeDifference,
          centerLongitude: centered.centerLongitude + longitudeDifference }, 1);
        if (Math.abs(latitudeDifference) < 1e-10 && Math.abs(longitudeDifference) < 1e-10) break;
      }
      setViewport(centered);
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [disabled, placing, cancelGesture]);

  function togglePlacement() {
    if (disabled) return;
    cancelGesture();
    lastPointerAdd.current = null;
    setSelectedId(null); setSelectedGroupIds([]); setRepositioningId(null);
    setSelectedPortKeys([]); setSelectedPortKey(null);
    if (!placing) setViewport(geometryRef.current?.viewport ?? { ...DEFAULT_ROUTE_MAP_VIEWPORT });
    if (placing && fullscreen.isFullscreen) fullscreen.exitFullscreen();
    setPlacing(!placing);
    if (placing) toggleRef.current?.focus({ preventScroll: true });
  }

  function addPosition(position: SeaPosition | null) {
    if (disabled || !placing || !position) return;
    onAddWaypoint(position);
    setAnnouncement(`Point ${waypoints.length + 1} ajouté au tableau · ${formatSeaPosition(position)}.`);
  }

  const selected = waypoints.find(point => point.id === selectedId);
  const repositioning = Boolean(placing && !disabled && selected && repositioningId === selected.id && onMoveWaypoint);
  const selectedGroup = waypoints.filter(point => selectedGroupIds.includes(point.id));
  const proposedPorts = SEA_OPERATION_MAP_PORT_CATALOG.filter(port => selectedPortKeys.includes(port.key) && port.location);
  const proposedPort = proposedPorts.find(port => port.key === selectedPortKey);

  function selectPorts(ports: readonly SeaOperationMapPort[]) {
    if (disabled || repositioning) return;
    const located = ports.filter(port => port.location);
    if (!located.length) return;
    resetInteraction(); setSelectedId(null); setSelectedGroupIds([]);
    setSelectedPortKeys(located.map(port => port.key)); setSelectedPortKey(located.length === 1 ? located[0].key : null);
  }

  function confirmPort() {
    if (disabled || !proposedPort?.location) return;
    const position = { latitude: proposedPort.location.latitude, longitude: proposedPort.location.longitude };
    if (!placing) { setViewport(geometryRef.current?.viewport ?? { ...DEFAULT_ROUTE_MAP_VIEWPORT }); setPlacing(true); }
    cancelGesture(); lastPointerAdd.current = null;
    onAddWaypoint(position, { name: proposedPort.port.port, portKey: proposedPort.key });
    setAnnouncement(`${proposedPort.port.port} ajouté comme waypoint · ${formatSeaPosition(position)}.`);
    setSelectedPortKeys([]); setSelectedPortKey(null);
  }

  function selectWaypoint(id: string) {
    if (disabled || !placing) return;
    resetInteraction(); clearPortSelection(); setSelectedGroupIds([]); setSelectedId(id);
  }

  function placePosition(position: SeaPosition | null) {
    if (disabled || !placing || !position) return;
    setSelectedPortKeys([]); setSelectedPortKey(null);
    if (repositioning && selected && onMoveWaypoint) {
      onMoveWaypoint(selected.id, position);
      setAnnouncement(`Waypoint ${selected.number || waypoints.indexOf(selected) + 1} repositionné · ${formatSeaPosition(position)}.`);
      setRepositioningId(null); setSelectedId(null); setSelectedGroupIds([]);
    } else { setSelectedId(null); setSelectedGroupIds([]); addPosition(position); }
  }

  function addAtCentre() {
    const geometry = geometryRef.current;
    if (geometry) placePosition(routeMapPositionAt(geometry, geometry.width / 2, geometry.height / 2));
  }

  function moveView(east: number, north: number) {
    if (disabled || !placing) return;
    cancelGesture();
    lastPointerAdd.current = null;
    const geometry = geometryRef.current;
    if (geometry?.viewport) setViewport(moveRouteMapViewport(geometry.viewport, east, north, geometry.width, geometry.height));
  }

  function zoomView(factor: number) {
    if (disabled || !placing) return;
    cancelGesture();
    lastPointerAdd.current = null;
    const current = geometryRef.current?.viewport;
    if (current) setViewport(zoomRouteMapViewport(current, factor));
  }

  function fitRoute() {
    if (disabled || !placing) return;
    cancelGesture();
    lastPointerAdd.current = null;
    const geometry = geometryRef.current;
    setViewport(buildSeaOperationRouteMap(waypoints, geometry?.width, geometry?.height).viewport ?? { ...DEFAULT_ROUTE_MAP_VIEWPORT });
  }

  function pointerDown(event: PointerEvent<SVGRectElement>, geometry: SeaOperationRouteMapGeometry) {
    if (disabled || !placing || event.button !== 0) return;
    if (gestureRef.current) { cancelGesture(); return; }
    if (event.isPrimary === false) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const gesture: MapGesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, element: event.currentTarget, bounds, geometry, dragging: false, cancelled: false, holdTimer: null };
    gestureRef.current = gesture;
    gesture.holdTimer = setTimeout(() => {
      if (gestureRef.current !== gesture || gesture.cancelled) return;
      gesture.dragging = true; setGrabbing(true); lastPointerAdd.current = null;
    }, 300);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGRectElement>) {
    const gesture = gestureRef.current;
    if (disabled || !placing || !gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.clientX, dy = event.clientY - gesture.clientY;
    if (Math.hypot(dx, dy) > 6) { gesture.dragging = true; setGrabbing(true); if (gesture.holdTimer != null) clearTimeout(gesture.holdTimer); }
    if (!gesture.dragging || !gesture.geometry.viewport) return;
    event.preventDefault();
    lastPointerAdd.current = null;
    setViewport(moveRouteMapViewport(gesture.geometry.viewport, -dx / gesture.bounds.width, dy / gesture.bounds.height, gesture.geometry.width, gesture.geometry.height));
  }

  function pointerUp(event: PointerEvent<SVGRectElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    cancelGesture();
    if (disabled || !placing || gesture.cancelled || gesture.dragging || Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) > 6) return;
    const previous = lastPointerAdd.current;
    if (previous && event.timeStamp - previous.time < 350 && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 6) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pixel = mapPixelAt(svg, gesture.geometry, event.clientX, event.clientY);
    const position = routeMapPositionAt(gesture.geometry, pixel.x, pixel.y);
    if (!position) return;
    lastPointerAdd.current = { time: event.timeStamp, x: event.clientX, y: event.clientY };
    placePosition(position);
  }

  function keyDown(event: KeyboardEvent<SVGRectElement>) {
    if (disabled || !placing || event.target !== event.currentTarget) return;
    const directions: Record<string, [number, number]> = { ArrowUp: [0, .15], ArrowDown: [0, -.15], ArrowLeft: [-.15, 0], ArrowRight: [.15, 0] };
    if (directions[event.key]) { event.preventDefault(); moveView(...directions[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) addAtCentre(); }
  }

  return <section aria-label="Placement des waypoints" ref={editorRef} tabIndex={fullscreen.isFullscreen ? -1 : undefined} className={`so-waypoint-map-editor${placing ? ' is-placing' : ''}${grabbing ? ' is-grabbing' : ''}${repositioning ? ' is-repositioning' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}${fullscreen.isFallbackFullscreen ? ' is-fallback-fullscreen' : ''}`} onKeyDownCapture={fullscreen.onKeyDownCapture} onKeyDown={(event) => {
    if ((placing || proposedPorts.length > 0) && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (proposedPorts.length) { resetInteraction(); clearPortSelection(); (placing ? surfaceRef.current : toggleRef.current)?.focus({ preventScroll: true }); }
      else if (selected || selectedGroup.length) { resetInteraction(); setSelectedId(null); setSelectedGroupIds([]); surfaceRef.current?.focus({ preventScroll: true }); }
      else togglePlacement();
    }
  }}>
    <div className="so-waypoint-map-toolbar">
      <button type="button" className={`sp-button ${placing ? 'sp-button--primary' : 'sp-button--secondary'}`} ref={toggleRef} aria-pressed={placing} onClick={togglePlacement} disabled={disabled}>
        {placing ? <Check aria-hidden="true" size={16} /> : <MapPin aria-hidden="true" size={16} />}{placing ? 'Terminer le placement' : 'Placer les waypoints'}
      </button>
      {placing && <>
        <button type="button" className="sp-button sp-button--secondary" onClick={fitRoute} disabled={disabled}><LocateFixed aria-hidden="true" size={16} />Cadrer le parcours</button>
        <button type="button" className="sp-button sp-button--primary" onClick={addAtCentre} disabled={disabled}>{repositioning ? <Move aria-hidden="true" size={16} /> : <Plus aria-hidden="true" size={16} />}{repositioning ? 'Repositionner au centre' : 'Ajouter au centre'}</button>
      </>}
      {(placing || fullscreen.isFullscreen) && <button type="button" className="sp-button sp-button--secondary" ref={fullscreenToggleRef} aria-label={fullscreen.isFullscreen ? 'Quitter le plein écran' : 'Afficher la carte en plein écran'} aria-pressed={fullscreen.isFullscreen} disabled={disabled && !fullscreen.isFullscreen} onClick={() => {
        if (fullscreen.isFullscreen) fullscreen.exitFullscreen(); else if (!disabled) fullscreen.enterFullscreen();
      }}>{fullscreen.isFullscreen ? <Minimize aria-hidden="true" size={16} /> : <Maximize aria-hidden="true" size={16} />}{fullscreen.isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}</button>}
    </div>
    {placing && <>
      <p id={instructionsId} className="so-waypoint-map-instructions">{repositioning ? 'Cliquez sur la nouvelle position. Glissez pour déplacer la carte, molette pour zoomer. Clavier : flèches et Entrée pour repositionner au centre.' : 'Cliquez pour ajouter un waypoint. Sélectionnez un point pour le déplacer ou le supprimer. Glissez pour déplacer la carte, molette pour zoomer. Clavier : flèches et Entrée.'} {fullscreen.isFullscreen ? 'Échap : quitter le plein écran.' : selected || selectedGroup.length ? 'Échap : annuler la sélection.' : 'Échap : fin du placement.'}</p>
      <div className="so-waypoint-map-navigation" aria-label="Déplacement et zoom de la carte">
        <div className="so-waypoint-map-controls">
          <button type="button" className="sp-button sp-button--secondary" aria-label="Zoomer sur la carte" onClick={() => zoomView(2)} disabled={disabled}><Plus aria-hidden="true" size={18} /></button>
          <button type="button" className="sp-button sp-button--secondary" aria-label="Dézoomer la carte" onClick={() => zoomView(.5)} disabled={disabled}><Minus aria-hidden="true" size={18} /></button>
          <button type="button" className="sp-button sp-button--secondary" aria-label="Déplacer la carte vers le nord" onClick={() => moveView(0, .2)} disabled={disabled}><ArrowUp aria-hidden="true" size={18} /></button>
          <button type="button" className="sp-button sp-button--secondary" aria-label="Déplacer la carte vers le sud" onClick={() => moveView(0, -.2)} disabled={disabled}><ArrowDown aria-hidden="true" size={18} /></button>
          <button type="button" className="sp-button sp-button--secondary" aria-label="Déplacer la carte vers l’ouest" onClick={() => moveView(-.2, 0)} disabled={disabled}><ArrowLeft aria-hidden="true" size={18} /></button>
          <button type="button" className="sp-button sp-button--secondary" aria-label="Déplacer la carte vers l’est" onClick={() => moveView(.2, 0)} disabled={disabled}><ArrowRight aria-hidden="true" size={18} /></button>
        </div>
        {viewport && <span className="so-waypoint-map-centre">Centre : {formatSeaPosition({ latitude: viewport.centerLatitude, longitude: viewport.centerLongitude })}</span>}
      </div>
      {(selected || selectedGroup.length > 1) && <div className="so-waypoint-map-selection" role="group" aria-label="Waypoint sélectionné">
        {selected ? <><strong>Waypoint {selected.number || waypoints.indexOf(selected) + 1}</strong>
          {onMoveWaypoint && <button type="button" className={`sp-button ${repositioning ? 'sp-button--primary' : 'sp-button--secondary'}`} disabled={disabled} aria-pressed={repositioning} onClick={() => {
            if (disabled) return; cancelGesture(); lastPointerAdd.current = null; setRepositioningId(selected.id); surfaceRef.current?.focus({ preventScroll: true });
          }}><Move size={15} aria-hidden="true" />Repositionner</button>}
          {onDeleteWaypoint && <button type="button" className="sp-button sp-button--secondary" disabled={disabled} onClick={() => {
            if (disabled) return; resetInteraction(); onDeleteWaypoint(selected.id); setSelectedId(null); setSelectedGroupIds([]);
            setAnnouncement(`Waypoint ${selected.number || waypoints.indexOf(selected) + 1} supprimé du tableau.`); surfaceRef.current?.focus({ preventScroll: true });
          }}><Trash2 size={15} aria-hidden="true" />Supprimer le waypoint</button>}
        </> : <div role="group" aria-label="Waypoints à cette position"><strong>Plusieurs waypoints à cette position :</strong>{selectedGroup.map(point => <button type="button" className="sp-button sp-button--secondary" key={point.id} disabled={disabled} onClick={() => selectWaypoint(point.id)}>Sélectionner le waypoint {waypoints.indexOf(point) + 1}</button>)}</div>}
        <button type="button" className="sp-button sp-button--secondary" disabled={disabled} onClick={() => { resetInteraction(); setSelectedId(null); setSelectedGroupIds([]); surfaceRef.current?.focus({ preventScroll: true }); }}><X size={15} aria-hidden="true" />Annuler la sélection</button>
      </div>}
    </>}
    {!disabled && proposedPorts.length > 0 && <div className="so-waypoint-map-port-proposal" ref={portProposalRef} role="group" aria-label="Port proposé comme waypoint">
      {proposedPort?.location ? <><div><strong>{formatProjectPort(proposedPort.port)}</strong><span>{formatSeaPosition(proposedPort.location)}</span><small>Point de référence du catalogue, à valider pour votre route.</small></div><button type="button" className="sp-button sp-button--primary" onClick={confirmPort}>Ajouter ce port comme waypoint</button></>
        : <div role="group" aria-label="Ports à cette position"><strong>Choisissez le port :</strong>{proposedPorts.map(port => <button key={port.key} type="button" className="sp-button sp-button--secondary" onClick={() => setSelectedPortKey(port.key)}>{formatProjectPort(port.port)}</button>)}</div>}
      <button type="button" className="sp-button sp-button--secondary" onClick={() => { resetInteraction(); clearPortSelection(); (placing ? surfaceRef.current : toggleRef.current)?.focus({ preventScroll: true }); }}>Annuler</button>
    </div>}
    <SeaOperationRouteMap waypoints={waypoints} showPlaces showWaypointCoordinates showRouteLegs={placing || waypoints.length > 1} maxSpeedKnots={maxSpeedKnots} etd={etd} eta={eta} viewport={placing ? viewport : undefined} onGeometry={recordGeometry} fillAvailableSpace={fullscreen.isFullscreen}
      onPortSelect={!disabled && !repositioning ? selectPorts : undefined} renderOverlay={!disabled ? (geometry, { places }) => <>
      {placing && <rect className="so-waypoint-map-surface" ref={surfaceRef} width={geometry.width} height={geometry.height} role="button" tabIndex={0} aria-label="Zone de placement des waypoints" aria-describedby={instructionsId} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape" onKeyDown={keyDown} onPointerDown={(event) => pointerDown(event, geometry)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} />}
      {placing && !selected && selectedGroup.length === 0 && proposedPorts.length === 0 && <g aria-hidden="true" className="so-waypoint-map-crosshair" transform={`translate(${geometry.width / 2} ${geometry.height / 2})`}><circle r={10} /><path d="M -17 0 H -5 M 5 0 H 17 M 0 -17 V -5 M 0 5 V 17" /></g>}
      {!repositioning && groupPortTargets(places?.markers || []).map(marker => <g key={marker.key} className="so-waypoint-map-port-target" role="button" tabIndex={0}
        aria-label={marker.ports.length === 1 ? `Sélectionner le port ${formatProjectPort(marker.ports[0].port)}` : `Choisir un port parmi ${marker.ports.map(port => port.port.port).join(', ')}`}
        onPointerDown={event => { event.stopPropagation(); cancelGesture(); }} onClick={event => {
          event.preventDefault(); event.stopPropagation();
          const svg = event.currentTarget.ownerSVGElement;
          const pixel = svg && (event.clientX !== 0 || event.clientY !== 0) ? mapPixelAt(svg, geometry, event.clientX, event.clientY) : null;
          const target = pixel ? groupPortTargets(places?.markers || []).reduce((nearest, candidate) => Math.hypot(candidate.x - pixel.x, candidate.y - pixel.y) < Math.hypot(nearest.x - pixel.x, nearest.y - pixel.y) ? candidate : nearest, marker) : marker;
          selectPorts(target.ports);
        }} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) selectPorts(marker.ports); }
        }}><circle cx={marker.x} cy={marker.y} r={20} /></g>)}
      {placing && !repositioning && geometry.points.filter((point, index, points) => points.findIndex(candidate => candidate.x === point.x && candidate.y === point.y) === index).map(point => {
        const group = geometry.points.filter(candidate => candidate.x === point.x && candidate.y === point.y);
        const original = waypoints[point.index - 1];
        if (!original) return null;
        const chosen = group.some(candidate => waypoints[candidate.index - 1]?.id === selectedId || selectedGroupIds.includes(waypoints[candidate.index - 1]?.id));
        const select = () => {
          if (disabled) return;
          if (group.length > 1) { resetInteraction(); setSelectedId(null); setSelectedGroupIds(group.map(candidate => waypoints[candidate.index - 1].id)); }
          else selectWaypoint(original.id);
        };
        return <g key={original.id} className={`so-waypoint-map-marker${chosen ? ' is-selected' : ''}`} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0}
          aria-label={group.length > 1 ? `Sélectionner les waypoints ${group.map(candidate => candidate.index).join(', ')}` : `Sélectionner le waypoint ${point.index}`} aria-pressed={chosen}
          onPointerDown={event => { event.stopPropagation(); cancelGesture(); }} onClick={event => { event.preventDefault(); event.stopPropagation(); select(); }} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) select(); }
          }}><circle r={20} /></g>;
      })}
    </> : undefined} />
    <p className="so-waypoint-map-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </section>;
}
