import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3, ChevronDown, ClipboardList, Droplets, Fuel, Gauge, Ship, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { compareFleetAssets, fleetIllustration, normalizeFleetName } from '../fleet/fleetDisplay';
import { fleetConsumptionScale, SeaOperationVesselConsumption } from './SeaOperationFleetConsumption';
import { SeaOperationFleetFuelHistory } from './SeaOperationFleetFuelHistory';
import { SeaOperationLatestTankReading } from './SeaOperationLatestTankReading';
import { SeaOperationSpeedDial } from './SeaOperationSpeedDial';
import { SeaOperationStockGauge } from './SeaOperationStockGauge';
import {
  fetchSeaOperationFleetFuel, fetchSeaOperationFleetFuelHistory,
  type FleetFuelNavigationProfile, type FleetSludgeTank, type SeaOperationFleetFuelCostSource,
  type SeaOperationFleetFuelLevel, type SeaOperationFleetFuelMonth,
} from './seaOperationFleetFuelQuery';
import { formatFuelVolume, fuelVolumeUnit } from './seaOperationFuelVolume';
import { seaOperationToday } from './seaOperationModel';
import type { SeaOperationRegisterConsumption } from './seaOperationRegisterConsumptionQuery';
import './seaOperationFleetFuel.css';

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const rateNumber = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 4 });
const measuredDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const referenceDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });

function tankLevel(fuelLiters: number | null, capacityLiters: number | null) {
  const fill = fuelLiters !== null && capacityLiters !== null && capacityLiters > 0 ? fuelLiters / capacityLiters : null;
  const level = fill === null ? 'unknown' : fill < .25 ? 'critical' : fill <= .35 ? 'warning' : 'normal';
  return { fill, level, fillPercent: `${Math.min((fill ?? 0) * 100, 100)}%` } as const;
}

type ConsumptionDetails = {
  averages?: SeaOperationRegisterConsumption['vesselAverages'];
  averagesError?: string;
  onRetryAverages: () => void;
};

export function orderedFleetFuelLevels(rows: readonly SeaOperationFleetFuelLevel[]) {
  return rows.filter(row => normalizeFleetName(row.vesselName).replace(/[^A-Z0-9]/g, '') !== 'BR71')
    .map(row => ({ ...row, name: row.vesselName, assetKind: 'vessel' as const })).sort(compareFleetAssets);
}

export function useSeaOperationFleetFuel(client: SupabaseClient, accessKey: string | null, refresh: number, operationIds: string) {
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ client: SupabaseClient; accessKey: string;
    rows?: SeaOperationFleetFuelLevel[]; error?: boolean }>();
  useEffect(() => {
    if (!accessKey) return;
    let active = true;
    void fetchSeaOperationFleetFuel(client).then(rows => {
      if (active) setResponse({ client, accessKey, rows });
    }).catch(() => {
      if (active) setResponse({ client, accessKey, error: true });
    });
    return () => { active = false; };
  }, [client, accessKey, refresh, operationIds, retry]);
  useEffect(() => {
    if (!accessKey) return;
    const refreshOnFocus = () => setRetry(value => value + 1);
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [accessKey]);
  const current = response?.client === client && response.accessKey === accessKey ? response : undefined;
  return { rows: current?.rows, error: current?.error, reload: () => setRetry(value => value + 1) };
}

function FuelAutonomy({ label, profile, fuelLiters, maxSpeedKnots, scaleLimitKnots }: {
  label: string; profile: FleetFuelNavigationProfile | null; fuelLiters: number | null;
  maxSpeedKnots: number | null; scaleLimitKnots: number | null;
}) {
  const rate = profile?.litersPerNm ?? null;
  const distance = fuelLiters !== null && rate !== null && rate > 0 ? fuelLiters / rate : null;
  const hours = distance !== null && profile && profile.speedKnots > 0 ? distance / profile.speedKnots : null;
  const available = distance !== null && hours !== null && Number.isFinite(distance) && Number.isFinite(hours);
  return <section className="so-fuel-navigation-profile" aria-label={label}>
    <SeaOperationSpeedDial label={label} speedKnots={profile?.speedKnots ?? null} maxSpeedKnots={maxSpeedKnots} scaleLimitKnots={scaleLimitKnots} />
    {available ? <div className="so-fuel-metric-primary"><strong>{number.format(hours)} h · {number.format(distance)} NM</strong></div>
      : profile && <small>{fuelLiters === null ? 'Stock à renseigner' : 'Autonomie indisponible'}</small>}
    {profile && <small className="so-fuel-autonomy-evidence">
      {rate !== null && rate > 0 && <b>{rateNumber.format(rate)} L/NM</b>}
      <span>{profile.sampleCount} {profile.sampleCount === 1 ? 'relevé' : 'relevés'}</span>
    </small>}
  </section>;
}

