import type { FleetFuelLatestTankReading } from './seaOperationFleetFuelQuery';
import { SeaOperationFuelTankGauge, SeaOperationFuelTankLayout } from './SeaOperationFuelTankVisual';
import { formatFuelVolume, fuelVolumeUnit } from './seaOperationFuelVolume';
import './seaOperationLatestTankReading.css';

const readingDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });

export function SeaOperationLatestTankReading({ reading }: { reading: FleetFuelLatestTankReading }) {
  return <section className="so-latest-tank-reading" aria-label="Dernier relevé Soutes">
    <div className="so-latest-tank-heading">
      <h4>Dernier relevé Soutes</h4>
      <time dateTime={reading.date}>{readingDate.format(new Date(`${reading.date}T12:00:00Z`))}</time>
    </div>
    {reading.superseded && <p>Ce relevé a été remplacé par un stock global.</p>}
    <SeaOperationFuelTankLayout tanks={reading.tanks} renderTank={tank => {
      const unit = fuelVolumeUnit(tank.capacityLiters);
      return <div className="so-latest-tank" data-tank={tank.key}>
        <h5>{tank.name}</h5>
        <div className="so-latest-tank-level">
          <SeaOperationFuelTankGauge liters={tank.liters} capacityLiters={tank.capacityLiters} />
          <div><strong>{formatFuelVolume(tank.liters, unit)}</strong>
            <small>{tank.capacityLiters === null ? 'Capacité inconnue' : `sur ${formatFuelVolume(tank.capacityLiters, unit)}`}</small>
          </div>
        </div>
      </div>;
    }} />
  </section>;
}
