import type { SupabaseClient } from '@supabase/supabase-js';
import { Trash2 } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { deleteProjectDocument, fetchProjectDocumentDeletionSnapshot, type ProjectDocumentDeletionInput, type ProjectDocumentDeletionResult } from './projectDocumentDeletion';

export interface ProjectDeletableDocument { documentId: string; fileName: string; sourceKey: string }
interface Props {
  accessKey: string;
  archived: boolean;
  canManage: boolean;
  children: ReactNode;
  client: SupabaseClient;
  documents: ProjectDeletableDocument[];
  onDeleted: (result: ProjectDocumentDeletionResult) => void;
  projectId: number;
}
interface DeleteActions { editable: boolean; busy: boolean; documents: ReadonlyMap<string, ProjectDeletableDocument>; open: (documentId: string) => void }
const DocumentDeleteActions = createContext<DeleteActions | null>(null);
const message = (error: unknown) => error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error
  ? String(error.message) : 'La suppression du document n’a pas été confirmée. Réessayez.';

/** Both modules share the same confirmation and authoritative, manager-only delete snapshot. */
export function ProjectDocumentDeletionProvider({ accessKey, archived, canManage, children, client, documents, onDeleted, projectId }: Props) {
  const context = useMemo(() => ({ accessKey, archived, canManage, client, projectId }), [accessKey, archived, canManage, client, projectId]);
  const currentContext = useRef(context); currentContext.current = context;
  const byId = new Map(documents.map(document => [document.documentId, document]));
  const currentDocuments = useRef(byId); currentDocuments.current = byId;
  const mounted = useRef(false);
  const pendingRef = useRef<{ context: typeof context; document: ProjectDeletableDocument; phase: 'read' | 'delete' } | null>(null);
  const [pending, setPending] = useState<typeof pendingRef.current>(null);
  const [edit, setEdit] = useState<{ context: typeof context; document: ProjectDeletableDocument; snapshot?: ProjectDocumentDeletionInput; error?: string } | null>(null);
  const [feedback, setFeedback] = useState<{ context: typeof context; message: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pendingRef.current = null; }; }, []);
  const editable = canManage && !archived && Number.isSafeInteger(projectId) && projectId > 0;
  const currentEdit = edit?.context === context && byId.get(edit.document.documentId)?.sourceKey === edit.document.sourceKey ? edit : null;
  const busy = pending?.context === context && pending.document.sourceKey === currentDocuments.current.get(pending.document.documentId)?.sourceKey;
  const deleting = busy && pending?.phase === 'delete';

  function hasCurrentRequest() {
    const operation = pendingRef.current;
    return operation?.context === context && currentDocuments.current.get(operation.document.documentId)?.sourceKey === operation.document.sourceKey;
  }

  function isCurrent(operation: NonNullable<typeof pendingRef.current>) {
    return mounted.current && currentContext.current === operation.context && pendingRef.current === operation
      && currentDocuments.current.get(operation.document.documentId)?.sourceKey === operation.document.sourceKey;
  }
  async function load(document: ProjectDeletableDocument) {
    if (!editable || currentContext.current !== context || hasCurrentRequest()) return;
    const operation = { context, document, phase: 'read' as const };
    pendingRef.current = operation; setPending(operation); setEdit({ context, document }); setFeedback(null);
    try {
      const snapshot = await fetchProjectDocumentDeletionSnapshot(client, { projectId, documentId: document.documentId });
      if (!isCurrent(operation)) return;
      if (snapshot.expected.fileName !== document.fileName.trim()) throw new Error('Le document a changé. Actualisez la liste avant de le supprimer.');
      setEdit({ context, document, snapshot });
    } catch (error) { if (isCurrent(operation)) setEdit({ context, document, error: message(error) }); }
    finally { if (pendingRef.current === operation) { pendingRef.current = null; if (mounted.current) setPending(null); } }
  }
  function open(documentId: string) {
    const document = currentDocuments.current.get(documentId);
    if (document) void load(document);
  }
  function close() {
    if (deleting) return;
    if (pendingRef.current?.phase === 'read') pendingRef.current = null;
    setPending(null); setEdit(null);
  }
  async function confirm() {
    if (!editable || !currentEdit?.snapshot || hasCurrentRequest() || currentContext.current !== context) return;
    const operation = { context, document: currentEdit.document, phase: 'delete' as const };
    pendingRef.current = operation; setPending(operation);
    const snapshot = currentEdit.snapshot;
    try {
      const result = await deleteProjectDocument(client, snapshot);
      if (!isCurrent(operation)) return;
      onDeleted(result); setEdit(null);
      setFeedback({ context, message: `Le document « ${operation.document.fileName} » a été supprimé.` });
    } catch (error) { if (isCurrent(operation)) setEdit({ context, document: operation.document, snapshot, error: message(error) }); }
    finally { if (pendingRef.current === operation) { pendingRef.current = null; if (mounted.current) setPending(null); } }
  }

  return <DocumentDeleteActions.Provider value={{ editable, busy, documents: byId, open }}>
    {children}
    {!currentEdit && feedback?.context === context ? <p role="status">{feedback.message}</p> : null}
    {currentEdit ? <AppDialog title="Supprimer le document ?" description={currentEdit.document.fileName} eyebrow="Projet · Documents" icon={<Trash2 aria-hidden="true" size={20} />}
      size="sm" isBusy={deleting} onClose={close} footer={<div className="app-dialog__actions">
        <button type="button" className="sp-button sp-button--secondary" disabled={deleting} onClick={close}>Annuler</button>
        <button type="button" className="sp-button sp-button--danger" disabled={busy || !currentEdit.snapshot} onClick={() => void confirm()}><Trash2 aria-hidden="true" size={16} />{deleting ? 'Suppression…' : 'Supprimer le document'}</button>
      </div>}>
      <p>Ce document sera retiré du projet et d’Opération en Mer. Son historique et le fichier source sont conservés pour la traçabilité.</p>
      {busy && !deleting ? <p role="status">Vérification du document…</p> : null}
      {currentEdit.error ? <div role="alert"><p>{currentEdit.error}</p>{!currentEdit.snapshot ? <button type="button" className="sp-button sp-button--secondary" disabled={busy} onClick={() => void load(currentEdit.document)}>Réessayer</button> : null}</div> : null}
    </AppDialog> : null}
  </DocumentDeleteActions.Provider>;
}

export function ProjectDocumentDeleteAction({ documentId }: { documentId: string }) {
  const context = useContext(DocumentDeleteActions);
  const document = context?.documents.get(documentId);
  if (!context?.editable || !document) return null;
  return <button type="button" className="sp-button sp-button--secondary project-document-delete-action" title="Supprimer" aria-label={`Supprimer ${document.fileName}`} disabled={context.busy} onClick={() => context.open(documentId)}><Trash2 aria-hidden="true" size={17} /></button>;
}
