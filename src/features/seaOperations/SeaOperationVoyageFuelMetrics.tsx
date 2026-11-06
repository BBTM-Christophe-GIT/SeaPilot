import { Cloud, Euro, Fuel, Gauge } from 'lucide-react';
import {
  formatProjectFuelCo2, formatProjectFuelCost, formatProjectFuelPrice, formatProjectFuelVolume,
  PROJECT_FUEL_COMBUSTION_CO2_KG_PER_LITER,
} from '../projects/projectFuelEstimate';
import type { SeaOperationConsumption } from './seaOperationConsumption';
import type { SeaOperationPayload } from './seaOperationModel';

const rateFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function renderSeaOperationVoyageFuelDetails(consumption: SeaOperationConsumption | null | undefined,
  draft: SeaOperationPayload, distanceNm: number | null) {
  if (!consumption) return null;
  const { reference, record } = consumption;
  const sameVessel = reference.vesselId === Number(draft.vessel.id) && reference.vesselId !== null;
  const towing = draft.applicability.towing === 'yes';
  const calibratedRate = sameVessel ? towing ? reference.towageLitersPerNm : reference.transitLitersPerNm : null;
  const rate = calibratedRate !== null && calibratedRate > 0 ? calibratedRate : null;
  const actual = sameVessel && record?.consumedLiters != null;
  const fuel = actual ? record.consumedLiters
    : rate !== null && distanceNm !== null && distanceNm > 0 ? rate * distanceNm : null;
  const unitPrice = reference.pricePerLiter;
  const cost = fuel !== null && unitPrice !== null ? fuel * unitPrice : null;
  const priceTitle = unitPrice === null ? 'Prix du Zaphir TAXABLE indisponible'
    : `Dernier prix du Zaphir TAXABLE · ${formatProjectFuelPrice(unitPrice)}`;
  const co2 = fuel === null ? null : fuel * PROJECT_FUEL_COMBUSTION_CO2_KG_PER_LITER;
  const average = actual
    ? record.litersPerNm !== null ? `${rateFormat.format(record.litersPerNm)} L/NM`
      : record.litersPerHour !== null ? `${rateFormat.format(record.litersPerHour)} L/h` : null
    : rate !== null ? `${rateFormat.format(rate)} L/NM` : null;

  if (fuel === null && average === null) return <small>Référence carburant indisponible pour ce navire et ce régime.</small>;
  return <section className="so-route-map-fuel-metrics" aria-label={actual ? 'Carburant du relevé Conso' : 'Estimation du carburant'}>
    <strong>{actual ? 'Relevé Conso' : towing ? 'Carburant estimé · remorquage' : 'Carburant estimé · sans remorquage'}</strong>
    <dl className="so-route-map-summary-grid">
      <div><dt><Fuel size={14} aria-hidden="true" />{actual ? 'Fuel relevé' : 'Fuel estimé'}</dt><dd>{fuel === null ? 'Indisponible' : formatProjectFuelVolume(fuel)}</dd></div>
      <div><dt><Euro size={14} aria-hidden="true" />Coût estimé</dt><dd title={priceTitle}>{cost === null ? 'Indisponible' : formatProjectFuelCost(cost)}</dd></div>
      <div><dt><Cloud size={14} aria-hidden="true" />CO₂ estimé</dt><dd>{co2 === null ? 'Indisponible' : formatProjectFuelCo2(co2)}</dd></div>
      <div><dt><Gauge size={14} aria-hidden="true" />Conso moyenne</dt><dd>{average || 'Indisponible'}</dd></div>
    </dl>
  </section>;
}
