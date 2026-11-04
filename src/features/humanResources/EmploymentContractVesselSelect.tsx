import { useEffect, useId, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { compareFleetAssets, fleetAssetKind } from '../fleet/fleetDisplay';
import { fetchFleetVessels, type FleetVessel } from '../fleet/fleetQueries';

const ENTIRE_FLEET = 'Ensemble de la flotte';

interface FleetLoad {
  client: SupabaseClient;
  status: 'loading' | 'ready' | 'error';
  vessels: FleetVessel[];
}

/** Mounted only by the authorized contract editor; the stored text remains the contract snapshot. */
export function EmploymentContractVesselSelect({ client, value, onChange, disabled = false }: {
  client: SupabaseClient;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<FleetLoad | null>(null);
  const current = load?.client === client ? load : null;
  const ready = current?.status === 'ready';
  const failed = current?.status === 'error';
  const vessels = ready ? current.vessels : [];
  const retained = Boolean(value && value !== ENTIRE_FLEET && !vessels.some(vessel => vessel.name === value));

  useEffect(() => {
    let live = true;
    setLoad({ client, status: 'loading', vessels: [] });
    void fetchFleetVessels(client).then(records => {
      if (!live) return;
      const eligible = records.filter(vessel => vessel.active && fleetAssetKind(vessel) === 'vessel').sort(compareFleetAssets);
      const uniqueNames = [...new Map(eligible.map(vessel => [vessel.name, vessel])).values()];
      setLoad({ client, status: 'ready', vessels: uniqueNames });
    }).catch(() => {
      if (live) setLoad({ client, status: 'error', vessels: [] });
    });
    return () => { live = false; };
  }, [client, attempt]);

  function select(next: string) {
    if (disabled || !ready) return;
    if (!next || next === ENTIRE_FLEET || next === value || vessels.some(vessel => vessel.name === next)) onChange(next);
  }

  return <div>
    <label className="hr-edit-field" htmlFor={id}>Navire(s) d’affectation
      <select id={id} value={value} disabled={disabled || !ready}
        aria-describedby={!ready || !vessels.length ? `${id}-feedback` : undefined}
        onChange={event => select(event.target.value)}>
        <option value={ENTIRE_FLEET}>{ENTIRE_FLEET}</option>
        {vessels.map(vessel => <option key={vessel.id} value={vessel.name}>{vessel.name}</option>)}
        {retained ? <option value={value}>{ready ? `Valeur enregistrée : ${value}` : value}</option> : null}
        <option value="">Non renseigné</option>
      </select>
    </label>
    {failed ? <div id={`${id}-feedback`}><p className="form-error" role="alert">Impossible de charger la flotte. La valeur enregistrée est conservée.</p>
      <button className="sp-button sp-button--secondary" type="button" disabled={disabled} onClick={() => setAttempt(currentAttempt => currentAttempt + 1)}>Réessayer</button>
    </div> : !ready ? <p id={`${id}-feedback`} role="status">Chargement de la flotte…</p>
      : !vessels.length ? <p id={`${id}-feedback`}>Aucun navire actif dans la flotte.</p> : null}
  </div>;
}
