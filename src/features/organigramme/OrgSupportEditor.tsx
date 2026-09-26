import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteOrgSupport, saveOrgSupport } from './organigrammeQueries';
import { orgCategoryLabel, orgOfficeResponsibilities, orgRankLabel, type OrgData, type OrgSupport, type OrgSupportDraft, type OrgRank } from './organigrammeModel';

const emptyEntry = (): OrgSupportDraft => ({ name: '', functionLabel: '', category: 'external', personId: null, position: 10, rank: '' });
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
  const entries = [...orgOfficeResponsibilities(data), ...data.support.filter((item) => item.category === 'external')];
  return <section className="org-editor" aria-label="Structure complémentaire"><h2>Hiérarchie, supports et intervenants</h2><p>Le rang 1 est tout en haut. Les rangs suivants sont placés en dessous ; les fonctions Support apparaissent sur les côtés. L’ordre départage les personnes de même rang.</p>
    <div className="org-support-list">{entries.map((item) => <div key={item.id ? `entry-${item.id}` : `person-${item.personId}`}><span><strong>{item.name}</strong><small>{item.functionLabel}{item.category === 'office' ? ` · ${orgRankLabel(item.rank)}` : ''}</small></span><button type="button" aria-label={`Modifier ${item.name}`} disabled={saving} onClick={() => setEntry(item)}>Modifier<span className="org-sr-only"> {item.name}</span></button>{item.id && <button type="button" aria-label={`Supprimer ${item.name}`} disabled={saving || previewMode} onClick={() => void remove(item.id!)}>Supprimer<span className="org-sr-only"> {item.name}</span></button>}</div>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}><fieldset disabled={saving}><legend>{entry.id ? 'Modifier une responsabilité' : 'Ajouter une responsabilité'}</legend>
      <label>Rubrique<select value={entry.category} onChange={(event) => setEntry({ ...entry, category: event.target.value as OrgSupport['category'], personId: null })}><option value="external">{orgCategoryLabel(data, 'external')}</option><option value="office">{orgCategoryLabel(data, 'office')}</option></select></label>
      {entry.category === 'office' && <label>Fiche RH liée<select value={entry.personId ?? ''} onChange={(event) => { const person = data.people.find((person) => person.id === Number(event.target.value)); setEntry({ ...entry, personId: person?.id ?? null, name: person?.name || entry.name }); }}><option value="">Saisie libre</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <label>Nom<input required maxLength={160} value={entry.name} onChange={(event) => setEntry({ ...entry, name: event.target.value })} /></label>
      <label>Fonction ou accompagnement<input required maxLength={300} value={entry.functionLabel} onChange={(event) => setEntry({ ...entry, functionLabel: event.target.value })} /></label>
      {entry.category === 'office' && <label>Rang hiérarchique<select value={entry.rank || ''} onChange={(event) => setEntry({ ...entry, rank: event.target.value as OrgRank })}><option value="">À définir</option>{['1','2','3','4','5','6','7','8','9','support'].map((rank) => <option key={rank} value={rank}>{orgRankLabel(rank as OrgRank)}</option>)}</select></label>}
      <label>Ordre dans le rang<input type="number" min="0" max="9999" required value={entry.position} onChange={(event) => setEntry({ ...entry, position: Number(event.target.value) })} /></label>
      <button type="submit" className="org-primary">{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button type="button" onClick={() => setEntry(emptyEntry())}>Annuler</button>
    </fieldset></form>{previewMode && <p>Les modifications de démonstration restent locales à cette préversion.</p>}{error && <p role="alert" className="org-error">{error}</p>}
  </section>;
}
