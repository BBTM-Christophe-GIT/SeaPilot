import { useEffect, useRef, useState } from 'react';
import { Folders, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import type { PharmacyCategory, PharmacyItem } from './pharmacyModel';

interface Props {
  vesselName: string;
  categories: PharmacyCategory[];
  items: PharmacyItem[];
  busy: boolean;
  notice: string;
  onClose: () => void;
  onSave: (name: string, category?: PharmacyCategory) => Promise<void>;
  onDelete: (category: PharmacyCategory) => Promise<void>;
}
const keyOf = (name: string) => name.trim().toLocaleLowerCase('fr');
function failureMessage(reason: unknown) {
  return reason && typeof reason === 'object' && 'message' in reason
    ? String(reason.message) : 'La modification n’a pas pu être enregistrée. Réessayez.';
}

export function PharmacyCategoriesDialog({ vesselName, categories, items, busy, notice, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ category: PharmacyCategory; name: string } | null>(null);
  const [removing, setRemoving] = useState<PharmacyCategory | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const locked = busy || saving;
  const sorted = [...categories].sort((left, right) => left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' }));
  const countFor = (category: PharmacyCategory) => items.filter((item) => keyOf(item.category) === keyOf(category.name));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function validatedName(value: string, current?: PharmacyCategory): string | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 200) { setError('Saisissez un nom de catégorie de 1 à 200 caractères.'); return null; }
    if (categories.some((category) => category.id !== current?.id && keyOf(category.name) === keyOf(trimmed))) {
      setError('Une catégorie porte déjà ce nom sur ce navire.'); return null;
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
    void run(() => onSave(validated, current), () => { if (current) setEditing(null); else setName(''); });
  }

  if (removing) {
    const count = countFor(removing).length;
    return <AppDialog key={`delete-${removing.id}`} title={`Supprimer la catégorie ${removing.name}`} eyebrow={`Inventaire Pharmacie · ${vesselName}`}
      icon={<Trash2 aria-hidden="true" size={20} />} size="sm" isBusy={locked}
      description="La suppression d’une catégorie ne supprime aucun article."
      onClose={() => { if (!inFlight.current) { setRemoving(null); setError(''); } }}
      footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={locked} onClick={() => { setRemoving(null); setError(''); }} type="button">Annuler</button><button className="is-danger" disabled={locked} onClick={() => void run(() => onDelete(removing), () => setRemoving(null))} type="button">{locked ? 'Suppression…' : 'Supprimer'}</button></div>}>
      <p>Supprimer <strong>{removing.name}</strong> sur <strong>{vesselName}</strong> ?</p>
      <p>{count} article{count > 1 ? 's' : ''}, y compris les articles retirés, {count > 1 ? 'seront classés' : 'sera classé'} dans <strong>Sans catégorie</strong>. Les articles et leur historique sont conservés.</p>
      {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    </AppDialog>;
  }
  return <AppDialog key="categories" title="Gérer les catégories" eyebrow={`Inventaire Pharmacie · ${vesselName}`} icon={<Folders aria-hidden="true" size={20} />} size="lg" isBusy={locked}
    description="Ajoutez, renommez ou supprimez les catégories de ce navire. Les effectifs comprennent les articles retirés."
    onClose={() => { if (!inFlight.current) onClose(); }}
    footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={locked} onClick={onClose} type="button">Fermer</button></div>}>
    {error ? <p className="pharmacy-message is-error" role="alert">{error}</p> : null}
    {notice && !error ? <p className="pharmacy-message is-success" role="status">{notice}</p> : null}
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
            <div className="pharmacy-category-name"><strong>{category.name}</strong><small>{matching.length} article{matching.length > 1 ? 's' : ''}{retired ? ` · ${retired} retiré${retired > 1 ? 's' : ''}` : ''}</small></div>
            <div className="pharmacy-category-actions"><button aria-label={`Renommer ${category.name}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => { setEditing({ category: { ...category }, name: category.name }); setError(''); }} type="button"><Pencil aria-hidden="true" size={15} /> Renommer</button><button aria-label={`Supprimer ${category.name}`} className="sp-button sp-button--secondary" disabled={locked} onClick={() => { setRemoving({ ...category }); setError(''); }} type="button"><Trash2 aria-hidden="true" size={15} /> Supprimer</button></div>
          </>}
        </li>;
      })}
    </ul> : <p className="pharmacy-category-empty">Aucune catégorie sur ce navire. Ajoutez votre première catégorie.</p>}
  </AppDialog>;
}
