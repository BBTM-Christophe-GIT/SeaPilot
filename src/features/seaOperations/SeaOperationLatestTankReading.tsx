import type { FleetFuelLatestTankReading } from './seaOperationFleetFuelQuery';
import { SeaOperationFuelTankGauge, SeaOperationTankGroups } from './SeaOperationFuelTankVisual';
import { formatFuelVolume, fuelVolumeUnit } from './seaOperationFuelVolume';
import './seaOperationLatestTankReading.css';

const readingDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });

export function SeaOperationLatestTankReading({ reading, standalone = false }: {
  reading: FleetFuelLatestTankReading; standalone?: boolean;
}) {
  const Heading = standalone ? 'h3' : 'h4';
  const TankHeading = standalone ? 'h5' : 'h6';
  return <section className={standalone ? 'sp-panel so-latest-tank-reading so-latest-tank-panel' : 'so-latest-tank-reading'}
    aria-label="Dernier relevé Soutes">
    <div className="so-latest-tank-heading">
      <Heading>Dernier relevé Soutes</Heading>
      <time dateTime={`${reading.date}T${reading.time}`} title="Heure de Paris">
        {readingDate.format(new Date(`${reading.date}T12:00:00Z`))} à {reading.time}
      </time>
    </div>
    {reading.superseded && <p>Le stock global sert de référence pour le carburant.</p>}
    {!reading.updatesFuelBaseline && <p>Le stock de référence carburant est calculé à partir d’un relevé complet des cuves principales.</p>}
    <SeaOperationTankGroups tanks={reading.tanks} heading={standalone ? 'h4' : 'h5'} renderTank={tank => {
      const unit = fuelVolumeUnit(tank.capacityLiters);
      return <div className="so-latest-tank" data-tank={tank.key}>
        <TankHeading>{tank.name}</TankHeading>
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
