import { SeaOperationRouteMap } from '../seaOperations/SeaOperationRouteMap';
import { formatSeaLatitude, formatSeaLongitude } from '../seaOperations/seaOperationCoordinates';
import { passagePlanCellData } from '../seaOperations/seaOperationPassagePlan';
import type { SeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { seaOperationRouteArrivalEta } from '../seaOperations/seaOperationVoyageSummary';
import type { ProjectLocationPlan } from './projectLocation';
import './projectLocationPreview.css';
import { useLayoutEffect, useRef, useState } from 'react';

/** An appendix is visible only after the user opts in; it is not a contract section. */
export function ProjectLocationPreview({ plan, projectLabel, maxSpeedKnots }: {
  plan: ProjectLocationPlan; projectLabel: string; maxSpeedKnots?: number | null; draftMeters?: number | null;
}) {
  const paper = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const container = paper.current?.parentElement;
    if (!container) return;
    const fit = () => { if (container.clientWidth > 0) setScale(Math.min(1, Math.max(.1, (container.clientWidth - 32) / 900))); };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit);
    observer?.observe(container);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  const table = (title: string, points: SeaOperationWaypoint[]) => points.length ? <section>
    <h3>{title}</h3>
    <table><thead><tr>{['Waypoint', 'Description', 'Latitude', 'Longitude', 'UKC', 'ETA · Date - Heure', 'Contacts VHF', 'Météo à l’ETA', 'Trafic dense'].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{points.map((point, index) => {
        const row = passagePlanCellData(point, { allowLiveRadio: true });
        return <tr className={point.denseTraffic ? 'is-dense' : undefined} key={point.id}>
          <td>{point.number || index + 1}</td><td>{point.descriptionVhf || `Waypoint ${index + 1}`}</td><td>{row.latitude}</td><td>{row.longitude}</td>
          <td>{row.ukc}</td><td>{row.eta}</td><td>{row.vhf}</td><td>À actualiser dans Opérations en mer</td><td>{point.denseTraffic ? '◉ Trafic dense' : 'Non'}</td>
        </tr>;
      })}</tbody></table>
  </section> : null;
  return <article ref={paper} style={{ zoom: scale }} className="project-location-preview" aria-label="Annexe Localisation">
    <h2>Annexe — Localisation / Passage plan</h2><p>{projectLabel}</p>
    <SeaOperationRouteMap waypoints={plan.waypoints} isolatedPoints={plan.points} zones={plan.zones} showPlaces showRouteLegs maxSpeedKnots={maxSpeedKnots} etd={plan.waypoints[0]?.eta || plan.etd} eta={seaOperationRouteArrivalEta(plan)} />
    {plan.charts ? <p>Cartes marines : {plan.charts}</p> : null}
    {table('Passage plan', plan.waypoints)}{table('Points isolés — hors calcul de navigation', plan.points)}
    {plan.zones.length ? <section><h3>Zones</h3><table><thead><tr><th>Zone</th><th>Sommet</th><th>Latitude</th><th>Longitude</th></tr></thead>
      <tbody>{plan.zones.flatMap((zone, index) => zone.vertices.length ? zone.vertices.map((vertex, vertexIndex) => <tr key={`${zone.id}:${vertexIndex}`}><td>{zone.name || `Zone ${index + 1}`}</td><td>{vertexIndex + 1}</td><td>{formatSeaLatitude(vertex.latitude) || 'À compléter'}</td><td>{formatSeaLongitude(vertex.longitude) || 'À compléter'}</td></tr>) : <tr key={zone.id}><td>{zone.name || `Zone ${index + 1}`}</td><td colSpan={3}>À compléter</td></tr>)}</tbody>
    </table></section> : null}
    <small>Fond Natural Earth · Tracé indicatif · Coordonnées WGS84. Les points isolés et zones ne contribuent pas aux distances et durées.</small>
  </article>;
}
