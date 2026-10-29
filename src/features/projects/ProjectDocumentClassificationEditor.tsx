import type { SupabaseClient } from '@supabase/supabase-js';
import { FolderCog, Pencil } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { saveProjectDocumentClassification, type ProjectDocumentClassification } from './projectDocumentClassification';
import type { ProjectDocumentCategory } from './projectDocumentCategories';

export interface ClassificationDocument {
  documentId: string;
  fileName: string;
  categoryKey: string | null;
  subcategoryKey: string | null;
  sourceKey: string;
}

interface Props {
  accessKey: string;
  archived: boolean;
  canManage: boolean;
  categories: ProjectDocumentCategory[];
  children: ReactNode;
  client: SupabaseClient;
  documents: ClassificationDocument[];
  onClassified: (classification: ProjectDocumentClassification) => void;
  projectId: number;
  ready: boolean;
}

interface ActionContext {
  editable: boolean;
  disabled: boolean;
  documents: ReadonlyMap<string, ClassificationDocument>;
  open: (documentId: string) => void;
}
const ClassificationActions = createContext<ActionContext | null>(null);
const errorMessage = (error: unknown) => error instanceof Error ? error.message
  : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de modifier la catégorie du document.';

export function ProjectDocumentClassificationEditor({ accessKey, archived, canManage, categories, children, client, documents, onClassified, projectId, ready }: Props) {
  const context = useMemo(() => ({ accessKey, archived, canManage, client, projectId }), [accessKey, archived, canManage, client, projectId]);
  const currentContext = useRef(context); currentContext.current = context;
  const byId = new Map(documents.map(document => [document.documentId, document]));
  const currentDocuments = useRef(byId); currentDocuments.current = byId;
  const mounted = useRef(false);
  const pendingRef = useRef<typeof context | null>(null);
  const [pending, setPending] = useState<typeof context | null>(null);
  const [edit, setEdit] = useState<{ context: typeof context; document: ClassificationDocument; categoryKey: string; subcategoryKey: string } | null>(null);
  const [feedback, setFeedback] = useState<{ context: typeof context; error?: string; message?: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentEdit = edit?.context === context && byId.get(edit.document.documentId)?.sourceKey === edit.document.sourceKey ? edit : null;
  const currentFeedback = feedback?.context === context ? feedback : null;
  const busy = pending === context;
  const editable = canManage && !archived;
  const roots = categories.filter(category => category.active && !category.parentKey);
  const subcategories = categories.filter(category => category.active && category.parentKey === currentEdit?.categoryKey);
  const validCategory = roots.some(category => category.key === currentEdit?.categoryKey);
  const validSubcategory = !currentEdit?.subcategoryKey || subcategories.some(category => category.key === currentEdit.subcategoryKey);
  const categoryLabel = (key: string) => categories.find(category => category.key === key)?.label || key;

  function open(documentId: string) {
    const document = currentDocuments.current.get(documentId);
    if (!editable || !ready || !document || currentContext.current !== context || pendingRef.current === context) return;
    setFeedback(null);
    setEdit({ context, document, categoryKey: document.categoryKey || '', subcategoryKey: document.subcategoryKey || '' });
  }

  async function save() {
    if (!editable || !ready || !currentEdit || !validCategory || !validSubcategory || pendingRef.current === context
      || currentContext.current !== context) return;
    const source = currentEdit.document;
    if (currentDocuments.current.get(source.documentId)?.sourceKey !== source.sourceKey) return;
    if (currentEdit.categoryKey === (source.categoryKey || '') && currentEdit.subcategoryKey === (source.subcategoryKey || '')) {
      setEdit(null); return;
    }
    const operationContext = context;
    pendingRef.current = context; setPending(context); setFeedback(null);
    try {
      const classification = await saveProjectDocumentClassification(client, {
        projectId, documentId: source.documentId, categoryKey: currentEdit.categoryKey, subcategoryKey: currentEdit.subcategoryKey || null,
        expectedCategoryKey: source.categoryKey, expectedSubcategoryKey: source.subcategoryKey,
      });
      if (!mounted.current || currentContext.current !== operationContext
        || currentDocuments.current.get(source.documentId)?.sourceKey !== source.sourceKey) return;
      onClassified(classification);
      setEdit(null);
      setFeedback({ context: operationContext, message: `La catégorie du document « ${source.fileName} » a été enregistrée.` });
    } catch (error) {
      if (mounted.current && currentContext.current === operationContext
        && currentDocuments.current.get(source.documentId)?.sourceKey === source.sourceKey) setFeedback({ context: operationContext, error: errorMessage(error) });
    } finally {
      if (pendingRef.current === operationContext) pendingRef.current = null;
      if (mounted.current && currentContext.current === operationContext) setPending(null);
    }
  }

  return <ClassificationActions.Provider value={{ editable, disabled: !ready || busy, documents: byId, open }}>
    {children}
    {!currentEdit && currentFeedback?.message ? <p role="status">{currentFeedback.message}</p> : null}
    {currentEdit ? <AppDialog title="Modifier la catégorie" description={currentEdit.document.fileName} eyebrow="Projet · Documents" icon={<FolderCog aria-hidden="true" size={20} />} size="sm"
      isBusy={busy} onClose={() => { if (!busy) setEdit(null); }} onSubmit={event => { event.preventDefault(); void save(); }}
      footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} onClick={() => setEdit(null)} type="button">Annuler</button><button className="sp-button sp-button--primary" disabled={busy || !ready || !validCategory || !validSubcategory} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
      <div className="project-documents-form">
        <label>Catégorie<select disabled={busy || !ready} required value={currentEdit.categoryKey} onChange={event => setEdit({ ...currentEdit, categoryKey: event.target.value, subcategoryKey: '' })}>
          <option value="" disabled>Choisir une catégorie</option>
          {currentEdit.categoryKey && !validCategory ? <option disabled value={currentEdit.categoryKey}>{categoryLabel(currentEdit.categoryKey)} (classement actuel)</option> : null}
          {roots.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}
        </select></label>
        {subcategories.length || currentEdit.subcategoryKey ? <label>Sous-catégorie<select disabled={busy || !ready} value={currentEdit.subcategoryKey} onChange={event => setEdit({ ...currentEdit, subcategoryKey: event.target.value })}>
          <option value="">Sans sous-catégorie</option>
          {currentEdit.subcategoryKey && !validSubcategory ? <option disabled value={currentEdit.subcategoryKey}>{categoryLabel(currentEdit.subcategoryKey)} (classement actuel)</option> : null}
          {subcategories.map(category => <option key={category.key} value={category.key}>{category.label}</option>)}
        </select></label> : null}
      </div>
      {currentFeedback?.error ? <p role="alert" className="project-documents-error">{currentFeedback.error}</p> : null}
    </AppDialog> : null}
  </ClassificationActions.Provider>;
}

export function ProjectDocumentCategoryAction({ documentId }: { documentId: string }) {
  const context = useContext(ClassificationActions);
  const document = context?.documents.get(documentId);
  if (!context?.editable || !document) return null;
  return <button className="sp-button sp-button--secondary project-document-category-action" aria-label={`Modifier la catégorie de ${document.fileName}`}
    title="Modifier la catégorie" disabled={context.disabled} onClick={() => context.open(documentId)} type="button"><Pencil aria-hidden="true" size={15} /></button>;
}
