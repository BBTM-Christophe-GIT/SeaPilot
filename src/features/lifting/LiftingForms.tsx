import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { CHECK_KEYS, CHECK_LABELS, CONDITION_LABELS, annualExpiry, entryComplete, todayLocal, type CheckValue, type InspectionEntry, type ItemCondition, type ItemDraft, type LiftingKind } from './liftingModel';

export function LiftingItemForm({ initial, kind, busy, error, onClose, onSave }: {
  initial: ItemDraft; kind: LiftingKind; busy: boolean; error: string; onClose: () => void; onSave: (draft: ItemDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (key: keyof ItemDraft, value: string | number | null) => setDraft((previous) => ({ ...previous, [key]: value }));
  return <AppDialog title="Fiche matériel" eyebrow={kind === 'towing' ? 'Remorque maritime' : 'Apparaux de levage'} onClose={onClose} isBusy={busy}
    onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy}>Enregistrer le matériel</button></>}>
    <div className="lifting-form-grid">
      <label>Identifiant du matériel<input required maxLength={100} value={draft.reference} onChange={(e) => change('reference', e.target.value)} /></label>
      <label>Type de matériel<input required maxLength={100} readOnly={kind === 'towing'} value={draft.material_type} onChange={(e) => change('material_type', e.target.value)} list="lifting-material-types" /></label>
      <datalist id="lifting-material-types">{['Élingue', 'Manille', 'Croc', 'Sangle', 'Palan', 'Autre'].map((type) => <option key={type}>{type}</option>)}</datalist>
      <label className="lifting-span">Description<textarea required maxLength={2000} value={draft.description} onChange={(e) => change('description', e.target.value)} /></label>
      <label>CMU (tonnes)<input type="number" min="0.001" step="any" inputMode="decimal" value={draft.swl_tonnes ?? ''} onChange={(e) => change('swl_tonnes', e.target.value ? Number(e.target.value) : null)} placeholder="Non renseignée" /></label>
      <label>Numéro de série<input value={draft.serial_number} onChange={(e) => change('serial_number', e.target.value)} /></label>
      <label className="lifting-span">Emplacement à bord<input value={draft.location} onChange={(e) => change('location', e.target.value)} /></label>
      <label className="lifting-span">Notes<textarea value={draft.notes} onChange={(e) => change('notes', e.target.value)} /></label>
    </div>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}

export function LiftingStartForm({ busy, error, onClose, onSave }: { busy: boolean; error: string; onClose: () => void; onSave: (issued: string, expires: string) => void }) {
  const [issued, setIssued] = useState(todayLocal());
  const [expires, setExpires] = useState(annualExpiry(issued));
  return <AppDialog title="Nouveau contrôle annuel" onClose={onClose} isBusy={busy}
    description="Le formulaire reprend tous les matériels actifs de cette section et de ce navire."
    onSubmit={(e) => { e.preventDefault(); onSave(issued, expires); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy}>Démarrer le contrôle</button></>}>
    <div className="lifting-form-grid">
      <label>Date d’émission<input type="date" required value={issued} onChange={(e) => { setIssued(e.target.value); setExpires(annualExpiry(e.target.value)); }} /></label>
      <label>Date d’échéance<input type="date" required min={issued} value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
    </div>
    <p>Vérificateur : <strong>Antoine MONCEAUX</strong></p>
    <p className="lifting-muted">Une échéance d’un an est proposée et reste ajustable. Le PDF final sera classé dans « Certificats flotte ».</p>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}

export function LiftingEntryForm({ entry, busy, error, onClose, onSave }: {
  entry: InspectionEntry; busy: boolean; error: string; onClose: () => void; onSave: (entry: InspectionEntry) => void;
}) {
  const [draft, setDraft] = useState(entry);
  return <AppDialog title={`Contrôler le matériel ${entry.item_snapshot.reference}`} description={entry.item_snapshot.description} onClose={onClose} isBusy={busy} size="lg"
    onSubmit={(e) => { e.preventDefault(); onSave(draft); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy}>Enregistrer le contrôle</button></>}>
    <div className="lifting-entry-form">
      <label>Décision pour ce matériel<select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value as ItemCondition })}>
        {Object.entries(CONDITION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      {draft.condition !== 'not_present' && <fieldset><legend>Points de contrôle</legend>
        <p className="lifting-muted">EG, NID et V1 à V5 reprennent les repères du registre source. Choisissez « Sans objet » pour les points non applicables.</p>
        <div className="lifting-checks">{CHECK_KEYS.map((key) => <label key={key}>{key}<select value={draft.checks[key]} onChange={(e) => setDraft({ ...draft, checks: { ...draft.checks, [key]: e.target.value as CheckValue } })}>
          {Object.entries(CHECK_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>)}</div>
      </fieldset>}
      <label>Observations et actions à réaliser<textarea rows={4} value={draft.observations} onChange={(e) => setDraft({ ...draft, observations: e.target.value })} placeholder="Défaut constaté, réparation à prévoir, motif d’absence…" /></label>
      <p className="lifting-muted">{entryComplete(draft) ? 'Ce matériel est prêt pour le rapport.' : 'Vous pouvez enregistrer une saisie partielle et la compléter plus tard.'}</p>
      {draft.condition === 'repair' && <p className="lifting-warning">La réparation doit être réalisée avant la remise en service.</p>}
      {error && <p className="lifting-error" role="alert">{error}</p>}
    </div>
  </AppDialog>;
}
