import { AlertTriangle, Clock3 } from 'lucide-react';
import type { VesselExpiryCounts } from './vesselExpiryAlerts';
import './vesselExpiryBadges.css';

export function vesselExpiryDescription(count: VesselExpiryCounts | undefined, loading: boolean): string {
  if (!count) return loading ? 'Comptages en cours…' : 'Comptages indisponibles';
  return [count.due ? `${count.due} matériel${count.due === 1 ? '' : 's'} à échéance sous 30 jours` : '',
    count.expired ? `${count.expired} matériel${count.expired === 1 ? '' : 's'} périmé${count.expired === 1 ? '' : 's'}` : '']
    .filter(Boolean).join(' ; ') || 'Aucun matériel à échéance sous 30 jours ni périmé.';
}

export function VesselExpiryBadges({ count, loading = false }: { count: VesselExpiryCounts | undefined; loading?: boolean }) {
  if (!count) return <span className="vessel-expiry-unavailable" title={vesselExpiryDescription(count, loading)}>{loading ? '…' : '?'}</span>;
  if (!count.due && !count.expired) return null;
  return <span className="vessel-expiry-badges">
    {count.due > 0 ? <span className="vessel-expiry-badge is-due" role="img" aria-label={`${count.due} matériel${count.due === 1 ? '' : 's'} à échéance sous 30 jours`} title={`${count.due} matériel${count.due === 1 ? '' : 's'} à échéance sous 30 jours`}><Clock3 aria-hidden="true" size={10} /><span aria-hidden="true">{count.due}</span></span> : null}
    {count.expired > 0 ? <span className="vessel-expiry-badge is-expired" role="img" aria-label={`${count.expired} matériel${count.expired === 1 ? '' : 's'} périmé${count.expired === 1 ? '' : 's'}`} title={`${count.expired} matériel${count.expired === 1 ? '' : 's'} périmé${count.expired === 1 ? '' : 's'}`}><AlertTriangle aria-hidden="true" size={10} /><span aria-hidden="true">{count.expired}</span></span> : null}
  </span>;
}
