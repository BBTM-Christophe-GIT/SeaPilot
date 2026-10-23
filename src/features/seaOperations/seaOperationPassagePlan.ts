import type { SeaOperationWaypoint } from './seaOperationModel';
import { seaOperationRadioContacts, SEA_RADIO_VERIFIED_ON } from './seaOperationRadio';
import { waypointRadioSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';

const value = (text: string) => text.trim() || 'À renseigner';
const numbers = [0, 1, 2].map((digits) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, ...(digits === 2 ? { minimumFractionDigits: 2 } : {}) }));
const utcDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const number = (amount: number | null, digits = 1) => amount === null ? 'indisponible' : numbers[digits].format(amount);
const utc = (time: string) => `${utcDate.format(new Date(time))} UTC`;

/** A shared, plain-text view of the recorded Passage Plan for the editor, print and PDF. */
export function passagePlanCellData(point: SeaOperationWaypoint, options: { allowLiveRadio?: boolean } = {}) {
  const radio = waypointRadioSnapshot(point);
  const contacts = radio?.contacts ?? (options.allowLiveRadio ? seaOperationRadioContacts([point]).contacts : undefined);
  const forecast = waypointWeatherSnapshot(point);
  const vhf = contacts === undefined ? 'Contacts VHF non enregistrés.' : contacts.length ? contacts.map((contact) => [
    `${contact.name} · Ch ${contact.vhf}`,
    [contact.phone ? `Tél. ${contact.phone}` : '', contact.mmsi ? `MMSI ${contact.mmsi}` : ''].filter(Boolean).join(' · '),
  ].filter(Boolean).join('\n')).join('\n\n') : 'Aucun contact de l’annuaire trouvé à proximité.';
  const weather = forecast ? [
    forecast.wind ? `Vent moyen 10 m : ${number(forecast.wind.speedKnots)} nd · de ${number(forecast.wind.directionDegrees, 0)}°\nModèle : ${utc(forecast.wind.time)}`
      : `Vent : ${forecast.windMessage || 'prévision indisponible à cette ETA.'}`,
    forecast.waves ? `Houle Hs : ${number(forecast.waves.heightMeters, 2)} m · ${number(forecast.waves.periodSeconds)} s · de ${number(forecast.waves.directionDegrees, 0)}°\nModèle : ${utc(forecast.waves.time)}`
      : `Hs : ${forecast.wavesMessage || 'prévision indisponible à cette ETA.'}`,
  ].join('\n\n') : 'Prévisions météo non enregistrées pour cette position et cette ETA.';
  const radioFootnote = contacts?.length ? [
    `Annuaire vérifié le ${radio?.verifiedOn ?? SEA_RADIO_VERIFIED_ON}${radio ? ` · copie du ${utc(radio.capturedAt)}` : ' · propositions à enregistrer'}.`,
    ...contacts.map((contact) => `${contact.name} : ${contact.sourceLabel} · ${contact.source}`),
  ].join('\n') : '';
  const weatherFootnote = forecast ? [
    `${forecast.attribution} · consultée le ${utc(forecast.fetchedAt)}`,
    ...(forecast.model ? [`${forecast.model.name} · réseau du ${utc(forecast.model.referenceTime)} · maille ${forecast.model.latitude.toFixed(3)}, ${forecast.model.longitude.toFixed(3)}`] : []),
    forecast.sourceUrl,
  ].join('\n') : '';
  return {
    waypoint: value(point.number), description: value(point.descriptionVhf), latitude: value(point.latitude), longitude: value(point.longitude),
    ukc: value(point.ukc), eta: value(point.eta.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}).*$/, '$3/$2/$1 à $4')),
    vhf, weather, denseTraffic: point.denseTraffic ? 'Oui' : 'Non', weatherFootnote, radioFootnote,
  };
}
