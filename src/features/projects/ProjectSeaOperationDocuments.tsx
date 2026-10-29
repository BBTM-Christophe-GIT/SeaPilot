import type { SupabaseClient } from '@supabase/supabase-js';
import { Ship } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchProjectSeaOperationDocuments, saveProjectSeaOperationDocument, type ProjectSeaOperationDocument, type ProjectSeaOperationDocumentSelection } from './projectSeaOperationDocumentsQueries';
import './ProjectSeaOperationDocuments.css';

interface Props {
  accessKey: string;
  archived: boolean;
  canManage: boolean;
  children: ReactNode;
  client: SupabaseClient;
  projectId: number;
  refreshKey: string;
}
interface SelectionContext {
  documents: ReadonlyMap<string, ProjectSeaOperationDocument>;
  pending: { id: string; selected: boolean } | null;
  disabled: boolean;
  toggle: (id: string, selected: boolean) => void;
}
const DocumentSelection = createContext<SelectionContext | null>(null);
const errorMessage = (error: unknown) => error instanceof Error ? error.message
  : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'L’enregistrement de la sélection n’a pas été confirmé. Réessayez.';

/** Server eligibility is authoritative; commercial documents never get a local fallback checkbox. */
export function ProjectSeaOperationDocuments({ accessKey, archived, canManage, children, client, projectId, refreshKey }: Props) {
  const [attempt, setAttempt] = useState(0);
  const context = useMemo(() => ({ accessKey, archived, canManage, client, projectId, refreshKey, attempt }), [accessKey, archived, canManage, client, projectId, refreshKey, attempt]);
  const sameProjectAccess = (other: typeof context) => other.accessKey === context.accessKey && other.archived === context.archived
    && other.canManage === context.canManage && other.client === context.client && other.projectId === context.projectId;
  const currentContext = useRef(context); currentContext.current = context;
  const mounted = useRef(false);
  const busyRef = useRef<typeof context | null>(null);
  const [catalog, setCatalog] = useState<{ context: typeof context; selection?: ProjectSeaOperationDocumentSelection; error?: string } | null>(null);
  const [pending, setPending] = useState<{ context: typeof context; id: string; selected: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ context: typeof context; error?: string; message?: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    void fetchProjectSeaOperationDocuments(client, projectId).then(selection => {
      if (active && currentContext.current === context) setCatalog({ context, selection });
    }).catch((error: unknown) => { if (active && currentContext.current === context) setCatalog({ context, error: errorMessage(error) }); });
    return () => { active = false; };
  }, [canManage, client, context, projectId]);

  const current = catalog?.context === context ? catalog : null;
  const currentPending = pending && sameProjectAccess(pending.context) ? pending : null;
  const currentFeedback = feedback?.context === context ? feedback : null;
  const documents = useMemo(() => new Map(current?.selection?.documents.map(document => [document.id, document]) ?? []), [current?.selection]);
  async function toggle(id: string, selected: boolean) {
    if (!canManage || archived || (busyRef.current && sameProjectAccess(busyRef.current)) || !documents.has(id)) return;
    const operationContext = context;
    busyRef.current = operationContext; setPending({ context, id, selected }); setFeedback(null);
    try {
      const selection = await saveProjectSeaOperationDocument(client, projectId, id, selected);
      if (!mounted.current || currentContext.current !== operationContext) return;
      setCatalog({ context: operationContext, selection });
      setFeedback({ context: operationContext, message: 'Sélection enregistrée.' });
    } catch (error) {
      if (mounted.current && currentContext.current === operationContext) setFeedback({ context: operationContext, error: errorMessage(error) });
    } finally {
      if (busyRef.current === operationContext) busyRef.current = null;
      if (mounted.current) {
        const latest = currentContext.current;
        if (latest === operationContext) setPending(null);
        else if (latest.accessKey === operationContext.accessKey && latest.archived === operationContext.archived
          && latest.canManage === operationContext.canManage && latest.client === operationContext.client && latest.projectId === operationContext.projectId) {
          // An upload or category refresh may have read before this write committed.
          // Re-read after completion; never apply an old response to a new context.
          setPending(null); setAttempt(value => value + 1);
        }
      }
    }
  }
  return <DocumentSelection.Provider value={{ documents, pending: currentPending, disabled: !canManage || archived || Boolean(currentPending), toggle: (id, selected) => { void toggle(id, selected); } }}>
    {canManage ? <p className="project-sea-operation-documents-help">Si la case est cochée, le document apparaîtra dans Opération en Mer. Les nouveaux documents sont décochés par défaut.</p> : null}
    {canManage && !current ? <p role="status">Chargement des cases Opération en Mer…</p> : current?.error ? <p role="alert">{current.error} <button className="sp-button sp-button--secondary" onClick={() => setAttempt(value => value + 1)} type="button">Réessayer les cases Opération en Mer</button></p> : null}
    {currentPending ? <p role="status">Enregistrement de la sélection…</p> : currentFeedback?.error ? <p role="alert">{currentFeedback.error} <button className="sp-button sp-button--secondary" onClick={() => setAttempt(value => value + 1)} type="button">Actualiser les cases</button></p> : currentFeedback?.message ? <p className="project-sea-operation-documents-saved" role="status">{currentFeedback.message}</p> : null}
    {children}
  </DocumentSelection.Provider>;
}

export function ProjectSeaOperationDocumentCheckbox({ documentId, documentName, showLabel = false }: { documentId: string; documentName: string; showLabel?: boolean }) {
  const context = useContext(DocumentSelection);
  const document = context?.documents.get(documentId);
  if (!context || !document) return null;
  const checked = context.pending?.id === documentId ? context.pending.selected : document.selected;
  return <label className="project-sea-operation-document-choice" title="Afficher dans Opération en Mer"><input aria-label={`Afficher ${documentName} dans Opération en Mer`} checked={checked} disabled={context.disabled} onChange={event => context.toggle(documentId, event.target.checked)} type="checkbox" />{showLabel ? <><Ship aria-hidden="true" size={15} /><span>En mer</span></> : null}</label>;
}