function FuelDetails({ vessel, averages, averagesError, scale, onRetryAverages }: ConsumptionDetails & {
  vessel: SeaOperationFleetFuelLevel; scale: ReturnType<typeof fleetConsumptionScale>;
}) {
  const { fuelLiters, capacityLiters, maxSpeedKnots, navigationProfiles, source, measuredAt,
    baselineDate, baselineFuelLiters, deductedFuelLiters, refuelLiters, latestTankReading, sludgeTank } = vessel;
  const includesCustomTanks = latestTankReading?.tanks.some(tank => tank.sectionName !== undefined);
  const vmax = maxSpeedKnots !== null && maxSpeedKnots > 0 ? maxSpeedKnots : null;
  const highestSpeed = Math.max(navigationProfiles?.normal?.speedKnots ?? 0, navigationProfiles?.towing?.speedKnots ?? 0);
  const scaleLimitKnots = vmax !== null && vmax >= highestSpeed ? vmax : highestSpeed > 0 ? Math.ceil(highestSpeed / 5) * 5 : null;
  const { fill, level } = tankLevel(fuelLiters, capacityLiters);
  const volumeUnit = fuelVolumeUnit(capacityLiters);
  const sourceLabel = source === 'refuel' ? 'Avitaillement Conso' : source === 'baseline' ? 'Stock de référence' : 'Arrivée Conso';
  const sludge = sludgeTank && sludgeTankLevel(sludgeTank);

  return <>
    <section className="so-fuel-card-metric" aria-label="Soutes">
      <h3><span><ClipboardList size={16} aria-hidden="true" /></span>Soutes</h3>
      <SeaOperationStockGauge fuelLiters={fuelLiters} capacityLiters={capacityLiters} fill={fill} level={level} />
      {source && (baselineDate || measuredAt) && <small className="so-fuel-stock-source">{sourceLabel}{' · '}{baselineDate
        ? <time dateTime={baselineDate}>{referenceDate.format(new Date(`${baselineDate}T12:00:00Z`))}</time>
        : measuredAt && <time dateTime={measuredAt}>{measuredDate.format(new Date(measuredAt))}</time>}</small>}
      {(baselineFuelLiters !== null || deductedFuelLiters !== null || refuelLiters !== null) && <ul className="so-fuel-stock-breakdown" aria-label="Calcul du stock">
        {baselineFuelLiters !== null && <li><ClipboardList size={13} aria-hidden="true" /><span>{formatFuelVolume(baselineFuelLiters, volumeUnit)} de référence</span></li>}
        {deductedFuelLiters !== null && <li><span className="so-fuel-stock-minus" aria-hidden="true">−</span><span>{formatFuelVolume(deductedFuelLiters, volumeUnit)} déduits via DPR</span></li>}
        {refuelLiters !== null && <li><Fuel size={13} aria-hidden="true" /><span>{formatFuelVolume(refuelLiters, volumeUnit)} avitaillés</span></li>}
      </ul>}
      {sludge && <dl className="so-fuel-sludge-values" data-level={sludge.level}>
        <dt><Droplets size={16} aria-hidden="true" />Sludges</dt>
        <dd><span>{sludge.volume ?? '—'} / {sludge.capacity}</span>
          {sludge.percentage !== null && <strong>{sludge.percentage}</strong>}
        </dd>
      </dl>}
      {latestTankReading && !includesCustomTanks && <SeaOperationLatestTankReading reading={latestTankReading} />}
      {!latestTankReading && <small>Aucun relevé Soutes enregistré.</small>}
    </section>
    <section className="so-fuel-card-metric" aria-label="Autonomie estimée">
      <h3><span><Gauge size={16} aria-hidden="true" /></span>Autonomie estimée</h3>
      <FuelAutonomy label="Vitesse moyenne" profile={navigationProfiles?.normal ?? null} fuelLiters={fuelLiters} maxSpeedKnots={vmax} scaleLimitKnots={scaleLimitKnots} />
      <FuelAutonomy label="Vitesse moyenne en remorque" profile={navigationProfiles?.towing ?? null} fuelLiters={fuelLiters} maxSpeedKnots={vmax} scaleLimitKnots={scaleLimitKnots} />
    </section>
    <section className="so-fuel-card-metric so-fuel-averages-card" aria-label="Moyennes">
      <h3 title="L/NM et coût HT au dernier prix applicable. Tendance par rapport au mois précédent."><span><BarChart3 size={16} aria-hidden="true" /></span>Moyennes</h3>
      <small>Tendance par rapport au mois précédent</small>
      <SeaOperationVesselConsumption vessel={vessel} averages={averages} scale={scale} error={averagesError} onRetry={onRetryAverages} />
    </section>
    {latestTankReading && includesCustomTanks && <SeaOperationLatestTankReading reading={latestTankReading} standalone />}
  </>;
}

