import { Activity, Fuel } from 'lucide-react';
import type { SeaOperationConsumptionRecord } from './seaOperationConsumption';
import type { SeaOperationConsumptionTrace } from './seaOperationConsumptionTrace';

const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
const price = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });
const volume = (liters: number) => decimal.format(liters) + ' L';
const width = 640, height = 178, left = 44, top = 10, right = 14, bottom = 30;

function SpeedProfile({ trace }: { trace: SeaOperationConsumptionTrace }) {
  const speeds = trace.profile.flatMap(point => point.speedKnots === null ? [] : [point.speedKnots]);
  if (!speeds.length) return null;
  const ceiling = Math.max(2, Math.ceil(Math.max(...speeds) / 2) * 2);
  const duration = Math.max(trace.durationMinutes, trace.profile.at(-1)?.elapsedMinutes ?? 0);
  const x = (minute: number) => left + minute / duration * (width - left - right);
  const y = (speed: number) => height - bottom - speed / ceiling * (height - top - bottom);
  const ticks = [0, ceiling / 2, ceiling];
  let connected = false;
  const path = trace.profile.map(point => {
    if (point.speedKnots === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M';
    connected = true;
    return command + x(point.elapsedMinutes) + ',' + y(point.speedKnots);
  }).join(' ');
  return <section className="so-consumption-chart" aria-label="Navigation enregistrée">
    <h3><Activity size={17} aria-hidden="true" />Profil de vitesse GPS</h3>
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={'Profil de vitesse GPS, maximum ' + decimal.format(Math.max(...speeds)) + ' nœuds'}>
      {ticks.map(tick => <g key={tick}>
        <line className="so-consumption-chart-grid" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
        <text x={left - 7} y={y(tick) + 4} textAnchor="end">{tick} nd</text>
      </g>)}
      <path className="so-consumption-chart-line" d={path} />
      {trace.profile.map((point, index) => point.speedKnots !== null &&
        (trace.profile[index - 1]?.speedKnots ?? null) === null && (trace.profile[index + 1]?.speedKnots ?? null) === null
        ? <circle className="so-consumption-chart-point" key={point.elapsedMinutes} cx={x(point.elapsedMinutes)} cy={y(point.speedKnots)} r={2.5} /> : null)}
      <text x={left} y={height - 8}>0 min</text>
      <text x={width - right} y={height - 8} textAnchor="end">{decimal.format(duration)} min</text>
    </svg>
    <p className="so-help">Vitesse moyenne par intervalle. Les interruptions de la trace apparaissent sous forme de blancs.</p>
  </section>;
}

export function SeaOperationConsumptionCharts({ record }: { record: SeaOperationConsumptionRecord }) {
  const { departureLiters, arrivalLiters, trace } = record;
  const duration = Math.floor(record.durationMinutes / 60) + ' h ' + String(record.durationMinutes % 60).padStart(2, '0');
  const barScale = Math.max(departureLiters ?? 0, arrivalLiters ?? 0, 1);
  return <div className="so-consumption-charts">
    <dl className="so-consumption-trip">
      <div><dt>Durée</dt><dd>{duration}</dd></div>
      <div><dt>Vitesse moyenne</dt><dd>{decimal.format(record.averageSpeedKnots)} nd</dd></div>
      <div><dt>Source de la distance</dt><dd>{trace ? 'Trace GPS' : 'Durée × vitesse moyenne'}</dd></div>
      {trace && <div><dt>Début de trace (Paris)</dt><dd>{dateTime.format(new Date(trace.startedAt))}</dd></div>}
      {record.actualArrival && <div><dt>Arrivée réelle (Paris)</dt><dd>{record.actualArrival.replace(/^(\d{4})-(\d{2})-(\d{2})T/, '$3/$2/$1 ')}</dd></div>}
      {record.refuelLiters !== null && <div><dt>Avitaillement avant départ</dt><dd>{volume(record.refuelLiters)}</dd></div>}
      {record.pricePerLiter !== null && <div><dt>Prix du fuel HT</dt><dd>{price.format(record.pricePerLiter)} €/L</dd></div>}
    </dl>
    <section className="so-consumption-chart" aria-label="Soutes au départ et à l’arrivée">
      <h3><Fuel size={17} aria-hidden="true" />Niveau des soutes</h3>
      {departureLiters !== null && arrivalLiters !== null ? <div className="so-consumption-bars">
        {[{ label: 'Au départ', liters: departureLiters }, { label: 'À l’arrivée', liters: arrivalLiters }].map(bar =>
          <div className="so-consumption-bar-row" key={bar.label}><span>{bar.label}</span>
            <span className="so-consumption-bar-track" aria-hidden="true"><span style={{ width: (100 * bar.liters / barScale) + '%' }} /></span>
            <strong>{volume(bar.liters)}</strong>
          </div>)}
      </div> : <p className="so-help">Volumes indisponibles pour cette conversion de jauge.</p>}
    </section>
    {trace && <SpeedProfile trace={trace} />}
  </div>;
}
