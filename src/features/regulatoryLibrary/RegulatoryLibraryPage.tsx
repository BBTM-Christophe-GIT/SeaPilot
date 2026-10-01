import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Compass, ExternalLink, FileText, History, Link2, Pencil, Plus, Scale, Search, Ship } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { canManageRegulatoryLibrary, getRegulatoryReviewStatus, latestRegulatoryReview, validateRegulatoryTextDraft, REGULATORY_REFERENCE_TEXTS, regulatoryReviewDueAt, type RegulatoryCategory, type RegulatoryReview, type RegulatoryText, type RegulatoryTextDraft } from './regulatoryModel';
import { fetchRegulatoryLibrary, recordRegulatoryReview, saveRegulatoryText } from './regulatoryQueries';
import './regulatoryLibrary.css';

const CATEGORY_LABELS = { safety: 'Sécurité Maritime', transport: 'Code des Transports' };
const CATEGORY_MODULES = { safety: 'regulatorySafety', transport: 'regulatoryTransport' } as const;
const EMPTY_DRAFT: RegulatoryTextDraft = { title: '', url: '', category: 'safety' };
const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
function displayDate(value: string | Date) { const date = new Date(value); return Number.isFinite(date.getTime()) ? dateFormat.format(date) : 'Date à vérifier'; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : (error as { message?: string })?.message || 'L’enregistrement a échoué. Réessayez.'; }
function isPdf(text: RegulatoryText) { return new URL(text.url).pathname.toLowerCase().endsWith('.pdf'); }
function matchesSearch(text: RegulatoryText, query: string) { return `${text.title} ${CATEGORY_LABELS[text.category]}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').includes(query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')); }

export function RegulatoryLibraryPage({ category, client }: { category?: RegulatoryCategory; client?: SupabaseClient }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const previewMode = context?.previewMode || false;
  const roles = context?.roles || [];
  const canManage = canManageRegulatoryLibrary(roles);
  const accessibleCategories = (['safety', 'transport'] as const).filter((key) => !context?.visibleModules || context.visibleModules.some((module) => module.key === CATEGORY_MODULES[key]));
  const [library, setLibrary] = useState<{ texts: RegulatoryText[]; reviews: RegulatoryReview[] }>({ texts: [], reviews: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [now, setNow] = useState(() => new Date());
  const [editor, setEditor] = useState<{ id?: string; draft: RegulatoryTextDraft } | null>(null);
  const [reviewText, setReviewText] = useState<RegulatoryText | null>(null);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [updates, setUpdates] = useState('');
  const [historyText, setHistoryText] = useState<RegulatoryText | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    const request = previewMode ? Promise.resolve({ texts: REGULATORY_REFERENCE_TEXTS, reviews: [] }) : fetchRegulatoryLibrary(effectiveClient);
    void request.then((data) => { if (active) setLibrary(data); }).catch((caught) => { if (active) setLoadError(errorMessage(caught)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [effectiveClient, previewMode, reloadKey]);

  useEffect(() => { const interval = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(interval); }, []);
  const texts = library.texts.filter((text) => accessibleCategories.includes(text.category) && (!category || text.category === category)).sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'fr'));
  const alertCount = texts.filter((text) => getRegulatoryReviewStatus(latestRegulatoryReview(text.id, library.reviews, text.url), now) !== 'current').length;
  const visibleTexts = texts.filter((text) => matchesSearch(text, query.trim()) && (statusFilter !== 'due' || getRegulatoryReviewStatus(latestRegulatoryReview(text.id, library.reviews, text.url), now) !== 'current'));
  const documents = texts.filter((text) => !text.is_primary);
  const primarySource = texts.find((text) => text.is_primary);
  const selectedDocument = documents.find((text) => text.id === selectedDocumentId);
  const history = historyText ? library.reviews.filter((review) => review.text_id === historyText.id).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at)) : [];

  function openReview(text: RegulatoryText) { setError(''); setMessage(''); setHasUpdates(false); setUpdates(''); setReviewText(text); }
  function openEditor(text?: RegulatoryText) { setError(''); setMessage(''); setEditor(text ? { id: text.id, draft: { title: text.title, url: text.url, category: text.category, is_primary: text.is_primary, sort_order: text.sort_order } } : { draft: { ...EMPTY_DRAFT, category: category || accessibleCategories[0] || 'safety' } }); }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy || !canManage) return;
    setBusy(true); setError('');
    try {
      const draft = validateRegulatoryTextDraft(editor.draft);
      if (!draft.title) throw new Error('Renseignez le titre du texte.');
      const saved: RegulatoryText = previewMode ? { ...draft, id: editor.id || crypto.randomUUID(), is_primary: draft.is_primary || false, sort_order: draft.sort_order ?? 1000 } : await saveRegulatoryText(effectiveClient, draft, editor.id);
      setLibrary((value) => ({ ...value, texts: [...value.texts.filter((text) => text.id !== saved.id), saved].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'fr')) }));
      setQuery(''); setStatusFilter('all'); setEditor(null); setMessage(previewMode ? 'Lien ajouté à cette démonstration. Il ne sera pas enregistré en production.' : 'Lien enregistré dans la bibliothèque partagée.');
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!reviewText || busy || !canManage) return;
    setBusy(true); setError('');
    try {
      if (hasUpdates && !updates.trim()) throw new Error('Décrivez les mises à jour constatées.');
      const review: RegulatoryReview = previewMode ? { id: crypto.randomUUID(), text_id: reviewText.id, reviewed_at: new Date().toISOString(), reviewer_name: 'Démonstration', has_updates: hasUpdates, updates: hasUpdates ? updates.trim() : '' } : await recordRegulatoryReview(effectiveClient, reviewText.id, { has_updates: hasUpdates, updates: hasUpdates ? updates.trim() : '' });
      setLibrary((value) => ({ ...value, reviews: [review, ...value.reviews] })); setNow(new Date()); setReviewText(null);
      setMessage(previewMode ? 'Revue ajoutée à cette démonstration. Elle ne sera pas enregistrée en production.' : 'Revue enregistrée. La prochaine revue est prévue dans un mois.');
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  return <section className="reg-library">
    {category ? <Link className="reg-library__back" to="/modules/regulatoryLibrary"><ArrowLeft size={16} aria-hidden="true" /> Bibliothèque Réglementaire</Link> : null}
    <header className="reg-library__header">
      <div><h1>{category ? CATEGORY_LABELS[category] : 'Bibliothèque Réglementaire'}</h1><p>{category ? category === 'safety' ? 'Les références pour une navigation en toute sécurité.' : 'Le cadre juridique de vos activités maritimes.' : 'Vos textes de référence. Une veille bien tenue.'}</p></div>
      {canManage && !loading && !loadError && accessibleCategories.length ? <button className="reg-button reg-button--navy" type="button" onClick={() => openEditor()}><Plus size={19} aria-hidden="true" /> Ajouter un lien</button> : null}
    </header>
    {previewMode ? <p className="reg-library__preview">Démonstration · les ajouts et revues restent dans cette page.</p> : null}
    {message ? <p role="status" className="reg-library__success"><CheckCircle2 size={18} aria-hidden="true" />{message}</p> : null}
    {!category ? <>
      <div className="reg-library__banner"><div><h2>Le bon cap, c’est une revue chaque mois.</h2><p>Consultez les sources, notez les évolutions, gardez la trace.</p></div><div className="reg-library__motif" aria-hidden="true"><BookOpen /><Compass /></div></div>
      <nav className="reg-library__categories" aria-label="Rubriques réglementaires">
        {accessibleCategories.map((key) => { const Icon = key === 'safety' ? Ship : Scale; const count = library.texts.filter((text) => text.category === key).length; return <Link key={key} className={`reg-library__category reg-library__category--${key}`} to={`/modules/${CATEGORY_MODULES[key]}`}><span className="reg-library__category-icon"><Icon size={33} strokeWidth={1.7} aria-hidden="true" /></span><span><strong>{CATEGORY_LABELS[key]}</strong><span>{loading ? 'Chargement des textes…' : `${count} texte${count > 1 ? 's' : ''} de référence`}</span><span className="reg-library__category-cta">Consulter la rubrique <ArrowRight size={18} aria-hidden="true" /></span></span></Link>; })}
      </nav>
    </> : null}
    {loading ? <p className="reg-library__state" role="status">Chargement de la bibliothèque…</p> : loadError ? <div className="reg-library__state" role="alert"><p>{loadError}</p><button className="reg-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Réessayer</button></div> : <>
      {category ? <section className="reg-library__sources" aria-label="Sources réglementaires">
        {documents.length ? <><h2>Liens directs</h2><div className="reg-library__direct-links">{documents.map((text) => <article key={text.id}><FileText size={22} aria-hidden="true" /><div><a href={text.url} rel="noopener noreferrer" target="_blank" aria-label={`${text.title} (nouvel onglet)`}>{text.title}<ExternalLink size={14} aria-hidden="true" /></a>{isPdf(text) ? <button type="button" className="reg-library__text-button" aria-pressed={selectedDocumentId === text.id} onClick={() => setSelectedDocumentId(text.id)}>Lire le PDF dans SeaPilot</button> : null}</div></article>)}</div></> : null}
        {primarySource ? <div className={`reg-library__official reg-library__official--${category}`}><span className="reg-library__category-icon">{category === 'safety' ? <Ship size={30} aria-hidden="true" /> : <Scale size={30} aria-hidden="true" />}</span><div><h2>{primarySource.title}</h2><p>Consultez le texte sur le site officiel. Ce site autorise la consultation dans un nouvel onglet.</p><a href={primarySource.url} target="_blank" rel="noopener noreferrer" className="reg-button">Ouvrir le site officiel <ExternalLink size={16} aria-hidden="true" /></a></div></div> : null}
        {selectedDocument ? <div className="reg-library__reader"><div><h3>{selectedDocument.title}</h3><a href={selectedDocument.url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF <ExternalLink size={14} aria-hidden="true" /></a></div><iframe key={selectedDocument.id} src={selectedDocument.url} title={`Lecture : ${selectedDocument.title}`} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-downloads" /><p>Si le lecteur reste vide, ouvrez le PDF dans un nouvel onglet.</p></div> : null}
      </section> : null}
      <section className="reg-library__watch" aria-labelledby="reg-watch-title">
        <div className="reg-library__watch-header"><div><div className="reg-library__watch-title"><h2 id="reg-watch-title">Carnet de veille</h2><span className={alertCount ? 'reg-library__alert-count' : 'reg-library__current-count'} role="status">{alertCount ? <AlertCircle size={19} aria-hidden="true" /> : <CheckCircle2 size={19} aria-hidden="true" />}{alertCount ? `${alertCount} revue${alertCount > 1 ? 's' : ''} à réaliser` : 'Les revues sont à jour'}</span></div><p>Une alerte apparaît après un mois sans revue.</p></div><div className="reg-library__filters"><label className="reg-library__search"><Search size={18} aria-hidden="true" /><input aria-label="Rechercher un texte" placeholder="Rechercher un texte…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filtrer les revues" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tous les textes</option><option value="due">Revues à réaliser</option></select></div></div>
        <div className="reg-library__table-scroll"><table className="reg-library__table"><caption className="reg-library__sr-only">Suivi des revues des textes réglementaires</caption><thead><tr><th scope="col">Texte de référence</th><th scope="col">Dernière revue</th><th scope="col">Mises à jour</th><th scope="col">État</th><th scope="col">Actions</th></tr></thead><tbody>{visibleTexts.map((text) => {
          const review = latestRegulatoryReview(text.id, library.reviews, text.url); const status = getRegulatoryReviewStatus(review, now); const dueAt = review ? regulatoryReviewDueAt(review.reviewed_at) : null;
          return <tr key={text.id}><td><div className="reg-library__text"><FileText size={22} aria-hidden="true" /><div><a href={text.url} rel="noopener noreferrer" target="_blank" aria-label={`${text.title} (nouvel onglet)`}>{text.title}<ExternalLink size={12} aria-hidden="true" /></a><small>{CATEGORY_LABELS[text.category]}</small></div></div></td><td>{review ? <><time dateTime={review.reviewed_at}>{displayDate(review.reviewed_at)}</time><small>{review.reviewer_name}</small><small>{dueAt ? `À renouveler le ${displayDate(dueAt)}` : 'Date à vérifier'}</small></> : 'À réaliser'}</td><td><p className="reg-library__update-summary">{review ? review.has_updates ? review.updates : 'Aucune mise à jour constatée' : 'Aucune revue enregistrée'}</p>{library.reviews.some((item) => item.text_id === text.id) ? <button className="reg-library__text-button" type="button" onClick={() => setHistoryText(text)}><History size={14} aria-hidden="true" /> Historique ({library.reviews.filter((item) => item.text_id === text.id).length})</button> : null}</td><td><span className={`reg-library__status reg-library__status--${status}`}><span aria-hidden="true" />{status === 'current' ? 'À jour' : status === 'overdue' ? 'En retard' : status === 'invalid' ? 'À vérifier' : 'À revoir'}</span></td><td><div className="reg-library__row-actions">{canManage ? <button className="reg-button reg-button--review" type="button" onClick={() => openReview(text)} aria-label={`Faire la revue de ${text.title}`}><ClipboardCheck size={16} aria-hidden="true" />Faire la revue</button> : <a className="reg-library__text-button" href={text.url} target="_blank" rel="noopener noreferrer">Consulter <ExternalLink size={14} aria-hidden="true" /></a>}{canManage && !text.is_primary ? <button className="reg-library__edit" type="button" aria-label={`Modifier le lien ${text.title}`} onClick={() => openEditor(text)}><Pencil size={15} aria-hidden="true" /></button> : null}</div></td></tr>;
        })}{visibleTexts.length === 0 ? <tr><td colSpan={5} className="reg-library__empty">{texts.length ? 'Aucun texte ne correspond à votre recherche.' : 'Aucun texte disponible dans cette rubrique.'}</td></tr> : null}</tbody></table></div>
      </section>
    </>}
    {editor ? <AppDialog title={editor.id ? 'Modifier le lien' : 'Ajouter un lien'} icon={<Link2 size={21} />} isBusy={busy} onClose={() => setEditor(null)} onSubmit={submitLink} footer={<div className="app-dialog__actions"><button type="button" disabled={busy} onClick={() => setEditor(null)}>Annuler</button><button type="submit" disabled={busy} className="is-primary">{busy ? 'Enregistrement…' : 'Enregistrer le lien'}</button></div>}><div className="reg-library__form"><label>Titre du texte<input required maxLength={240} value={editor.draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} placeholder="Ex. Nouvelle division réglementaire" /></label><label>Adresse du lien<input required type="url" maxLength={8000} value={editor.draft.url} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, url: event.target.value } })} placeholder="https://…" /></label><label>Rubrique<select value={editor.draft.category} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, category: event.target.value as RegulatoryCategory } })}>{accessibleCategories.map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label><p>Ce lien sera suivi dans le carnet de veille, avec une revue à réaliser chaque mois.</p>{error ? <p role="alert" className="reg-library__error">{error}</p> : null}</div></AppDialog> : null}
    {reviewText ? <AppDialog title="Faire la revue" icon={<ClipboardCheck size={21} />} isBusy={busy} onClose={() => setReviewText(null)} onSubmit={submitReview} footer={<div className="app-dialog__actions"><button type="button" disabled={busy} onClick={() => setReviewText(null)}>Annuler</button><button type="submit" disabled={busy} className="is-primary">{busy ? 'Enregistrement…' : 'Valider la revue'}</button></div>}><div className="reg-library__form"><h3>{reviewText.title}</h3><a className="reg-library__text-button" href={reviewText.url} target="_blank" rel="noopener noreferrer">Consulter la source avant la revue <ExternalLink size={16} aria-hidden="true" /></a><fieldset><legend>Résultat de votre vérification</legend><label className="reg-library__radio"><input type="radio" name="review-result" checked={!hasUpdates} onChange={() => setHasUpdates(false)} />Aucune mise à jour constatée</label><label className="reg-library__radio"><input type="radio" name="review-result" checked={hasUpdates} onChange={() => setHasUpdates(true)} />Des mises à jour ont été constatées</label></fieldset>{hasUpdates ? <label>Mises à jour constatées<textarea required maxLength={10000} rows={5} value={updates} onChange={(event) => setUpdates(event.target.value)} placeholder="Listez les évolutions, les articles concernés et les actions à prévoir…" /></label> : null}<p>La date et l’auteur sont enregistrés lors de la validation. Les revues précédentes restent dans l’historique.</p>{error ? <p role="alert" className="reg-library__error">{error}</p> : null}</div></AppDialog> : null}
    {historyText ? <AppDialog title="Historique des revues" icon={<History size={21} />} onClose={() => setHistoryText(null)} size="lg"><h3 className="reg-library__history-title">{historyText.title}</h3><ol className="reg-library__history">{history.map((review) => <li key={review.id}><div><strong>{displayDate(review.reviewed_at)}</strong><span>{review.reviewer_name}</span></div><a className="reg-library__text-button" href={review.url_snapshot || historyText.url} target="_blank" rel="noopener noreferrer">{review.title_snapshot || historyText.title}<ExternalLink size={14} aria-hidden="true" /></a><span className={`reg-library__history-result${review.has_updates ? ' has-updates' : ''}`}>{review.has_updates ? 'Mises à jour constatées' : 'Aucune mise à jour constatée'}</span>{review.has_updates ? <p>{review.updates}</p> : null}</li>)}</ol></AppDialog> : null}
  </section>;
}
