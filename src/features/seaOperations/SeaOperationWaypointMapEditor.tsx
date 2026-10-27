import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, LocateFixed, MapPin, Maximize, Minimize, Minus, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AppContextMenu, AppContextMenuItem, type AppContextMenuPosition } from '../../components/AppContextMenu';
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
  element: SVGElement;
  bounds: DOMRect;
  geometry: SeaOperationRouteMapGeometry;
  dragging: boolean;
  cancelled: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  waypointId?: string;
  waypointPixel?: { x: number; y: number };
  moved?: boolean;
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
  const [menuPosition, setMenuPosition] = useState<AppContextMenuPosition | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; position: SeaPosition } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [selectedPortKeys, setSelectedPortKeys] = useState<string[]>([]);
  const geometryRef = useRef<SeaOperationRouteMapGeometry | null>(null);
  const surfaceRef = useRef<SVGRectElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const fullscreenToggleRef = useRef<HTMLButtonElement>(null);
  const gestureRef = useRef<MapGesture | null>(null);
  const suppressedMarkerClick = useRef<string | null>(null);
  const lastPointerAdd = useRef<{ time: number; x: number; y: number } | null>(null);

  const cancelGesture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture?.holdTimer != null) clearTimeout(gesture.holdTimer);
    if (gesture?.element.hasPointerCapture?.(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId);
    setGrabbing(false); setDragPreview(null);
  }, []);
  const closeMenu = useCallback(() => { setMenuPosition(null); setSelectedId(null); setSelectedGroupIds([]); setSelectedPortKeys([]); }, []);
  const resetInteraction = useCallback(() => { cancelGesture(); lastPointerAdd.current = null; closeMenu(); }, [cancelGesture, closeMenu]);
  const recordGeometry = useCallback((geometry: SeaOperationRouteMapGeometry) => {
    const previous = geometryRef.current;
    if (previous && (previous.width !== geometry.width || previous.height !== geometry.height)) resetInteraction();
    geometryRef.current = geometry;
  }, [resetInteraction]);
  const fullscreen = useSeaOperationMapFullscreen(editorRef, fullscreenToggleRef, resetInteraction, toggleRef);

  useEffect(() => {
    if (disabled || !placing) resetInteraction();
    else surfaceRef.current?.focus({ preventScroll: true });
  }, [disabled, placing, resetInteraction]);

  useEffect(() => {
    const blur = () => resetInteraction();
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('blur', blur); resetInteraction(); };
  }, [resetInteraction]);

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
      resetInteraction();
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
  }, [disabled, placing, resetInteraction]);

  function togglePlacement() {
    if (disabled) return;
    cancelGesture();
    lastPointerAdd.current = null;
    closeMenu();
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
  const selectedGroup = waypoints.filter(point => selectedGroupIds.includes(point.id));
  const proposedPorts = SEA_OPERATION_MAP_PORT_CATALOG.filter(port => selectedPortKeys.includes(port.key) && port.location);

  function addPort(port: SeaOperationMapPort) {
    if (disabled || !port.location) return;
    const position = { latitude: port.location.latitude, longitude: port.location.longitude };
    if (!placing) { setViewport(geometryRef.current?.viewport ?? { ...DEFAULT_ROUTE_MAP_VIEWPORT }); setPlacing(true); }
    resetInteraction();
    onAddWaypoint(position, { name: port.port.port, portKey: port.key });
    setAnnouncement(`${port.port.port} ajouté comme waypoint · ${formatSeaPosition(position)}.`);
  }

  function selectPorts(ports: readonly SeaOperationMapPort[], position?: AppContextMenuPosition) {
    if (disabled || gestureRef.current?.waypointId) return;
    const located = ports.filter(port => port.location);
    if (!located.length) return;
    if (located.length === 1) { addPort(located[0]); return; }
    resetInteraction(); setSelectedPortKeys(located.map(port => port.key));
    const bounds = editorRef.current?.getBoundingClientRect();
    setMenuPosition(position ?? { x: bounds?.left ?? 12, y: (bounds?.top ?? 0) + 48 });
  }

  function selectWaypoint(id: string, position: AppContextMenuPosition) {
    if (disabled || !placing) return;
    resetInteraction(); setSelectedId(id); setMenuPosition(position);
  }

  function placePosition(position: SeaPosition | null) {
    if (disabled || !placing || !position) return;
    closeMenu(); addPosition(position);
  }

  function addAtCentre() {
    const geometry = geometryRef.current;
    if (geometry) placePosition(routeMapPositionAt(geometry, geometry.width / 2, geometry.height / 2));
  }

  function moveView(east: number, north: number) {
    if (disabled || !placing) return;
    resetInteraction();
    const geometry = geometryRef.current;
    if (geometry?.viewport) setViewport(moveRouteMapViewport(geometry.viewport, east, north, geometry.width, geometry.height));
  }

  function zoomView(factor: number) {
    if (disabled || !placing) return;
    resetInteraction();
    const current = geometryRef.current?.viewport;
    if (current) setViewport(zoomRouteMapViewport(current, factor));
  }

  function fitRoute() {
    if (disabled || !placing) return;
    resetInteraction();
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
    closeMenu();
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
    if (disabled || !placing || !gesture || gesture.waypointId || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.clientX, dy = event.clientY - gesture.clientY;
    if (Math.hypot(dx, dy) > 6) { gesture.dragging = true; setGrabbing(true); if (gesture.holdTimer != null) clearTimeout(gesture.holdTimer); }
    if (!gesture.dragging || !gesture.geometry.viewport) return;
    event.preventDefault();
    lastPointerAdd.current = null;
    setViewport(moveRouteMapViewport(gesture.geometry.viewport, -dx / gesture.bounds.width, dy / gesture.bounds.height, gesture.geometry.width, gesture.geometry.height));
  }

  function pointerUp(event: PointerEvent<SVGRectElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.waypointId || gesture.pointerId !== event.pointerId) return;
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

  function waypointPointerDown(event: PointerEvent<SVGGElement>, geometry: SeaOperationRouteMapGeometry, id: string | undefined) {
    event.stopPropagation();
    if (disabled || !placing || event.button !== 0) return;
    if (gestureRef.current) { cancelGesture(); return; }
    suppressedMarkerClick.current = null;
    if (event.isPrimary === false || !id || !onMoveWaypoint) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    const point = geometry.points.find(item => waypoints[item.index - 1]?.id === id);
    if (bounds.width <= 0 || bounds.height <= 0 || !point) return;
    event.preventDefault(); closeMenu();
    event.currentTarget.focus({ preventScroll: true });
    const gesture: MapGesture = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      element: event.currentTarget, bounds, geometry, waypointId: id, waypointPixel: { x: point.x, y: point.y }, dragging: false, moved: false, cancelled: false, holdTimer: null };
    gestureRef.current = gesture;
    gesture.holdTimer = setTimeout(() => {
      if (gestureRef.current !== gesture) return;
      gesture.dragging = true; setGrabbing(true);
    }, 300);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function waypointDragPosition(gesture: MapGesture, clientX: number, clientY: number) {
    const svg = gesture.element.ownerSVGElement;
    const point = gesture.waypointPixel;
    if (!svg || !point) return null;
    const start = mapPixelAt(svg, gesture.geometry, gesture.clientX, gesture.clientY);
    const end = mapPixelAt(svg, gesture.geometry, clientX, clientY);
    return routeMapPositionAt(gesture.geometry, point.x + end.x - start.x, point.y + end.y - start.y);
  }

  function waypointPointerMove(event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    const gesture = gestureRef.current;
    if (disabled || !placing || !gesture?.waypointId || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) <= 6 && !gesture.moved) return;
    const position = waypointDragPosition(gesture, event.clientX, event.clientY);
    if (!position) return;
    event.preventDefault(); gesture.dragging = true; gesture.moved = true;
    if (gesture.holdTimer != null) clearTimeout(gesture.holdTimer);
    suppressedMarkerClick.current = gesture.waypointId;
    setGrabbing(true); setDragPreview({ id: gesture.waypointId, position });
  }

  function waypointPointerUp(event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    const gesture = gestureRef.current;
    if (!gesture?.waypointId || gesture.pointerId !== event.pointerId) return;
    const position = gesture.moved ? waypointDragPosition(gesture, event.clientX, event.clientY) : null;
    if (gesture.dragging) suppressedMarkerClick.current = gesture.waypointId;
    cancelGesture();
    if (disabled || !placing || !position || !onMoveWaypoint || !waypoints.some(point => point.id === gesture.waypointId)) return;
    onMoveWaypoint(gesture.waypointId, position);
    setAnnouncement(`Waypoint ${waypoints.findIndex(point => point.id === gesture.waypointId) + 1} repositionné · ${formatSeaPosition(position)}.`);
  }

  function waypointKeyboardMove(event: KeyboardEvent<SVGGElement>, id: string | undefined, geometry: SeaOperationRouteMapGeometry) {
    const directions: Record<string, [number, number]> = { ArrowUp: [0, -5], ArrowDown: [0, 5], ArrowLeft: [-5, 0], ArrowRight: [5, 0] };
    const direction = directions[event.key];
    if (!event.altKey || !direction || disabled || !placing || !id || !onMoveWaypoint) return false;
    event.preventDefault(); event.stopPropagation();
    const point = geometry.points.find(item => waypoints[item.index - 1]?.id === id);
    const position = point && routeMapPositionAt(geometry, point.x + direction[0], point.y + direction[1]);
    if (position) { resetInteraction(); onMoveWaypoint(id, position); setAnnouncement(`Waypoint ${waypoints.findIndex(point => point.id === id) + 1} repositionné · ${formatSeaPosition(position)}.`); }
    return true;
  }

  function keyDown(event: KeyboardEvent<SVGRectElement>) {
    if (disabled || !placing || event.target !== event.currentTarget) return;
    const directions: Record<string, [number, number]> = { ArrowUp: [0, .15], ArrowDown: [0, -.15], ArrowLeft: [-.15, 0], ArrowRight: [.15, 0] };
    if (directions[event.key]) { event.preventDefault(); moveView(...directions[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) addAtCentre(); }
  }

  return <section aria-label="Placement des waypoints" ref={editorRef} tabIndex={fullscreen.isFullscreen ? -1 : undefined} className={`so-waypoint-map-editor${placing ? ' is-placing' : ''}${grabbing ? ' is-grabbing' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}${fullscreen.isFallbackFullscreen ? ' is-fallback-fullscreen' : ''}`} onKeyDownCapture={event => {
    if (menuPosition && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); surfaceRef.current?.focus({ preventScroll: true }); }
    else fullscreen.onKeyDownCapture(event);
  }} onKeyDown={(event) => {
    if (placing && !event.defaultPrevented && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (gestureRef.current) resetInteraction(); else togglePlacement();
    }
  }}>
    <div className="so-waypoint-map-toolbar">
      <button type="button" className={`sp-button ${placing ? 'sp-button--primary' : 'sp-button--secondary'}`} ref={toggleRef} aria-pressed={placing} onClick={togglePlacement} disabled={disabled}>
        {placing ? <Check aria-hidden="true" size={16} /> : <MapPin aria-hidden="true" size={16} />}{placing ? 'Terminer le placement' : 'Placer les waypoints'}
      </button>
      {placing && <>
        <button type="button" className="sp-button sp-button--secondary" onClick={fitRoute} disabled={disabled}><LocateFixed aria-hidden="true" size={16} />Cadrer le parcours</button>
        <button type="button" className="sp-button sp-button--primary" onClick={addAtCentre} disabled={disabled}><Plus aria-hidden="true" size={16} />Ajouter au centre</button>
      </>}
      {(placing || fullscreen.isFullscreen) && <button type="button" className="sp-button sp-button--secondary" ref={fullscreenToggleRef} aria-label={fullscreen.isFullscreen ? 'Quitter le plein écran' : 'Afficher la carte en plein écran'} aria-pressed={fullscreen.isFullscreen} disabled={disabled && !fullscreen.isFullscreen} onClick={() => {
        if (fullscreen.isFullscreen) fullscreen.exitFullscreen(); else if (!disabled) fullscreen.enterFullscreen();
      }}>{fullscreen.isFullscreen ? <Minimize aria-hidden="true" size={16} /> : <Maximize aria-hidden="true" size={16} />}{fullscreen.isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}</button>}
    </div>
    {placing && <>
      <p id={instructionsId} className="so-waypoint-map-instructions">Cliquez pour ajouter, maintenez et glissez un waypoint pour le déplacer. Clic sur un waypoint : supprimer. Glissez le fond pour naviguer, molette pour zoomer. Clavier : flèches, Entrée ; Alt+flèches sur un waypoint. {fullscreen.isFullscreen ? 'Échap : quitter le plein écran.' : 'Échap : fermer le menu ou terminer.'}</p>
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
    </>}
    <SeaOperationRouteMap waypoints={waypoints} previewWaypoint={dragPreview} showPlaces showWaypointCoordinates showRouteLegs={placing || waypoints.length > 1} maxSpeedKnots={maxSpeedKnots} etd={etd} eta={eta} viewport={placing ? viewport : undefined} onGeometry={recordGeometry} fillAvailableSpace={fullscreen.isFullscreen}
      onPortSelect={!disabled && !dragPreview ? selectPorts : undefined} renderOverlay={!disabled ? (geometry, { places }) => <>
      {placing && <rect className="so-waypoint-map-surface" ref={surfaceRef} width={geometry.width} height={geometry.height} role="button" tabIndex={0} aria-label="Zone de placement des waypoints" aria-describedby={instructionsId} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape" onKeyDown={keyDown} onPointerDown={(event) => pointerDown(event, geometry)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} />}
      {placing && !menuPosition && !dragPreview && <g aria-hidden="true" className="so-waypoint-map-crosshair" transform={`translate(${geometry.width / 2} ${geometry.height / 2})`}><circle r={10} /><path d="M -17 0 H -5 M 5 0 H 17 M 0 -17 V -5 M 0 5 V 17" /></g>}
      {!dragPreview && groupPortTargets(places?.markers || []).map(marker => <g key={marker.key} className="so-waypoint-map-port-target" role="button" tabIndex={0}
        aria-label={marker.ports.length === 1 ? `Ajouter le port ${formatProjectPort(marker.ports[0].port)} comme waypoint` : `Choisir un port parmi ${marker.ports.map(port => port.port.port).join(', ')}`}
        onPointerDown={event => { event.stopPropagation(); cancelGesture(); }} onClick={event => {
          event.preventDefault(); event.stopPropagation();
          const svg = event.currentTarget.ownerSVGElement;
          const pixel = svg && (event.clientX !== 0 || event.clientY !== 0) ? mapPixelAt(svg, geometry, event.clientX, event.clientY) : null;
          const target = pixel ? groupPortTargets(places?.markers || []).reduce((nearest, candidate) => Math.hypot(candidate.x - pixel.x, candidate.y - pixel.y) < Math.hypot(nearest.x - pixel.x, nearest.y - pixel.y) ? candidate : nearest, marker) : marker;
          selectPorts(target.ports, { x: event.clientX + 12, y: event.clientY + 12 });
        }} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { const bounds = event.currentTarget.getBoundingClientRect(); selectPorts(marker.ports, { x: bounds.right + 8, y: bounds.top }); } }
        }}><circle cx={marker.x} cy={marker.y} r={20} /></g>)}
      {placing && (gestureRef.current?.waypointId ? gestureRef.current.geometry.points : geometry.points).filter((point, index, points) => points.findIndex(candidate => candidate.x === point.x && candidate.y === point.y) === index).map(point => {
        // Keep the captured hit target mounted while the visual route follows the drag preview.
        const group = (gestureRef.current?.waypointId ? gestureRef.current.geometry.points : geometry.points).filter(candidate => candidate.x === point.x && candidate.y === point.y);
        const original = waypoints[point.index - 1];
        if (!original) return null;
        const chosen = group.some(candidate => waypoints[candidate.index - 1]?.id === selectedId || selectedGroupIds.includes(waypoints[candidate.index - 1]?.id));
        const dragId = group.length === 1 ? original.id : group.map(candidate => waypoints[candidate.index - 1]?.id).find(id => id === selectedId);
        const select = (position: AppContextMenuPosition) => {
          if (disabled) return;
          if (group.length > 1) { resetInteraction(); setSelectedGroupIds(group.map(candidate => waypoints[candidate.index - 1].id)); setMenuPosition(position); }
          else selectWaypoint(original.id, position);
        };
        return <g key={original.id} className={`so-waypoint-map-marker${chosen ? ' is-selected' : ''}`} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0}
          aria-label={group.length > 1 ? `Sélectionner les waypoints ${group.map(candidate => candidate.index).join(', ')}` : `Sélectionner le waypoint ${point.index}`} aria-pressed={chosen} aria-haspopup="menu" aria-expanded={chosen && Boolean(menuPosition)} aria-keyshortcuts="Enter Space Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
          onPointerDown={event => waypointPointerDown(event, geometry, dragId)} onPointerMove={waypointPointerMove} onPointerUp={waypointPointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture}
          onClick={event => { event.preventDefault(); event.stopPropagation(); if (suppressedMarkerClick.current) { suppressedMarkerClick.current = null; return; } const bounds = event.currentTarget.getBoundingClientRect(); select({ x: bounds.right + 8, y: bounds.top }); }} onKeyDown={event => {
            if (waypointKeyboardMove(event, dragId, geometry)) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { const bounds = event.currentTarget.getBoundingClientRect(); select({ x: bounds.right + 8, y: bounds.top }); } }
          }}><circle r={20} /></g>;
      })}
    </> : undefined} />
    {!disabled && menuPosition && (selected || selectedGroup.length > 1 || proposedPorts.length > 1) && <AppContextMenu label={selected ? `Waypoint ${waypoints.indexOf(selected) + 1}` : selectedGroup.length ? 'Waypoints à cette position' : 'Ports à cette position'} position={menuPosition} onClose={closeMenu}>
      {selected && onDeleteWaypoint && <AppContextMenuItem danger onSelect={() => {
        if (disabled) return; resetInteraction(); onDeleteWaypoint(selected.id);
        setAnnouncement(`Waypoint ${selected.number || waypoints.indexOf(selected) + 1} supprimé du tableau.`); surfaceRef.current?.focus({ preventScroll: true });
      }}><Trash2 size={15} aria-hidden="true" />Supprimer</AppContextMenuItem>}
      {!selected && selectedGroup.map(point => <AppContextMenuItem key={point.id} onSelect={() => selectWaypoint(point.id, menuPosition)}>Waypoint {waypoints.indexOf(point) + 1}</AppContextMenuItem>)}
      {proposedPorts.map(port => <AppContextMenuItem key={port.key} onSelect={() => addPort(port)}>{formatProjectPort(port.port)}</AppContextMenuItem>)}
    </AppContextMenu>}
    <p className="so-waypoint-map-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </section>;
}
