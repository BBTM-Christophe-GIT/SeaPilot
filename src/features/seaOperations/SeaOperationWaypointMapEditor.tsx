import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, LocateFixed, MapPin, Maximize, Minimize, Minus, Plus } from 'lucide-react';
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

interface MapGesture {
  pointerId: number;
  clientX: number;
  clientY: number;
  element: SVGRectElement;
  bounds: DOMRect;
  geometry: SeaOperationRouteMapGeometry;
  dragging: boolean;
  cancelled: boolean;
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

/** Only this wrapper accepts gestures. Moving its viewport never modifies the recorded route. */
export function SeaOperationWaypointMapEditor({ waypoints, onAddWaypoint, disabled = false }: {
  waypoints: readonly SeaOperationWaypoint[];
  onAddWaypoint: (position: SeaPosition) => void;
  disabled?: boolean;
}) {
  const instructionsId = useId();
  const [placing, setPlacing] = useState(false);
  const [viewport, setViewport] = useState<RouteMapViewport>();
  const [announcement, setAnnouncement] = useState('');
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
    if (gesture?.element.hasPointerCapture?.(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId);
  }, []);
  const resetInteraction = useCallback(() => { cancelGesture(); lastPointerAdd.current = null; }, [cancelGesture]);
  const recordGeometry = useCallback((geometry: SeaOperationRouteMapGeometry) => {
    const previous = geometryRef.current;
    if (previous && (previous.width !== geometry.width || previous.height !== geometry.height)) resetInteraction();
    geometryRef.current = geometry;
  }, [resetInteraction]);
  const fullscreen = useSeaOperationMapFullscreen(editorRef, fullscreenToggleRef, resetInteraction, toggleRef);

  useEffect(() => {
    if (disabled || !placing) cancelGesture();
    else surfaceRef.current?.focus({ preventScroll: true });
  }, [disabled, placing, cancelGesture]);

  useEffect(() => {
    window.addEventListener('blur', cancelGesture);
    return () => { window.removeEventListener('blur', cancelGesture); cancelGesture(); };
  }, [cancelGesture]);

  function togglePlacement() {
    if (disabled) return;
    cancelGesture();
    lastPointerAdd.current = null;
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

  function addAtCentre() {
    const geometry = geometryRef.current;
    if (geometry) addPosition(routeMapPositionAt(geometry, geometry.width / 2, geometry.height / 2));
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
    if (gestureRef.current) { gestureRef.current.cancelled = true; return; }
    if (event.isPrimary === false) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    gestureRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, element: event.currentTarget, bounds, geometry, dragging: false, cancelled: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGRectElement>) {
    const gesture = gestureRef.current;
    if (disabled || !placing || !gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.clientX, dy = event.clientY - gesture.clientY;
    if (Math.hypot(dx, dy) > 6) gesture.dragging = true;
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
    addPosition(position);
  }

  function keyDown(event: KeyboardEvent<SVGRectElement>) {
    if (disabled || !placing || event.target !== event.currentTarget) return;
    const directions: Record<string, [number, number]> = { ArrowUp: [0, .15], ArrowDown: [0, -.15], ArrowLeft: [-.15, 0], ArrowRight: [.15, 0] };
    if (directions[event.key]) { event.preventDefault(); moveView(...directions[event.key]); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) addAtCentre(); }
  }

  return <section aria-label="Placement des waypoints" ref={editorRef} tabIndex={fullscreen.isFullscreen ? -1 : undefined} className={`so-waypoint-map-editor${placing ? ' is-placing' : ''}${fullscreen.isFullscreen ? ' is-fullscreen' : ''}${fullscreen.isFallbackFullscreen ? ' is-fallback-fullscreen' : ''}`} onKeyDownCapture={fullscreen.onKeyDownCapture} onKeyDown={(event) => {
    if (placing && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); togglePlacement(); }
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
      <p id={instructionsId} className="so-waypoint-map-instructions">Cliquez ou touchez la carte pour ajouter un waypoint à la fin du tableau. Glissez pour déplacer la vue. Au clavier, utilisez les flèches puis Entrée pour ajouter au centre. {fullscreen.isFullscreen ? 'Échap quitte le plein écran.' : 'Échap termine le placement.'}</p>
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
    <SeaOperationRouteMap waypoints={waypoints} viewport={placing ? viewport : undefined} onGeometry={recordGeometry} fillAvailableSpace={fullscreen.isFullscreen} renderOverlay={placing && !disabled ? (geometry) => <>
      <rect className="so-waypoint-map-surface" ref={surfaceRef} width={geometry.width} height={geometry.height} role="button" tabIndex={0} aria-label="Zone de placement des waypoints" aria-describedby={instructionsId} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape" onKeyDown={keyDown} onPointerDown={(event) => pointerDown(event, geometry)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} />
      <g aria-hidden="true" className="so-waypoint-map-crosshair" transform={`translate(${geometry.width / 2} ${geometry.height / 2})`}><circle r={10} /><path d="M -17 0 H -5 M 5 0 H 17 M 0 -17 V -5 M 0 5 V 17" /></g>
    </> : undefined} />
    <p className="so-waypoint-map-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </section>;
}
