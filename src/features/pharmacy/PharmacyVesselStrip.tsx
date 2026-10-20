import { useId, useState } from 'react';
import { AlertTriangle, Check, Clock3, Ship } from 'lucide-react';
import { fleetIllustration } from '../fleet/fleetDisplay';
import type { PharmacyVessel } from './pharmacyModel';
import './pharmacyVessels.css';

export interface PharmacyVesselStripProps {
  vessels: PharmacyVessel[];
  value: number;
  disabled: boolean;
  counts: Record<number, { due: number; expired: number }> | null;
  onChange: (id: number) => void;
  loading?: boolean;
}

function countLabel(count: number, type: 'due' | 'expired'): string {
  const noun = count === 1 ? 'article' : 'articles';
  return type === 'due' ? `${count} ${noun} à échéance sous 30 jours` : `${count} ${noun} périmé${count === 1 ? '' : 's'}`;
}

function VesselCard({ vessel, selected, disabled, count, loading, onChange }: {
  vessel: PharmacyVessel; selected: boolean; disabled: boolean;
  count: { due: number; expired: number } | undefined;
  loading: boolean; onChange: (id: number) => void;
}) {
  const statusId = useId();
  const photo = fleetIllustration(vessel);
  const [failedPhoto, setFailedPhoto] = useState('');
  const known = count && Number.isFinite(count.due) && count.due >= 0 && Number.isFinite(count.expired) && count.expired >= 0;
  const unavailable = loading ? 'Comptages en cours…' : 'Comptages indisponibles';
  const description = known
    ? [count.due ? countLabel(count.due, 'due') : '', count.expired ? countLabel(count.expired, 'expired') : ''].filter(Boolean).join(' ; ') || 'Aucun article à échéance sous 30 jours ni périmé.'
    : unavailable;
  return <button
    aria-describedby={statusId}
    aria-label={vessel.name}
    aria-pressed={selected}
    className="pharmacy-vessel-card"
    disabled={disabled}
    onClick={() => onChange(vessel.id)}
    title={vessel.name}
    type="button"
  >
    <span className="pharmacy-vessel-visual">
      {photo && failedPhoto !== photo
        ? <img alt="" decoding="async" height={48} loading="lazy" onError={() => setFailedPhoto(photo)} src={photo} width={88} />
        : <span aria-hidden="true" className="pharmacy-vessel-placeholder"><Ship size={27} /><small>{vessel.acronym || 'Navire'}</small></span>}
      {selected ? <span aria-hidden="true" className="pharmacy-vessel-selected"><Check size={10} strokeWidth={3} /></span> : null}
      {known && (count.due > 0 || count.expired > 0) ? <span className="pharmacy-vessel-counts">
        {count.due > 0 ? <span aria-label={countLabel(count.due, 'due')} className="pharmacy-vessel-count is-due" role="img" title={countLabel(count.due, 'due')}><Clock3 aria-hidden="true" size={10} /><span aria-hidden="true">{count.due}</span></span> : null}
        {count.expired > 0 ? <span aria-label={countLabel(count.expired, 'expired')} className="pharmacy-vessel-count is-expired" role="img" title={countLabel(count.expired, 'expired')}><AlertTriangle aria-hidden="true" size={10} /><span aria-hidden="true">{count.expired}</span></span> : null}
      </span> : null}
    </span>
    <strong className="pharmacy-vessel-name">{vessel.name}</strong>
    {!known
      ? <small className="pharmacy-vessel-unavailable" id={statusId}>{unavailable}</small>
      : <span className="pharmacy-vessel-description" id={statusId}>{description}</span>}
  </button>;
}

export function PharmacyVesselStrip({ vessels, value, disabled, counts, onChange, loading = false }: PharmacyVesselStripProps) {
  return <div aria-busy={loading || undefined} aria-label="Choisir un navire" className="pharmacy-vessel-strip" role="group" tabIndex={vessels.length ? 0 : undefined}>
    {vessels.map((vessel) => <VesselCard count={counts ? counts[vessel.id] || { due: 0, expired: 0 } : undefined} disabled={disabled} key={vessel.id} loading={loading} onChange={onChange} selected={vessel.id === value} vessel={vessel} />)}
    {!vessels.length ? <p className="pharmacy-vessel-empty">{loading ? 'Chargement des navires…' : 'Aucun navire accessible.'}</p> : null}
  </div>;
}
