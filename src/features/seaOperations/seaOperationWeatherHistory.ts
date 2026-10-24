import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaWaypointPosition } from './seaOperationNavigation';
import { formatSeaPosition } from './seaOperationCoordinates';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { isSeaOperationWeatherObservation, type ObservationResult } from './seaOperationWeatherObservationsModel';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const utc = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const number = (value: number | null) => value === null ? 'indisponible' : decimal.format(value);
const metric = (value: number | null, unit: string) => value === null ? 'indisponible' : `${number(value)}${unit}`;
export const observationTime = (value: string) => `${utc.format(new Date(value))} UTC`;

/** An annex must never be shown against a different point, position or ETA. */
export function waypointWeatherObservation(point: SeaOperationWaypoint, observations?: readonly ObservationResult[]): ObservationResult | undefined {
  const position = seaWaypointPosition(point);
  if (!position) return undefined;
  let eta: string;
  try { eta = seaOperationEtaUtc(point.eta); } catch { return undefined; }
  return observations?.find((row) => isSeaOperationWeatherObservation(row) && row.pointId === point.id && Date.parse(row.etaUtc) === Date.parse(eta)
    && Math.abs(row.latitude - position.latitude) < 1e-8 && Math.abs(row.longitude - position.longitude) < 1e-8);
}

export function observationWaitingMessage(point: SeaOperationWaypoint, now = Date.now()): string {
  if (!seaWaypointPosition(point)) return 'Coordonnées manquantes : aucune collecte de mesures possible.';
  let eta: number;
  try { eta = Date.parse(seaOperationEtaUtc(point.eta)); } catch { return 'Une ETA complète est nécessaire pour retrouver les mesures officielles.'; }
  return eta + 7 * 86_400_000 < now ? 'Aucune mesure officielle enregistrée pour ce point.'
    : 'Les mesures officielles sont collectées quotidiennement après le passage, selon leur disponibilité.';
}

export function observationText(observation: ObservationResult | undefined, fallback = 'Aucune mesure officielle enregistrée.'): string {
  if (!observation || observation.status !== 'recorded') return observation?.message || fallback;
  const wind = observation.wind;
  const waves = observation.waves;
  return [
    'MESURES OFFICIELLES APRÈS LE PASSAGE',
    waves ? `${waves.component === 'swell' ? 'Houle Hs' : 'Hs de mer totale'} observée : ${metric(waves.heightMeters, ' m')} · période ${waves.periodKind === 'peak' ? 'de pic' : 'moyenne'} : ${metric(waves.periodSeconds, ' s')}\nProvenance : ${metric(waves.directionDegrees, '°')}\n${waves.station.name} · ${number(waves.station.distanceKm)} km · ${observationTime(waves.observedAt)}` : 'Hs / période : aucune mesure officielle proche disponible.',
    wind ? `Vent mesuré${wind.instrumentHeightMeters === null ? ' (hauteur non renseignée)' : ` à ${number(wind.instrumentHeightMeters)} m`} : ${metric(wind.speedKnots, ' nd')} · de ${metric(wind.directionDegrees, '°')}\n${wind.station.name} · ${number(wind.station.distanceKm)} km · ${observationTime(wind.observedAt)}` : 'Vent : aucune mesure officielle proche disponible.',
    ...(observation.message ? [observation.message] : []),
  ].join('\n\n');
}

export function observationFootnote(observation: ObservationResult | undefined): string {
  if (!observation || observation.status !== 'recorded') return '';
  const components = [observation.wind, observation.waves].filter((value) => value !== null);
  return [
    `Annexe mise à jour le ${observationTime(observation.recordedAt)}. Stations à 50 km maximum, heure observée à 30 min maximum de l’ETA.`,
    ...components.map((part) => `${part.source.provider} · ${part.station.name} (${part.station.id}) · ${formatSeaPosition(part.station)} · ${part.station.distanceKm.toFixed(1)} km · ${observationTime(part.observedAt)} · qualité ${part.source.quality === 'good' ? 'bonne' : 'non renseignée'}\n${part.source.sourceUrl}\n${part.source.license} · ${part.source.licenseUrl}`),
    'Valeurs présentées en mètres, secondes, degrés et nœuds ; sélection de la station et de l’heure proches de l’ETA. Les mesures ne modifient pas la décision signée.',
  ].join('\n');
}
