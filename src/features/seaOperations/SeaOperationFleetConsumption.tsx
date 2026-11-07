import { Anchor, ArrowDownRight, ArrowUpRight, Droplet, Equal, Euro, Waves } from 'lucide-react';
import { normalizeFleetName } from '../fleet/fleetDisplay';
import type { SeaOperationRegisterConsumption } from './seaOperationRegisterConsumptionQuery';
import './seaOperationFleetConsumption.css';

type FleetAverages = SeaOperationRegisterConsumption['vesselAverages'];

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fuelLabel = (value: number) => number.format(value) + ' L/NM';
const costLabel = (value: number) => euros.format(value) + '/NM';
const towageVessels = new Set(['LE ROZEL', 'LANDEMER', 'SUROIT']);
const showsTowage = (name: string) => towageVessels.has(normalizeFleetName(name));
const towage = { key: 'towageLitersPerNm', label: 'Remorquage', monthlyKey: 'towage', icon: Anchor, style: 'is-towage' } as const;
const other = { key: 'otherLitersPerNm', label: 'Autres manœuvres', monthlyKey: 'other', icon: Waves, style: 'is-other' } as const;

function Trend({ label, value, previous, months, precision, format }: {
  label: string;
  value?: number | null;
  previous?: number | null;
  months?: { currentMonth: string; previousMonth: string } | null;
  precision: number;
  format: (value: number) => string;
}) {
  if (value == null || previous == null || !months) {
    const unavailable = label + ' · Comparaison avec le mois précédent indisponible';
    return <span className="so-fleet-trend" role="img" aria-label={unavailable} title={unavailable}>—</span>;
  }
  const change = Math.sign(Math.round(value * precision) - Math.round(previous * precision));
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Equal;
  const direction = change > 0 ? 'en hausse' : change < 0 ? 'en baisse' : 'stable';
  const month = (key: string) => monthLabel.format(new Date(key + '-15T12:00:00Z'));
  const detail = label + ' ' + direction + ' · ' + month(months.currentMonth) + ' ' + format(value)
    + ' / ' + month(months.previousMonth) + ' ' + format(previous);
  return <span className={'so-fleet-trend' + (change > 0 ? ' is-up' : change < 0 ? ' is-down' : '')}
    role="img" aria-label={detail} title={detail}><Icon size={13} aria-hidden="true" /></span>;
}

export function fleetConsumptionScale(vessels: readonly { vesselId: number; vesselName: string }[], averages?: FleetAverages) {
  return vessels.reduce((maximum, vessel) => {
    const rate = averages?.get(vessel.vesselId);
    return Math.max(maximum, showsTowage(vessel.vesselName) ? rate?.towageLitersPerNm ?? 0 : 0, rate?.otherLitersPerNm ?? 0);
  }, 1);
}

export function SeaOperationVesselConsumption({ vessel, averages, scale, error, onRetry }: {
  vessel: { vesselId: number; vesselName: string }; averages?: FleetAverages; scale: number; error?: string; onRetry: () => void;
}) {
  if (error) return <div className="so-fleet-consumption-status">
    <p role="alert">Moyennes indisponibles.</p>
    <button type="button" className="sp-button sp-button--secondary so-secondary" onClick={onRetry}>Réessayer</button>
  </div>;
  if (!averages) return <p role="status">Chargement des moyennes…</p>;

  const rate = averages.get(vessel.vesselId);
  const price = rate?.pricePerLiter ?? null;
  return <dl className="so-vessel-consumption" aria-label="Consommation moyenne et coût HT par mille nautique">
    {(showsTowage(vessel.vesselName) ? [towage, other] : [other]).map(({ key, label, monthlyKey, icon: Icon, style }) => {
      const value = rate?.[key] ?? null;
      const months = rate?.monthly;
      const trend = months?.[monthlyKey];
      return <div key={key} className={style}>
        <dt><Icon size={13} aria-hidden="true" />{label}</dt>
        <dd className="so-fleet-consumption-values">
          {value === null ? <span>Sans référence</span> : <>
            <span><Droplet size={12} aria-hidden="true" /><span>{fuelLabel(value)}</span>
              <Trend label="Consommation" value={trend?.current.litersPerNm} previous={trend?.previous.litersPerNm}
                months={months} precision={10} format={fuelLabel} /></span>
            <span><Euro size={12} aria-hidden="true" /><span>{price === null ? 'Prix indisponible' : costLabel(value * price)}</span>
              <Trend label="Coût HT" value={trend?.current.costPerNm} previous={trend?.previous.costPerNm}
                months={months} precision={100} format={costLabel} /></span>
          </>}
        </dd>
        {value !== null && <dd className="so-fleet-consumption-track" aria-hidden="true"><span style={{ width: (value / scale * 100) + '%' }} /></dd>}
      </div>;
    })}
  </dl>;
}
