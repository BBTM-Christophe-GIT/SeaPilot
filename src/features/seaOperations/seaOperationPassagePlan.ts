import type { SeaOperationPayload, SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationRadioContacts, SEA_RADIO_VERIFIED_ON } from './seaOperationRadio';
import { waypointRadioSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import { evaluateVesselSeaState, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { observationFootnote, observationText, observationWaitingMessage, waypointWeatherObservation } from './seaOperationWeatherHistory';
import { seaOperationWeatherLocation } from './seaOperationWeatherLocation';
import { formatSeaLatitude, formatSeaLongitude, formatSeaPosition } from './seaOperationCoordinates';
import { seaOperationUkcPresentation } from './seaOperationUkcPresentation';

const value = (text: string) => text.trim() || 'À renseigner';
const numbers = [0, 1, 2].map((digits) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, ...(digits === 2 ? { minimumFractionDigits: 2 } : {}) }));
const utcDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const number = (amount: number | null, digits = 1) => amount === null ? 'indisponible' : numbers[digits].format(amount);
const utc = (time: string) => `${utcDate.format(new Date(time))} UTC`;

/** A shared, plain-text view of the recorded Passage Plan for the editor, print and PDF. */
export function passagePlanCellData(point: SeaOperationWaypoint, options: { payload?: SeaOperationPayload; allowLiveRadio?: boolean; weatherMatrix?: VesselWeatherMatrix | null; observations?: readonly ObservationResult[]; includeObservations?: boolean; validatedAt?: string | null } = {}) {
  const ukcPresentation = seaOperationUkcPresentation(options.payload, point);
  const radio = waypointRadioSnapshot(point);
  const contacts = radio?.contacts ?? (options.allowLiveRadio ? seaOperationRadioContacts([point]).contacts : undefined);
  const forecast = waypointWeatherSnapshot(point);
  const seaState = evaluateVesselSeaState(options.weatherMatrix, forecast?.waves);
  const hasSeaStateIndicator = seaState.code !== 'no_matrix' && seaState.code !== 'not_defined';
  const vhf = contacts === undefined ? 'Contacts VHF non enregistrés.' : contacts.length ? contacts.map((contact) => [
    `${contact.name} · Ch ${contact.vhf}`,
    [contact.phone ? `Tél. ${contact.phone}` : '', contact.mmsi ? `MMSI ${contact.mmsi}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n')).join('\n\n') : 'Aucun contact de l’annuaire trouvé à proximité.';
  const forecastText = forecast ? [
    ...(hasSeaStateIndicator ? [seaState.label] : []),
    forecast.waves ? `Houle Hs : ${number(forecast.waves.heightMeters, 2)} m\nPériode : ${number(forecast.waves.periodSeconds)} s\nProvenance houle : ${number(forecast.waves.directionDegrees, 0)}°`
      : `Hs / période : ${forecast.wavesMessage || 'prévision indisponible à cette ETA.'}`,
    forecast.wind ? `Vent moyen 10 m : ${number(forecast.wind.speedKnots)} nd · de ${number(forecast.wind.directionDegrees, 0)}°`
      : `Vent : ${forecast.windMessage || 'prévision indisponible à cette ETA.'}`,
  ].join('\n\n') : 'Prévisions météo non enregistrées pour cette position et cette ETA.';
  const observation = options.includeObservations ? waypointWeatherObservation(point, options.observations) : undefined;
  const observedWeather = options.includeObservations ? observationText(observation, observationWaitingMessage(point)) : '';
  const weather = [options.validatedAt ? `Prévision conservée à la validation du ${utc(options.validatedAt)}.` : '', forecastText, observedWeather].filter(Boolean).join('\n\n');
  const radioFootnote = contacts?.length ? [
    `Annuaire vérifié le ${radio?.verifiedOn ?? SEA_RADIO_VERIFIED_ON}${radio ? ` · copie du ${utc(radio.capturedAt)}` : ' · propositions à enregistrer'}.`,
    ...contacts.map((contact) => `${contact.name} : ${contact.sourceLabel} · ${contact.source}`),
  ].join('\n') : '';
  const forecastFootnote = forecast ? [
    `${forecast.attribution} · consultée le ${utc(forecast.fetchedAt)}`,
    `ETA : ${utc(forecast.etaUtc)}${forecast.waves ? ` · modèle houle : ${utc(forecast.waves.time)}` : ''}${forecast.wind ? ` · modèle vent : ${utc(forecast.wind.time)}` : ''}`,
    ...(forecast.model ? [`${forecast.model.name} · réseau du ${utc(forecast.model.referenceTime)} · maille ${formatSeaPosition(forecast.model)}`] : []),
    ...(forecast.model ? [seaOperationWeatherLocation(forecast)] : []),
    ...(hasSeaStateIndicator && seaState.hsRange ? [`Matrice du navire enregistrée : Hs ${seaState.hsRange} · période ${seaState.periodRange}. Aide à la lecture, sans décision GO automatique.`] : []),
    forecast.sourceUrl,
  ].join('\n') : '';
  const weatherFootnote = [options.validatedAt ? `Validation du Capitaine : ${utc(options.validatedAt)}.` : '', forecastFootnote, observationFootnote(observation)].filter(Boolean).join('\n');
  return {
    waypoint: value(point.number), description: value(point.descriptionVhf), latitude: value(formatSeaLatitude(point.latitude)), longitude: value(formatSeaLongitude(point.longitude)),
    ukc: ukcPresentation.automatic ? ukcPresentation.displayValue || 'Indisponible' : value(point.ukc), ukcPresentation,
    ukcFootnote: ukcPresentation.automatic ? ukcPresentation.sourceFootnote : '',
    eta: value(point.eta.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}).*$/, '$3/$2/$1 à $4')),
    vhf, weather, observedWeather, observation, seaState, hasSeaStateIndicator, denseTraffic: point.denseTraffic ? 'Oui' : 'Non', weatherFootnote, radioFootnote,
  };
}
