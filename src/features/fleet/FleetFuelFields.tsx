import { FLEET_FUEL_TANK_NAMES_ERROR, fleetFuelTankLabel, fleetMainFuelCapacityLiters, MAX_FLEET_FUEL_TANK_CAPACITY_LITERS, MAX_FLEET_FUEL_TANKS, type FleetFuelCapacity } from './fleetFuel';
import './fleetFuelFields.css';

export interface FleetFuelDraft {
  tankCapacities: (number | null)[];
  tankNames: string[];
  dailyTankEnabled: boolean;
  dailyTankCapacity: number | null;
  legacyCapacity: number | null;
}

const litersFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const tankCounts = Array.from({ length: MAX_FLEET_FUEL_TANKS }, (_, index) => index + 1);

function formatLiters(value: number | null | undefined) {
  return value == null ? '—' : `${litersFormat.format(value)} L`;
}

function capacityInput(value: number | null, onChange: (value: number | null) => void, disabled: boolean) {
  return <input type="number" required min={0.001} max={MAX_FLEET_FUEL_TANK_CAPACITY_LITERS} step={0.001} disabled={disabled}
    value={value ?? ''} onChange={event => onChange(event.target.value ? event.target.valueAsNumber : null)} />;
}

export function FleetFuelFields({ value, onChange, disabled, namesReady }: {
  value: FleetFuelDraft;
  onChange: (value: FleetFuelDraft) => void;
  disabled: boolean;
  namesReady: boolean;
}) {
  const count = value.tankCapacities.length;
  return <>
    <h3 className="fleet-fuel-heading">Carburant</h3>
    <label>Nombre de cuves principales
      <select disabled={disabled} value={count} onChange={event => {
        const nextCount = Number(event.target.value);
        const tankCapacities = Array.from({ length: nextCount }, (_, index) => value.tankCapacities[index] ?? null);
        const tankNames = nextCount > 2 ? tankCapacities.map((_, index) => value.tankNames[index] ?? fleetFuelTankLabel(nextCount, index)) : [];
        onChange({ ...value, tankCapacities, tankNames });
      }}>
        <option value={0}>Non renseigné</option>
        {tankCounts.map(count => <option key={count} value={count}>{count}</option>)}
      </select>
    </label>
    {count === 0 && value.legacyCapacity !== null && <p className="fleet-fuel-legacy">Capacité historique {formatLiters(value.legacyCapacity)}</p>}
    {value.tankCapacities.map((capacity, index) => <div className={`fleet-fuel-tank${index === 0 ? ' fleet-fuel-first-tank' : ''}`} key={index}>
      {count > 2 && <label>Nom de la cuve {index + 1}
        <input required disabled={disabled} value={value.tankNames[index] ?? ''} onChange={event => onChange({
          ...value, tankNames: value.tankNames.map((name, position) => position === index ? event.target.value : name),
        })} />
      </label>}
      <label>{fleetFuelTankLabel(count, index, value.tankNames)} (L)
        {capacityInput(capacity, liters => onChange({
          ...value, tankCapacities: value.tankCapacities.map((previous, position) => position === index ? liters : previous),
        }), disabled)}
      </label>
    </div>)}
    {!namesReady && <p className="fleet-fuel-names-error" role="status">{FLEET_FUEL_TANK_NAMES_ERROR}</p>}
    <div className="fleet-fuel-daily">
      <label className="fleet-fuel-check"><input type="checkbox" checked={value.dailyTankEnabled} disabled={disabled}
        onChange={event => onChange({ ...value, dailyTankEnabled: event.target.checked })} />Caisse journalière</label>
      {value.dailyTankEnabled && <label>Capacité de la caisse journalière (L)
        {capacityInput(value.dailyTankCapacity, liters => onChange({ ...value, dailyTankCapacity: liters }), disabled)}
      </label>}
    </div>
  </>;
}

export function FleetFuelDetails({ vessel }: { vessel: FleetFuelCapacity }) {
  const capacities = vessel.fuelTankCapacitiesLiters ?? [];
  const total = fleetMainFuelCapacityLiters(vessel);
  return <section className="fleet-detail-section" aria-label="Carburant">
    <h3>Carburant</h3>
    <dl className="fleet-detail-grid">
      <div><dt>Nombre de cuves principales</dt><dd>{capacities.length || '—'}</dd></div>
      <div><dt>{!capacities.length && total !== null ? 'Capacité historique' : 'Capacité totale des cuves principales'}</dt><dd>{formatLiters(total)}</dd></div>
      {capacities.map((capacity, index) => <div key={index}><dt>{fleetFuelTankLabel(capacities.length, index, vessel.fuelTankNames)}</dt><dd>{formatLiters(capacity)}</dd></div>)}
      <div><dt>Caisse journalière</dt><dd>{formatLiters(vessel.dailyFuelTankCapacityLiters)}</dd></div>
    </dl>
  </section>;
}