function FuelHistory({ client, vessel, refresh }: { client: SupabaseClient; vessel: SeaOperationFleetFuelLevel; refresh: number }) {
  const currentYear = Number(seaOperationToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    client: SupabaseClient; key: string; years: number[]; months?: SeaOperationFleetFuelMonth[];
    costSource?: SeaOperationFleetFuelCostSource; lastEntryDate?: string | null; error?: string;
  }>();
  const key = `${vessel.vesselId}:${year}:${refresh}:${retry}`;
  const reload = useCallback(() => setRetry(value => value + 1), []);

  useEffect(() => {
    let active = true;
    void fetchSeaOperationFleetFuelHistory(client, vessel.vesselId, year).then(result => {
      if (active) setResponse({ client, key, ...result });
    }).catch(() => {
      if (active) setResponse(previous => ({ client, key, years: previous?.client === client ? previous.years : [],
        error: 'L’historique annuel de carburant est indisponible.' }));
    });
    window.addEventListener('focus', reload);
    return () => { active = false; window.removeEventListener('focus', reload); };
  }, [client, key, reload, vessel.vesselId, year]);

  const current = response?.client === client && response.key === key ? response : undefined;
  const years = [...new Set([currentYear, year, ...(response?.client === client ? response.years : [])])].sort((a, b) => b - a);
  return <SeaOperationFleetFuelHistory vesselName={vessel.vesselName} year={year} years={years} months={current?.months} volumeUnit={fuelVolumeUnit(vessel.capacityLiters)}
    costSource={current?.costSource} lastEntryDate={current?.lastEntryDate} loading={!current} error={current?.error} onRetry={reload} onYearChange={setYear} />;
}

function sludgeTankLevel({ capacityLiters, liters }: FleetSludgeTank) {
  const fill = liters === null ? null : liters / capacityLiters;
  const level = fill === null ? 'unknown' : fill >= .75 ? 'critical' : fill >= .6 ? 'warning' : 'normal';
  const status = level === 'critical' ? 'Niveau critique' : level === 'warning' ? 'Niveau élevé' : 'Niveau normal';
  const volumeUnit = fuelVolumeUnit(capacityLiters);
  return {
    level, status,
    position: fill === null ? null : Math.min(fill * 100, 100),
    percentage: fill === null ? null : percent.format(Math.floor((fill + Number.EPSILON) * 1000) / 1000),
    volume: liters === null ? null : formatFuelVolume(liters, volumeUnit),
    capacity: formatFuelVolume(capacityLiters, volumeUnit),
  };
}

