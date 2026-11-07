import { ArrowDownRight, ArrowUpRight, BarChart3, Equal } from 'lucide-react';
import { normalizeFleetName } from '../fleet/fleetDisplay';
import type { SeaOperationData } from './seaOperationQueries';
import type { SeaOperationRegisterConsumption } from './seaOperationRegisterConsumptionQuery';
import './seaOperationFleetConsumption.css';

interface Props {
  vessels: SeaOperationData['vessels'];
  averages?: SeaOperationRegisterConsumption['vesselAverages'];
  error?: string;
  onRetry: () => void;
}

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fuelLabel = (value: number) => number.format(value) + ' L/NM';
const costLabel = (value: number) => euros.format(value) + '/NM';
const towageVessels = new Set(['LE ROZEL', 'LANDEMER', 'SUROIT']);
const showsTowage = (name: string) => towageVessels.has(normalizeFleetName(name));
const towage = { key: 'towageLitersPerNm', label: 'Remorquage', monthlyKey: 'towage', style: 'is-towage' } as const;
const other = { key: 'otherLitersPerNm', label: 'Autres manœuvres', monthlyKey: 'other', style: 'is-other' } as const;

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

export function SeaOperationFleetConsumption({ vessels, averages, error, onRetry }: Props) {
  const scale = vessels.reduce((maximum, vessel) => {
    const rate = averages?.get(Number(vessel.id));
    return Math.max(maximum, showsTowage(vessel.name) ? rate?.towageLitersPerNm ?? 0 : 0, rate?.otherLitersPerNm ?? 0);
  }, 1);
  return <section className="sp-panel so-fleet-consumption" aria-label="Consommation moyenne par navire">
    <header><BarChart3 size={19} aria-hidden="true" /><div><h2>Consommation moyenne par navire</h2>
      <p>Barres en L/NM sur une échelle commune. Coût estimé HT en €/NM au dernier prix applicable. Les flèches comparent les relevés du mois en cours à ceux du mois précédent.</p></div>
    </header>
    {error ? <div className="so-fleet-consumption-status">
      <p role="alert">Les moyennes de consommation sont indisponibles.</p>
      <button type="button" className="sp-button sp-button--secondary" onClick={onRetry}>Réessayer les moyennes</button>
    </div> : !averages ? <p role="status">Chargement des moyennes de consommation…</p>
      : vessels.length ? <ul className="so-fleet-consumption-vessels">{vessels.map(vessel => {
        const rate = averages.get(Number(vessel.id));
        const price = rate?.pricePerLiter ?? null;
        return <li key={vessel.id}>
          <h3>{vessel.name}</h3>
          <dl>{(showsTowage(vessel.name) ? [towage, other] : [other]).map(({ key, label, monthlyKey, style }) => {
            const value = rate?.[key] ?? null;
            const months = rate?.monthly;
            const trend = months?.[monthlyKey];
            return <div key={key} className={style}>
              <dt>{label}</dt><dd className="so-fleet-consumption-values">
                {value === null ? <span>Sans référence</span> : <>
                  <span><span>{fuelLabel(value)}</span><Trend label="Consommation" value={trend?.current.litersPerNm}
                    previous={trend?.previous.litersPerNm} months={months} precision={10} format={fuelLabel} /></span>
                  <span><span>{price === null ? 'Prix indisponible' : costLabel(value * price)}</span>
                    <Trend label="Coût HT" value={trend?.current.costPerNm} previous={trend?.previous.costPerNm}
                      months={months} precision={100} format={costLabel} /></span>
                </>}
              </dd>
              <dd className="so-fleet-consumption-track" aria-hidden="true">
                {value !== null && <span style={{ width: (value / scale * 100) + '%' }} />}
              </dd>
            </div>;
          })}</dl>
        </li>;
      })}</ul> : <p>Aucun navire disponible.</p>}
  </section>;
}
