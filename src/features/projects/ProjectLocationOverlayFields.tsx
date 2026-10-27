import { Plus, Trash2 } from 'lucide-react';
import { emptySeaOperation, emptySeaOperationWaypoint, type SeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { SeaOperationCoordinateInput } from '../seaOperations/SeaOperationCoordinateInput';
import { SeaOperationEtaPicker } from '../seaOperations/SeaOperationEtaPicker';
import { SeaOperationUkcField } from '../seaOperations/SeaOperationUkcField';
import { SeaOperationWeatherCard } from '../seaOperations/SeaOperationWeatherCard';
import { passagePlanCellData } from '../seaOperations/seaOperationPassagePlan';
import { updateSeaOperationWaypoint } from '../seaOperations/seaOperationWaypointSnapshots';
import { seaOperationZonePositions } from '../seaOperations/seaOperationMapLayers';
import type { VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { PROJECT_LOCATION_LIMITS, type ProjectLocationOverlay } from './projectLocation';
import './projectLocationEditor.css';

export interface ProjectLocationVessel { id?: string | number; draftMeters?: number | null; maxSpeedKnots?: number | null; weatherMatrix?: VesselWeatherMatrix | null }

export function ProjectLocationPointFields({ point, index, kind = 'Waypoint', disabled = false, vessel, projectId, onChange, onDelete }: {
  point: SeaOperationWaypoint; index: number; kind?: string; disabled?: boolean; vessel?: ProjectLocationVessel; projectId?: string;
  onChange: (patch: Partial<SeaOperationWaypoint>) => void; onDelete: () => void;
}) {
  const label = `${kind} ${index + 1}`;
  const payload = emptySeaOperation(); payload.waypoints = [point];
  payload.vessel.id = String(vessel?.id ?? ''); payload.vessel.draftMeters = vessel?.draftMeters;
  payload.planning = { date: '', operationId: '', projectId: projectId || '', captainPersonId: '' };
  return <div role="row" aria-label={label} className="project-location-point">
    <div role="cell" className="project-location-point-head"><label>Numéro<input aria-label={`Numéro · ${label}`} value={point.number} maxLength={80} onChange={event => onChange({ number: event.target.value })} /></label><label>Description<input aria-label={`Description · ${label}`} value={point.descriptionVhf} maxLength={4000} onChange={event => onChange({ descriptionVhf: event.target.value })} /></label><button type="button" className="sp-button sp-button--secondary" aria-label={`Supprimer ${label}`} disabled={disabled} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /></button></div>
    <div role="cell" className="project-location-coordinates"><div><span>Latitude</span><SeaOperationCoordinateInput axis="latitude" value={point.latitude} label={`Latitude · ${label}`} onChange={latitude => onChange({ latitude })} /></div><div><span>Longitude</span><SeaOperationCoordinateInput axis="longitude" value={point.longitude} label={`Longitude · ${label}`} onChange={longitude => onChange({ longitude })} /></div></div>
    <div role="cell" className="project-location-eta"><span>ETA · date et heure</span><SeaOperationEtaPicker value={point.eta} label={`ETA · ${label}`} inline disabled={disabled} onChange={eta => onChange({ eta, etaMode: 'manual' })} />{kind === 'Waypoint' && point.etaMode === 'manual' && <button type="button" className="sp-button sp-button--secondary" disabled={disabled} onClick={() => onChange({ eta: '', etaMode: 'automatic' })}>Rétablir l’ETA automatique</button>}</div>
    <SeaOperationUkcField payload={payload} point={point} index={index} disabled={disabled} status={{ loading: false, error: kind === 'Waypoint' ? 'Le calcul automatique est disponible dans la fiche Opération en Mer.' : 'Les calculs automatiques concernent les waypoints de la route.' }} onChange={onChange} />
    <div role="cell"><label className="project-location-traffic"><input type="checkbox" checked={point.denseTraffic} disabled={disabled} onChange={event => onChange({ denseTraffic: event.target.checked })} />Zone maritime à trafic dense</label></div>
    <div role="cell"><details className="project-location-point-details"><summary>Contacts VHF et météo</summary><div><strong>Contacts VHF indicatifs</strong><p>{passagePlanCellData(point, { allowLiveRadio: true }).vhf}</p><SeaOperationWeatherCard point={point} matrix={vessel?.weatherMatrix} compact /><small>{kind === 'Waypoint' ? 'Les prévisions et calculs automatiques sont consultés dans la fiche Opération en Mer.' : 'Les prévisions automatiques concernent les waypoints de la route.'}</small></div></details></div>
  </div>;
}

export function ProjectLocationOverlayFields({ value, onChange, disabled = false, vessel, projectId, onSelectZone }: {
  value: ProjectLocationOverlay; onChange: (value: ProjectLocationOverlay) => void; disabled?: boolean; vessel?: ProjectLocationVessel;
  projectId?: string; etd?: string; onSelectZone?: (id: string) => void;
}) {
  const emit = (next: ProjectLocationOverlay) => { if (!disabled) onChange(next); };
  return <fieldset className="project-location-overlay" disabled={disabled}>
    <legend>Points isolés et zones</legend>
    <section aria-label="Points isolés"><div className="project-location-subheading"><h3>Points isolés</h3><button type="button" className="sp-button sp-button--secondary" disabled={disabled || value.points.length >= PROJECT_LOCATION_LIMITS.points} onClick={() => emit({ ...value, points: [...value.points, { ...emptySeaOperationWaypoint(), number: String(value.points.length + 1) }] })}><Plus size={16} aria-hidden="true" />Ajouter un point isolé</button></div>
      <div role="table" aria-label="Points isolés à compléter">{value.points.map((point, index) => <ProjectLocationPointFields key={point.id} point={point} index={index} kind="Point isolé" disabled={disabled} vessel={vessel} projectId={projectId}
        onChange={patch => emit({ ...value, points: value.points.map(item => item.id === point.id ? updateSeaOperationWaypoint(item, patch) : item) })} onDelete={() => emit({ ...value, points: value.points.filter(item => item.id !== point.id) })} />)}</div>
      {!value.points.length && <p className="project-location-help">Aucun point isolé. Ils ne sont pas reliés à la route.</p>}
    </section>
    <section aria-label="Zones"><div className="project-location-subheading"><h3>Zones</h3><button type="button" className="sp-button sp-button--secondary" disabled={disabled || value.zones.length >= PROJECT_LOCATION_LIMITS.zones} onClick={() => {
      const id = crypto.randomUUID(); emit({ ...value, zones: [...value.zones, { id, name: `Zone ${value.zones.length + 1}`, vertices: [] }] }); onSelectZone?.(id);
    }}><Plus size={16} aria-hidden="true" />Ajouter une zone</button></div>
      {value.zones.map((zone, zoneIndex) => <section key={zone.id} className="project-location-zone" aria-label={`Zone ${zoneIndex + 1}`}><div className="project-location-subheading"><label>Nom de la zone<input aria-label={`Nom · zone ${zoneIndex + 1}`} value={zone.name} maxLength={500} onChange={event => emit({ ...value, zones: value.zones.map(item => item.id === zone.id ? { ...item, name: event.target.value } : item) })} /></label>{onSelectZone && <button type="button" className="sp-button sp-button--secondary" onClick={() => onSelectZone(zone.id)}>Dessiner les sommets</button>}<button type="button" className="sp-button sp-button--secondary" aria-label={`Supprimer la zone ${zoneIndex + 1}`} onClick={() => emit({ ...value, zones: value.zones.filter(item => item.id !== zone.id) })}><Trash2 size={16} aria-hidden="true" /></button></div>
        <p className="project-location-help" role="status">{seaOperationZonePositions(zone) ? `${zone.vertices.length} sommets · zone fermée sur la carte.` : 'Zone en cours : trois sommets valides et distincts sont nécessaires pour la dessiner.'}</p>
        {zone.vertices.map((vertex, index) => <div className="project-location-vertex" key={index}><span>Sommet {index + 1}</span><SeaOperationCoordinateInput axis="latitude" value={vertex.latitude} label={`Latitude · zone ${zoneIndex + 1} · sommet ${index + 1}`} onChange={latitude => emit({ ...value, zones: value.zones.map(item => item.id === zone.id ? { ...item, vertices: item.vertices.map((current, vertexIndex) => vertexIndex === index ? { ...current, latitude } : current) } : item) })} /><SeaOperationCoordinateInput axis="longitude" value={vertex.longitude} label={`Longitude · zone ${zoneIndex + 1} · sommet ${index + 1}`} onChange={longitude => emit({ ...value, zones: value.zones.map(item => item.id === zone.id ? { ...item, vertices: item.vertices.map((current, vertexIndex) => vertexIndex === index ? { ...current, longitude } : current) } : item) })} /><button type="button" className="sp-button sp-button--secondary" aria-label={`Supprimer le sommet ${index + 1} de la zone ${zoneIndex + 1}`} onClick={() => emit({ ...value, zones: value.zones.map(item => item.id === zone.id ? { ...item, vertices: item.vertices.filter((_current, vertexIndex) => vertexIndex !== index) } : item) })}><Trash2 size={14} aria-hidden="true" /></button></div>)}
        <button type="button" className="sp-button sp-button--secondary" disabled={disabled || zone.vertices.length >= PROJECT_LOCATION_LIMITS.vertices} onClick={() => emit({ ...value, zones: value.zones.map(item => item.id === zone.id ? { ...item, vertices: [...item.vertices, { latitude: '', longitude: '' }] } : item) })}>Ajouter un sommet</button>
      </section>)}
      {!value.zones.length && <p className="project-location-help">Aucune zone. Les sommets peuvent être complétés sur la carte ou dans les champs.</p>}
    </section>
  </fieldset>;
}
