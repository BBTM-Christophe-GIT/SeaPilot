import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink, FolderOpen, Link2, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { deleteDirectoryItem, directoryError, faviconSources, fetchLinksDirectory, saveLinkCategory, saveUsefulLink, searchText, type LinkDraft, type LinksDirectory } from './usefulLinks';
import './usefulLinks.css';

function SiteIcon({ url, title }: { url: string; title: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const source = faviconSources(url)[sourceIndex];
  return <span className="useful-links__icon" aria-hidden="true">
    {!loaded ? <span>{title.slice(0, 2).toLocaleUpperCase('fr')}</span> : null}
    {source ? <img src={source} alt="" width="28" height="28" loading="lazy" style={{ opacity: loaded ? 1 : 0 }} referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setSourceIndex((index) => index + 1); }} /> : null}
  </span>;
}

export function UsefulLinksPage({ client }: { client?: SupabaseClient }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const [directory, setDirectory] = useState<LinksDirectory>({ links: [], categories: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [editor, setEditor] = useState<{ id?: string; draft: LinkDraft } | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryEditor, setCategoryEditor] = useState({ id: '', name: '' });
  const [deletion, setDeletion] = useState<{ type: 'link' | 'category'; id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    fetchLinksDirectory(effectiveClient).then((value) => { if (active) setDirectory(value); })
      .catch((caught: unknown) => { if (active) setLoadError(directoryError(caught)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [effectiveClient, reloadKey]);

  const { links, categories, canManage } = directory;
  const groups = [...categories, { id: 'uncategorized', name: 'Sans catégorie' }];
  const needle = searchText(query.trim());
  const visibleLinks = links.filter((link) => (category === 'all' || (link.category_id || 'uncategorized') === category)
    && searchText(`${link.title} ${categories.find((item) => item.id === link.category_id)?.name || ''}`).includes(needle));

  function clearFeedback() { setError(''); setMessage(''); }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy || !canManage) return;
    setBusy(true); setError('');
    try {
      const saved = await saveUsefulLink(effectiveClient, editor.draft, editor.id);
      setDirectory((value) => ({ ...value, links: [...value.links.filter((link) => link.id !== saved.id), saved].sort((a, b) => a.title.localeCompare(b.title, 'fr')) }));
      setCategory('all'); setQuery(''); setEditor(null); setMessage('Lien enregistré.');
    } catch (caught) { setError(directoryError(caught)); } finally { setBusy(false); }
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    if (busy || !canManage) return;
    setBusy(true); setError('');
    try {
      const saved = await saveLinkCategory(effectiveClient, categoryEditor.name, categoryEditor.id || undefined);
      setDirectory((value) => ({ ...value, categories: [...value.categories.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
      setCategoryEditor({ id: '', name: '' }); setMessage('Catégorie enregistrée.');
    } catch (caught) { setError(directoryError(caught)); } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deletion || busy || !canManage) return;
    setBusy(true); setError('');
    try {
      await deleteDirectoryItem(effectiveClient, deletion.type, deletion.id);
      setDirectory((value) => deletion.type === 'link'
        ? { ...value, links: value.links.filter((link) => link.id !== deletion.id) }
        : { ...value, categories: value.categories.filter((item) => item.id !== deletion.id), links: value.links.map((link) => link.category_id === deletion.id ? { ...link, category_id: null } : link) });
      if (category === deletion.id) setCategory('all');
      if (categoryEditor.id === deletion.id) setCategoryEditor({ id: '', name: '' });
      setDeletion(null); setMessage(deletion.type === 'link' ? 'Lien supprimé.' : 'Catégorie supprimée. Ses liens sont conservés sans catégorie.');
    } catch (caught) { setError(directoryError(caught)); } finally { setBusy(false); }
  }

  return <section className="useful-links">
    <header className="useful-links__header">
      <div><p className="module-family">Votre répertoire partagé</p><h1><Link2 aria-hidden="true" /> Liens utiles</h1><p>Vos portails et outils du quotidien, réunis au même endroit.</p></div>
      {canManage && !loading && !loadError ? <div className="useful-links__actions">
        <button type="button" className="is-secondary" onClick={() => { clearFeedback(); setCategoriesOpen(true); }}><Tags size={17} /> Catégories</button>
        <button type="button" className="is-primary" onClick={() => { clearFeedback(); setEditor({ draft: { title: '', url: '', category_id: categories.some((item) => item.id === category) ? category : null } }); }}><Plus size={17} /> Ajouter un lien</button>
      </div> : null}
    </header>
    {message && !categoriesOpen ? <p role="status" className="useful-links__success">{message}</p> : null}
    {loading ? <p role="status" className="admin-state">Chargement des liens utiles…</p> : loadError ? <div role="alert" className="admin-state"><p>{loadError}</p><button onClick={() => setReloadKey((key) => key + 1)}>Réessayer</button></div> : <>
      <div className="useful-links__toolbar">
        <label className="useful-links__search"><Search size={18} aria-hidden="true" /><input aria-label="Rechercher un lien" placeholder="Rechercher un lien ou une catégorie…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <span>{visibleLinks.length} lien{visibleLinks.length > 1 ? 's' : ''}</span>
      </div>
      <nav className="useful-links__filters" aria-label="Filtrer par catégorie">
        {[{ id: 'all', name: 'Tous les liens' }, ...groups.filter((group) => group.id !== 'uncategorized' || links.some((link) => !link.category_id))].map((group) => <button key={group.id} type="button" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.name}<span>{group.id === 'all' ? links.length : links.filter((link) => (link.category_id || 'uncategorized') === group.id).length}</span></button>)}
      </nav>
      {visibleLinks.length === 0 ? <div className="useful-links__empty"><FolderOpen size={34} aria-hidden="true" /><h2>{links.length ? 'Aucun lien trouvé' : 'Votre répertoire est prêt'}</h2><p>{links.length ? 'Essayez une autre recherche ou une autre catégorie.' : 'Ajoutez votre premier lien pour le retrouver ici.'}</p></div> : groups.map((group) => {
        const items = visibleLinks.filter((link) => (link.category_id || 'uncategorized') === group.id);
        return items.length ? <section className="useful-links__group" key={group.id} aria-label={group.name}>
          <h2>{group.name}<span>{items.length}</span></h2>
          <div className="useful-links__grid">{items.map((link) => <article key={link.id} className="useful-links__card">
            <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`${link.title} (nouvel onglet)`}>
              <SiteIcon key={link.url} url={link.url} title={link.title} /><strong>{link.title}</strong><ExternalLink size={16} aria-hidden="true" />
            </a>
            {canManage ? <div className="useful-links__card-actions">
              <button type="button" aria-label={`Modifier ${link.title}`} onClick={() => { clearFeedback(); setEditor({ id: link.id, draft: { title: link.title, url: link.url, category_id: link.category_id } }); }}><Pencil size={15} /></button>
              <button type="button" aria-label={`Supprimer ${link.title}`} onClick={() => { clearFeedback(); setDeletion({ type: 'link', id: link.id, title: link.title }); }}><Trash2 size={15} /></button>
            </div> : null}
          </article>)}</div>
        </section> : null;
      })}
    </>}
    {editor ? <AppDialog title={editor.id ? 'Modifier le lien' : 'Ajouter un lien'} icon={<Link2 size={20} />} isBusy={busy} onClose={() => setEditor(null)} onSubmit={submitLink} footer={<div className="app-dialog__actions"><button type="button" disabled={busy} onClick={() => setEditor(null)}>Annuler</button><button className="is-primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
      <div className="useful-links__form">
        <label>Titre<input required maxLength={120} value={editor.draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} placeholder="Ex. Portail fournisseurs" /></label>
        <label>Adresse du lien<input required type="url" maxLength={8000} value={editor.draft.url} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, url: event.target.value } })} placeholder="https://…" /></label>
        <label>Catégorie<select value={editor.draft.category_id || ''} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, category_id: event.target.value || null } })}><option value="">Sans catégorie</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <p className="useful-links__hint">L’icône du site s’affiche automatiquement. Seul le titre apparaît dans le répertoire.</p>
        {error ? <p role="alert" className="useful-links__error">{error}</p> : null}
      </div>
    </AppDialog> : null}
    {categoriesOpen && !deletion ? <AppDialog title="Gérer les catégories" icon={<Tags size={20} />} isBusy={busy} onClose={() => { setCategoriesOpen(false); setCategoryEditor({ id: '', name: '' }); }}>
      <form className="useful-links__form" onSubmit={submitCategory}>
        <label>Nom de la catégorie<input required maxLength={80} value={categoryEditor.name} onChange={(event) => setCategoryEditor({ ...categoryEditor, name: event.target.value })} /></label>
        <div className="useful-links__actions"><button className="is-primary" disabled={busy} type="submit">{categoryEditor.id ? 'Enregistrer la catégorie' : 'Ajouter la catégorie'}</button>{categoryEditor.id ? <button type="button" disabled={busy} onClick={() => setCategoryEditor({ id: '', name: '' })}>Annuler</button> : null}</div>
      </form>
      {error ? <p role="alert" className="useful-links__error">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
      <ul className="useful-links__category-list">{categories.map((item) => <li key={item.id}><span>{item.name}</span><button type="button" disabled={busy} aria-label={`Renommer ${item.name}`} onClick={() => { clearFeedback(); setCategoryEditor(item); }}><Pencil size={16} /></button><button type="button" disabled={busy} aria-label={`Supprimer la catégorie ${item.name}`} onClick={() => { clearFeedback(); setDeletion({ type: 'category', id: item.id, title: item.name }); }}><Trash2 size={16} /></button></li>)}</ul>
    </AppDialog> : null}
    {deletion ? <AppDialog title={deletion.type === 'link' ? 'Supprimer le lien ?' : 'Supprimer la catégorie ?'} size="sm" isBusy={busy} onClose={() => { setDeletion(null); setError(''); }} footer={<div className="app-dialog__actions"><button type="button" disabled={busy} onClick={() => { setDeletion(null); setError(''); }}>Annuler</button><button type="button" disabled={busy} className="is-danger" onClick={() => void confirmDelete()}>{busy ? 'Suppression…' : 'Confirmer la suppression'}</button></div>}>
      <p><strong>{deletion.title}</strong></p><p>{deletion.type === 'category' ? 'Les liens de cette catégorie seront conservés dans « Sans catégorie ».' : 'Ce lien sera retiré du répertoire partagé pour tous les profils.'}</p>{error ? <p role="alert" className="useful-links__error">{error}</p> : null}
    </AppDialog> : null}
  </section>;
}
