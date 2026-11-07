import { TriangleAlert } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatFuelVolume } from './seaOperationFuelVolume';
import './seaOperationStockGauge.css';

type StockGaugeProps = {
  fuelLiters: number | null;
  capacityLiters: number | null;
  fill: number | null;
  level: 'unknown' | 'critical' | 'warning' | 'normal';
};

const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const gaugeVolume = (liters: number) => formatFuelVolume(liters, liters > 1000 ? 'm³' : 'L');

export function SeaOperationStockGauge({ fuelLiters, capacityLiters, fill, level }: StockGaugeProps) {
  const position = fill === null ? undefined : Math.min(Math.max(fill, 0), 1) * 100;
  const current = fuelLiters === null ? 'Non renseigné' : gaugeVolume(fuelLiters);
  const capacity = capacityLiters === null ? null : gaugeVolume(capacityLiters);
  const percentage = fill === null ? null : percent.format(fill);
  const status = level === 'critical' ? ' · Carburant critique' : level === 'warning' ? ' · Niveau de carburant bas' : '';

  return <div className="so-stock-gauge" data-level={level}
    style={{ '--so-stock-position': `${position ?? 0}%` } as CSSProperties}
    role={fill === null ? undefined : 'meter'} aria-label={fill === null ? undefined : 'Stock de carburant'}
    aria-valuemin={fill === null ? undefined : 0} aria-valuemax={fill === null ? undefined : 100} aria-valuenow={position}
    aria-valuetext={fill === null ? undefined : `${percentage} · ${current} sur ${capacity}${status}`}>
    <div className="so-stock-gauge-current">
      {level === 'critical' && <TriangleAlert size={14} aria-hidden="true" />}
      {percentage !== null && <strong>{percentage}</strong>}
      <span>{current}</span>
    </div>
    <div className="so-stock-gauge-track" aria-hidden="true">
      {fill !== null && <>
        <span className="so-stock-gauge-fill" />
        <span className="so-stock-gauge-marker" />
      </>}
    </div>
    <small className="so-stock-gauge-capacity">{capacity === null ? 'Capacité à renseigner' : <>Capacité <strong>{capacity}</strong></>}</small>
  </div>;
}
