import type { SupabaseClient } from '@supabase/supabase-js';
import { Files } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { fetchProjectSeaOperationDocuments, saveProjectSeaOperationDocuments, type ProjectSeaOperationDocumentSelection } from './projectSeaOperationDocumentsQueries';
import './ProjectSeaOperationDocuments.css';

interface Props {
  accessKey: string;
  archived: boolean;
  canManage: boolean;
  client: SupabaseClient;
  projectId: number;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message
  : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible d’enregistrer la sélection documentaire. Réessayez.';

export function ProjectSeaOperationDocuments({ accessKey, archived, canManage, client, projectId }: Props) {
  const context = useMemo(() => ({ accessKey, archived, canManage, client, projectId }), [accessKey, archived, canManage, client, projectId]);
  const [opened, setOpened] = useState<typeof context | null>(null);
  const [saved, setSaved] = useState<typeof context | null>(null);
  if (!canManage) return null;
  return <>
    <button className="sp-button sp-button--secondary" disabled={archived} onClick={() => { setSaved(null); setOpened(context); }} type="button"><Files aria-hidden="true" size={17} />Documents pour Opération en Mer</button>
    {saved === context ? <span className="project-sea-operation-documents-saved" role="status">Sélection enregistrée.</span> : null}
    {opened === context && !archived ? <ProjectSeaOperationDocumentDialog client={client} projectId={projectId} onClose={() => setOpened(null)} onSaved={() => { setSaved(context); setOpened(null); }} /> : null}
  </>;
}

function ProjectSeaOperationDocumentDialog({ client, projectId, onClose, onSaved }: {
  client: SupabaseClient; projectId: number; onClose: () => void; onSaved: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const context = useMemo(() => ({ client, projectId, attempt }), [client, projectId, attempt]);
  const [catalog, setCatalog] = useState<{ context: typeof context; selection?: ProjectSeaOperationDocumentSelection; error?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void fetchProjectSeaOperationDocuments(client, projectId).then(selection => {
      if (!active) return;
      setCatalog({ context, selection });
      setSelectedIds(new Set(selection.documents.filter(document => document.selected).map(document => document.id)));
    }).catch((error: unknown) => { if (active) setCatalog({ context, error: errorMessage(error) }); });
    return () => { active = false; };
  }, [client, context, projectId]);

  const current = catalog?.context === context ? catalog : null;
  const selection = current?.selection;
  const changed = Boolean(selection && (!selection.configured || selection.documents.some(document => document.selected !== selectedIds.has(document.id))));

  async function save() {
    if (!selection || !changed || busyRef.current) return;
    busyRef.current = true; setBusy(true); setSaveError('');
    try {
      await saveProjectSeaOperationDocuments(client, projectId, selection.documents.filter(document => selectedIds.has(document.id)).map(document => document.id));
      if (mounted.current) onSaved();
    } catch (error) {
      if (mounted.current) setSaveError(errorMessage(error));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <AppDialog title="Documents pour Opération en Mer" eyebrow="Projet · Documents" description="Cochez les documents à afficher dans les fiches d’opération de ce projet." icon={<Files aria-hidden="true" size={20} />} isBusy={busy} onClose={() => { if (!busyRef.current) onClose(); }} onSubmit={event => { event.preventDefault(); void save(); }} size="lg" footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} onClick={onClose} type="button">Annuler</button><button className="sp-button sp-button--primary" disabled={busy || !selection || !changed} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer la sélection'}</button></div>}>
    <div className="project-sea-operation-documents">
      <p>Les catégories Offre commerciale et Facturation ne sont pas proposées. Après enregistrement, les nouveaux documents devront également être cochés ici.</p>
      {!current ? <p role="status">Chargement des documents disponibles…</p> : current.error ? <div role="alert"><p>{current.error}</p><button className="sp-button sp-button--secondary" onClick={() => setAttempt(value => value + 1)} type="button">Réessayer les documents</button></div> : selection ? <>
        <div className="project-sea-operation-documents-toolbar">
          <span role="status">{selectedIds.size} document{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''} sur {selection.documents.length}</span>
          {selection.documents.length ? <><button className="sp-button sp-button--secondary" disabled={busy} onClick={() => setSelectedIds(new Set(selection.documents.map(document => document.id)))} type="button">Tout sélectionner</button><button className="sp-button sp-button--secondary" disabled={busy} onClick={() => setSelectedIds(new Set())} type="button">Tout désélectionner</button></> : null}
        </div>
        {selection.documents.length ? <ul className="project-sea-operation-document-choices">{selection.documents.map(document => <li key={document.id}><label>
          <input checked={selectedIds.has(document.id)} disabled={busy} onChange={event => { const checked = event.target.checked; setSelectedIds(previous => { const next = new Set(previous); if (checked) next.add(document.id); else next.delete(document.id); return next; }); }} type="checkbox" />
          <span><strong>{document.title}</strong><small>{[document.categoryLabel, document.subcategoryLabel, document.title !== document.fileName ? document.fileName : ''].filter(Boolean).join(' · ')}</small></span>
        </label></li>)}</ul> : <p>Aucun document éligible dans ce projet.</p>}
      </> : null}
      {saveError ? <p role="alert">{saveError}</p> : null}
    </div>
  </AppDialog>;
}
