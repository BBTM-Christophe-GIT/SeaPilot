import { useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Ship } from 'lucide-react';
import type { LiftingVessel } from './liftingModel';

function VesselImage({ vessel }: { vessel: LiftingVessel }) {
  const [failedUrl, setFailedUrl] = useState('');
  const thumbnailUrl = vessel.illustration_thumbnail_url;
  return thumbnailUrl && failedUrl !== thumbnailUrl
    ? <img src={thumbnailUrl} alt="" width={256} height={171} loading="lazy" decoding="async" onError={() => setFailedUrl(thumbnailUrl)} />
    : <span className="lifting-vessel-placeholder"><Ship size={34} aria-hidden="true" /><small>Photo à venir</small></span>;
}

export function LiftingVesselFilter({ vessels, value, disabled, onChange }: {
  vessels: LiftingVessel[]; value: number; disabled: boolean; onChange: (id: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const selected = vessels.find((vessel) => vessel.id === value);
  return <section className="lifting-fleet" aria-label="Sélection du navire">
    <div className="lifting-fleet-heading">
      <div><span className="lifting-fleet-label">FLOTTE BBTM</span><h2>Choisir un navire <span>ou le Yard</span></h2></div>
      <div className="lifting-fleet-scroll">
        <span>{vessels.length} unités</span>
        <button type="button" aria-label="Voir les navires précédents" disabled={!vessels.length} onClick={() => row.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft size={17} /></button>
        <button type="button" aria-label="Voir les navires suivants" disabled={!vessels.length} onClick={() => row.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight size={17} /></button>
      </div>
    </div>
    <div className="lifting-vessel-strip" ref={row} role="group" aria-label="Filtrer par navire">
      {vessels.map((vessel) => <button type="button" className="lifting-vessel-card" key={vessel.id} aria-label={vessel.name} aria-pressed={vessel.id === value} disabled={disabled} onClick={() => onChange(vessel.id)}>
        <span className="lifting-vessel-photo"><VesselImage vessel={vessel} />{vessel.id === value && <span className="lifting-vessel-check"><Check size={12} strokeWidth={3} /></span>}</span>
        <strong>{vessel.name}</strong>
      </button>)}
      {!vessels.length && <p className="lifting-fleet-empty">Aucun navire accessible.</p>}
    </div>
    <div className="lifting-fleet-context" aria-live="polite"><span className="lifting-context-dot" /><strong>{selected?.name || 'Aucune sélection'}</strong><span>Inventaire et rapports de contrôle</span></div>
  </section>;
}
