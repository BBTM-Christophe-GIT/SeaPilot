import { Waves, Wind } from 'lucide-react';
import type { SeaOperationWaypoint } from './seaOperationModel';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { observationTime, observationWaitingMessage, waypointWeatherObservation } from './seaOperationWeatherHistory';
import { formatSeaPosition } from './seaOperationCoordinates';
import './seaOperationWeatherCard.css';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const value = (number: number | null) => number === null ? 'Indisponible' : decimal.format(number);
const metric = (number: number | null, unit: string) => number === null ? 'Indisponible' : `${value(number)}${unit}`;

/** A measured annex is read independently of the Captain's immutable forecast. */
export function SeaOperationWeatherObservationCard({ point, observations }: {
  point: SeaOperationWaypoint; observations?: readonly ObservationResult[];
}) {
  const observation = waypointWeatherObservation(point, observations);
  return <section className="so-weather-observations" aria-label={`Mesures météo du waypoint ${point.number || point.id}`}>
    <h5>Mesures officielles après le passage</h5>
    {!observation || observation.status !== 'recorded' ? <p>{observation?.message || observationWaitingMessage(point)}</p> : <>
      {observation.waves ? <div className="so-weather-observation-component">
        <strong><Waves size={14} aria-hidden="true" />{observation.waves.component === 'swell' ? 'Houle Hs observée' : 'Hs de mer totale observée'}</strong>
        <span>{metric(observation.waves.heightMeters, ' m')} · période {observation.waves.periodKind === 'peak' ? 'de pic' : 'moyenne'} : {metric(observation.waves.periodSeconds, ' s')}</span>
        <span>Provenance : {metric(observation.waves.directionDegrees, '°')}</span>
        <ObservationOrigin component={observation.waves} />
      </div> : <p>Hs / période : aucune mesure officielle proche disponible.</p>}
      {observation.wind ? <div className="so-weather-observation-component">
        <strong><Wind size={14} aria-hidden="true" />Vent mesuré{observation.wind.instrumentHeightMeters !== null ? ` à ${value(observation.wind.instrumentHeightMeters)} m` : ''}</strong>
        <span>{metric(observation.wind.speedKnots, ' nd')} · de {metric(observation.wind.directionDegrees, '°')}</span>
        {observation.wind.instrumentHeightMeters === null && <small>Hauteur de mesure non renseignée.</small>}
        <ObservationOrigin component={observation.wind} />
      </div> : <p>Vent : aucune mesure officielle proche disponible.</p>}
      {observation.message && <p>{observation.message}</p>}
      <small>Annexe mise à jour le {observationTime(observation.recordedAt)}. La prévision et la décision signées restent conservées.</small>
    </>}
  </section>;
}

function ObservationOrigin({ component }: { component: NonNullable<ObservationResult['wind']> | NonNullable<ObservationResult['waves']> }) {
  return <>
    <small>{component.station.name} · {decimal.format(component.station.distanceKm)} km · {observationTime(component.observedAt)}</small>
    <small>{formatSeaPosition(component.station)}</small>
    <small><a href={component.source.sourceUrl} target="_blank" rel="noopener noreferrer">{component.source.provider}</a> · qualité {component.source.quality === 'good' ? 'bonne' : 'non renseignée'} · <a href={component.source.licenseUrl} target="_blank" rel="noopener noreferrer">{component.source.license}</a></small>
  </>;
}
