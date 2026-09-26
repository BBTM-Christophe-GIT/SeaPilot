import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ORG_CATEGORY_LABELS, orgAllTargets, orgCategoryLabel, orgTargetValue, type OrgCategory, type OrgData, type OrgLink } from './organigrammeModel';
import { deleteOrgLink, saveOrgCategory, saveOrgLink } from './organigrammeQueries';

const categories = Object.keys(ORG_CATEGORY_LABELS) as OrgCategory[];
const emptyLink = () => ({ sourceCategory: 'external' as OrgCategory, targetKind: 'category' as OrgLink['targetKind'], targetKey: '', targetSection: '', label: '', id: undefined as number | undefined });
export function OrgStructureEditor({ client, data, onSaved, previewMode }: { client: SupabaseClient; data: OrgData; onSaved: () => void; previewMode: boolean }) {
  const [category, setCategory] = useState<OrgCategory>('external');
  const [name, setName] = useState(() => orgCategoryLabel(data, 'external'));
  const [link, setLink] = useState(emptyLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const targets = useMemo(() => orgAllTargets(data), [data]);
  const choices = targets.filter((target) => target.kind === link.targetKind && !(target.kind === 'category' && target.key === link.sourceCategory));
  const value = link.targetKey ? JSON.stringify([link.targetKind, link.targetSection, link.targetKey]) : '';
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setStatus('');
    try { await action(); setStatus(success); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }
  return <section className="org-editor" aria-label="Catégories et liens"><h2>Catégories et liens</h2>
    <p>Les noms et les liens sont partagés par l’entreprise. Les relations apparaissent sous les équipes dans le diagramme et dans les exports. Une cible absente de la date, de la vue ou des filtres choisis reste enregistrée.</p>
    <form onSubmit={(event) => { event.preventDefault(); void perform(() => saveOrgCategory(client, category, name), 'Nom de catégorie enregistré.'); }}>
      <fieldset disabled={busy || previewMode}><legend>Renommer une grande catégorie</legend>
        <label>Catégorie à renommer<select value={category} onChange={(event) => { const key = event.target.value as OrgCategory; setCategory(key); setName(orgCategoryLabel(data, key)); }}>{categories.map((key) => <option key={key} value={key}>{orgCategoryLabel(data, key)}</option>)}</select></label>
        <label>Nouveau nom<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <button type="submit" disabled={!name.trim()}>Enregistrer le nom</button>
      </fieldset>
    </form>
    <div className="org-support-list">{(data.links || []).map((item) => {
      const target = targets.find((candidate) => candidate.kind === item.targetKind && candidate.key === item.targetKey && candidate.section === item.targetSection);
      return <div key={item.id}><span><strong>{orgCategoryLabel(data, item.sourceCategory)} → {target?.name || 'Cible indisponible'}</strong><small>{[item.label || 'En lien avec', target?.context].filter(Boolean).join(' · ')}</small></span><button type="button" aria-label={`Modifier le lien vers ${target?.name || 'la cible indisponible'}`} disabled={busy || previewMode} onClick={() => setLink({ ...item })}>Modifier le lien</button><button type="button" aria-label={`Supprimer le lien vers ${target?.name || 'la cible indisponible'}`} disabled={busy || previewMode} onClick={() => void perform(async () => { await deleteOrgLink(client, item.id); if (link.id === item.id) setLink(emptyLink()); }, 'Lien supprimé.')}>Supprimer le lien</button></div>;
    })}</div>
    <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await saveOrgLink(client, link); setLink(emptyLink()); }, 'Lien enregistré.'); }}>
      <fieldset disabled={busy || previewMode}><legend>{link.id ? 'Modifier un lien' : 'Ajouter un lien'}</legend>
        <label>Catégorie de départ<select value={link.sourceCategory} onChange={(event) => setLink({ ...link, sourceCategory: event.target.value as OrgCategory, targetKey: '', targetSection: '' })}>{categories.map((key) => <option key={key} value={key}>{orgCategoryLabel(data, key)}</option>)}</select></label>
        <label>Type de cible<select value={link.targetKind} onChange={(event) => setLink({ ...link, targetKind: event.target.value as OrgLink['targetKind'], targetKey: '', targetSection: '' })}><option value="category">Grande catégorie</option><option value="group">Groupe / bordée / fonction</option><option value="person">Personne / intervenant</option></select></label>
        <label>Cible du lien<select required value={value} onChange={(event) => { const target = choices.find((candidate) => orgTargetValue(candidate) === event.target.value); setLink({ ...link, targetKey: target?.key || '', targetSection: target?.section || '' }); }}><option value="">Choisir une cible</option>{value && !choices.some((target) => orgTargetValue(target) === value) && <option value={value} disabled>Cible indisponible — choisissez une autre cible</option>}{choices.map((target) => <option key={orgTargetValue(target)} value={orgTargetValue(target)}>{target.name}{target.context ? ` — ${target.context}` : ''}</option>)}</select></label>
        <label>Libellé du lien (facultatif)<input maxLength={100} placeholder="Ex. Assistance technique" value={link.label} onChange={(event) => setLink({ ...link, label: event.target.value })} /></label>
        <button type="submit" className="org-primary" disabled={!choices.some((target) => orgTargetValue(target) === value)}>{link.id ? 'Enregistrer le lien' : 'Ajouter le lien'}</button>
        <button type="button" onClick={() => setLink(emptyLink())}>Annuler le lien</button>
      </fieldset>
    </form>
    {previewMode && <p>La structure de démonstration est en lecture seule.</p>}{error && <p role="alert" className="org-error">{error}</p>}{status && <p role="status">{status}</p>}
  </section>;
}
