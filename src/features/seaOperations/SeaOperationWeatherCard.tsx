import { Compass, Timer, Waves, Wind } from 'lucide-react';
import { evaluateVesselSeaState, type VesselSeaStateAssessment, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import './seaOperationWeatherCard.css';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { SeaOperationWeatherObservationCard } from './SeaOperationWeatherObservationCard';

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const height = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const amount = (value: number | null, formatter = decimal) => value === null ? '—' : formatter.format(value);

export function SeaStateIndicator({ assessment }: { assessment: VesselSeaStateAssessment }) {
  if (assessment.code === 'no_matrix' || assessment.code === 'not_defined') return null;
  return <span className={`so-sea-state is-${assessment.tone}`} title={assessment.hsRange ? `Matrice du navire · Hs ${assessment.hsRange} · période ${assessment.periodRange}` : undefined}>
    <span className="so-sea-state-dot" aria-hidden="true" />{assessment.label}
  </span>;
}

/** Recorded data only: this card neither fetches a forecast nor changes the captain's decision. */
export function SeaOperationWeatherCard({ point, matrix, compact = false, showIndicator = true, variant = 'default', validatedAt, showObservations = false, observations }: {
  point: SeaOperationWaypoint; matrix?: VesselWeatherMatrix | null; compact?: boolean; showIndicator?: boolean; variant?: 'default' | 'editor';
  validatedAt?: string | null; showObservations?: boolean; observations?: readonly ObservationResult[];
}) {
  const forecast = waypointWeatherSnapshot(point);
  const assessment = evaluateVesselSeaState(matrix, forecast?.waves);
  const waves = forecast?.waves;
  return <div className={`so-waypoint-weather-card${compact ? ' is-compact' : ''}${variant === 'editor' ? ' is-editor' : ''}${!forecast ? ' is-unavailable' : ''}${validatedAt ? ' is-validated' : ''}`}>
    <div className="so-waypoint-weather-heading"><span>{validatedAt ? 'Prévision conservée à la validation' : 'État de mer prévu'}</span>{showIndicator && <SeaStateIndicator assessment={assessment} />}</div>
    {forecast ? <>
      <dl className="so-waypoint-weather-metrics">
        <div><dt><Waves size={15} aria-hidden="true" />Houle Hs</dt><dd>{amount(waves?.heightMeters ?? null, height)}<small> m</small></dd></div>
        <div><dt title="Période moyenne de la houle"><Timer size={15} aria-hidden="true" />Période<small>moyenne</small></dt><dd>{amount(waves?.periodSeconds ?? null)}<small> s</small></dd></div>
      </dl>
      <p className="so-waypoint-weather-direction"><Compass size={13} aria-hidden="true" />Provenance de la houle : {waves?.directionDegrees != null ? `${amount(waves.directionDegrees, integer)}°` : 'indisponible'}</p>
      {!waves && <p className="so-waypoint-weather-unavailable">{forecast.wavesMessage || 'Prévision de houle indisponible.'}</p>}
      <div className="so-waypoint-weather-wind"><Wind size={15} aria-hidden="true" /><span>Vent moyen 10 m<strong>{forecast.wind ? <>{amount(forecast.wind.speedKnots)} nd · de {amount(forecast.wind.directionDegrees, integer)}°</> : 'Indisponible'}</strong></span></div>
      <div className="so-waypoint-weather-time"><span>ETA : {date.format(new Date(forecast.etaUtc))} UTC</span><span>{forecast.attribution}</span></div>
      {waves && <small className="so-waypoint-weather-model">Modèle houle : {date.format(new Date(waves.time))} UTC</small>}
      {forecast.wind && <small className="so-waypoint-weather-model">Modèle vent : {date.format(new Date(forecast.wind.time))} UTC</small>}
      {assessment.hsRange && <small className="so-waypoint-weather-band">Matrice : Hs {assessment.hsRange} · {assessment.periodRange}</small>}
    </> : <p className="so-waypoint-weather-unavailable">Prévisions météo non enregistrées pour cette position et cette ETA.</p>}
    {validatedAt && <small className="so-waypoint-weather-model">Validation du Capitaine : {date.format(new Date(validatedAt))} UTC</small>}
    {showObservations && <SeaOperationWeatherObservationCard point={point} observations={observations} />}
  </div>;
}