function FuelCard({ vessel, detailId, expanded, onToggle }: {
  vessel: SeaOperationFleetFuelLevel; detailId: string; expanded: boolean; onToggle: () => void;
}) {
  const { vesselName, fuelLiters, capacityLiters } = vessel;
  const photo = fleetIllustration({ name: vesselName, assetKind: 'vessel' });
  const { fill, level, fillPercent } = tankLevel(fuelLiters, capacityLiters);
  const volumeUnit = fuelVolumeUnit(capacityLiters);
  const sludge = vessel.sludgeTank && sludgeTankLevel(vessel.sludgeTank);

  return <li className="so-fuel-card" data-expanded={expanded}>
    <div className="so-fuel-card-heading">
      <h3>{vesselName}</h3>
      {level === 'critical' && <span className="so-fuel-critical" role="img" aria-label="Carburant critique · moins de 25 %" title="Carburant critique · moins de 25 %">
        <TriangleAlert size={12} aria-hidden="true" /></span>}
    </div>
    <div className="so-fuel-card-illustration">
      <span className="so-fuel-card-photo" aria-hidden="true">{photo ? <img src={photo} alt="" loading="lazy" /> : <Ship size={28} />}</span>
      <span className="so-fuel-card-tank" data-level={level} aria-hidden="true">
        <span className="so-fuel-card-tank-fill" style={{ height: fillPercent }} />
        <Fuel size={13} />
      </span>
      {sludge && <span className="so-fuel-card-tank so-fuel-sludge-tank" data-level={sludge.level} title="Sludges"
        aria-hidden={sludge.position === null || undefined}
        role={sludge.position === null ? undefined : 'meter'} aria-label={sludge.position === null ? undefined : 'Sludges'}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={sludge.position ?? undefined}
        aria-valuetext={sludge.position === null ? undefined : `${sludge.percentage} · ${sludge.volume} sur ${sludge.capacity} · ${sludge.status}`}>
        {sludge.position !== null && <span className="so-fuel-card-tank-fill" style={{ height: `${sludge.position}%` }} />}
        <Droplets size={13} aria-hidden="true" />
        {sludge.level === 'critical' && <span className="so-fuel-sludge-alert" aria-hidden="true"><TriangleAlert size={11} /></span>}
      </span>}
    </div>
    <div className="so-fuel-card-values"><strong>{fuelLiters === null ? 'Non renseigné' : formatFuelVolume(fuelLiters, volumeUnit)}</strong>
      {fill !== null && <span>{percent.format(fill)}</span>}
      {level === 'warning' && <span className="so-sr-only">Niveau de carburant bas</span>}
    </div>
    <button type="button" className="sp-button sp-button--secondary so-secondary so-fuel-card-toggle"
      aria-label={`Détails carburant · ${vesselName}`} title={`Détails carburant · ${vesselName}`}
      aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}><ChevronDown size={16} aria-hidden="true" /></button>
  </li>;
}

export function SeaOperationFleetFuel({ client, historyRefresh, rows, error, reload, ...details }: ReturnType<typeof useSeaOperationFleetFuel> & ConsumptionDetails & {
  client: SupabaseClient; historyRefresh: number;
}) {
  const [expandedVesselId, setExpandedVesselId] = useState<number | null>(null);
  const detailId = useId();
  const vessels = rows && orderedFleetFuelLevels(rows);
  const expandedVessel = vessels?.find(vessel => vessel.vesselId === expandedVesselId);
  const scale = fleetConsumptionScale(vessels ?? [], details.averages);
  return <section className="sp-panel so-fleet-fuel" aria-labelledby="so-fleet-fuel-title">
    <header className="so-fleet-fuel-heading"><Fuel size={20} aria-hidden="true" /><h2 id="so-fleet-fuel-title">Carburant de la flotte</h2></header>
    {error ? <div className="so-fleet-fuel-status"><p role="alert">Les niveaux de carburant sont indisponibles.</p>
      <button type="button" className="sp-button sp-button--secondary so-secondary" onClick={reload}>Réessayer les niveaux</button></div>
      : !vessels ? <p role="status">Chargement des niveaux de carburant…</p>
        : vessels.length ? <ul className="so-fleet-fuel-vessels" aria-label="Niveaux de carburant par navire" tabIndex={vessels.length > 1 ? 0 : undefined}>
          {vessels.map(vessel => <FuelCard key={vessel.vesselId} vessel={vessel} detailId={detailId} expanded={vessel.vesselId === expandedVesselId}
            onToggle={() => setExpandedVesselId(value => value === vessel.vesselId ? null : vessel.vesselId)} />)}
        </ul> : <p>Aucun navire disponible.</p>}
    <section id={detailId} className="so-fuel-details-panel" aria-label={expandedVessel ? `Indicateurs carburant · ${expandedVessel.vesselName}` : undefined}
      hidden={!expandedVessel}>
      {expandedVessel && <>
        <FuelHistory key={expandedVessel.vesselId} client={client} vessel={expandedVessel} refresh={historyRefresh} />
        <div className="so-fuel-existing-metrics"><FuelDetails vessel={expandedVessel} scale={scale} {...details} /></div>
      </>}
    </section>
  </section>;
}
