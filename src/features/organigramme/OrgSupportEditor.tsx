import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteOrgSupport, saveOrgSupport } from './organigrammeQueries';
import type { OrgData, OrgSupport } from './organigrammeModel';

const emptyEntry = (): Omit<OrgSupport, 'id'> & { id?: number } => ({ name: '', functionLabel: '', category: 'external', personId: null, position: 10 });
export function OrgSupportEditor({ client, data, onSaved, previewMode }: { client: SupabaseClient; data: OrgData; onSaved: () => void; previewMode: boolean }) {
  const [entry, setEntry] = useState(emptyEntry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setSaving(true); setError('');
    try { await saveOrgSupport(client, entry); setEntry(emptyEntry()); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  }
  async function remove(id: number) {
    setSaving(true); setError('');
    try { await deleteOrgSupport(client, id); if (entry.id === id) setEntry(emptyEntry()); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Suppression impossible.'); }
    finally { setSaving(false); }
  }
  return <section className="org-editor" aria-label="Structure complémentaire"><h2>Direction et intervenants externes</h2><p>Les responsabilités ci-dessous reprennent le document de référence et peuvent être actualisées. Une fiche RH liée conserve le nom à jour. Les équipages se modifient dans le Planning.</p>
    <div className="org-support-list">{data.support.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.functionLabel}</small></span><button type="button" disabled={saving} onClick={() => setEntry(item)}>Modifier<span className="org-sr-only"> {item.name}</span></button><button type="button" disabled={saving || previewMode} onClick={() => void remove(item.id)}>Supprimer<span className="org-sr-only"> {item.name}</span></button></div>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><fieldset disabled={saving || previewMode}><legend>{entry.id ? 'Modifier une responsabilité' : 'Ajouter une responsabilité'}</legend>
      <label>Rubrique<select value={entry.category} onChange={(event) => setEntry({ ...entry, category: event.target.value as OrgSupport['category'], personId: null })}><option value="external">Intervenants externes</option><option value="office">Direction & Administration</option></select></label>
      {entry.category === 'office' && <label>Fiche RH liée<select value={entry.personId ?? ''} onChange={(event) => { const person = data.people.find((person) => person.id === Number(event.target.value)); setEntry({ ...entry, personId: person?.id ?? null, name: person?.name || entry.name }); }}><option value="">Saisie libre</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <label>Nom<input required maxLength={160} value={entry.name} onChange={(event) => setEntry({ ...entry, name: event.target.value })} /></label>
      <label>Fonction ou accompagnement<input required maxLength={300} value={entry.functionLabel} onChange={(event) => setEntry({ ...entry, functionLabel: event.target.value })} /></label>
      <label>Ordre<input type="number" min="0" max="9999" required value={entry.position} onChange={(event) => setEntry({ ...entry, position: Number(event.target.value) })} /></label>
      <button type="submit" className="org-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button type="button" onClick={() => setEntry(emptyEntry())}>Annuler</button>
    </fieldset></form>{previewMode && <p>La structure de démonstration est en lecture seule.</p>}{error && <p role="alert" className="org-error">{error}</p>}
  </section>;
}
