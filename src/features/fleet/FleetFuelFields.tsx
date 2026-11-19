import { DEFAULT_FLEET_DAILY_FUEL_TANK_NAME, FLEET_DAILY_FUEL_TANK_NAME_ERROR, FLEET_FUEL_TANK_NAMES_ERROR, fleetDailyFuelTankLabel, fleetFuelTankLabel, fleetMainFuelCapacityLiters, fleetMainFuelTankKey, formatFleetCapacityLiters, MAX_FLEET_FUEL_TANK_CAPACITY_LITERS, MAX_FLEET_FUEL_TANKS, type FleetFuelCapacity, type FleetFuelTankKey } from './fleetFuel';
import './fleetFuelFields.css';

export interface FleetFuelDraft {
  tankCapacities: (number | null)[];
  tankNames: string[];
  dailyTankEnabled: boolean;
  dailyTankCapacity: number | null;
  dailyTankName: string;
  legacyCapacity: number | null;
  hiddenTankKeys: FleetFuelTankKey[];
}

const tankCounts = Array.from({ length: MAX_FLEET_FUEL_TANKS }, (_, index) => index + 1);

export function FleetTankCapacityInput({ value, onChange, disabled }: {
  value: number | null; onChange: (value: number | null) => void; disabled: boolean;
}) {
  return <input type="number" required min={0.001} max={MAX_FLEET_FUEL_TANK_CAPACITY_LITERS} step={0.001} disabled={disabled}
    value={value ?? ''} onChange={event => onChange(event.target.value ? event.target.valueAsNumber : null)} />;
}

export function FleetSoutesCheckbox({ tankName, checked, onChange, disabled }: {
  tankName: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean;
}) {
  return <label className="fleet-soutes-check">
    <input type="checkbox" aria-label={`Afficher dans Soutes — ${tankName}`} checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)} />
    Afficher dans Soutes
  </label>;
}

