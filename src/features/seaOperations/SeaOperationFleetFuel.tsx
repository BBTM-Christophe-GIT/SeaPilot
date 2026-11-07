import type { SupabaseClient } from '@supabase/supabase-js';
import { Fuel, Gauge, Pencil, Ship } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets, fleetIllustration } from '../fleet/fleetDisplay';
import {
  fetchSeaOperationFleetFuel, MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY, saveSeaOperationFuelBaseline,
  type FleetFuelUnit, type SeaOperationFleetFuelLevel,
} from './seaOperationFleetFuelQuery';
import { consumptionErrorMessage } from './useSeaOperationConsumption';
import './seaOperationFleetFuel.css';

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const measuredDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

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
  const current = response?.client === client && response.accessKey === accessKey ? response : undefined;
  return { rows: current?.rows, error: current?.error, reload: () => setRetry(value => value + 1) };
}

function FuelCard({ vessel, disabled, onSetBaseline }: {
  vessel: SeaOperationFleetFuelLevel; disabled: boolean; onSetBaseline: (vessel: SeaOperationFleetFuelLevel) => void;
}) {
  const { vesselName, fuelLiters, capacityLiters, maxSpeedKnots, rateLitersPerHour, rateSampleCount, source, measuredAt } = vessel;
  const photo = fleetIllustration({ name: vesselName, assetKind: 'vessel' });
  const fill = fuelLiters !== null && capacityLiters !== null && capacityLiters > 0 ? fuelLiters / capacityLiters : null;
  const cruise = maxSpeedKnots && maxSpeedKnots > 0 ? maxSpeedKnots / 2 : null;
  const hours = cruise !== null && fuelLiters !== null && rateLitersPerHour && rateLitersPerHour > 0 ? fuelLiters / rateLitersPerHour : null;
  const sourceLabel = source === 'baseline' ? 'État de départ' : 'Arrivée Conso';
  const editLabel = fuelLiters === null ? 'Saisir l’état de départ' : 'Actualiser le niveau';
  const missingAutonomy = !cruise ? 'Vitesse maximale à renseigner' : fuelLiters === null
    ? 'Niveau à renseigner' : 'Aucun relevé à une vitesse comparable';

  return <li className="so-fuel-card">
    <header className="so-fuel-card-heading">
      <span className="so-fuel-card-photo" aria-hidden="true">
        {photo ? <img src={photo} alt="" loading="lazy" /> : <Ship size={25} />}
      </span>
      <h3>{vesselName}</h3>
    </header>
    <div className="so-fuel-card-level">
      <span>Niveau de carburant</span>
      <div className="so-fuel-card-values"><strong>{fuelLiters === null ? 'Non renseigné' : `${number.format(fuelLiters)} L`}</strong>
        {fill !== null && <span>{percent.format(fill)}</span>}</div>
      <div className="so-fuel-card-meter" aria-hidden="true">
        {fill !== null && <span style={{ width: `${Math.min(fill * 100, 100)}%` }} />}
      </div>
      <small>{capacityLiters === null ? 'Capacité à renseigner' : `${number.format(capacityLiters)} L de capacité`}</small>
    </div>
    <div className="so-fuel-card-range"><Gauge size={17} aria-hidden="true" /><div>
      <span>Autonomie estimée {cruise === null ? 'à mi-vitesse' : `à ${number.format(cruise)} nd`}</span>
      {hours !== null && cruise !== null ? <><strong>{number.format(hours)} h · {number.format(hours * cruise)} NM</strong>
        <small>{rateSampleCount} {rateSampleCount === 1 ? 'relevé comparable' : 'relevés comparables'}</small></>
        : <small>{missingAutonomy}</small>}
    </div></div>
    <footer className="so-fuel-card-footer">
      {measuredAt && source ? <small>{sourceLabel} · <time dateTime={measuredAt}>{measuredDate.format(new Date(measuredAt))}</time></small> : null}
      {vessel.canSetBaseline && <button type="button" className="sp-button sp-button--secondary so-secondary" disabled={disabled}
        aria-label={`${editLabel} · ${vesselName}`} onClick={() => onSetBaseline(vessel)}><Pencil size={14} aria-hidden="true" />{editLabel}</button>}
    </footer>
  </li>;
}

