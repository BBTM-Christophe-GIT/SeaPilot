import { useState } from 'react';
import { FileUp, Pill } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { blankPharmacyItem, type PharmacyItem, type PharmacyItemDraft } from './pharmacyModel';

export function PharmacyItemForm({ item, categories, busy, error, onClose, onSave }: {
  item?: PharmacyItem; categories: string[]; busy: boolean; error: string;
  onClose: () => void; onSave: (draft: PharmacyItemDraft) => void;
}) {
  const [draft, setDraft] = useState<PharmacyItemDraft>(() => item ? { ...item } : blankPharmacyItem());
  const update = <K extends keyof PharmacyItemDraft>(key: K, value: PharmacyItemDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  return <AppDialog title={item ? 'Modifier l’article' : 'Ajouter un article'} eyebrow="Inventaire Pharmacie" icon={<Pill size={20} />} isBusy={busy} onClose={onClose} size="lg"
    description="Conservez les unités et conditionnements indiqués à bord. Les quantités en texte ne sont pas converties automatiquement."
    onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, expires_on: draft.expiry_precision === 'unknown' ? null : draft.expires_on }); }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy} onClick={onClose} type="button">Annuler</button><button className="is-primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    <div className="pharmacy-form-grid">
      <label>Section<input maxLength={300} value={draft.section} onChange={(event) => update('section', event.target.value)} /></label>
      <label>Catégorie<input list="pharmacy-categories" maxLength={200} value={draft.category} onChange={(event) => update('category', event.target.value)} /><datalist id="pharmacy-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
      <label className="pharmacy-form-wide">Désignation<input required maxLength={500} value={draft.designation} onChange={(event) => update('designation', event.target.value)} /></label>
      <label>Marque<input maxLength={200} value={draft.brand} onChange={(event) => update('brand', event.target.value)} /></label>
      <label>N° de lot / référence<input maxLength={200} value={draft.lot_number} onChange={(event) => update('lot_number', event.target.value)} /></label>
      <label>Quantité à bord<input maxLength={200} placeholder="Ex. 2 boîtes, 30 × 300 mg" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
      <label>Quantité réglementaire<input maxLength={200} value={draft.required_quantity} onChange={(event) => update('required_quantity', event.target.value)} /></label>
      <label>Précision de la péremption<select value={draft.expiry_precision} onChange={(event) => update('expiry_precision', event.target.value as PharmacyItemDraft['expiry_precision'])}><option value="day">Date complète</option><option value="month">Mois / année</option><option value="unknown">Non renseignée</option></select></label>
      {draft.expiry_precision === 'month' ? <label>Mois de péremption<input required type="month" value={draft.expires_on?.slice(0, 7) || ''} onChange={(event) => update('expires_on', event.target.value ? `${event.target.value}-01` : null)} /></label> : draft.expiry_precision === 'day' ? <label>Date de péremption<input required type="date" value={draft.expires_on || ''} onChange={(event) => update('expires_on', event.target.value || null)} /></label> : <label>Mention de validité<input maxLength={200} placeholder="Ex. sans date indiquée" value={draft.expiry_text} onChange={(event) => update('expiry_text', event.target.value)} /></label>}
      <label className="pharmacy-form-wide">Observations<textarea rows={3} maxLength={4000} value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></label>
      <label className="pharmacy-checkbox pharmacy-form-wide"><input type="checkbox" checked={draft.active} onChange={(event) => update('active', event.target.checked)} /> Article présent dans l’inventaire actif</label>
    </div>
    {item?.source_file ? <p className="pharmacy-source">Source : {item.source_file} · {item.source_sheet}, ligne {item.source_row}. Les observations du classeur sont conservées.</p> : null}
  </AppDialog>;
}

export function PharmacyControlForm({ vesselName, busy, error, onClose, onSave }: {
  vesselName: string; busy: boolean; error: string; onClose: () => void;
  onSave: (file: File, expiresOn: string, issuedOn: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  return <AppDialog title="Déposer le contrôle pharmacie" eyebrow={vesselName} icon={<FileUp size={20} />} size="md" isBusy={busy} onClose={onClose}
    description="Le document et son échéance sont liés à ce navire. Une alerte apparaît 30 jours avant l’échéance et reste active si elle est dépassée."
    onSubmit={(event) => { event.preventDefault(); if (file) onSave(file, expiresOn, issuedOn); }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy} onClick={onClose} type="button">Annuler</button><button className="is-primary" disabled={busy || !file || !expiresOn} type="submit">{busy ? 'Dépôt en cours…' : 'Enregistrer le contrôle'}</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    <div className="pharmacy-form-grid">
      <label className="pharmacy-form-wide">Document Contrôle Pharmacie<input aria-label="Document Contrôle Pharmacie" required type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span className="pharmacy-field-help">PDF, JPG ou PNG · 20 Mo maximum</span></label>
      <label>Date du contrôle<input type="date" max={expiresOn || undefined} value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} /></label>
      <label>Date d’échéance<input required type="date" min={issuedOn || undefined} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
    </div>
  </AppDialog>;
}
