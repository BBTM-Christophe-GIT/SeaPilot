import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { LSA_CATEGORIES, type LsaDraft } from './lsaModel';

export function LsaItemForm({ initial, busy, error, onClose, onSave }: {
  initial: LsaDraft; busy: boolean; error: string; onClose: () => void; onSave: (draft: LsaDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const change = (key: keyof LsaDraft, value: string) => setDraft({ ...draft, [key]: value });
  return <AppDialog title="Fiche matériel LSA" eyebrow="Équipements de sauvetage" isBusy={busy} onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
    <div className="lifting-form-grid">
      <label className="lifting-span">Type d’équipement<select required value={draft.category_key} onChange={(event) => change('category_key', event.target.value)}>{LSA_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
      <label className="lifting-span">Désignation<input required maxLength={2000} value={draft.document_title} onChange={(event) => change('document_title', event.target.value)} /></label>
      <label>Date d’émission<input type="date" value={draft.issued_on || ''} onChange={(event) => change('issued_on', event.target.value)} /></label>
      <label>Date d’échéance<input type="date" min={draft.issued_on || undefined} value={draft.expires_on || ''} onChange={(event) => change('expires_on', event.target.value)} /></label>
      <label>Contrôle prévu<input type="date" value={draft.planned_on || ''} onChange={(event) => change('planned_on', event.target.value)} /></label>
      <label>Prestataire<input value={draft.provider_name || ''} onChange={(event) => change('provider_name', event.target.value)} /></label>
      <label className="lifting-span">Lieu du contrôle<input value={draft.visit_location || ''} onChange={(event) => change('visit_location', event.target.value)} /></label>
      <label className="lifting-span">Notes<textarea value={draft.notes || ''} onChange={(event) => change('notes', event.target.value)} /></label>
      <label className="lifting-span">Suivi du renouvellement<textarea value={draft.renewal_notes || ''} onChange={(event) => change('renewal_notes', event.target.value)} /></label>
    </div>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
