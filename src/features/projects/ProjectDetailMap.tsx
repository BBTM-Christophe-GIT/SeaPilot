import { Pencil, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SeaOperationWaypointMapEditor } from '../seaOperations/SeaOperationWaypointMapEditor';
import { seaOperationRouteArrivalEta } from '../seaOperations/seaOperationVoyageSummary';
import { emptyProjectLocationPlan, parseProjectLocationPlan, type ProjectLocationPlan } from './projectLocation';
import { ProjectLocationEditor } from './ProjectLocationEditor';
import type { ProjectRecord } from './projectQueries';
import './projectDetailMap.css';

const EMPTY_LOCATION = emptyProjectLocationPlan();
const ignorePlacement = () => {};

interface ProjectDetailMapProps {
  project: ProjectRecord;
  maxSpeedKnots?: number | null;
  canManage?: boolean;
  disabled?: boolean;
  onSave?: (plan: ProjectLocationPlan, source: ProjectRecord) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Each persisted project version owns its local editing session and async replies. */
export function ProjectDetailMap(props: ProjectDetailMapProps) {
  return <ProjectDetailMapContent {...props} key={`${props.project.id}:${props.project.updatedAt}`} />;
}

function ProjectDetailMapContent({ project, maxSpeedKnots, canManage = false, disabled = false, onSave, onDirtyChange }: ProjectDetailMapProps) {
  const [plan, setPlan] = useState(() => structuredClone(project.locationPlan ?? EMPTY_LOCATION));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const latest = useRef({ plan, canManage, editing, saving, disabled, onSave });
  latest.current = { plan, canManage, editing, saving, disabled, onSave };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  const change = (next: ProjectLocationPlan) => {
    const current = latest.current;
    if (!alive.current || !current.canManage || !current.editing || current.saving || current.disabled || !current.onSave) return;
    if (JSON.stringify(next) === JSON.stringify(current.plan)) return;
    latest.current.plan = next; setPlan(next); setDirty(true); setError('');
  };
  const cancel = () => {
    if (latest.current.saving) return;
    const original = structuredClone(project.locationPlan ?? EMPTY_LOCATION);
    latest.current.plan = original; latest.current.editing = false;
    setPlan(original); setEditing(false); setDirty(false); setError('');
  };
  const save = async () => {
    const current = latest.current;
    if (!alive.current || !dirty || !current.canManage || !current.editing || current.saving || current.disabled || !current.onSave) return;
    latest.current.saving = true; setSaving(true); setError('');
    try {
      const canonical = parseProjectLocationPlan(current.plan)!;
      await current.onSave(canonical, project);
      if (!alive.current) return;
      latest.current.editing = false; setEditing(false); setDirty(false);
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : 'La carte n’a pas pu être enregistrée. Réessayez.');
    } finally { if (alive.current) { latest.current.saving = false; setSaving(false); } }
  };
  const hasPoints = plan.waypoints.length > 0 || plan.points.length > 0 || plan.zones.length > 0;
  return <section aria-label="Carte du projet" className="project-detail-section">
    <div className="project-context-heading"><div>
      <h3>Carte du projet</h3>
      <p>Route, points isolés et zones enregistrés dans la localisation du projet.</p>
    </div></div>
    <div className="project-detail-map-actions">
      {!editing && canManage && onSave ? <button type="button" className="sp-button sp-button--secondary" disabled={disabled} onClick={() => { latest.current.editing = true; setEditing(true); }}><Pencil size={16} aria-hidden="true" />Modifier la carte</button> : null}
      {editing ? <><button type="button" className="sp-button sp-button--primary" disabled={!dirty || !canManage || !onSave || saving || disabled} onClick={() => { void save(); }}><Save size={16} aria-hidden="true" />{saving ? 'Enregistrement…' : 'Enregistrer la carte'}</button>
        <button type="button" className="sp-button sp-button--secondary" disabled={saving} onClick={cancel}><X size={16} aria-hidden="true" />Annuler</button></> : null}
    </div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {editing ? <ProjectLocationEditor value={plan} onChange={change} disabled={disabled || saving || !canManage || !onSave}
      vessel={{ id: project.primaryVesselId ?? undefined, maxSpeedKnots }} projectId={String(project.id)}
      departurePort={project.deliveryPort} arrivalPort={project.redeliveryPort} /> : <>
    {!hasPoints ? <p className="project-empty-state">Aucun waypoint, point isolé ou zone enregistré pour ce projet.</p> : null}
    <SeaOperationWaypointMapEditor
      readOnly
      waypoints={plan.waypoints}
      isolatedPoints={plan.points}
      zones={plan.zones}
      maxSpeedKnots={maxSpeedKnots}
      etd={plan.waypoints[0]?.eta || plan.etd}
      eta={seaOperationRouteArrivalEta(plan)}
      departurePort={project.deliveryPort}
      arrivalPort={project.redeliveryPort}
      onAddWaypoint={ignorePlacement}
    />
    </>}
  </section>;
}