export function SeaOperationFleetFuel({ rows, error, reload, disabled, onSetBaseline }: ReturnType<typeof useSeaOperationFleetFuel> & {
  disabled: boolean; onSetBaseline: (vessel: SeaOperationFleetFuelLevel) => void;
}) {
  const vessels = rows?.map(row => ({ ...row, name: row.vesselName, assetKind: 'vessel' as const })).sort(compareFleetAssets);
  return <section className="sp-panel so-fleet-fuel" aria-labelledby="so-fleet-fuel-title">
    <header className="so-fleet-fuel-heading"><span className="so-fleet-fuel-icon"><Fuel size={21} aria-hidden="true" /></span>
      <div><h2 id="so-fleet-fuel-title">Carburant et autonomie</h2>
        <p>Dernier niveau connu. Autonomie à 50 % de la vitesse maximale, estimée à partir de relevés à vitesse comparable.</p></div></header>
    {error ? <div className="so-fleet-fuel-status"><p role="alert">Les niveaux de carburant sont indisponibles.</p>
      <button type="button" className="sp-button sp-button--secondary so-secondary" onClick={reload}>Réessayer les niveaux</button></div>
      : !vessels ? <p role="status">Chargement des niveaux de carburant…</p>
        : vessels.length ? <ul className="so-fleet-fuel-vessels" aria-label="Niveaux de carburant par navire" tabIndex={vessels.length > 1 ? 0 : undefined}>
          {vessels.map(vessel => <FuelCard key={vessel.vesselId} vessel={vessel} disabled={disabled} onSetBaseline={onSetBaseline} />)}
        </ul> : <p>Aucun navire disponible.</p>}
  </section>;
}

export function SeaOperationFuelBaselineDialog({ client, vessel, onClose, onSaved }: {
  client: SupabaseClient; vessel: SeaOperationFleetFuelLevel; onClose: () => void; onSaved: () => void;
}) {
  const [unit, setUnit] = useState<FleetFuelUnit>('liters');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const capacity = vessel.capacityLiters && vessel.capacityLiters > 0 ? vessel.capacityLiters : null;
  const maximum = unit === 'percent' ? 100 : capacity ?? MAX_BASELINE_FUEL_LITERS_WITHOUT_CAPACITY;
  const quantity = Number(value);
  const valid = /^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(value) && quantity <= maximum;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || pending.current || !vessel.canSetBaseline) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await saveSeaOperationFuelBaseline(client, vessel.vesselId, unit, quantity);
      if (active.current) onSaved();
    } catch (reason) {
      if (active.current) setError(consumptionErrorMessage(reason));
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  }

  return <AppDialog size="sm" eyebrow="Suivi carburant" title="État de départ du carburant" description={vessel.vesselName}
    icon={<Fuel size={21} aria-hidden="true" />} isBusy={saving} onClose={onClose} onSubmit={event => void submit(event)}
    footer={<div className="app-dialog__actions"><button type="button" className="sp-button sp-button--secondary so-secondary" onClick={onClose} disabled={saving}>Annuler</button>
      <button type="submit" className="sp-button sp-button--primary" disabled={saving || !valid}>{saving ? 'Enregistrement…' : 'Enregistrer le niveau'}</button></div>}>
    <fieldset className="so-fuel-baseline-fields" disabled={saving}>
      <label className="so-field"><span className="so-field-label">Unité</span><select value={unit} onChange={event => {
        setUnit(event.target.value === 'percent' ? 'percent' : 'liters');
        setValue(''); setError('');
      }}><option value="liters">Litres (L)</option><option value="percent" disabled={capacity === null}>Pourcentage (%)</option></select></label>
      <label className="so-field"><span className="so-field-label">{unit === 'liters' ? 'Niveau en litres' : 'Niveau en pourcentage'}</span>
        <input type="number" inputMode="decimal" min="0" max={maximum} step="0.001" value={value}
          onChange={event => { setValue(event.target.value); setError(''); }} /></label>
    </fieldset>
    <p className="so-help">{capacity === null ? 'Renseignez la capacité dans Navires pour saisir un pourcentage.'
      : `Capacité des cuves principales · ${number.format(capacity)} L.`} Le niveau sera daté à l’enregistrement.</p>
    {error && <p className="so-alert so-danger" role="alert">{error}</p>}
  </AppDialog>;
}
