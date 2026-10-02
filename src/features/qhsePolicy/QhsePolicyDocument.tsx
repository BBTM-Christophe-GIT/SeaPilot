import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, FileText, Pencil, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { fetchPublishedProcedures, getProcedureFileUrl, type PublishedProcedureRecord } from '../procedures/procedureQueries';
import { createProcedureFileStore } from '../procedures/procedureDriveFiles';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { saveQhsePolicySettings } from './qhsePolicyQueries';
import { policyDriveUrls, policyPublications, policyPublicationLabel, QHSE_POLICY_DOCUMENT_TITLE } from './qhsePolicyDocumentModel';
import './qhsePolicyDocument.css';

const QhsePolicyPdfReader = lazy(() => import('./QhsePolicyPdfReader'));

interface Props {
  client: SupabaseClient;
  canEdit: boolean;
  settings: QhsePolicySnapshot['settings'];
  onSaved: () => void | Promise<void>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Le document ne peut pas être chargé. Réessayez.';
}

export function QhsePolicyDocument({ client, canEdit, settings, onSaved }: Props) {
  const [loaded, setLoaded] = useState<{ client: SupabaseClient; records: PublishedProcedureRecord[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ client: SupabaseClient; revision: number | null } | null>(null);
  const [choice, setChoice] = useState('auto');
  const [driveUrl, setDriveUrl] = useState('');
  const [savingClient, setSavingClient] = useState<SupabaseClient | null>(null);
  const [saveError, setSaveError] = useState('');
  const [reader, setReader] = useState<{ client: SupabaseClient; url: string; openUrl: string; isBlob: boolean; external: boolean; title: string } | null>(null);
  const [openingClient, setOpeningClient] = useState<SupabaseClient | null>(null);
  const [openError, setOpenError] = useState('');
  const scope = useRef(client);
  const request = useRef(0);
  useEffect(() => {
    scope.current = client;
    return () => { request.current += 1; };
  }, [client]);
  useEffect(() => {
    let active = true;
    void fetchPublishedProcedures(client).then((records) => {
      if (active) setLoaded({ client, records: policyPublications(records), error: '' });
    }).catch((error: unknown) => {
      if (active) setLoaded({ client, records: [], error: errorMessage(error) });
    });
    return () => { active = false; };
  }, [client, attempt]);
  useEffect(() => () => { if (reader?.isBlob) URL.revokeObjectURL(reader.url); }, [reader]);

  const current = loaded?.client === client ? loaded : null;
  const editing = editor?.client === client;
  const saving = savingClient === client;
  const opening = openingClient === client;
  const records = current?.records || [];
  const external = settings?.documentUrl ? policyDriveUrls(settings.documentUrl) : null;
  const publication = settings?.publicationId != null
    ? records.find((record) => record.id === settings.publicationId)
    : !external ? records[0] : undefined;
  const available = Boolean(external || publication);

  function startEditing() {
    setChoice(settings?.documentUrl ? 'drive' : settings?.publicationId != null ? String(settings.publicationId) : 'auto');
    setDriveUrl(settings?.documentUrl || '');
    setSaveError('');
    setEditor({ client, revision: settings?.revision ?? null });
  }

  async function save() {
    if (!canEdit || saving || !editing) return;
    const normalized = choice === 'drive' ? policyDriveUrls(driveUrl) : null;
    if (choice === 'drive' && !normalized) { setSaveError('Saisissez le lien Google Drive du PDF à afficher.'); return; }
    const operationClient = client;
    setSavingClient(client);
    setSaveError('');
    try {
      await saveQhsePolicySettings(client, {
        publicationId: choice !== 'auto' && choice !== 'drive' ? Number(choice) : null,
        documentUrl: normalized?.open || '',
        expectedRevision: editor?.revision ?? null,
      });
      if (scope.current === operationClient) {
        setEditor(null);
        await onSaved();
      }
    } catch (error) {
      if (scope.current === operationClient) setSaveError(errorMessage(error));
    } finally { if (scope.current === operationClient) setSavingClient(null); }
  }

  async function open() {
    if (opening || !available) return;
    const operation = ++request.current;
    setOpeningClient(client);
    setOpenError('');
    try {
      let url = external?.preview || '';
      let openUrl = external?.open || '';
      let isBlob = false;
      if (publication) {
        if (publication.googleDrivePath) {
          const blob = await createProcedureFileStore(client).read(publication);
          url = URL.createObjectURL(blob);
          isBlob = true;
        } else { url = await getProcedureFileUrl(client, publication, 'open'); }
        openUrl = url;
      }
      if (scope.current !== client || operation !== request.current) {
        if (isBlob) URL.revokeObjectURL(url);
        return;
      }
      setReader({ client, url, openUrl, isBlob, external: Boolean(external), title: publication?.title || 'Politique QHSE' });
    } catch (error) {
      if (scope.current === client && operation === request.current) setOpenError(errorMessage(error));
    } finally { if (scope.current === client && operation === request.current) setOpeningClient(null); }
  }

  return <section className="qhse-policy-document" aria-label="Politique de sécurité et de protection de l’environnement">
    <div className="qhse-policy-document__identity">
      <span className="qhse-policy-document__icon"><FileText aria-hidden="true" size={24} /></span>
      <div><h2>{QHSE_POLICY_DOCUMENT_TITLE}</h2>
        <p>{publication ? policyPublicationLabel(publication) : external ? 'Document PDF de référence' : current ? 'Aucune version PDF publiée pour ce chapitre.' : 'Chargement du document…'}</p>
      </div>
    </div>
    <div className="qhse-policy-document__actions">
      <button className="qhse-policy-button is-primary" disabled={!available || opening} onClick={() => void open()} type="button"><BookOpen aria-hidden="true" size={17} />{opening ? 'Ouverture…' : 'Lire la politique'}</button>
      {canEdit ? <button className="qhse-policy-button is-secondary" disabled={saving || !current || Boolean(current.error)} onClick={startEditing} type="button"><Pencil aria-hidden="true" size={15} />Modifier la politique</button> : null}
    </div>
    {current?.error ? <div role="alert" className="qhse-policy-document__error">{current.error} <button onClick={() => setAttempt((value) => value + 1)} type="button"><RefreshCw size={14} />Réessayer</button></div> : null}
    {settings?.publicationId != null && current && !publication ? <p role="alert">La version sélectionnée n’est plus publiée ou accessible. {canEdit ? 'Sélectionnez une autre version.' : 'Contactez Administration ou Direction.'}</p> : null}
    {openError ? <p role="alert" className="qhse-policy-document__error">{openError}</p> : null}
    {editing && canEdit ? <AppDialog title="Modifier la politique" onClose={() => setEditor(null)} isBusy={saving}
      description="Choisissez la version PDF du chapitre 02 consultable par les collaborateurs."
      onSubmit={(event) => { event.preventDefault(); void save(); }}
      footer={<><button className="qhse-policy-button" disabled={saving} onClick={() => setEditor(null)} type="button">Annuler</button><button className="qhse-policy-button is-primary" disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></>}>
      <div className="qhse-policy-document__form">
        <label>Version à afficher<select value={choice} onChange={(event) => setChoice(event.target.value)} disabled={saving}>
          <option value="auto">Dernière version PDF publiée du chapitre 02</option>
          {records.map((record) => <option key={record.id} value={record.id}>{policyPublicationLabel(record)}</option>)}
          <option value="drive">Un document PDF sur Google Drive</option>
        </select></label>
        {choice === 'drive' ? <label>Lien Google Drive du PDF<input type="url" maxLength={500} required value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} disabled={saving} /><small>Le PDF conserve ses autorisations Google Drive.</small></label> : null}
        <Link to="/modules/procedures">Gérer les sources et publier une nouvelle version</Link>
        {saveError ? <p role="alert">{saveError}</p> : null}
      </div>
    </AppDialog> : null}
    {reader?.client === client ? <AppDialog title="Politique QHSE" description={reader.title} size="fullscreen" variant="preview" onClose={() => setReader(null)}
      footer={<><a className="qhse-policy-button" href={reader.openUrl} rel="noopener noreferrer" target="_blank">Ouvrir le PDF dans un onglet</a><button className="qhse-policy-button" onClick={() => setReader(null)} type="button">Fermer</button></>}>
      {reader.external ? <iframe className="qhse-policy-document__reader" title={QHSE_POLICY_DOCUMENT_TITLE} src={reader.url} referrerPolicy="no-referrer" /> :
        <Suspense fallback={<p role="status">Chargement du lecteur PDF…</p>}><QhsePolicyPdfReader url={reader.url} title={reader.title} /></Suspense>}
    </AppDialog> : null}
  </section>;
}
