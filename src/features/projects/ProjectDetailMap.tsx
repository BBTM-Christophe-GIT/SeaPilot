import { SeaOperationWaypointMapEditor } from '../seaOperations/SeaOperationWaypointMapEditor';
import { seaOperationRouteArrivalEta } from '../seaOperations/seaOperationVoyageSummary';
import { emptyProjectLocationPlan } from './projectLocation';
import type { ProjectRecord } from './projectQueries';

const EMPTY_LOCATION = emptyProjectLocationPlan();
const ignorePlacement = () => {};

/** Dossier consultation keeps camera changes local and never changes the saved localisation. */
export function ProjectDetailMap({ project, maxSpeedKnots }: {
  project: ProjectRecord;
  maxSpeedKnots?: number | null;
}) {
  const plan = project.locationPlan ?? EMPTY_LOCATION;
  const hasPoints = plan.waypoints.length > 0 || plan.points.length > 0 || plan.zones.length > 0;
  return <section aria-label="Carte du projet" className="project-detail-section">
    <div className="project-context-heading"><div>
      <h3>Carte du projet</h3>
      <p>Route, points isolés et zones enregistrés dans la localisation du projet.</p>
    </div></div>
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
  </section>;
}
