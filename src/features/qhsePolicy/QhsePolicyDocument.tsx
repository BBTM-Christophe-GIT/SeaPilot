import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, FileText, Maximize2, Pencil, RefreshCw, Search } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { fetchPublishedProcedures, type PublishedProcedureRecord } from '../procedures/procedureQueries';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { saveQhsePolicySettings } from './qhsePolicyQueries';
import { readQhsePolicyPublication } from './qhsePolicyFiles';
import { policyDriveUrls, policyPublications, policyPublicationLabel, resolvePolicyPublication, QHSE_POLICY_DOCUMENT_TITLE } from './qhsePolicyDocumentModel';
import './qhsePolicyDocument.css';

const QhsePolicyPdfReader = lazy(() => import('./QhsePolicyPdfReader'));
interface Props { client: SupabaseClient; canEdit: boolean; settings: QhsePolicySnapshot['settings']; onSaved: () => void | Promise<void> }
interface DocumentSource { client: SupabaseClient; key: string; url: string; external: boolean; title: string; error: string }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Le document ne peut pas être chargé. Réessayez.'; }

export function QhsePolicyDocument({ client, canEdit, settings, onSaved }: Props) {
  const [loaded, setLoaded] = useState<{ client: SupabaseClient; records: PublishedProcedureRecord[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState<DocumentSource | null>(null);
  const [reader, setReader] = useState<DocumentSource | null>(null);
  const [editor, setEditor] = useState<{ client: SupabaseClient; revision: number | null } | null>(null);
  const [choice, setChoice] = useState('auto');
  const [search, setSearch] = useState('');
  const [savingClient, setSavingClient] = useState<SupabaseClient | null>(null);
  const [saveError, setSaveError] = useState('');
  const scope = useRef(client);
  useEffect(() => { scope.current = client; }, [client]);
  useEffect(() => {
    let active = true;
    void fetchPublishedProcedures(client).then((records) => {
      if (active) setLoaded({ client, records: policyPublications(records, false), error: '' });
    }).catch((error: unknown) => { if (active) setLoaded({ client, records: [], error: errorMessage(error) }); });
    return () => { active = false; };
  }, [client, attempt]);
  const current = loaded?.client === client ? loaded : null;
  const records = current?.records || [];
  const externalUrl = settings?.documentUrl ? policyDriveUrls(settings.documentUrl)?.preview ?? '' : '';
  const publication = externalUrl ? undefined : resolvePolicyPublication(records, settings?.publicationId ?? null);
  const sourceKey = `${externalUrl || String(publication?.id ?? 'none')}|${attempt}`;
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const controller = new AbortController();
    if (externalUrl) {
      void Promise.resolve().then(() => { if (active) setSource({ client, key: sourceKey, url: externalUrl, external: true, title: 'Politique QHSE', error: '' }); });
    } else if (publication) {
      void readQhsePolicyPublication(client, publication, controller.signal).then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource({ client, key: sourceKey, url: objectUrl, external: false, title: policyPublicationLabel(publication), error: '' });
      }).catch((error: unknown) => {
        if (active) setSource({ client, key: sourceKey, url: '', external: false, title: policyPublicationLabel(publication), error: errorMessage(error) });
      });
    }
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, publication, externalUrl, sourceKey, attempt]);
  const document = source?.client === client && source.key === sourceKey ? source : null;
  const editing = editor?.client === client && canEdit;
  const saving = savingClient === client;
  const selectedAvailable = choice === 'auto' ? Boolean(policyPublications(records).length) : records.some((record) => String(record.id) === choice);
  const matchingRecords = records.filter((record) => `${policyPublicationLabel(record)} ${record.fileName} ${record.ismChapter}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')));

  function startEditing() {
    setChoice(settings?.publicationId != null ? String(settings.publicationId) : 'auto');
    setSearch(''); setSaveError(''); setEditor({ client, revision: settings?.revision ?? null });
  }
  async function save() {
    if (!canEdit || saving || !editing || !selectedAvailable) return;
    const operationClient = client;
    setSavingClient(client); setSaveError('');
    try {
      await saveQhsePolicySettings(client, { publicationId: choice === 'auto' ? null : Number(choice), documentUrl: '', expectedRevision: editor?.revision ?? null });
      if (scope.current === operationClient) { setEditor(null); setReader(null); await onSaved(); }
    } catch (error) { if (scope.current === operationClient) setSaveError(errorMessage(error)); }
    finally { if (scope.current === operationClient) setSavingClient(null); }
  }
  function open() { if (document?.url && !document.error) setReader(document); }

  return <section className="qhse-policy-document" aria-label="Politique de sécurité et de protection de l’environnement">
    {publication || externalUrl ? <button type="button" className="qhse-policy-document__preview" onClick={open} disabled={!document?.url || Boolean(document.error)} aria-label="Agrandir l’aperçu de la politique">
      {document?.url ? document.external ? <span><FileText size={42} aria-hidden="true" />PDF de référence</span> : <Suspense fallback={<span>Chargement de l’aperçu…</span>}><QhsePolicyPdfReader url={document.url} title={document.title} compact /></Suspense> : <span>{document?.error ? 'Aperçu indisponible' : 'Chargement de l’aperçu…'}</span>}
      <span className="qhse-policy-document__zoom"><Maximize2 size={13} aria-hidden="true" />Agrandir</span>
    </button> : null}
    <div className="qhse-policy-document__identity"><div><h2>{QHSE_POLICY_DOCUMENT_TITLE}</h2>
      <p>{publication ? policyPublicationLabel(publication) : externalUrl ? 'Document PDF de référence' : current ? 'Aucune version PDF publiée pour ce chapitre.' : 'Chargement du document…'}</p>
      <div className="qhse-policy-document__actions"><button className="qhse-policy-button is-primary" disabled={!document?.url || Boolean(document.error)} onClick={open} type="button"><BookOpen aria-hidden="true" size={17} />Lire la politique</button>
        {canEdit ? <button className="qhse-policy-button is-secondary" disabled={saving || !current || Boolean(current.error)} onClick={startEditing} type="button"><Pencil aria-hidden="true" size={15} />Modifier la politique</button> : null}
      </div>
    </div></div>
    {current?.error || document?.error ? <div role="alert" className="qhse-policy-document__error">{current?.error || document?.error} <button onClick={() => setAttempt((value) => value + 1)} type="button"><RefreshCw size={14} />Réessayer</button></div> : null}
    {settings?.publicationId != null && current && !publication ? <p role="alert">La version sélectionnée n’est plus publiée ou accessible. {canEdit ? 'Sélectionnez une autre version.' : 'Contactez Administration ou Direction.'}</p> : null}
    {editing ? <AppDialog title="Modifier la politique" onClose={() => setEditor(null)} isBusy={saving} size="lg" description="Sélectionnez le PDF publié à afficher comme politique QHSE."
      onSubmit={(event) => { event.preventDefault(); void save(); }}
      footer={<><button className="qhse-policy-button" disabled={saving} onClick={() => setEditor(null)} type="button">Annuler</button><button className="qhse-policy-button is-primary" disabled={saving || !selectedAvailable} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
      <div className="qhse-policy-document__form"><label className="qhse-policy-document__search"><span><Search size={15} aria-hidden="true" />Rechercher un fichier PDF</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} disabled={saving} /></label>
        <fieldset disabled={saving} className="qhse-policy-document__choices"><legend>Fichiers PDF publiés</legend>
          <label className="qhse-policy-document__choice"><input type="radio" name="policy-file" value="auto" checked={choice === 'auto'} onChange={() => setChoice('auto')} disabled={!policyPublications(records).length} /><span>Dernière version PDF publiée du chapitre 02<small>La sélection suit les nouvelles publications de ce chapitre.</small></span></label>
          {matchingRecords.map((record) => <label className="qhse-policy-document__choice" key={record.id}><input type="radio" name="policy-file" value={record.id} checked={choice === String(record.id)} onChange={() => setChoice(String(record.id))} /><FileText size={19} aria-hidden="true" /><span>{policyPublicationLabel(record)}<small>{record.fileName}{record.publishedOn ? ` · ${record.publishedOn}` : ''}</small></span></label>)}
          {!matchingRecords.length ? <p>Aucun fichier PDF ne correspond à cette recherche.</p> : null}
        </fieldset><Link to="/modules/procedures">Gérer les sources et publier une nouvelle version</Link>{saveError ? <p role="alert">{saveError}</p> : null}
      </div>
    </AppDialog> : null}
    {reader?.client === client && reader.key === sourceKey ? <AppDialog title="Politique QHSE" description={reader.title} size="fullscreen" variant="preview" onClose={() => setReader(null)}
      footer={<><a className="qhse-policy-button" href={reader.external ? settings?.documentUrl : reader.url} rel="noopener noreferrer" target="_blank">Ouvrir le PDF dans un onglet</a><button className="qhse-policy-button" onClick={() => setReader(null)} type="button">Fermer</button></>}>
      {reader.external ? <iframe className="qhse-policy-document__reader" title={QHSE_POLICY_DOCUMENT_TITLE} src={reader.url} referrerPolicy="no-referrer" /> : <Suspense fallback={<p role="status">Chargement du lecteur PDF…</p>}><QhsePolicyPdfReader url={reader.url} title={reader.title} /></Suspense>}
    </AppDialog> : null}
  </section>;
}
