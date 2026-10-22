import { useEffect, useRef, useState } from 'react';
import { Folders, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { PHARMACY_MEDICAL_SECTIONS, pharmacyDotationKey, pharmacyDotationLabel, pharmacyMedicalSection, pharmacyMedicalSectionLabel, type PharmacyCategory, type PharmacyItem, type PharmacyMedicalSection } from './pharmacyModel';

interface Props {
  vesselName: string;
  medicalDotation?: string;
  initialMedicalSection?: 'all' | PharmacyMedicalSection;
  categories: PharmacyCategory[];
  items: PharmacyItem[];
  busy: boolean;
  notice: string;
  onClose: () => void;
  onSave: (name: string, category?: PharmacyCategory, medicalSection?: PharmacyMedicalSection) => Promise<void>;
  onDelete: (category: PharmacyCategory) => Promise<void>;
}
const keyOf = (name: string) => name.trim().toLocaleLowerCase('fr');
function failureMessage(reason: unknown) {
  return reason && typeof reason === 'object' && 'message' in reason
    ? String(reason.message) : 'La modification n’a pas pu être enregistrée. Réessayez.';
}

export function PharmacyCategoriesDialog({ vesselName, medicalDotation = '', initialMedicalSection = 'all', categories: allCategories, items: allItems, busy, notice, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [medicalSection, setMedicalSection] = useState<'' | PharmacyMedicalSection>(() => initialMedicalSection === 'all' ? '' : initialMedicalSection);
  const [editing, setEditing] = useState<{ category: PharmacyCategory; name: string } | null>(null);
  const [removing, setRemoving] = useState<PharmacyCategory | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const locked = busy || saving;
  const parentCategories = allCategories.filter((category) => pharmacyDotationKey(category.medical_dotation) === pharmacyDotationKey(medicalDotation));
  const categories = parentCategories.filter((category) => !medicalSection || pharmacyMedicalSection(category.medical_section) === medicalSection);
  const items = allItems.filter((item) => pharmacyDotationKey(item.medical_dotation) === pharmacyDotationKey(medicalDotation));
  const sorted = [...categories].sort((left, right) => left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' }));
  const countFor = (category: PharmacyCategory) => items.filter((item) => pharmacyMedicalSection(item.medical_section) === pharmacyMedicalSection(category.medical_section) && keyOf(item.category) === keyOf(category.name));
  const sectionOptions = (Object.keys(PHARMACY_MEDICAL_SECTIONS) as PharmacyMedicalSection[]).filter((section) => section !== 'unclassified' || [...parentCategories, ...items].some((entry) => pharmacyMedicalSection(entry.medical_section) === 'unclassified'));
  const actionName = (category: PharmacyCategory) => categories.some((entry) => entry.id !== category.id && keyOf(entry.name) === keyOf(category.name)) ? `${category.name} — ${pharmacyMedicalSectionLabel(category.medical_section)}` : category.name;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function validatedName(value: string, current?: PharmacyCategory): string | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) { setError('Saisissez un nom de catégorie de 1 à 200 caractères.'); return null; }
    const section = current ? pharmacyMedicalSection(current.medical_section) : medicalSection;
    if (!section) { setError('Choisissez la branche de la nouvelle catégorie.'); return null; }
    if (parentCategories.some((category) => category.id !== current?.id && pharmacyMedicalSection(category.medical_section) === section && keyOf(category.name) === keyOf(trimmed))) {
      setError('Une catégorie porte déjà ce nom dans cette branche de la dotation.'); return null;
    }
    return trimmed;
  }
  async function run(action: () => Promise<void>, complete: () => void) {
    if (locked || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError('');
    try { await action(); if (mounted.current) complete(); }
    catch (reason) { if (mounted.current) setError(failureMessage(reason)); }
    finally { inFlight.current = false; if (mounted.current) setSaving(false); }
  }
  function saveName(value: string, current?: PharmacyCategory) {
    if (locked || inFlight.current) return;
    const validated = validatedName(value, current);
    if (!validated) return;
    if (current && validated === current.name) { setEditing(null); setError(''); return; }
    const section = current ? pharmacyMedicalSection(current.medical_section) : medicalSection;
    if (!section) return;
    void run(() => onSave(validated, current, section), () => { if (current) setEditing(null); else setName(''); });
  }

  if (removing) {
    const count = countFor(removing).length;
    return <AppDialog key={`delete-${removing.id}`} title={`Supprimer la catégorie ${removing.name}`} eyebrow={`Catalogue commun · ${pharmacyDotationLabel(medicalDotation)} · ${pharmacyMedicalSectionLabel(removing.medical_section)}`}
      icon={<Trash2 aria-hidden="true" size={20} />} size="sm" isBusy={locked}
      description="La suppression d’une catégorie ne supprime aucun article."
      onClose={() => { if (!inFlight.current) { setRemoving(null); setError(''); } }}
      footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={locked} onClick={() => { setRemoving(null); setError(''); }} type="button">Annuler</button><button className="is-danger" disabled={locked} onClick={() => void run(() => onDelete(removing), () => setRemoving(null))} type="button">{locked ? 'Suppression…' : 'Supprimer'}</button></div>}>
      <p>Supprimer <strong>{removing.name}</strong> du catalogue commun de la société pour <strong>{pharmacyDotationLabel(medicalDotation)}</strong>, branche <strong>{pharmacyMedicalSectionLabel(removing.medical_section)}</strong> ?</p>
      <p>{count} article{count > 1 ? 's' : ''}, y compris les articles retirés, sur <strong>{vesselName}</strong>.</p>
      <p>Sur tous les navires de la société partageant cette dotation et cette branche, les articles seront classés dans <strong>Sans catégorie</strong>. Les articles et leur historique sont conservés. Les quantités restent propres à chaque navire.</p>
      {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    </AppDialog>;
  }
  return <AppDialog key="categories" title="Gérer les catégories" eyebrow={`Catalogue commun · ${vesselName} · ${pharmacyDotationLabel(medicalDotation)}`} icon={<Folders aria-hidden="true" size={20} />} size="lg" isBusy={locked}
    description="Les catégories sont communes aux navires de la société pour la même dotation et la même branche. Renommer ou supprimer une catégorie concerne leurs articles ; leurs quantités restent propres à chaque navire. Les effectifs affichés concernent uniquement ce navire, articles retirés compris."
    onClose={() => { if (!inFlight.current) onClose(); }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={locked} onClick={onClose} type="button">Fermer</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    {notice && !error ? <p className="pharmacy-message is-success" role="status">{notice}</p> : null}
    <label className="pharmacy-filter-field pharmacy-category-section">Branche du catalogue<select aria-label="Branche du catalogue" value={medicalSection} disabled={locked} onChange={(event) => { setMedicalSection(event.target.value as '' | PharmacyMedicalSection); setEditing(null); setError(''); }}><option value="">Toutes les branches — choisir pour ajouter</option>{sectionOptions.map((section) => <option key={section} value={section}>{pharmacyMedicalSectionLabel(section)}</option>)}</select></label>
    <form className="pharmacy-category-form" onSubmit={(event) => { event.preventDefault(); saveName(name); }}>
      <label htmlFor="pharmacy-new-category">Nouvelle catégorie</label>
      <div><input id="pharmacy-new-category" maxLength={200} value={name} disabled={locked} onChange={(event) => setName(event.target.value)} placeholder="Nom de la catégorie" /><button className="sp-button sp-button--primary" disabled={locked} type="submit"><Plus aria-hidden="true" size={16} /> Ajouter</button></div>
    </form>
    {sorted.length ? <ul className="pharmacy-category-list" aria-label={`Catégories de ${vesselName}`}>
      {sorted.map((category) => {
        const matching = countFor(category);
        const retired = matching.filter((item) => !item.active).length;
        return <li key={category.id} data-pharmacy-category={category.id}>
          {editing?.category.id === category.id ? <form className="pharmacy-category-rename" onSubmit={(event) => { event.preventDefault(); saveName(editing.name, editing.category); }}>
            <label className="pharmacy-sr-only" htmlFor={`pharmacy-category-${category.id}`}>Nouveau nom de {editing.category.name}</label>
            <input id={`pharmacy-category-${category.id}`} value={editing.name} maxLength={200} disabled={locked} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            <button aria-label={`Enregistrer ${editing.category.name}`} className="sp-button sp-button--primary" disabled={locked} type="submit">Enregistrer</button>
            <button aria-label={`Annuler le renommage de ${editing.category.name}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => { setEditing(null); setError(''); }} type="button">Annuler</button>
          </form> : <>
            <div className="pharmacy-category-name"><strong>{category.name}</strong><small>{pharmacyMedicalSectionLabel(category.medical_section)} · {matching.length} article{matching.length > 1 ? 's' : ''}{retired ? ` · ${retired} retiré${retired > 1 ? 's' : ''}` : ''} sur ce navire</small></div>
            <div className="pharmacy-category-actions"><button aria-label={`Renommer ${actionName(category)}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => { setEditing({ category: { ...category }, name: category.name }); setError(''); }} type="button"><Pencil aria-hidden="true" size={15} /> Renommer</button><button aria-label={`Supprimer ${actionName(category)}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => { setRemoving({ ...category }); setError(''); }} type="button"><Trash2 aria-hidden="true" size={15} /> Supprimer</button></div>
          </>}
        </li>;
      })}
    </ul> : <p className="pharmacy-category-empty">Aucune catégorie dans cette dotation. Ajoutez votre première catégorie.</p>}
  </AppDialog>;
}
