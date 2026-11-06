import {
  estimateProjectFuel,
  formatProjectFuelCo2,
  formatProjectFuelCost,
  formatProjectFuelPrice,
  formatProjectFuelVolume,
  type ProjectFuelReference,
} from './projectFuelEstimate';

const rateFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const priceDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'UTC' });
export const PROJECT_FUEL_RATE_UNAVAILABLE = 'Référence de consommation indisponible pour ce navire et ce régime.';

export function projectVoyageFuelDetails(reference: ProjectFuelReference | undefined, vesselId: number | null | undefined, distanceNm: number | null, towing = false) {
  const estimate = estimateProjectFuel(reference, vesselId, distanceNm, towing);
  if (!estimate) return null;

  const rows = [
    { label: 'Consommation de fuel estimée', value: formatProjectFuelVolume(estimate.fuelLiters) },
    { label: 'Coût de fuel estimé', value: estimate.costEuros == null ? 'Prix indisponible' : formatProjectFuelCost(estimate.costEuros) },
    { label: 'Émissions de CO₂ estimées', value: formatProjectFuelCo2(estimate.co2Kg) },
  ];
  const rate = `${towing ? 'En remorquage' : 'Sans remorquage'} · ${rateFormat.format(estimate.litersPerNm)} L/NM`;
  const price = estimate.price;
  const priceDate = price && new Date(`${price.effectiveOn}T00:00:00Z`);
  const priceBasis = price && priceDate && Number.isFinite(priceDate.valueOf())
    ? `${formatProjectFuelPrice(price.eurosPerLiter)} · prix du ${priceDateFormat.format(priceDate)}` : null;
  return { rows, rate, priceBasis, priceSource: price?.source };
}

export function renderProjectVoyageFuelDetails(reference: ProjectFuelReference | undefined, vesselId: number | null | undefined, distanceNm: number | null, towing = false) {
  const details = projectVoyageFuelDetails(reference, vesselId, distanceNm, towing);
  if (!details) return (distanceNm ?? 0) > 0 ? <small>{PROJECT_FUEL_RATE_UNAVAILABLE}</small> : null;
  return <><dl>{details.rows.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <small>{details.rate}</small>
    {details.priceBasis && <small title={details.priceSource}>{details.priceBasis}</small>}
  </>;
}
