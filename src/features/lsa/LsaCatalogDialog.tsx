import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppDialog } from '../../components/AppDialog';
import { compareLsaNames, type LsaCatalog } from './lsaModel';
import { fetchLsaCatalog, saveLsaCatalogEntry } from './lsaQueries';

type EditEntry = { kind: 'type' | 'designation'; id?: number; name: string; equipment_type_id?: number; active: boolean; updated_at?: string };

export function LsaCatalogDialog({ client, catalog, onChange, onClose }: {
  client: SupabaseClient; catalog: LsaCatalog; onChange: (catalog: LsaCatalog) => void; onClose: () => void;
}) {
  const [edit, setEdit] = useState<EditEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const select = (entry: EditEntry) => { setEdit(entry); setError(''); setNotice(''); };
  async function save() {
    if (!edit || busy) return;
    setBusy(true); setError('');
    try {
      await saveLsaCatalogEntry(client, edit.kind, edit);
      onChange(await fetchLsaCatalog(client)); setEdit(null); setNotice('Arborescence enregistrée.');
    } catch (reason) { setError(reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : 'Impossible d’enregistrer l’arborescence.'); }
    finally { setBusy(false); }
  }
  return <AppDialog title="Arborescence des désignations" eyebrow="Administration · Registre LSA" size="lg" isBusy={busy} onClose={onClose}
    footer={<button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Terminer</button>}>
    <p>Les types et désignations sont communs aux navires de l’entreprise. Un élément archivé reste visible sur les fiches existantes.</p>
    {notice && <p className="lifting-notice" role="status">{notice}</p>}
    {edit ? <form className="lsa-catalog-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h3>{edit.id ? 'Modifier' : 'Ajouter'} {edit.kind === 'type' ? 'un type d’équipement' : 'une désignation'}</h3>
      <div className="lifting-form-grid">
        {edit.kind === 'designation' && <label className="lifting-span">Type d’équipement<select aria-label="Type d’équipement" required value={edit.equipment_type_id || ''} onChange={(event) => setEdit({ ...edit, equipment_type_id: Number(event.target.value) })}><option value="">Choisir un type</option>{[...catalog.types].sort(compareLsaNames).map((type) => <option key={type.id} value={type.id}>{type.name}{!type.active ? ' (archivé)' : ''}</option>)}</select></label>}
        <label className="lifting-span">Libellé<input autoFocus required maxLength={120} value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label>
        <label className="lsa-catalog-active"><input type="checkbox" checked={edit.active} onChange={(event) => setEdit({ ...edit, active: event.target.checked })} />Disponible pour les nouvelles fiches</label>
      </div>
      {error && <p role="alert" className="lifting-error">{error}</p>}
      <div className="lsa-catalog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEdit(null)}>Annuler la modification</button><button className="primary-button" disabled={busy}>Enregistrer l’arborescence</button></div>
    </form> : <>
      <button type="button" className="secondary-button" onClick={() => select({ kind: 'type', name: '', active: true })}>Ajouter un type</button>
      <div className="lsa-catalog-tree">{[...catalog.types].sort(compareLsaNames).map((type) => <section key={type.id} aria-label={type.name}>
        <header><h3>{type.name}{!type.active && <small> · Archivé</small>}</h3><button type="button" className="secondary-button" onClick={() => select({ kind: 'type', ...type })} aria-label={`Modifier le type ${type.name}`}>Modifier le type</button></header>
        <ul>{catalog.designations.filter((entry) => entry.equipment_type_id === type.id).sort(compareLsaNames).map((entry) => <li key={entry.id}><span>{entry.name}{!entry.active && <small> · Archivée</small>}</span><button type="button" className="secondary-button" aria-label={`Modifier la désignation ${entry.name}`} onClick={() => select({ kind: 'designation', ...entry })}>Modifier</button></li>)}</ul>
        <button type="button" className="secondary-button" onClick={() => select({ kind: 'designation', name: '', equipment_type_id: type.id, active: true })} aria-label={`Ajouter une désignation dans ${type.name}`}>Ajouter une désignation</button>
      </section>)}</div>
    </>}
  </AppDialog>;
}
