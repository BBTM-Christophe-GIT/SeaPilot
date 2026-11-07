import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3, ChevronDown, ClipboardList, Fuel, Gauge, Settings2, Ship, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets, fleetIllustration, normalizeFleetName } from '../fleet/fleetDisplay';
import { fleetConsumptionScale, SeaOperationVesselConsumption } from './SeaOperationFleetConsumption';
import { SeaOperationFleetFuelHistory } from './SeaOperationFleetFuelHistory';
import { SeaOperationSpeedDial } from './SeaOperationSpeedDial';
import { SeaOperationStockGauge } from './SeaOperationStockGauge';
import {
  fetchSeaOperationFleetFuel, fetchSeaOperationFleetFuelHistory, MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY, saveSeaOperationFuelBaseline,
  type FleetFuelUnit, type SeaOperationFleetFuelCostSource, type SeaOperationFleetFuelLevel, type SeaOperationFleetFuelMonth,
} from './seaOperationFleetFuelQuery';
import { formatFuelVolume, fuelVolumeUnit } from './seaOperationFuelVolume';
import { seaOperationToday } from './seaOperationModel';
import type { SeaOperationRegisterConsumption } from './seaOperationRegisterConsumptionQuery';
import { consumptionErrorMessage } from './useSeaOperationConsumption';
import './seaOperationFleetFuel.css';

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const measuredDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const referenceDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });
const liters = (value: number) => `${number.format(value)} L`;

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

function FuelDetails({ vessel, averages, averagesError, scale, onRetryAverages }: ConsumptionDetails & {
  vessel: SeaOperationFleetFuelLevel; scale: ReturnType<typeof fleetConsumptionScale>;
}) {
  const { fuelLiters, capacityLiters, maxSpeedKnots, rateLitersPerHour, rateSampleCount, source, measuredAt,
    baselineDate, baselineFuelLiters, deductedFuelLiters, refuelLiters } = vessel;
  const cruise = maxSpeedKnots && maxSpeedKnots > 0 ? maxSpeedKnots / 2 : null;
  const hours = cruise !== null && fuelLiters !== null && rateLitersPerHour && rateLitersPerHour > 0 ? fuelLiters / rateLitersPerHour : null;
  const { fill, level } = tankLevel(fuelLiters, capacityLiters);
  const volumeUnit = fuelVolumeUnit(capacityLiters);
  const sourceLabel = source === 'refuel' ? 'Avitaillement Conso' : source === 'baseline' ? 'Stock de référence' : 'Arrivée Conso';
  const missingAutonomy = !cruise ? 'Vitesse maximale à renseigner' : fuelLiters === null
    ? 'Niveau à renseigner' : 'Aucun relevé à une vitesse comparable';

  return <>
    <section className="so-fuel-card-metric" aria-label="Stock">
      <h3><span><ClipboardList size={16} aria-hidden="true" /></span>Stock</h3>
      <SeaOperationStockGauge fuelLiters={fuelLiters} capacityLiters={capacityLiters} fill={fill} level={level} />
      {source && (baselineDate || measuredAt) && <small className="so-fuel-stock-source">{sourceLabel}{' · '}{baselineDate
        ? <time dateTime={baselineDate}>{referenceDate.format(new Date(`${baselineDate}T12:00:00Z`))}</time>
        : measuredAt && <time dateTime={measuredAt}>{measuredDate.format(new Date(measuredAt))}</time>}</small>}
      {(baselineFuelLiters !== null || deductedFuelLiters !== null || refuelLiters !== null) && <ul className="so-fuel-stock-breakdown" aria-label="Calcul du stock">
        {baselineFuelLiters !== null && <li><ClipboardList size={13} aria-hidden="true" /><span>{formatFuelVolume(baselineFuelLiters, volumeUnit)} de référence</span></li>}
        {deductedFuelLiters !== null && <li><span className="so-fuel-stock-minus" aria-hidden="true">−</span><span>{formatFuelVolume(deductedFuelLiters, volumeUnit)} déduits via DPR</span></li>}
        {refuelLiters !== null && <li><Fuel size={13} aria-hidden="true" /><span>{formatFuelVolume(refuelLiters, volumeUnit)} avitaillés</span></li>}
      </ul>}
    </section>
    <section className="so-fuel-card-metric" aria-label="Autonomie estimée">
      <h3><span><Gauge size={16} aria-hidden="true" /></span>Autonomie estimée</h3>
      {hours !== null && cruise !== null
        ? <div className="so-fuel-metric-primary"><strong>{number.format(hours)} h · {number.format(hours * cruise)} NM</strong></div>
        : <small className="so-fuel-metric-empty">{missingAutonomy}</small>}
      {cruise !== null && maxSpeedKnots !== null && <SeaOperationSpeedDial speedKnots={cruise} maxSpeedKnots={maxSpeedKnots} />}
      {hours !== null && cruise !== null && rateLitersPerHour !== null && <small className="so-fuel-autonomy-evidence">
        <b title="Consommation estimée à la vitesse retenue">{number.format(rateLitersPerHour / cruise)} L/NM</b>
        <span>{rateSampleCount} {rateSampleCount === 1 ? 'relevé comparable' : 'relevés comparables'}</span>
      </small>}
    </section>
    <section className="so-fuel-card-metric so-fuel-averages-card" aria-label="Moyennes">
      <h3 title="L/NM et coût HT au dernier prix applicable. Tendance par rapport au mois précédent."><span><BarChart3 size={16} aria-hidden="true" /></span>Moyennes</h3>
      <small>Tendance par rapport au mois précédent</small>
      <SeaOperationVesselConsumption vessel={vessel} averages={averages} scale={scale} error={averagesError} onRetry={onRetryAverages} />
    </section>
  </>;
}

