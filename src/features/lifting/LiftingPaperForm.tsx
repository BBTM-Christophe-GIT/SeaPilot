import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import type { LiftingKind, LiftingVessel } from './liftingModel';

export function LiftingPaperForm({ vessels, initialVesselId, initialKind, busy, error, onClose, onDownload }: {
  vessels: LiftingVessel[]; initialVesselId: number; initialKind: LiftingKind; busy: boolean; error: string;
  onClose: () => void; onDownload: (vesselId: number, kind: LiftingKind, includeNotice: boolean) => void;
}) {
  const [vesselId, setVesselId] = useState(initialVesselId);
  const [kind, setKind] = useState(initialKind);
  const [includeNotice, setIncludeNotice] = useState(true);
  return <AppDialog title="Fiche de contrôle papier" icon={<Printer size={22} />} onClose={onClose} isBusy={busy}
    description="Préparez votre contrôle à bord à partir de tous les matériels actifs de l’inventaire au moment du téléchargement."
    onSubmit={(event) => { event.preventDefault(); onDownload(vesselId, kind, includeNotice); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !vesselId}><Download size={17} />{busy ? 'Préparation…' : 'Télécharger la fiche PDF'}</button></>}>
    <div className="lifting-form-grid">
      <label className="lifting-span">Navire / site de la fiche<select required disabled={busy} value={vesselId} onChange={(event) => setVesselId(Number(event.target.value))}><option value={0} disabled>Choisir un navire ou un site</option>{vessels.map((vessel) => <option value={vessel.id} key={vessel.id}>{vessel.name}</option>)}</select></label>
      <label className="lifting-span">Registre à imprimer<select disabled={busy} value={kind} onChange={(event) => setKind(event.target.value as LiftingKind)}><option value="lifting">Apparaux de levage</option><option value="towing">Remorques</option></select></label>
      <label className="lifting-toggle lifting-span"><input type="checkbox" disabled={busy} checked={includeNotice} onChange={(event) => setIncludeNotice(event.target.checked)} /> Joindre la notice des codes (dernière page A3)</label>
    </div>
    <p className="lifting-muted">Les feuilles de saisie sont au format A4 paysage. Les matériels sont classés par type d’accessoire, avec leurs identifiants, leurs codes et des espaces vierges pour la décision et les observations.</p>
    <p className="lifting-muted">Après le contrôle sur papier, reportez vos résultats dans le contrôle numérique depuis votre ordinateur ou votre téléphone.</p>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
