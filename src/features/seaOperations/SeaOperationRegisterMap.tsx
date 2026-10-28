import { Map, Pencil, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PROJECT_LOCATION_LIMITS } from '../projects/projectLocation';
import { emptySeaOperationWaypoint, type SeaOperationPayload } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';
import type { SeaPosition } from './seaOperationNavigation';
import { initialSeaOperationDepartureEta, updateSeaOperationRouteEtas } from './seaOperationRouteEta';
import { seaOperationRouteArrivalEta } from './seaOperationVoyageSummary';
import { updateSeaOperationWaypoint } from './seaOperationWaypointSnapshots';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';
import './seaOperationRegisterMap.css';

interface RegisterMapProps {
  record: SeaOperationRecord | null;
  maxSpeedKnots?: number | null;
  disabled?: boolean;
  onSave: (draft: SeaOperationPayload, record: SeaOperationRecord) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

const errorText = (error: unknown) => error instanceof Error ? error.message
  : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'La modification des points n’a pas pu être enregistrée. Réessayez.';

function coordinates(position: SeaPosition) {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)
    || Math.abs(position.latitude) > 90 || Math.abs(position.longitude) > 180) return null;
  return { latitude: String(Number(position.latitude.toFixed(6))), longitude: String(Number(position.longitude.toFixed(6))) };
}

/** Browsing never writes the saved frame; only explicit point changes are persisted. */
export function SeaOperationRegisterMap(props: RegisterMapProps) {
  const { record } = props;
  return <section className="so-register-map sp-panel" aria-label="Carte de l’opération">
    <header className="so-register-map-heading"><Map size={20} aria-hidden="true" /><div><h2>Carte de l’opération</h2>
      <p>{record ? [record.draft.project || 'Opération sans titre', record.draft.vessel.name].filter(Boolean).join(' · ') : 'Sélectionnez une opération dans le registre.'}</p>
    </div></header>
    {record ? <RegisterMapContent {...props} record={record} key={`${record.companyId}:${record.id}:${record.version}`} />
      : <p className="so-register-map-empty">Ses waypoints, points isolés et zones s’afficheront ici avec un cadrage automatique.</p>}
  </section>;
}

