import { MapPin, Route, Shapes } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { emptySeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { SeaOperationWaypointMapEditor } from '../seaOperations/SeaOperationWaypointMapEditor';
import { updateSeaOperationWaypoint } from '../seaOperations/seaOperationWaypointSnapshots';
import type { SeaPosition } from '../seaOperations/seaOperationNavigation';
import { ProjectLocationOverlayFields, ProjectLocationPointFields, type ProjectLocationVessel } from './ProjectLocationOverlayFields';
import { emptyProjectLocationPlan, PROJECT_LOCATION_LIMITS, type ProjectLocationPlan } from './projectLocation';
import { projectLocationRouteEtas } from './projectLocationRouteEtas';
import { seaOperationRouteArrivalEta } from '../seaOperations/seaOperationVoyageSummary';
import './projectLocationEditor.css';

export function ProjectLocationEditor({ value, onChange, disabled = false, vessel, projectId }: {
  value?: ProjectLocationPlan | null; onChange: (value: ProjectLocationPlan) => void; disabled?: boolean; vessel?: ProjectLocationVessel; projectId?: string;
}) {
  const plan = useMemo(() => value ?? emptyProjectLocationPlan(), [value]);
  const [mode, setMode] = useState<'route' | 'point' | 'zone'>('route');
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const latest = useRef({ plan, disabled, projectId, mode }); latest.current = { plan, disabled, projectId, mode };
  const emit = (next: ProjectLocationPlan) => { if (!disabled && !latest.current.disabled && latest.current.projectId === projectId) onChange(projectLocationRouteEtas(next, vessel?.maxSpeedKnots)); };
  useEffect(() => {
    if (disabled) return;
    const next = projectLocationRouteEtas(plan, vessel?.maxSpeedKnots);
    if (next !== plan) onChange(next);
  }, [plan, vessel?.maxSpeedKnots, disabled, onChange]);

  function startZone(id?: string) {
    if (disabled) return;
    setMode('zone');
    if (id) { setActiveZoneId(id); return; }
    const existing = plan.zones.find(zone => zone.id === activeZoneId) ?? plan.zones[0];
    if (existing) { setActiveZoneId(existing.id); return; }
    const zoneId = crypto.randomUUID(); setActiveZoneId(zoneId);
    emit({ ...plan, zones: [...plan.zones, { id: zoneId, name: `Zone ${plan.zones.length + 1}`, vertices: [] }] });
  }
  function addOnMap(position: SeaPosition, port?: { name: string }) {
    if (disabled || latest.current.projectId !== projectId || latest.current.mode !== mode) return;
    const current = latest.current.plan;
    const coordinates = { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) };
    if (mode === 'zone') {
      const zone = current.zones.find(item => item.id === activeZoneId);
      if (!zone || zone.vertices.length >= PROJECT_LOCATION_LIMITS.vertices) return;
      emit({ ...current, zones: current.zones.map(item => item.id === zone.id ? { ...item, vertices: [...item.vertices, coordinates] } : item) });
    } else {
      const field = mode === 'point' ? 'points' : 'waypoints';
      if (current[field].length >= PROJECT_LOCATION_LIMITS[field]) return;
      const number = current[field].length + 1;
      emit({ ...current, [field]: [...current[field], { ...emptySeaOperationWaypoint(), number: String(number), descriptionVhf: port?.name || (mode === 'route' ? `Waypoint ${number}` : `Point isolé ${number}`), ...coordinates, ...(mode === 'route' ? { etaMode: 'automatic' as const } : {}) }] });
    }
  }
  function moveVertex(zoneId: string, index: number, position: SeaPosition) {
    const current = latest.current.plan;
    emit({ ...current, zones: current.zones.map(zone => zone.id === zoneId ? { ...zone, vertices: zone.vertices.map((vertex, vertexIndex) => vertexIndex === index ? { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) } : vertex) } : zone) });
  }
  return <fieldset className="project-location-editor" disabled={disabled}>
    <legend>Localisation facultative</legend>
    <p className="project-location-help">Préparez une route, des points isolés et des zones sur la même carte. Cette rubrique n’est pas obligatoire pour enregistrer le projet.</p>
    <div className="project-location-settings"><label>ETD · départ prévu<input type="datetime-local" aria-label="ETD de la localisation" value={plan.etd} onChange={event => emit({ ...plan, etd: event.target.value })} /></label><label>Numéro des cartes marines<input value={plan.charts} maxLength={20000} onChange={event => emit({ ...plan, charts: event.target.value })} /></label></div>
    <label className="project-location-pdf"><input type="checkbox" checked={plan.includeInPdf} onChange={event => emit({ ...plan, includeInPdf: event.target.checked })} />Joindre la localisation au PDF</label>
    <div className="project-location-modes" role="group" aria-label="Mode de dessin"><button type="button" className="sp-button sp-button--secondary" aria-pressed={mode === 'route'} onClick={() => setMode('route')}><Route size={16} aria-hidden="true" />Route</button><button type="button" className="sp-button sp-button--secondary" aria-pressed={mode === 'point'} onClick={() => setMode('point')}><MapPin size={16} aria-hidden="true" />Point isolé</button><button type="button" className="sp-button sp-button--secondary" aria-pressed={mode === 'zone'} onClick={() => startZone()}><Shapes size={16} aria-hidden="true" />Zone</button>{mode === 'zone' && plan.zones.length > 0 && <label>Zone à compléter<select value={activeZoneId || ''} onChange={event => setActiveZoneId(event.target.value)}>{plan.zones.map((zone, index) => <option key={zone.id} value={zone.id}>{zone.name || `Zone ${index + 1}`}</option>)}</select></label>}</div>
    <SeaOperationWaypointMapEditor waypoints={plan.waypoints} isolatedPoints={plan.points} zones={plan.zones} drawingMode={mode} maxSpeedKnots={vessel?.maxSpeedKnots} etd={plan.waypoints[0]?.eta || plan.etd} eta={seaOperationRouteArrivalEta(plan)} disabled={disabled}
      onAddWaypoint={(position, port) => { if (position) addOnMap(position, port); }}
      onMoveWaypoint={(id, position) => { const current = latest.current.plan; emit({ ...current, waypoints: current.waypoints.map(point => point.id === id ? updateSeaOperationWaypoint(point, { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) }) : point) }); }}
      onDeleteWaypoint={id => { const current = latest.current.plan; emit({ ...current, waypoints: current.waypoints.filter(point => point.id !== id) }); }}
      onMoveIsolatedPoint={(id, position) => { const current = latest.current.plan; emit({ ...current, points: current.points.map(point => point.id === id ? updateSeaOperationWaypoint(point, { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) }) : point) }); }}
      onDeleteIsolatedPoint={id => { const current = latest.current.plan; emit({ ...current, points: current.points.filter(point => point.id !== id) }); }}
      onMoveZoneVertex={moveVertex} onDeleteZoneVertex={(id, index) => { const current = latest.current.plan; emit({ ...current, zones: current.zones.map(zone => zone.id === id ? { ...zone, vertices: zone.vertices.filter((_vertex, vertexIndex) => vertexIndex !== index) } : zone) }); }} />
    <section aria-label="Route à compléter"><div className="project-location-subheading"><h3>Route</h3><button type="button" className="sp-button sp-button--secondary" disabled={disabled || plan.waypoints.length >= PROJECT_LOCATION_LIMITS.waypoints} onClick={() => emit({ ...plan, waypoints: [...plan.waypoints, { ...emptySeaOperationWaypoint(), number: String(plan.waypoints.length + 1), etaMode: 'automatic' }] })}>Ajouter un waypoint</button></div>
      <div role="table" aria-label="Waypoints de la route">{plan.waypoints.map((point, index) => <ProjectLocationPointFields key={point.id} point={point} index={index} disabled={disabled} vessel={vessel} projectId={projectId}
        onChange={patch => emit({ ...plan, waypoints: plan.waypoints.map(item => item.id === point.id ? updateSeaOperationWaypoint(item, patch) : item) })} onDelete={() => emit({ ...plan, waypoints: plan.waypoints.filter(item => item.id !== point.id) })} />)}</div>
      {!plan.waypoints.length && <p className="project-location-help">Aucun waypoint. Les distances et durées concernent uniquement les points de cette route.</p>}
    </section>
    <ProjectLocationOverlayFields value={{ version: 1, points: plan.points, zones: plan.zones }} disabled={disabled} vessel={vessel} projectId={projectId} etd={plan.etd} onSelectZone={startZone} onChange={overlay => emit({ ...plan, ...overlay })} />
  </fieldset>;
}
