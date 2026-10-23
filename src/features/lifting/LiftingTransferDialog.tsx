import { ArrowRightLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets, fleetAssetKind } from '../fleet/fleetDisplay';
import type { LiftingItem, LiftingVessel } from './liftingModel';
import { LiftingVesselFilter } from './LiftingVesselFilter';
import './liftingNavigation.css';
import './liftingTransferDialog.css';

/** The accessible vessel RPC supplies the candidates; the transfer RPC checks the destination again. */
export function LiftingTransferDialog({ item, vessels, busy, error = '', onClose, onTransfer }: {
  item: LiftingItem;
  vessels: readonly LiftingVessel[];
  busy: boolean;
  error?: string;
  onClose: () => void;
  onTransfer: (targetVesselId: number) => Promise<void>;
}) {
  const signature = `${item.id}:${item.company_id}:${item.vessel_id}:${item.kind}:${item.updated_at}`;
  const current = useRef(signature); current.current = signature;
  const mounted = useRef(true);
  const pending = useRef<object | null>(null);
  const [submission, setSubmission] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ signature: string; id: number } | null>(null);
  const [localError, setLocalError] = useState<{ signature: string; message: string } | null>(null);
  const destinations = vessels.filter((vessel) => vessel.id !== item.vessel_id && vessel.company_id === item.company_id && vessel.active !== false && fleetAssetKind(vessel) === 'vessel').sort(compareFleetAssets);
  const source = vessels.find((vessel) => vessel.id === item.vessel_id);
  const selected = selection?.signature === signature ? destinations.find((vessel) => vessel.id === selection.id) : undefined;
  const processing = busy || submission === signature;
  const message = error || (localError?.signature === signature ? localError.message : '');

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function transfer() {
    if (processing || pending.current || !selected || !item.active) return;
    const request = {};
    pending.current = request; setSubmission(signature); setLocalError(null);
    try { await onTransfer(selected.id); }
    catch (reason) {
      if (mounted.current && current.current === signature) setLocalError({ signature, message: reason instanceof Error ? reason.message : 'Le transfert n’a pas pu être réalisé. Réessayez.' });
    } finally {
      if (pending.current === request) pending.current = null;
      if (mounted.current) setSubmission((value) => value === signature ? null : value);
    }
  }

  function close() { if (!processing && !pending.current) onClose(); }

  return <AppDialog title={`Transférer le matériel ${item.reference}`} icon={<ArrowRightLeft aria-hidden="true" size={22} />} size="lg" isBusy={processing} onClose={close} footer={<div className="app-dialog__actions lifting-transfer-actions">
    <button type="button" className="sp-button sp-button--secondary" onClick={close} disabled={processing}>Annuler</button>
    <button type="button" className="sp-button sp-button--primary" onClick={() => void transfer()} disabled={processing || !selected || !item.active}><ArrowRightLeft size={17} aria-hidden="true" />Transférer</button>
  </div>}>
    <div className="lifting-transfer-dialog">
      <p className="lifting-transfer-item"><strong>{item.reference} · {item.description}</strong><span>Navire ou site de départ : {source?.name || 'Registre sélectionné'}</span></p>
      <p className="lifting-transfer-help">Choisissez le navire destinataire. Le matériel sera déplacé dans son registre et retiré du registre actuel.</p>
      {destinations.length > 0 && <LiftingVesselFilter vessels={destinations} value={selected?.id || 0} disabled={processing} onChange={(id) => { if (!pending.current && !busy) { setSelection({ signature, id }); setLocalError(null); } }} includeYard={false} contextLabel="Navire destinataire" showScrollControls={false} />}
      {!destinations.length && <p className="lifting-transfer-empty">Aucun autre navire autorisé n’est disponible pour ce transfert.</p>}
      {selected && <p className="lifting-transfer-destination" role="status">Destination : <strong>{selected.name}</strong></p>}
      {processing && <p className="lifting-transfer-help" role="status">Transfert en cours…</p>}
      {message && <p className="lifting-error" role="alert">{message}</p>}
    </div>
  </AppDialog>;
}
