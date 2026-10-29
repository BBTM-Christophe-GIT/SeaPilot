import type { SupabaseClient } from '@supabase/supabase-js';
import { ExternalLink, FileText } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { createSeaOperationProjectDocumentUrl, fetchSeaOperationProjectDocuments, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';

interface SeaOperationProjectDocumentsProps {
  client: SupabaseClient;
  projectId: string;
  disabled?: boolean;
}

const message = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Impossible de consulter les documents du projet. Réessayez.';

/** Read-only project documents: access is checked again when opening each file. */
export function SeaOperationProjectDocuments({ client, projectId, disabled = false }: SeaOperationProjectDocumentsProps) {
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const context = useMemo(() => ({ client, projectId, attempt }), [client, projectId, attempt]);
  const currentContext = useRef(context);
  currentContext.current = context;
  const mounted = useRef(false);
  const accessRequest = useRef(0);
  const [catalog, setCatalog] = useState<{ context: typeof context; documents: SeaOperationProjectDocument[]; error: string } | null>(null);
  const [viewer, setViewer] = useState<{ context: typeof context; document: SeaOperationProjectDocument; url: string; error: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void fetchSeaOperationProjectDocuments(client, projectId).then((documents) => {
      if (active) setCatalog({ context, documents, error: '' });
    }).catch((error: unknown) => {
      if (active) setCatalog({ context, documents: [], error: message(error) });
    });
    return () => { active = false; };
  }, [client, context, projectId]);

  const currentCatalog = catalog?.context === context ? catalog : null;
  const currentViewer = viewer?.context === context ? viewer : null;

  async function openDocument(document: SeaOperationProjectDocument) {
    if (disabled || document.projectId !== projectId) return;
    const request = ++accessRequest.current;
    setViewer({ context, document, url: '', error: '' });
    try {
      const url = await createSeaOperationProjectDocumentUrl(client, projectId, document.id);
      if (mounted.current && currentContext.current === context && accessRequest.current === request) setViewer({ context, document, url, error: '' });
    } catch (error) {
      if (mounted.current && currentContext.current === context && accessRequest.current === request) setViewer({ context, document, url: '', error: message(error) });
    }
  }

  function closeViewer() {
    accessRequest.current += 1;
    setViewer(null);
  }

  if (!projectId) return null;
  const externalReader = Boolean(currentViewer?.url && new URL(currentViewer.url, window.location.href).hostname.endsWith('.sharepoint.com'));
  const isPdf = !externalReader && currentViewer?.document.mimeType === 'application/pdf';
  const isImage = Boolean(!externalReader && currentViewer && /^image\/(png|jpe?g|webp|gif|avif)$/i.test(currentViewer.document.mimeType));

  return <section aria-labelledby={titleId} className="so-project-documents">
    <header><FileText aria-hidden="true" size={17} /><h3 id={titleId}>Documents</h3>{currentCatalog && !currentCatalog.error ? <small>{currentCatalog.documents.length} document{currentCatalog.documents.length > 1 ? 's' : ''}</small> : null}</header>
    {!currentCatalog ? <p role="status">Chargement des documents du projet…</p> : currentCatalog.error ? <div role="alert"><p>{currentCatalog.error}</p><button className="sp-button sp-button--secondary" disabled={disabled} onClick={() => setAttempt((value) => value + 1)} type="button">Réessayer les documents</button></div> : currentCatalog.documents.length ? <ul>{currentCatalog.documents.map((document) => <li key={document.id}>
      <div><strong>{document.title || document.fileName}</strong><small>{[document.categoryLabel, document.subcategoryLabel, document.fileName].filter(Boolean).join(' · ')}</small></div>
      <button aria-label={`Ouvrir : ${document.title || document.fileName}`} className="sp-button sp-button--secondary" disabled={disabled} onClick={() => void openDocument(document)} type="button">Ouvrir</button>
    </li>)}</ul> : <p>Aucun document disponible pour ce projet.</p>}
    {currentViewer ? <div className="so-project-document-modal" onKeyDown={(event) => event.stopPropagation()}>
      <AppDialog title={currentViewer.document.title || currentViewer.document.fileName} eyebrow="Documents du projet" onClose={closeViewer} size="xl" footer={<div className="app-dialog__actions">{currentViewer.url ? <a className="sp-button sp-button--secondary" href={currentViewer.url} rel="noopener noreferrer" target="_blank"><ExternalLink aria-hidden="true" size={16} />Ouvrir dans un nouvel onglet</a> : null}<button className="sp-button sp-button--secondary" onClick={closeViewer} type="button">Fermer le document</button></div>}>
        <div className="so-project-document-viewer">
          {currentViewer.error ? <div role="alert"><p>{currentViewer.error}</p><button className="sp-button sp-button--secondary" disabled={disabled} onClick={() => void openDocument(currentViewer.document)} type="button">Réessayer l’ouverture</button></div> : !currentViewer.url ? <p role="status">Préparation de l’accès au document…</p> : isImage ? <img alt={currentViewer.document.title || currentViewer.document.fileName} src={currentViewer.url} /> : isPdf ? <iframe referrerPolicy="no-referrer" src={currentViewer.url} title={`Lecture : ${currentViewer.document.title || currentViewer.document.fileName}`} /> : <p>Ce format se consulte dans un nouvel onglet.</p>}
        </div>
      </AppDialog>
    </div> : null}
  </section>;
}
