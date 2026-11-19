import type { SupabaseClient } from '@supabase/supabase-js';
import { Anchor, Building2, Ship } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { FleetVesselOverview } from './FleetVesselOverview';
import { fetchFleetVessel, type FleetVessel } from './fleetQueries';
import './fleetVesselSheet.css';

type VesselSheetState = { status: 'loading' | 'error' } | { status: 'ready'; vessel: FleetVessel | null };

export function FleetVesselSheet({ client, vesselId, vesselName, onClose }: {
  client: SupabaseClient;
  vesselId: number;
  vesselName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<VesselSheetState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchFleetVessel(client, vesselId).then(
      (vessel) => { if (active) setState({ status: 'ready', vessel }); },
      () => { if (active) setState({ status: 'error' }); },
    );
    return () => { active = false; };
  }, [attempt, client, vesselId]);

  const vessel = state.status === 'ready' ? state.vessel : null;
  const Icon = vessel?.assetKind === 'office' ? Building2 : vessel?.assetKind === 'quay' ? Anchor : Ship;
  const type = vessel?.typeLabel.trim() || vessel?.unitTypeLabel.trim();
  return <AppDialog eyebrow="Module Navire" icon={<Icon aria-hidden="true" size={22} />} onClose={onClose}
    size="xl" title={vessel?.name || vesselName}>
    <div aria-busy={state.status === 'loading'} className="fleet-vessel-sheet">
      {vessel ? <>
        <div className="fleet-vessel-sheet__meta">
          {type ? <span>{type}</span> : null}
          <span className={`fleet-status${vessel.active ? ' is-active' : ''}`}>{vessel.active ? 'Actif' : 'Retiré'}</span>
        </div>
        <FleetVesselOverview compact vessel={vessel} />
      </> : state.status === 'loading' ? <p role="status">Chargement de la fiche…</p> : <>
        <p role="status">{state.status === 'error' ? 'Impossible de charger la fiche du navire.' : 'Fiche du navire indisponible.'}</p>
        {state.status === 'error' ? <button className="sp-button sp-button--secondary" onClick={() => {
          setState({ status: 'loading' });
          setAttempt((previous) => previous + 1);
        }} type="button">Réessayer</button> : null}
      </>}
    </div>
  </AppDialog>;
}
