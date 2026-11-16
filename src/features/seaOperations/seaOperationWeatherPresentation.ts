import { evaluateVesselSeaState, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import type { SeaOperationWaypoint } from './seaOperationModel';
import { observationTime, weatherUncertaintyLabel } from './seaOperationWeatherHistory';
import { seaOperationWeatherGridLocations } from './seaOperationWeatherLocation';
import { hasSeaOperationForecast, type SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const metres = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function waypointWeatherAtValidation(point: SeaOperationWaypoint, validatedAt?: string | null) {
  const forecast = waypointWeatherSnapshot(point);
  if (!forecast || !validatedAt) return forecast;
  const signatureTime = Date.parse(validatedAt);
  return Number.isFinite(signatureTime) && Date.parse(forecast.fetchedAt) <= signatureTime ? forecast : undefined;
}

export function weatherPeriod(kind: 'mean' | 'peak' | undefined) {
  if (kind === 'peak') return { shortLabel: 'Période Tp', detail: 'de pic', label: 'Période de pic' };
  if (kind === 'mean') return { shortLabel: 'Période Tm', detail: 'moyenne', label: 'Période moyenne' };
  return { shortLabel: 'Période', detail: 'type non renseigné', label: 'Période' };
}

export function forecastSeaStateAssessment(matrix: VesselWeatherMatrix | null | undefined, forecast: SeaOperationWaypointWeather | undefined) {
  const swell = forecast?.waves;
  return evaluateVesselSeaState(matrix, swell?.periodKind === 'peak' ? undefined : swell);
}

export function forecastTotalSeaText(forecast: SeaOperationWaypointWeather) {
  const sea = forecast.seaState;
  if (!sea) return [];
  const height = sea.heightMeters === null ? 'indisponible' : `${metres.format(sea.heightMeters)} m`;
  const period = sea.periodSeconds === null ? 'indisponible' : `${decimal.format(sea.periodSeconds)} s`;
  const direction = sea.directionDegrees === null ? 'indisponible' : `${integer.format(sea.directionDegrees)}°`;
  const periodLabel = weatherPeriod(sea.periodKind);
  return [`Hs mer totale · ${height}`, `${periodLabel.label} · ${period}${sea.periodSeconds !== null && !sea.periodKind ? ' (type non renseigné)' : ''}`, `Direction de la mer totale · ${direction}`];
}

export function forecastModelDetails(forecast: SeaOperationWaypointWeather) {
  const { model } = forecast;
  return [
    ...(model ? [`${model.name}${model.product ? ` · produit ${model.product}` : ''} · réseau du ${observationTime(model.referenceTime)}`] : []),
    ...(model?.validTime && !hasSeaOperationForecast(forecast) ? [`Échéance du modèle ${observationTime(model.validTime)}`] : []),
    ...(!model && hasSeaOperationForecast(forecast) ? ['Modèle et cycle non renseignés.'] : []),
    ...seaOperationWeatherGridLocations(forecast),
  ];
}

export function forecastSourceLinks(forecast: SeaOperationWaypointWeather): { label: string; url: string }[] {
  if (forecast.attribution !== 'Open-Meteo' || !hasSeaOperationForecast(forecast)) return [{ label: forecast.attribution, url: forecast.sourceUrl }];
  return [
    ...(forecast.wind ? [{ label: 'Open-Meteo · Weather Forecast API', url: 'https://open-meteo.com/en/docs' }] : []),
    ...(forecast.waves || forecast.seaState ? [{ label: 'Open-Meteo · Marine Weather API', url: forecast.sourceUrl }] : []),
  ];
}

export function forecastSourceDetails(forecast: SeaOperationWaypointWeather) {
  return [
    `${forecast.attribution} · consultée le ${observationTime(forecast.fetchedAt)}`,
    `ETA ${observationTime(forecast.etaUtc)}`,
    ...(forecast.waves ? [`Échéance houle ${observationTime(forecast.waves.time)}`] : []),
    ...(forecast.seaState ? [`Échéance mer totale ${observationTime(forecast.seaState.time)}`] : []),
    ...(forecast.wind ? [`Échéance vent ${observationTime(forecast.wind.time)}`] : []),
    ...forecastModelDetails(forecast),
    ...(forecast.waves || forecast.seaState || forecast.wind ? [weatherUncertaintyLabel] : []),
  ];
}
