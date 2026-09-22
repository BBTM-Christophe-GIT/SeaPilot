import { useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { PICTOGRAMS, blankChemical, chemicalDraft, type ChemicalDraft, type ChemicalProduct, type ChemicalVessel } from './chemicalModel';
export function ChemicalForm({ product, vesselId, vessels, busy, error, onClose, onSave }: {
  product?: ChemicalProduct; vesselId: number; vessels: ChemicalVessel[]; busy: boolean; error: string; onClose: () => void;
  onSave: (draft: ChemicalDraft) => void;
}) {
  const [draft, setDraft] = useState(() => product ? chemicalDraft(product) : blankChemical(vesselId));
  const field = (key: keyof ChemicalDraft, label: string, multiline = false, maxLength = 500) => <label className={multiline ? 'chem-field chem-field--wide' : 'chem-field'}>
    <span>{label}</span>{multiline
      ? <textarea disabled={busy} maxLength={maxLength} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} rows={3} value={String(draft[key] ?? '')} />
      : <input disabled={busy} maxLength={maxLength} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} required={key === 'product_type'} value={String(draft[key] ?? '')} />}
  </label>;
  return <AppDialog eyebrow="QHSE · Inventaire" title={product ? 'Modifier le produit' : 'Ajouter un produit'} size="lg" isBusy={busy} onClose={onClose}
    onSubmit={(e) => { e.preventDefault(); onSave(draft); }} footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={busy} onClick={onClose}>Annuler</button><button className="is-primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
    {error ? <p role="alert" className="chem-error">{error}</p> : null}
    <div className="chem-form-grid">
      <label className="chem-field"><span>Navire *</span><select value={draft.vessel_id || ''} required disabled={busy} onChange={(e) => setDraft({ ...draft, vessel_id: Number(e.target.value) })}><option value="">Sélectionner un navire</option>{vessels.map((v) => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
      {field('product_type', 'Type / produit *', false, 250)}{field('brand', 'Marque', false, 250)}{field('variant', 'Variante / format / référence UFI')}
      <label className="chem-field"><span>Stock en litres</span><input type="number" min="0" max="999999999" step="0.001" disabled={busy} value={draft.stock_litres ?? ''} placeholder="À renseigner" onChange={(e) => setDraft({ ...draft, stock_litres: e.target.value === '' ? null : Number(e.target.value) })}/></label>
      {field('storage_compatibility', 'Compatibilité de stockage', false, 250)}{field('storage_location', 'Emplacement de stockage')}{field('usage', 'Usage', false, 2000)}
      <fieldset className="chem-pictogram-picker"><legend>Pictogrammes de danger</legend><p>Sélectionnez les pictogrammes indiqués sur la FDS ou l’étiquette.</p><div>{PICTOGRAMS.map((p) => <label key={p.code} className={draft.pictograms.includes(p.code) ? 'is-selected' : ''}><input type="checkbox" disabled={busy} checked={draft.pictograms.includes(p.code)} onChange={(e) => setDraft({ ...draft, pictograms: e.target.checked ? [...draft.pictograms, p.code] : draft.pictograms.filter((c) => c !== p.code) })}/><img src={`/ghs/${p.code}.png`} alt="" /><span><b>{p.code.replace('GHS','SGH')}</b>{p.label}</span></label>)}</div></fieldset>
      {field('hazards', 'Dangers (mentions H / EUH)', true, 12000)}{field('precautions', 'Conseils de prudence (mentions P)', true, 12000)}{field('ppe', 'EPI', true, 4000)}{field('notes', 'Observations / source', true, 4000)}
    </div>
  </AppDialog>;
}
