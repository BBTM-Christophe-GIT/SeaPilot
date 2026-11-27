import { useId, useState } from 'react';
import { ClipboardList, FileUp, Package } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { PharmacyIcon } from './PharmacyIcon';
import { PHARMACY_MEDICAL_SECTIONS, blankPharmacyItem, parsePharmacyQuantity, pharmacyDesignationKey, pharmacyDotationKey, pharmacyDotationLabel, pharmacyItemStrength, pharmacyMedicalSection, type PharmacyCategory, type PharmacyDotationRequirement, type PharmacyItem, type PharmacyItemDraft, type PharmacyMedicalSection } from './pharmacyModel';
import './pharmacyItemForm.css';

const stockUnits = [
  'unité', 'ampoule', 'boîte', 'comprimé', 'dose', 'flacon', 'gélule', 'patch',
  'paquet', 'pièce', 'sachet', 'seringue', 'suppositoire', 'tube', 'mL', 'cL', 'dL', 'litre',
];
const otherStockUnit = '__other__';

function PharmacyUnitSelect({ label, customLabel, value, onChange }: {
  label: string; customLabel: string; value: string | null | undefined; onChange: (unit: string | null) => void;
}) {
  const [editingCustom, setEditingCustom] = useState(false);
  const custom = editingCustom || Boolean(value && !stockUnits.includes(value));
  return <div className="pharmacy-item-unit">
    <label>{label}
      <select value={custom ? otherStockUnit : value ?? ''} onChange={(event) => {
        const selected = event.target.value;
        setEditingCustom(selected === otherStockUnit);
        onChange(selected && selected !== otherStockUnit ? selected : null);
      }}>
        <option value="">Non renseignée</option>
        {stockUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        <option value={otherStockUnit}>Autre unité…</option>
      </select>
    </label>
    {custom ? <label>{customLabel}<input maxLength={100} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label> : null}
  </div>;
}

type RequirementInput = { quantity: string; unit: string | null; strength: string; packageSize: number | null };

function requirementInput(source: PharmacyItem | PharmacyDotationRequirement | undefined): RequirementInput {
  return {
    quantity: source?.required_stock_quantity?.toString().replace('.', ',') ?? source?.required_quantity ?? '',
    unit: source?.required_stock_unit ?? null,
    strength: source?.required_strength ?? '',
    packageSize: source?.required_package_size ?? null,
  };
}

export function PharmacyItemForm({ item, medicalDotation, medicalSection, initialDesignation = '', initialCategory = '', categories, categoryRecords, requirements, requirementsPending, requirementsError, busy, error, onClose, onSave }: {
  item?: PharmacyItem; initialCategory?: string; medicalDotation?: string | null; medicalSection?: PharmacyMedicalSection; categories: string[]; categoryRecords?: PharmacyCategory[]; busy: boolean; error: string;
  initialDesignation?: string;
  requirements?: PharmacyDotationRequirement[]; requirementsPending?: boolean; requirementsError?: boolean;
  onClose: () => void; onSave: (draft: PharmacyItemDraft) => void;
}) {
  const [draft, setDraft] = useState<PharmacyItemDraft>(() => item ? { ...item, strength: pharmacyItemStrength(item), medical_dotation: item.medical_dotation || '', medical_section: pharmacyMedicalSection(item.medical_section) } : { ...blankPharmacyItem(), designation: initialDesignation, category: initialCategory, medical_dotation: medicalDotation?.trim() || '', medical_section: medicalSection === 'unclassified' ? undefined : medicalSection });
  const [branchError, setBranchError] = useState('');
  const originalOnboard = item?.stock_quantity?.toString().replace('.', ',') ?? item?.quantity ?? '';
  const [onboardQuantity, setOnboardQuantity] = useState(originalOnboard);
  const [requirementEdit, setRequirementEdit] = useState<{ key: string; values: RequirementInput } | null>(null);
  const [shareRequirementKey, setShareRequirementKey] = useState<string | null>(null);
  const stockHelpId = useId();
  const dotationHelpId = useId();
  const dotationKey = pharmacyDotationKey(draft.medical_dotation);
  const designationKey = pharmacyDesignationKey(draft.designation);
  const shareable = Boolean(draft.active && dotationKey && draft.medical_section && draft.medical_section !== 'unclassified');
  const shared = !draft.outside_dotation && shareable ? requirements?.find((entry) => entry.dotation_key === dotationKey
    && entry.medical_section === draft.medical_section && entry.designation_key === designationKey) : undefined;
  const sharedScopeKey = JSON.stringify([dotationKey, draft.medical_section, designationKey]);
  const requirementKey = shared ? sharedScopeKey : 'local';
  const requirementSource = shared || item;
  const originalRequirement = requirementInput(requirementSource);
  const requirement = requirementEdit?.key === requirementKey ? requirementEdit.values : originalRequirement;
  const regulatory = shared?.catalog_code ? shared : undefined;
  const requirementDisabled = Boolean(regulatory || draft.outside_dotation || !draft.medical_section || (shareable && (requirementsPending || requirementsError)));
  const canShareExisting = Boolean(item && designationKey && shareable && !shared && !requirementDisabled && originalRequirement.quantity.trim());
  const shareExisting = canShareExisting && shareRequirementKey === sharedScopeKey;
  const updateRequirement = (changes: Partial<RequirementInput>) => setRequirementEdit({ key: requirementKey, values: { ...requirement, ...changes } });
  const requirementChanged = !requirementDisabled && (requirement.quantity.trim() !== originalRequirement.quantity.trim()
    || (requirement.unit?.trim() || null) !== (originalRequirement.unit?.trim() || null)
    || requirement.strength.trim() !== originalRequirement.strength.trim() || requirement.packageSize !== originalRequirement.packageSize);
  const suggestions = categoryRecords ? [...new Set(categoryRecords.filter((category) => draft.medical_section && pharmacyMedicalSection(category.medical_section) === draft.medical_section).map((category) => category.name))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })) : categories;
  const update = <K extends keyof PharmacyItemDraft>(key: K, value: PharmacyItemDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  return <AppDialog title={item ? 'Modifier l’article' : 'Ajouter un article'} eyebrow="Inventaire Pharmacie" icon={<PharmacyIcon size={20} />} isBusy={busy} onClose={onClose} size="lg"
    onSubmit={(event) => {
      event.preventDefault();
      if (!draft.medical_section) { setBranchError('Choisissez la branche de l’article.'); return; }
      setBranchError('');
      onSave({
        ...draft,
        quantity: item && onboardQuantity === originalOnboard ? item.quantity : onboardQuantity.trim(),
        required_quantity: requirementSource && requirement.quantity === originalRequirement.quantity ? requirementSource.required_quantity : requirement.quantity.trim(),
        stock_quantity: parsePharmacyQuantity(onboardQuantity),
        required_stock_quantity: regulatory ? regulatory.required_stock_quantity : parsePharmacyQuantity(requirement.quantity),
        stock_unit: draft.stock_unit?.trim() || null,
        required_stock_unit: requirement.unit?.trim() || null,
        required_strength: requirement.strength.trim() || null,
        required_package_size: requirement.packageSize,
        update_dotation_requirement: requirementChanged || shareExisting,
        dotation_requirement_revision: shared?.dotation_requirement_revision ?? null,
        strength: draft.strength?.trim() || null,
        expiry_precision: draft.no_expiry ? 'unknown' : draft.expiry_precision,
        expires_on: draft.no_expiry || draft.expiry_precision === 'unknown' ? null : draft.expires_on,
        expiry_text: draft.no_expiry ? '' : draft.expiry_text,
      });
    }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy} onClick={onClose} type="button">Annuler</button><button className="is-primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    {branchError ? <p className="pharmacy-message is-error" role="alert">{branchError}</p> : null}
    <div className="pharmacy-item-form">
      <div className="pharmacy-item-fields pharmacy-item-classification">
        <label>Type de dotation médicale<input aria-label="Type de dotation médicale" readOnly value={pharmacyDotationLabel(draft.medical_dotation)} /><span className="pharmacy-item-help">{item ? 'Le type enregistré avec cet article est conservé.' : 'Le type est celui affecté au navire dans la Flotte.'}</span></label>
        <label>Branche<select aria-label="Branche" disabled={Boolean(regulatory)} required value={draft.medical_section || ''} onChange={(event) => { setDraft((previous) => ({ ...previous, medical_section: event.target.value as PharmacyMedicalSection, category: '', category_id: null })); setBranchError(''); }}><option value="" disabled>Choisir une branche</option>{(Object.entries(PHARMACY_MEDICAL_SECTIONS) as [PharmacyMedicalSection, string][]).filter(([section]) => section !== 'unclassified' || (item && pharmacyMedicalSection(item.medical_section) === 'unclassified')).map(([section, label]) => <option key={section} value={section}>{label}</option>)}</select></label>
        <label className="pharmacy-item-wide-on-small">Catégorie<input list="pharmacy-categories" maxLength={200} title={draft.category || undefined} value={draft.category} onChange={(event) => update('category', event.target.value)} /><datalist id="pharmacy-categories">{suggestions.map((category) => <option key={category} value={category} />)}</datalist></label>
        {!item ? <label className="pharmacy-item-wide">Section d’origine<input maxLength={300} value={draft.section} onChange={(event) => update('section', event.target.value)} /></label> : null}
      </div>
      <div className="pharmacy-item-fields">
        <label className="pharmacy-item-wide-on-small">Désignation<input required readOnly={Boolean(regulatory)} maxLength={500} value={draft.designation} onChange={(event) => update('designation', event.target.value)} /></label>
        <label>N° de lot / référence<input maxLength={200} value={draft.lot_number} onChange={(event) => update('lot_number', event.target.value)} /></label>
      </div>
      <div className="pharmacy-item-stock">
        <fieldset className="pharmacy-item-stock-card is-onboard" aria-describedby={stockHelpId}>
          <legend className="pharmacy-item-stock-title"><Package aria-hidden="true" size={16} /> Stock à bord</legend>
          <p id={stockHelpId} className="pharmacy-item-help">Quantités et conditionnement propres à ce navire.</p>
          <div className="pharmacy-item-stock-fields">
            <label>Marque / modèle<input maxLength={200} value={draft.brand} onChange={(event) => update('brand', event.target.value)} /></label>
            <label>Quantité à bord<input maxLength={200} placeholder="Ex. 10" value={onboardQuantity} onChange={(event) => setOnboardQuantity(event.target.value)} /></label>
            <PharmacyUnitSelect label="Unité de stock" customLabel="Préciser l’unité" value={draft.stock_unit} onChange={(unit) => update('stock_unit', unit)} />
            <label>Dosage ou volume par unité<input maxLength={100} placeholder="Ex. 10 mL" value={draft.strength ?? ''} onChange={(event) => update('strength', event.target.value)} /></label>
            <label>Conditionnement à bord<input maxLength={500} value={draft.stock_packaging ?? ''} onChange={(event) => update('stock_packaging', event.target.value)} /></label>
            <label>Unités par boîte<input type="number" min={1} step={1} max={1000000} placeholder="Facultatif" value={draft.package_size ?? ''} onChange={(event) => update('package_size', event.target.value === '' ? null : event.target.valueAsNumber)} /></label>
          </div>
        </fieldset>
        <fieldset className="pharmacy-item-stock-card" aria-describedby={dotationHelpId}>
          <legend className="pharmacy-item-stock-title"><ClipboardList aria-hidden="true" size={16} /> Dotation</legend>
          <p id={dotationHelpId} className="pharmacy-item-help">
            {draft.outside_dotation ? 'Seule une date de péremption renseignée peut déclencher une alerte.'
              : !draft.medical_section ? 'Choisissez la branche pour renseigner la dotation.'
              : !shareable ? 'Quantité requise pour cet article.'
              : requirementsError ? 'Dotation commune indisponible. Actualisez l’inventaire pour réessayer.'
              : requirementsPending ? 'Chargement de la dotation commune…'
              : regulatory ? `Division 217 du 30 septembre 2021 · page ${regulatory.source_page}`
              : shared ? 'Valeur reprise automatiquement et partagée avec les navires de même dotation.'
              : 'Valeur commune aux articles du même nom et de la même branche pour cette dotation.'}
          </p>
          <fieldset className="pharmacy-item-stock-fields" aria-label="Quantités de dotation" disabled={requirementDisabled}>
            <label>Quantité requise<input maxLength={200} placeholder="Ex. 20" value={regulatory && regulatory.required_stock_quantity == null ? regulatory.required_quantity : requirement.quantity} onChange={(event) => updateRequirement({ quantity: event.target.value })} /></label>
            <PharmacyUnitSelect key={requirementKey} label="Unité de dotation" customLabel="Préciser l’unité de dotation" value={requirement.unit} onChange={(unit) => updateRequirement({ unit })} />
            <label>Dosage ou volume requis par unité<input maxLength={100} placeholder="Ex. 5 mL" value={requirement.strength} onChange={(event) => updateRequirement({ strength: event.target.value })} /></label>
            <label>Unités par boîte de dotation<input type="number" min={1} step={1} max={1000000} placeholder="Facultatif" value={requirement.packageSize ?? ''} onChange={(event) => updateRequirement({ packageSize: event.target.value === '' ? null : event.target.valueAsNumber })} /></label>
          </fieldset>
          {regulatory?.packaging ? <p className="pharmacy-item-help"><strong>Conditionnement réglementaire</strong><br />{regulatory.packaging}</p> : null}
          {regulatory?.regulatory_notes ? <p className="pharmacy-item-help">{regulatory.regulatory_notes}</p> : null}
          {canShareExisting ? <label className="pharmacy-item-check"><input type="checkbox" checked={shareExisting} onChange={(event) => setShareRequirementKey(event.target.checked ? sharedScopeKey : null)} /> Partager cette dotation</label> : null}
          <label className="pharmacy-item-check"><input type="checkbox" disabled={Boolean(regulatory)} checked={draft.outside_dotation ?? false} onChange={(event) => update('outside_dotation', event.target.checked)} /> Hors dotation</label>
        </fieldset>
        <p className="pharmacy-item-help pharmacy-item-wide">Saisissez le nombre total d’unités. À volume égal, 10 unités de 10 mL couvrent une dotation de 20 unités de 5 mL.</p>
      </div>
      <div className="pharmacy-item-fields">
        <label className="pharmacy-item-check">
          <input type="checkbox" checked={draft.no_expiry ?? false} onChange={(event) => update('no_expiry', event.target.checked)} /> Sans date de péremption
        </label>
        {!draft.no_expiry ? <>
          <label>Précision de la péremption<select value={draft.expiry_precision} onChange={(event) => update('expiry_precision', event.target.value as PharmacyItemDraft['expiry_precision'])}><option value="day">Date complète</option><option value="month">Mois / année</option><option value="unknown">Non renseignée</option></select></label>
          {draft.expiry_precision === 'month' ? <label>Mois de péremption<input required type="month" value={draft.expires_on?.slice(0, 7) || ''} onChange={(event) => update('expires_on', event.target.value ? `${event.target.value}-01` : null)} /></label> : draft.expiry_precision === 'day' ? <label>Date de péremption<input required type="date" value={draft.expires_on || ''} onChange={(event) => update('expires_on', event.target.value || null)} /></label> : <label>Mention de validité<input maxLength={200} placeholder="Ex. date illisible" value={draft.expiry_text} onChange={(event) => update('expiry_text', event.target.value)} /></label>}
        </> : null}
      </div>
      <label>Observations<textarea rows={2} maxLength={4000} value={draft.notes} onChange={(event) => update('notes', event.target.value)} /></label>
      <div className="pharmacy-item-options">
        <label className="pharmacy-item-check"><input type="checkbox" checked={draft.active} onChange={(event) => update('active', event.target.checked)} /> Article présent dans l’inventaire actif</label>
      </div>
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