function FuelHistory({ client, vessel, refresh }: { client: SupabaseClient; vessel: SeaOperationFleetFuelLevel; refresh: number }) {
  const currentYear = Number(seaOperationToday().slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    client: SupabaseClient; key: string; years: number[]; months?: SeaOperationFleetFuelMonth[];
    costSource?: SeaOperationFleetFuelCostSource; error?: string;
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
    costSource={current?.costSource} loading={!current} error={current?.error} onRetry={reload} onYearChange={setYear} />;
}

function FuelCard({ vessel, detailId, expanded, onToggle }: {
  vessel: SeaOperationFleetFuelLevel; detailId: string; expanded: boolean; onToggle: () => void;
}) {
  const { vesselName, fuelLiters, capacityLiters } = vessel;
  const photo = fleetIllustration({ name: vesselName, assetKind: 'vessel' });
  const { fill, level, fillPercent } = tankLevel(fuelLiters, capacityLiters);
  const volumeUnit = fuelVolumeUnit(capacityLiters);

  return <li className="so-fuel-card" data-expanded={expanded}>
    <div className="so-fuel-card-heading">
      <h3>{vesselName}</h3>
      {level === 'critical' && <span className="so-fuel-critical" role="img" aria-label="Carburant critique · moins de 25 %" title="Carburant critique · moins de 25 %">
        <TriangleAlert size={12} aria-hidden="true" /></span>}
    </div>
    <div className="so-fuel-card-illustration" aria-hidden="true">
      <span className="so-fuel-card-photo">{photo ? <img src={photo} alt="" loading="lazy" /> : <Ship size={28} />}</span>
      <span className="so-fuel-card-tank" data-level={level}>
        <span className="so-fuel-card-tank-fill" style={{ height: fillPercent }} />
        <Fuel size={13} />
      </span>
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

export function SeaOperationFleetFuel({ client, historyRefresh, rows, error, reload, disabled, onOpenSettings, ...details }: ReturnType<typeof useSeaOperationFleetFuel> & ConsumptionDetails & {
  client: SupabaseClient; historyRefresh: number; disabled: boolean; onOpenSettings: () => void;
}) {
  const [expandedVesselId, setExpandedVesselId] = useState<number | null>(null);
  const detailId = useId();
  const vessels = rows && orderedFleetFuelLevels(rows);
  const expandedVessel = vessels?.find(vessel => vessel.vesselId === expandedVesselId);
  const scale = fleetConsumptionScale(vessels ?? [], details.averages);
  return <section className="sp-panel so-fleet-fuel" aria-labelledby="so-fleet-fuel-title">
    <header className="so-fleet-fuel-heading"><Fuel size={20} aria-hidden="true" /><h2 id="so-fleet-fuel-title">Carburant de la flotte</h2>
      {vessels?.some(vessel => vessel.canSetBaseline) && <button type="button" className="sp-button sp-button--secondary so-secondary so-fleet-fuel-settings"
        aria-label="Paramètres carburant" title="Paramètres carburant" disabled={disabled} onClick={onOpenSettings}><Settings2 size={18} aria-hidden="true" /></button>}
    </header>
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

export function SeaOperationFuelBaselineDialog({ client, vessels, onClose, onSaved }: {
  client: SupabaseClient; vessels: readonly SeaOperationFleetFuelLevel[]; onClose: () => void; onSaved: () => void;
}) {
  const [vesselId, setVesselId] = useState(vessels[0]?.vesselId);
  const [date, setDate] = useState(seaOperationToday);
  const [unit, setUnit] = useState<FleetFuelUnit>('liters');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const vessel = vessels.find(row => row.vesselId === vesselId);
  const capacity = vessel?.capacityLiters && vessel.capacityLiters > 0 ? vessel.capacityLiters : null;
  const today = seaOperationToday();
  const maximum = unit === 'percent' ? 100 : capacity ?? MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY;
  const quantity = Number(value);
  const valid = Boolean(vessel?.canSetBaseline) && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && date <= today
    && (unit === 'liters' || capacity !== null) && /^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(value) && quantity <= maximum;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending.current || !vessel?.canSetBaseline) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await saveSeaOperationFuelBaseline(client, vessel.vesselId, unit, quantity, date);
      if (active.current) onSaved();
    } catch (reason) {
      if (active.current) setError(consumptionErrorMessage(reason));
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }

  return <AppDialog size="sm" eyebrow="Suivi carburant" title="Paramètres carburant"
    description="Renseignez le stock au début de la journée choisie. Le décompte utilise les DPR validés à partir de cette date incluse."
    icon={<Settings2 size={21} aria-hidden="true" />} isBusy={saving} onClose={onClose} onSubmit={event => void submit(event)}
    footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary so-secondary" onClick={onClose} disabled={saving}>Annuler</button>
      <button type="submit" className="sp-button sp-button--primary" disabled={saving || !valid}>{saving ? 'Enregistrement…' : 'Enregistrer le niveau'}</button></div>}>
    <fieldset className="so-fuel-baseline-fields" disabled={saving}>
      <label className="so-field"><span className="so-field-label">Navire</span><select value={vesselId ?? ''} onChange={event => {
        setVesselId(Number(event.target.value)); setUnit('liters'); setValue(''); setError('');
      }}>{vessels.map(row => <option key={row.vesselId} value={row.vesselId}>{row.vesselName}</option>)}</select></label>
      <label className="so-field"><span className="so-field-label">Date de référence</span>
        <input type="date" min="1900-01-01" max={today} value={date} onChange={event => { setDate(event.target.value); setError(''); }} /></label>
      <label className="so-field"><span className="so-field-label">Unité</span><select value={unit} onChange={event => {
        setUnit(event.target.value === 'percent' ? 'percent' : 'liters');
        setValue(''); setError('');
      }}><option value="liters">Litres (L)</option><option value="percent" disabled={capacity === null}>Pourcentage (%)</option></select></label>
      <label className="so-field"><span className="so-field-label">{unit === 'liters' ? 'Niveau en litres' : 'Niveau en pourcentage'}</span>
        <input type="number" inputMode="decimal" min="0" max={maximum} step="0.001" value={value}
          onChange={event => { setValue(event.target.value); setError(''); }} /></label>
    </fieldset>
    <p className="so-help">{capacity === null ? 'Renseignez la capacité dans Navires pour saisir un pourcentage.'
      : `Capacité des cuves principales · ${liters(capacity)}.`}</p>
    {error && <p className="so-alert so-danger" role="alert">{error}</p>}
  </AppDialog>;
}