export function FleetFuelFields({ value, onChange, disabled, namesReady, dailyNameReady }: {
  value: FleetFuelDraft;
  onChange: (value: FleetFuelDraft) => void;
  disabled: boolean;
  namesReady: boolean;
  dailyNameReady: boolean;
}) {
  const count = value.tankCapacities.length;
  function soutesCheckbox(key: FleetFuelTankKey, tankName: string) {
    return <FleetSoutesCheckbox tankName={tankName} checked={!value.hiddenTankKeys.includes(key)} disabled={disabled}
      onChange={checked => onChange({
        ...value, hiddenTankKeys: checked ? value.hiddenTankKeys.filter(hiddenKey => hiddenKey !== key) : [...value.hiddenTankKeys, key],
      })} />;
  }

  return <section className="fleet-fuel-form" aria-label="Carburant">
    <h4 className="fleet-fuel-heading">Carburant</h4>
    <label>Nombre de cuves principales
      <select disabled={disabled} value={count} onChange={event => {
        const nextCount = Number(event.target.value);
        const tankCapacities = Array.from({ length: nextCount }, (_, index) => value.tankCapacities[index] ?? null);
        const tankNames = tankCapacities.map((_, index) => {
          const previousName = value.tankNames[index];
          return previousName && previousName.trim() !== fleetFuelTankLabel(count, index)
            ? previousName : fleetFuelTankLabel(nextCount, index);
        });
        const mainTankCount = Math.max(1, nextCount);
        const hiddenTankKeys = value.hiddenTankKeys.filter(key => key === 'day' || Number(key.slice(5)) <= mainTankCount);
        onChange({ ...value, tankCapacities, tankNames, hiddenTankKeys });
      }}>
        <option value={0}>Non renseigné</option>
        {tankCounts.map(count => <option key={count} value={count}>{count}</option>)}
      </select>
    </label>
    {count === 0 && <div className="fleet-fuel-legacy">
      <p>{value.legacyCapacity === null ? 'Cuve sans capacité renseignée' : `Capacité historique ${formatFleetCapacityLiters(value.legacyCapacity)}`}</p>
      {soutesCheckbox('main-1', value.legacyCapacity === null ? 'Cuve sans capacité renseignée' : 'Cuve historique')}
    </div>}
    {value.tankCapacities.map((capacity, index) => <div className={`fleet-fuel-tank${index === 0 ? ' fleet-fuel-first-tank' : ''}`} key={index}>
      <label>Nom de la cuve {index + 1}
        <input required disabled={disabled} value={value.tankNames[index] ?? ''} onChange={event => onChange({
          ...value, tankNames: value.tankNames.map((name, position) => position === index ? event.target.value : name),
        })} />
      </label>
      <label>{fleetFuelTankLabel(count, index, value.tankNames)} (L)
        <FleetTankCapacityInput value={capacity} disabled={disabled} onChange={liters => onChange({
          ...value, tankCapacities: value.tankCapacities.map((previous, position) => position === index ? liters : previous),
        })} />
      </label>
      {soutesCheckbox(fleetMainFuelTankKey(index), fleetFuelTankLabel(count, index, value.tankNames))}
    </div>)}
    {!namesReady && <p className="fleet-fuel-names-error" role="status">{FLEET_FUEL_TANK_NAMES_ERROR}</p>}
    <div className="fleet-fuel-daily">
      <label className="fleet-fuel-check"><input type="checkbox" checked={value.dailyTankEnabled} disabled={disabled}
        onChange={event => onChange({ ...value, dailyTankEnabled: event.target.checked,
          hiddenTankKeys: event.target.checked ? value.hiddenTankKeys : value.hiddenTankKeys.filter(key => key !== 'day'),
        })} />Caisse journalière</label>
      {value.dailyTankEnabled && <>
        <label>Nom de la caisse journalière
          <input disabled={disabled} placeholder={DEFAULT_FLEET_DAILY_FUEL_TANK_NAME} value={value.dailyTankName}
            onChange={event => onChange({ ...value, dailyTankName: event.target.value })} />
        </label>
        <label>Capacité de la caisse journalière (L)
          <FleetTankCapacityInput value={value.dailyTankCapacity} disabled={disabled}
            onChange={liters => onChange({ ...value, dailyTankCapacity: liters })} />
        </label>
        {soutesCheckbox('day', fleetDailyFuelTankLabel(value.dailyTankName))}
      </>}
    </div>
    {!dailyNameReady && <p className="fleet-fuel-names-error" role="status">{FLEET_DAILY_FUEL_TANK_NAME_ERROR}</p>}
  </section>;
}

export function FleetFuelDetails({ vessel, filledOnly = false }: { vessel: FleetFuelCapacity; filledOnly?: boolean }) {
  const capacities = vessel.fuelTankCapacitiesLiters ?? [];
  const total = fleetMainFuelCapacityLiters(vessel);
  return <section className="fleet-capacity-subsection" aria-label="Carburant">
    <h4>Carburant</h4>
    <dl className="fleet-detail-grid">
      {!filledOnly || capacities.length ? <div><dt>Nombre de cuves principales</dt><dd>{capacities.length || '—'}</dd></div> : null}
      {!filledOnly || total !== null ? <div><dt>{!capacities.length && total !== null ? 'Capacité historique' : 'Capacité totale des cuves principales'}</dt><dd>{formatFleetCapacityLiters(total)}</dd></div> : null}
      {capacities.map((capacity, index) => <div key={index}><dt>{fleetFuelTankLabel(capacities.length, index, vessel.fuelTankNames)}</dt><dd>{formatFleetCapacityLiters(capacity)}</dd></div>)}
      {!filledOnly || vessel.dailyFuelTankCapacityLiters != null ? <div><dt className="fleet-fuel-daily-name">{fleetDailyFuelTankLabel(vessel.dailyFuelTankName)}</dt><dd>{formatFleetCapacityLiters(vessel.dailyFuelTankCapacityLiters)}</dd></div> : null}
    </dl>
  </section>;
}
