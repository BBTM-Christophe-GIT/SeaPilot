import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { PharmacyIcon } from './PharmacyIcon';
import { PHARMACY_MEDICAL_SECTIONS, blankPharmacyItem, parsePharmacyQuantity, pharmacyDotationLabel, pharmacyItemStrength, pharmacyMedicalSection, type PharmacyCategory, type PharmacyItem, type PharmacyItemDraft, type PharmacyMedicalSection } from './pharmacyModel';

export function PharmacyItemForm({ item, medicalDotation, medicalSection, categories, categoryRecords, busy, error, onClose, onSave }: {
  item?: PharmacyItem; medicalDotation?: string | null; medicalSection?: PharmacyMedicalSection; categories: string[]; categoryRecords?: PharmacyCategory[]; busy: boolean; error: string;
  onClose: () => void; onSave: (draft: PharmacyItemDraft) => void;
}) {
  const [draft, setDraft] = useState<PharmacyItemDraft>(() => item ? { ...item, strength: pharmacyItemStrength(item), medical_dotation: item.medical_dotation || '', medical_section: pharmacyMedicalSection(item.medical_section) } : { ...blankPharmacyItem(), medical_dotation: medicalDotation?.trim() || '', medical_section: medicalSection === 'unclassified' ? undefined : medicalSection });
  const [branchError, setBranchError] = useState('');
  const originalOnboard = item?.stock_quantity?.toString().replace('.', ',') ?? item?.quantity ?? '';
  const originalDotation = item?.required_stock_quantity?.toString().replace('.', ',') ?? item?.required_quantity ?? '';
  const [onboardQuantity, setOnboardQuantity] = useState(originalOnboard);
  const [dotationQuantity, setDotationQuantity] = useState(originalDotation);
  const suggestions = categoryRecords ? [...new Set(categoryRecords.filter((category) => draft.medical_section && pharmacyMedicalSection(category.medical_section) === draft.medical_section).map((category) => category.name))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })) : categories;
  const update = <K extends keyof PharmacyItemDraft>(key: K, value: PharmacyItemDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  return <AppDialog title={item ? 'Modifier l’article' : 'Ajouter un article'} eyebrow="Inventaire Pharmacie" icon={<PharmacyIcon size={20} />} isBusy={busy} onClose={onClose} size="lg"
    description="Renseignez le stock total en unités. Par exemple, pour deux boîtes de trois comprimés, saisissez 6 à bord et 3 unités par boîte."
    onSubmit={(event) => {
      event.preventDefault();
      if (!draft.medical_section) { setBranchError('Choisissez la branche de l’article.'); return; }
      setBranchError('');
      onSave({
        ...draft,
        quantity: item && onboardQuantity === originalOnboard ? item.quantity : onboardQuantity.trim(),
        required_quantity: item && dotationQuantity === originalDotation ? item.required_quantity : dotationQuantity.trim(),
        stock_quantity: parsePharmacyQuantity(onboardQuantity),
        required_stock_quantity: parsePharmacyQuantity(dotationQuantity),
        stock_unit: draft.stock_unit?.trim() || null,
        strength: draft.strength?.trim() || null,
        expiry_precision: draft.no_expiry ? 'unknown' : draft.expiry_precision,
        expires_on: draft.no_expiry || draft.expiry_precision === 'unknown' ? null : draft.expires_on,
        expiry_text: draft.no_expiry ? '' : draft.expiry_text,
      });
    }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy} onClick={onClose} type="button">Annuler</button><button className="is-primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    {branchError ? <p className="pharmacy-message is-error" role="alert">{branchError}</p> : null}
    <div className="pharmacy-form-grid">
      <label className="pharmacy-form-wide">Type de dotation médicale<input aria-label="Type de dotation médicale" readOnly value={pharmacyDotationLabel(draft.medical_dotation)} /><span className="pharmacy-field-help">{item ? 'Le type enregistré avec cet article est conservé.' : 'Le type est celui affecté au navire dans la Flotte.'}</span></label>
      <label className="pharmacy-form-wide">Branche<select aria-label="Branche" required value={draft.medical_section || ''} onChange={(event) => { setDraft((previous) => ({ ...previous, medical_section: event.target.value as PharmacyMedicalSection, category: '', category_id: null })); setBranchError(''); }}><option value="" disabled>Choisir une branche</option>{(Object.entries(PHARMACY_MEDICAL_SECTIONS) as [PharmacyMedicalSection, string][]).filter(([section]) => section !== 'unclassified' || (item && pharmacyMedicalSection(item.medical_section) === 'unclassified')).map(([section, label]) => <option key={section} value={section}>{label}</option>)}</select></label>
      {!item ? <label>Section d’origine<input maxLength={300} value={draft.section} onChange={(event) => update('section', event.target.value)} /></label> : null}
      <label className={item ? 'pharmacy-form-wide' : undefined}>Catégorie<input list="pharmacy-categories" maxLength={200} value={draft.category} onChange={(event) => update('category', event.target.value)} /><datalist id="pharmacy-categories">{suggestions.map((category) => <option key={category} value={category} />)}</datalist></label>
      <label className="pharmacy-form-wide">Désignation<input required maxLength={500} value={draft.designation} onChange={(event) => update('designation', event.target.value)} /></label>
      <label className="pharmacy-checkbox pharmacy-form-wide"><input type="checkbox" checked={draft.outside_dotation ?? false} onChange={(event) => update('outside_dotation', event.target.checked)} /> Hors Dotation</label>
      <label>Marque<input maxLength={200} value={draft.brand} onChange={(event) => update('brand', event.target.value)} /></label>
      <label>N° de lot / référence<input maxLength={200} value={draft.lot_number} onChange={(event) => update('lot_number', event.target.value)} /></label>
      <label>Quantité à bord<input maxLength={200} placeholder="Ex. 6" value={onboardQuantity} onChange={(event) => setOnboardQuantity(event.target.value)} /></label>
      <label>Quantité réglementaire<input maxLength={200} placeholder="Ex. 9" value={dotationQuantity} onChange={(event) => setDotationQuantity(event.target.value)} /></label>
      <label>Unité de stock<input maxLength={100} placeholder="Ex. comprimé" value={draft.stock_unit ?? ''} onChange={(event) => update('stock_unit', event.target.value)} /></label>
      <label>Unités par boîte<input type="number" min={1} step={1} max={1000000} placeholder="Ex. 3" value={draft.package_size ?? ''} onChange={(event) => update('package_size', event.target.value === '' ? null : event.target.valueAsNumber)} /></label>
      <label>Dosage par unité<input maxLength={100} placeholder="Ex. 300 mg" value={draft.strength ?? ''} onChange={(event) => update('strength', event.target.value)} /></label>
      <label className="pharmacy-checkbox pharmacy-form-wide"><input type="checkbox" checked={draft.no_expiry ?? false} onChange={(event) => update('no_expiry', event.target.checked)} /> Sans date de péremption</label>
      {!draft.no_expiry ? <>
        <label>Précision de la péremption<select value={draft.expiry_precision} onChange={(event) => update('expiry_precision', event.target.value as PharmacyItemDraft['expiry_precision'])}><option value="day">Date complète</option><option value="month">Mois / année</option><option value="unknown">Non renseignée</option></select></label>
        {draft.expiry_precision === 'month' ? <label>Mois de péremption<input required type="month" value={draft.expires_on?.slice(0, 7) || ''} onChange={(event) => update('expires_on', event.target.value ? `${event.target.value}-01` : null)} /></label> : draft.expiry_precision === 'day' ? <label>Date de péremption<input required type="date" value={draft.expires_on || ''} onChange={(event) => update('expires_on', event.target.value || null)} /></label> : <label>Mention de validité<input maxLength={200} placeholder="Ex. date illisible" value={draft.expiry_text} onChange={(event) => update('expiry_text', event.target.value)} /></label>}
      </> : null}
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