function RegisterMapContent({ record, maxSpeedKnots, disabled = false, onSave, onDirtyChange }: RegisterMapProps & { record: SeaOperationRecord }) {
  const [draft, setDraft] = useState(() => structuredClone(record.draft));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editable = record.status === 'draft' && record.canEdit;
  const alive = useRef(true);
  const latest = useRef({ draft, editable, editing, saving, disabled });
  latest.current = { draft, editable, editing, saving, disabled };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const change = (transform: (current: SeaOperationPayload) => SeaOperationPayload) => {
    const current = latest.current;
    if (!alive.current || !current.editable || !current.editing || current.saving || current.disabled) return;
    const changed = transform(current.draft);
    if (changed === current.draft) return;
    const next = updateSeaOperationRouteEtas(changed, maxSpeedKnots);
    latest.current.draft = next; setDraft(next); setDirty(true); setError('');
  };
  const movePoint = (field: 'waypoints' | 'points', id: string, position: SeaPosition) => {
    const patch = coordinates(position);
    if (!patch) return;
    change(current => {
      const points = field === 'waypoints' ? current.waypoints : current.locationOverlay?.points;
      const point = points?.find(item => item.id === id);
      if (!point || point.latitude === patch.latitude && point.longitude === patch.longitude) return current;
      const updated = points!.map(item => item.id === id ? updateSeaOperationWaypoint(item, patch) : item);
      return field === 'waypoints' ? { ...current, waypoints: updated }
        : { ...current, locationOverlay: { ...current.locationOverlay!, points: updated } };
    });
  };
  const deletePoint = (field: 'waypoints' | 'points', id: string) => change(current => {
    const points = field === 'waypoints' ? current.waypoints : current.locationOverlay?.points;
    if (!points?.some(point => point.id === id)) return current;
    const updated = points.filter(point => point.id !== id);
    return field === 'waypoints' ? { ...current, waypoints: updated }
      : { ...current, locationOverlay: { ...current.locationOverlay!, points: updated } };
  });
  const vertex = (zoneId: string, index: number, position?: SeaPosition) => {
    const patch = position ? coordinates(position) : null;
    if (!Number.isInteger(index) || index < 0 || position && !patch) return;
    change(current => {
      const overlay = current.locationOverlay, zone = overlay?.zones.find(item => item.id === zoneId), point = zone?.vertices[index];
      if (!overlay || !zone || !point || patch && point.latitude === patch.latitude && point.longitude === patch.longitude) return current;
      return { ...current, locationOverlay: { ...overlay, zones: overlay.zones.map(item => item.id === zoneId
        ? { ...item, vertices: patch ? item.vertices.map((value, at) => at === index ? patch : value) : item.vertices.filter((_, at) => at !== index) } : item) } };
    });
  };
  const addWaypoint = (position: SeaPosition, port?: { name: string }) => {
    const patch = coordinates(position);
    if (!patch) return;
    change(current => {
      if (current.waypoints.length >= PROJECT_LOCATION_LIMITS.waypoints) return current;
      const used = new Set(current.waypoints.map(point => point.number.trim()));
      let number = current.waypoints.length + 1;
      while (used.has(String(number))) number += 1;
      const eta = current.waypoints.length ? '' : initialSeaOperationDepartureEta();
      return { ...current, waypoints: [...current.waypoints, { ...emptySeaOperationWaypoint(), number: String(number),
        descriptionVhf: port?.name.trim() || `Waypoint ${number}`, ...patch, ukcMode: 'automatic', eta,
        ...(eta ? { etaMode: 'manual' as const } : {}) }] };
    });
  };
  const cancel = () => {
    if (saving) return;
    const restored = structuredClone(record.draft);
    latest.current.draft = restored; latest.current.editing = false;
    setDraft(restored); setEditing(false); setDirty(false); setError('');
  };
  const save = async () => {
    if (!alive.current || !dirty || !latest.current.editable || !latest.current.editing || latest.current.saving || latest.current.disabled) return;
    latest.current.saving = true; setSaving(true); setError('');
    try {
      await onSave(structuredClone(latest.current.draft), record);
      if (!alive.current) return;
      latest.current.editing = false; setEditing(false); setDirty(false);
    } catch (failure) { if (alive.current) setError(errorText(failure)); }
    finally { if (alive.current) { latest.current.saving = false; setSaving(false); } }
  };
  return <>
    <div className="so-register-map-actions">
      {!editing && editable ? <button className="sp-button sp-button--secondary" type="button" disabled={disabled} onClick={() => { latest.current.editing = true; setEditing(true); }}><Pencil size={16} aria-hidden="true" />Modifier les points</button> : null}
      {editing ? <><button className="sp-button sp-button--primary" type="button" onClick={() => { void save(); }} disabled={!dirty || !editable || saving || disabled}><Save size={16} aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer les points'}</button>
        <button className="sp-button sp-button--secondary" type="button" onClick={cancel} disabled={saving}><X size={16} aria-hidden="true" />Annuler</button></> : null}
    </div>
    {editing ? <p className="so-register-map-help">Glissez les points ou les sommets pour les repositionner. Le menu d’un point permet de le supprimer. Enregistrez pour conserver les modifications.</p>
      : <p className="so-register-map-help">Molette pour zoomer, appui long pour déplacer la carte. Le plein écran est disponible sur la carte.</p>}
    {!editable ? <p className="so-register-map-help">{record.status === 'signed' ? 'Fiche signée : carte en consultation.' : 'Carte en consultation selon vos droits sur cette opération.'}</p> : null}
    {error ? <p className="so-alert so-danger" role="alert">{error}</p> : null}
    <SeaOperationWaypointMapEditor waypoints={draft.waypoints} isolatedPoints={draft.locationOverlay?.points} zones={draft.locationOverlay?.zones}
      readOnly={!editing || !editable || saving || disabled} drawingMode={editing && editable ? 'route' : undefined} maxSpeedKnots={maxSpeedKnots}
      departurePort={draft.vessel.departurePort} arrivalPort={draft.vessel.arrivalPort}
      etd={draft.waypoints[0]?.eta || draft.vessel.etd} eta={seaOperationRouteArrivalEta(draft)}
      onAddWaypoint={addWaypoint} onMoveWaypoint={(id, position) => movePoint('waypoints', id, position)}
      onDeleteWaypoint={id => deletePoint('waypoints', id)} onMoveIsolatedPoint={(id, position) => movePoint('points', id, position)}
      onDeleteIsolatedPoint={id => deletePoint('points', id)} onMoveZoneVertex={(id, index, position) => vertex(id, index, position)}
      onDeleteZoneVertex={(id, index) => vertex(id, index)} />
  </>;
}
