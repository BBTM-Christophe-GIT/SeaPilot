import { CloudSun, Compass, Timer, Waves, Wind, type LucideIcon } from 'lucide-react';
import type { VesselSeaStateAssessment, VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import type { SeaOperationWaypoint } from './seaOperationModel';
import './seaOperationWeatherCard.css';
import type { ObservationResult } from './seaOperationWeatherObservationsModel';
import { SeaOperationWeatherObservationCard, SeaOperationWeatherObservationOrigin } from './SeaOperationWeatherObservationCard';
import type { WeatherRequestStatus } from './seaOperationWeatherStatus';
import { observationTime, observationWaitingMessage, waypointWeatherObservation, weatherUncertaintyLabel } from './seaOperationWeatherHistory';
import { seaOperationEtaUtc } from './seaOperationWeatherModel';
import { forecastModelDetails, forecastSeaStateAssessment, forecastSourceDetails, forecastSourceLinks, forecastTotalSeaText, waypointWeatherAtValidation, weatherPeriod } from './seaOperationWeatherPresentation';

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
export function SeaOperationWeatherCard({ point, matrix, compact = false, showIndicator = true, variant = 'default', validatedAt, showObservations = false, observations, requestStatus }: {
  point: SeaOperationWaypoint; matrix?: VesselWeatherMatrix | null; compact?: boolean; showIndicator?: boolean; variant?: 'default' | 'editor' | 'comparison';
  validatedAt?: string | null; showObservations?: boolean; observations?: readonly ObservationResult[];
  requestStatus?: WeatherRequestStatus;
}) {
  if (variant === 'comparison') return <SeaOperationWeatherComparison point={point} matrix={matrix} showIndicator={showIndicator} validatedAt={validatedAt} observations={observations} />;
  const forecast = waypointWeatherAtValidation(point, validatedAt);
  const assessment = forecastSeaStateAssessment(matrix, forecast);
  const waves = forecast?.waves;
  const wavePeriod = weatherPeriod(waves ? waves.periodKind ?? 'mean' : undefined);
  const signatureTime = validatedAt && Number.isFinite(Date.parse(validatedAt)) ? validatedAt : undefined;
  return <div className={`so-waypoint-weather-card${compact ? ' is-compact' : ''}${variant === 'editor' ? ' is-editor' : ''}${!forecast ? ' is-unavailable' : ''}${validatedAt ? ' is-validated' : ''}`}>
    <div className="so-waypoint-weather-heading"><span>{validatedAt ? 'Prévision conservée à la validation' : 'État de mer prévu'}</span>{showIndicator && <SeaStateIndicator assessment={assessment} />}</div>
    {forecast ? <>
      <dl className="so-waypoint-weather-metrics">
        <div><dt><Waves size={15} aria-hidden="true" />Houle Hs</dt><dd>{amount(waves?.heightMeters ?? null, height)}<small> m</small></dd></div>
        <div><dt title={`${wavePeriod.label} de la houle`}><Timer size={15} aria-hidden="true" />Période{waves && <small>{wavePeriod.detail}</small>}</dt><dd>{amount(waves?.periodSeconds ?? null)}<small> s</small></dd></div>
      </dl>
      <p className="so-waypoint-weather-direction"><Compass size={13} aria-hidden="true" />Provenance de la houle : {waves?.directionDegrees != null ? `${amount(waves.directionDegrees, integer)}°` : 'indisponible'}</p>
      {!waves && <p className="so-waypoint-weather-unavailable">{forecast.wavesMessage || 'Prévision de houle indisponible.'}</p>}
      {forecast.seaState && <p className="so-waypoint-weather-direction">{forecastTotalSeaText(forecast).join(' · ')}</p>}
      <div className="so-waypoint-weather-wind"><Wind size={15} aria-hidden="true" /><span>Vent moyen 10 m<strong>{forecast.wind ? <>{amount(forecast.wind.speedKnots)} nd{forecast.wind.directionDegrees !== null && ` · de ${amount(forecast.wind.directionDegrees, integer)}°`}</> : forecast.windMessage || 'Indisponible'}</strong></span></div>
      <div className="so-waypoint-weather-time"><span>ETA : {date.format(new Date(forecast.etaUtc))} UTC</span>{forecastSourceLinks(forecast).map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}</div>
      {waves && <small className="so-waypoint-weather-model">Modèle houle : {date.format(new Date(waves.time))} UTC</small>}
      {forecast.seaState && <small className="so-waypoint-weather-model">Échéance mer totale {observationTime(forecast.seaState.time)}</small>}
      {forecast.wind && <small className="so-waypoint-weather-model">Modèle vent : {date.format(new Date(forecast.wind.time))} UTC</small>}
      {forecastModelDetails(forecast).map(detail => <small key={detail} className="so-waypoint-weather-model">{detail}</small>)}
      <small className="so-waypoint-weather-model">Consultée le {observationTime(forecast.fetchedAt)}.</small>
      {(forecast.wind || waves || forecast.seaState) && <small className="so-waypoint-weather-model">{weatherUncertaintyLabel}</small>}
      {assessment.hsRange && <small className="so-waypoint-weather-band">Matrice : Hs {assessment.hsRange} · {assessment.periodRange}</small>}
    </> : <p className="so-waypoint-weather-unavailable" role={requestStatus ? 'status' : undefined}>{requestStatus?.error || (requestStatus?.loading ? 'Chargement des prévisions météo…' : 'Prévisions météo non enregistrées pour cette position et cette ETA.')}</p>}
    {forecast && requestStatus?.loading && <small role="status" className="so-waypoint-weather-model">Actualisation des prévisions météo…</small>}
    {forecast && requestStatus?.error && <p role="status" className="so-waypoint-weather-unavailable">{requestStatus.error} Les prévisions déjà enregistrées sont conservées.</p>}
    {signatureTime && <small className="so-waypoint-weather-model">Validation du Capitaine : {date.format(new Date(signatureTime))} UTC</small>}
    {showObservations && <SeaOperationWeatherObservationCard point={point} observations={observations} />}
  </div>;
}

function WeatherComparisonMetric({ icon: Icon, label, value, unit, detail, formatter = decimal }: {
  icon: LucideIcon; label: string; value: number | null; unit: string; detail?: string; formatter?: Intl.NumberFormat;
}) {
  return <div><dt><Icon size={14} aria-hidden="true" />{label}</dt><dd>{value === null ? <span className="so-weather-comparison-missing">Indisponible</span> : <>{formatter.format(value)}<small> {unit}</small></>}{detail && <span className="so-weather-comparison-metric-detail">{detail}</span>}</dd></div>;
}

const direction = (value: number | null | undefined) => value == null ? 'Direction indisponible' : `de ${integer.format(value)}°`;

/** Screen comparison reads saved captures and official observations without merging their meanings. */
function SeaOperationWeatherComparison({ point, matrix, showIndicator, validatedAt, observations }: {
  point: SeaOperationWaypoint; matrix?: VesselWeatherMatrix | null; showIndicator: boolean;
  validatedAt?: string | null; observations?: readonly ObservationResult[];
}) {
  const signatureTime = validatedAt && Number.isFinite(Date.parse(validatedAt)) ? validatedAt : undefined;
  const forecast = waypointWeatherAtValidation(point, validatedAt);
  const observation = waypointWeatherObservation(point, observations);
  const measured = signatureTime && observation?.status === 'recorded' ? observation : undefined;
  const waves = forecast?.waves;
  const wavePeriod = weatherPeriod(waves?.periodKind ?? 'mean');
  const measuredWaves = measured?.waves;
  const measuredWind = measured?.wind;
  const assessment = forecastSeaStateAssessment(matrix, forecast);
  let etaUtc: string | undefined;
  try { etaUtc = seaOperationEtaUtc(point.eta); } catch { /* Historical records may have an incomplete ETA. */ }
  const pending = !signatureTime || observation?.status === 'pending' || !observation && Boolean(etaUtc && Date.parse(etaUtc) + 7 * 86_400_000 >= Date.now());
  const observationMissing = !signatureTime ? 'Les mesures officielles des stations proches seront recherchées après la signature du Capitaine et le passage à l’ETA.'
    : observation?.message || observationWaitingMessage(point);
  const forecastTitle = validatedAt ? 'Données prévues à la signature du Capitaine' : 'Prévisions du brouillon';
  const forecastMissing = validatedAt ? 'Aucune prévision conservée à la signature pour ce waypoint.' : 'Aucune prévision enregistrée pour ce waypoint.';
  const differentWaves = Boolean(waves && measuredWaves?.component === 'total');
  const differentPeriod = Boolean(waves?.periodSeconds != null && measuredWaves?.periodSeconds != null && measuredWaves.periodKind !== (waves.periodKind ?? 'mean'));
  const differentWind = Boolean(forecast?.wind && measuredWind && measuredWind.instrumentHeightMeters !== 10);
  return <section className="so-waypoint-weather-card is-comparison" aria-label={`Comparaison météo du waypoint ${point.number || point.id}`}>
    <header className="so-weather-comparison-heading"><strong><CloudSun size={17} aria-hidden="true" />Météo à l’ETA</strong><span>{etaUtc ? observationTime(etaUtc) : 'ETA complète à renseigner'}</span></header>
    <div className="so-weather-comparison-grid">
      <section className="so-weather-comparison-column is-forecast" aria-label={forecastTitle}>
        <header className="so-weather-comparison-column-heading"><h5>{forecastTitle}</h5><span className="so-weather-comparison-state">{validatedAt ? 'Prévision figée' : 'Non signé'}</span></header>
        <p className="so-weather-comparison-time">{validatedAt ? signatureTime ? `Signature : ${observationTime(signatureTime)}` : 'Horodatage de signature indisponible.' : 'Données de l’enregistrement sauvegardé.'}</p>
        {forecast ? <>
          <dl className="so-weather-comparison-metrics">
            <WeatherComparisonMetric icon={Waves} label="Hs · houle" value={waves?.heightMeters ?? null} unit="m" formatter={height} detail={direction(waves?.directionDegrees)} />
            <WeatherComparisonMetric icon={Timer} label={wavePeriod.shortLabel} value={waves?.periodSeconds ?? null} unit="s" detail={wavePeriod.detail} />
            <WeatherComparisonMetric icon={Wind} label="Vent moyen · 10 m" value={forecast.wind?.speedKnots ?? null} unit="nd" detail={direction(forecast.wind?.directionDegrees)} />
          </dl>
          {forecast.seaState && <p className="so-weather-comparison-message">{forecastTotalSeaText(forecast).join(' · ')}</p>}
          {showIndicator && <SeaStateIndicator assessment={assessment} />}
          {!waves && <p className="so-weather-comparison-message">{forecast.wavesMessage || 'Prévision de houle indisponible.'}</p>}
          {!forecast.wind && <p className="so-weather-comparison-message">{forecast.windMessage || 'Prévision de vent indisponible.'}</p>}
          <details className="so-weather-comparison-details"><summary>Sources et horaires de prévision</summary><div>
            {forecastSourceDetails(forecast).map(detail => <p key={detail}>{detail}</p>)}
            {forecastSourceLinks(forecast).map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>)}
          </div></details>
        </> : <p className="so-weather-comparison-message">{forecastMissing}</p>}
      </section>
      <section className="so-weather-comparison-column is-observed" aria-label="Données réelles à l’ETA">
        <header className="so-weather-comparison-column-heading"><h5>Données réelles à l’ETA</h5><span className={`so-weather-comparison-state${measured ? ' is-recorded' : ''}`}>{measured ? 'Mesures officielles' : pending ? 'En attente' : 'Indisponibles'}</span></header>
        <p className="so-weather-comparison-time">Stations proches · horaires relevés près de l’ETA.</p>
        {measured ? <>
          <dl className="so-weather-comparison-metrics">
            <WeatherComparisonMetric icon={Waves} label={measuredWaves ? measuredWaves.component === 'total' ? 'Hs · mer totale' : 'Hs · houle' : 'Hs'} value={measuredWaves?.heightMeters ?? null} unit="m" formatter={height} detail={direction(measuredWaves?.directionDegrees)} />
            <WeatherComparisonMetric icon={Timer} label={measuredWaves ? measuredWaves.periodKind === 'peak' ? 'Période Tp' : 'Période Tm' : 'Période'} value={measuredWaves?.periodSeconds ?? null} unit="s" detail={measuredWaves ? measuredWaves.periodKind === 'peak' ? 'de pic' : 'moyenne' : undefined} />
            <WeatherComparisonMetric icon={Wind} label="Vent mesuré" value={measuredWind?.speedKnots ?? null} unit="nd" detail={direction(measuredWind?.directionDegrees)} />
          </dl>
          <div className="so-weather-comparison-observed-times">
            {measuredWaves && <p>Mer : {observationTime(measuredWaves.observedAt)} · {decimal.format(measuredWaves.station.distanceKm)} km.</p>}
            {measuredWind && <p>Vent : {observationTime(measuredWind.observedAt)} · {decimal.format(measuredWind.station.distanceKm)} km · {measuredWind.instrumentHeightMeters === null ? 'hauteur non renseignée' : `mesuré à ${decimal.format(measuredWind.instrumentHeightMeters)} m`}.</p>}
          </div>
          {!measuredWaves && <p className="so-weather-comparison-message">Hs et période : aucune mesure officielle proche disponible.</p>}
          {!measuredWind && <p className="so-weather-comparison-message">Vent : aucune mesure officielle proche disponible.</p>}
          <details className="so-weather-comparison-details"><summary>Stations, sources et qualité</summary><div>
            {measuredWaves && <div><strong>État de mer</strong><SeaOperationWeatherObservationOrigin component={measuredWaves} /></div>}
            {measuredWind && <div><strong>Vent</strong><SeaOperationWeatherObservationOrigin component={measuredWind} /></div>}
            {measured.message && <p>{measured.message}</p>}
            <p>Annexe mise à jour le {observationTime(measured.recordedAt)}. Les mesures ne modifient pas la prévision ni la décision signées.</p>
          </div></details>
        </> : <p className="so-weather-comparison-message">{observationMissing}</p>}
      </section>
    </div>
    {(differentWaves || differentPeriod || differentWind) && <p className="so-weather-comparison-note">À lire séparément : {[differentWaves ? 'houle prévue et mer totale mesurée' : '', differentPeriod ? `${wavePeriod.label.toLowerCase()} ${waves?.periodKind === 'peak' ? 'Tp' : 'Tm'} et ${measuredWaves?.periodKind === 'peak' ? 'période de pic Tp' : 'période moyenne Tm'}` : '', differentWind ? 'vent prévu à 10 m et vent mesuré à une autre hauteur ou non renseignée' : ''].filter(Boolean).join(' ; ')}.</p>}
  </section>;
}
