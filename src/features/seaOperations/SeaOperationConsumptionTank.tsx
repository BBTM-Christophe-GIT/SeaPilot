import { CirclePlay, CircleStop, Droplet, Fuel } from 'lucide-react';
import { useId } from 'react';
import { landemerTankVolumeLiters, type SeaOperationConsumptionRecord } from './seaOperationConsumption';
import './seaOperationConsumptionTank.css';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const volume = (liters: number) => decimal.format(liters) + ' L';
const landemerFullTankLiters = landemerTankVolumeLiters(100);
const vesselOutline = 'M63 34H537C565 34 584 64 584 101S565 168 537 168H63C35 168 16 138 16 101S35 34 63 34Z';
const chamber = 'M69 42H531Q544 42 547 66V136Q544 160 531 160H69Q56 160 53 136V66Q56 42 69 42Z';
const chamberTop = 42;
const chamberBottom = 160;

function FuelTankGraphic({ arrivalLiters, ratio }: { arrivalLiters: number | null; ratio: number | null }) {
  const id = useId();
  const fill = ratio === null
    ? (arrivalLiters !== null && arrivalLiters > 0 ? .56 : 0)
    : Math.min(1, Math.max(0, ratio));
  const waterline = chamberBottom - (chamberBottom - chamberTop) * fill;
  const ripple = Math.min(4, waterline - chamberTop, chamberBottom - waterline);
  const wave = `M53 ${waterline} C135 ${waterline + ripple * 2} 174 ${waterline - ripple * 2} 249 ${waterline}
    S358 ${waterline + ripple * 2} 423 ${waterline} S498 ${waterline - ripple * 2} 547 ${waterline}`;
  const description = arrivalLiters === null ? 'Volume des soutes à l’arrivée indisponible'
    : ratio === null ? 'Représentation indicative des soutes à l’arrivée'
      : `Niveau des soutes à l’arrivée : ${percentage.format(ratio)} de la capacité totale`;

  return <svg className="so-consumption-tank__graphic" viewBox="0 0 600 182" role="img" aria-label={description}>
    <defs>
      <linearGradient id={id + '-steel'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7c8c9c" />
        <stop offset=".18" stopColor="#eef2f7" />
        <stop offset=".40" stopColor="#acb8c3" />
        <stop offset=".64" stopColor="#7d8b98" />
        <stop offset=".84" stopColor="#c6d0d9" />
        <stop offset="1" stopColor="#566575" />
      </linearGradient>
      <linearGradient id={id + '-chamber'} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#cedbe7" />
        <stop offset=".37" stopColor="#e9f0f6" />
        <stop offset="1" stopColor="#b0bfcd" />
      </linearGradient>
      <linearGradient id={id + '-fuel'} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#28b8ec" />
        <stop offset=".22" stopColor="#0875b9" />
        <stop offset=".66" stopColor="#084e8d" />
        <stop offset="1" stopColor="#07305f" />
      </linearGradient>
      <clipPath id={id + '-opening'}>
        <path d={chamber} />
      </clipPath>
    </defs>

    <ellipse cx="300" cy="174" rx="270" ry="7" fill="#304661" opacity=".13" />
    <g fill={`url(#${id}-steel)`} stroke="#536476" strokeWidth="1.5">
      <rect x="238" y="21" width="17" height="22" rx="3" />
      <rect x="233" y="18" width="27" height="6" rx="2" />
      <rect x="360" y="14" width="58" height="28" rx="6" />
      <rect x="354" y="11" width="70" height="8" rx="3" />
      <path d="M365 11v-5h7v5m15 0v-5h7v5m15 0v-5h7v5" />
      <path d={vesselOutline} />
    </g>
    <path d="M63 35C40 48 37 77 37 101s3 53 26 66M537 35c23 13 26 42 26 66s-3 53-26 66"
      fill="none" stroke="#536476" strokeWidth="2" />
    <path d="M60 41C44 59 43 87 43 101s1 42 17 60M540 41c16 18 17 46 17 60s-1 42-17 60"
      fill="none" stroke="#edf3f8" strokeWidth="2" strokeOpacity=".8" />
    <path d={chamber} fill={`url(#${id}-chamber)`} />
    {fill > 0 && <g clipPath={`url(#${id}-opening)`}>
      <path d={wave + 'V160H53Z'} fill={`url(#${id}-fuel)`} />
      <path d={wave} fill="none" stroke="#b7ecff" strokeWidth="2" />
    </g>}
    <path d={chamber} fill="none" stroke="#536476" strokeWidth="1.5" />
    {ratio !== null && <path d="M105 51v100m-8-100h16m-13 25h10m-13 25h16m-13 25h10m-13 25h16"
      fill="none" stroke="#f2f7fc" strokeWidth="2" opacity=".92" />}
    <g fill={`url(#${id}-steel)`} stroke="#536476" strokeWidth="1.5">
      <rect x="86" y="155" width="28" height="21" rx="2" />
      <rect x="486" y="155" width="28" height="21" rx="2" />
    </g>
    <g textAnchor="middle" fill="#fff">
      <rect x="165" y="67" width="270" height="68" rx="8" fill="#082947" opacity={fill >= .8 ? .36 : .90} />
      {arrivalLiters === null
        ? <text x="300" y="109" fontSize="23" fontWeight="700">Volume indisponible</text>
        : <>
          <text x="300" y="101" fontSize="34" fontWeight="750">{volume(arrivalLiters)}</text>
          <text x="300" y="124" fontSize="19" fontWeight="600">à l’arrivée</text>
        </>}
    </g>
  </svg>;
}

export function SeaOperationConsumptionTank({ record, capacityLiters }: {
  record: Pick<SeaOperationConsumptionRecord, 'departureLiters' | 'arrivalLiters' | 'consumedLiters' | 'tankGauges'>;
  capacityLiters: number | null;
}) {
  const { departureLiters, arrivalLiters, consumedLiters } = record;
  // Paired Landemer readings measure the two calibrated tanks. The fleet catalogue can change independently.
  const capacity = record.tankGauges && landemerFullTankLiters !== null
    ? 2 * landemerFullTankLiters : capacityLiters;
  const knownCapacity = capacity !== null && Number.isFinite(capacity) && capacity > 0 ? capacity : null;
  const ratio = arrivalLiters !== null && knownCapacity !== null ? arrivalLiters / knownCapacity : null;
  const caption = arrivalLiters === null ? 'Volumes indisponibles pour cette conversion de jauge.'
    : knownCapacity === null ? 'Illustration indicative · capacité totale indisponible.'
      : 'Capacité totale · ' + volume(knownCapacity);
  const quantities = [
    { label: 'Quantité au départ', liters: departureLiters, Icon: CirclePlay },
    { label: 'Quantité à l’arrivée', liters: arrivalLiters, Icon: CircleStop },
    { label: 'Quantité consommée', liters: consumedLiters, Icon: Droplet, isTotal: true },
  ];

  return <section className="sp-panel so-consumption-tank" aria-label="Soutes au départ et à l’arrivée">
    <h3><Fuel size={20} aria-hidden="true" />Soutes de carburant</h3>
    <div className="so-consumption-tank__layout">
      <figure>
        <FuelTankGraphic arrivalLiters={arrivalLiters} ratio={ratio} />
        <figcaption>{caption}</figcaption>
      </figure>
      <dl className="so-consumption-tank__quantities">
        {quantities.map(({ label, liters, Icon, isTotal }) => <div key={label} className={isTotal ? 'is-total' : undefined}>
          <dt><Icon size={19} aria-hidden="true" />{label}</dt>
          <dd className={liters === null ? 'is-unavailable' : undefined}>{liters === null ? 'Indisponible' : volume(liters)}</dd>
        </div>)}
      </dl>
    </div>
  </section>;
}
