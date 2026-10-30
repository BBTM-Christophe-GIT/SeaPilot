import type { SupabaseClient } from '@supabase/supabase-js';
import { FileText, FolderCog, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { inferredDocumentMimeType } from '../documents/documentBlobStorage';
import {
  DEFAULT_PROJECT_DOCUMENT_CATEGORIES,
  fetchProjectDocumentCategories,
  newProjectDocumentCategoryKey,
  saveProjectDocumentCategories,
  type ProjectDocumentCategory,
} from './projectDocumentCategories';
import { storeProjectAttachment, type ProjectAttachmentDraft } from './projectDocumentStorage';
import type { ProjectDocumentRecord, ProjectOperationDocumentRecord } from './projectQueries';
import { ProjectSeaOperationDocuments } from './ProjectSeaOperationDocuments';
import { ProjectDocumentClassificationEditor, type ClassificationDocument } from './ProjectDocumentClassificationEditor';
import type { ProjectDocumentClassification } from './projectDocumentClassification';
import { ProjectDocumentDeletionProvider } from './ProjectDocumentDeleteDialog';
import type { ProjectDocumentDeletionResult } from './projectDocumentDeletion';
import './ProjectDocumentLibrary.css';

interface LibraryDocuments {
  attachments: ProjectOperationDocumentRecord[];
  contractDocuments: ProjectDocumentRecord[];
  projectDocuments: ProjectDocumentRecord[];
  otherDocuments?: ProjectOperationDocumentRecord[];
}

interface ProjectDocumentLibraryProps extends LibraryDocuments {
  accessKey: string;
  archived?: boolean;
  canManage: boolean;
  client: SupabaseClient;
  onStored: (document: ProjectOperationDocumentRecord) => void;
  onClassified?: (classification: ProjectDocumentClassification) => void;
  onDeleted?: (result: ProjectDocumentDeletionResult) => void;
  projectId: number;
  renderDocuments: (documents: LibraryDocuments, labels: ReadonlyMap<string, string>, categories: ProjectDocumentCategory[]) => ReactNode;
}

export function ProjectDocumentLibrary({
  accessKey, archived = false, attachments, canManage, client, contractDocuments, onClassified, onDeleted, onStored, otherDocuments = [], projectDocuments, projectId, renderDocuments,
}: ProjectDocumentLibraryProps) {
  const fileHelpId = useId();
  const context = useMemo(() => ({ accessKey, archived, canManage, client, projectId }), [accessKey, archived, canManage, client, projectId]);
  const contextRef = useRef(context);
  contextRef.current = context;
  const mounted = useRef(false);
  const busyRef = useRef<typeof context | null>(null);
  const [busyContext, setBusyContext] = useState<typeof context | null>(null);
  const [catalog, setCatalog] = useState<{ context: typeof context; items: ProjectDocumentCategory[]; error: string } | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modal, setModal] = useState<{ context: typeof context; kind: 'upload' | 'categories' } | null>(null);
  const [draftCategories, setDraftCategories] = useState<ProjectDocumentCategory[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadSubcategory, setUploadSubcategory] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [feedback, setFeedback] = useState<{ context: typeof context; error?: string; message?: string } | null>(null);
  const [classifications, setClassifications] = useState<{ context: typeof context; entries: Map<string, { sourceKey: string; value: ProjectDocumentClassification }> } | null>(null);
  const [deletedDocuments, setDeletedDocuments] = useState<{ context: typeof context; ids: ReadonlySet<string> } | null>(null);

  const sourceKey = (documentId: string, document: ProjectDocumentRecord | ProjectOperationDocumentRecord) => JSON.stringify([documentId, document]);
  const rawDocuments = new Map<string, ProjectDocumentRecord | ProjectOperationDocumentRecord>([
    ...[...attachments, ...otherDocuments].map(document => [`generated:${document.id}`, document] as const),
    ...projectDocuments.map(document => [`project:${document.id}`, document] as const),
    ...contractDocuments.map(document => [`contract:${document.id}`, document] as const),
  ]);
  function classified<T extends ProjectDocumentRecord | ProjectOperationDocumentRecord>(items: T[], prefix: string): T[] {
    return items.filter(document => deletedDocuments?.context !== context || !deletedDocuments.ids.has(`${prefix}:${document.id}`)).map(document => {
      const documentId = `${prefix}:${document.id}`;
      const update = classifications?.context === context ? classifications.entries.get(documentId) : undefined;
      return update?.sourceKey === sourceKey(documentId, document) ? { ...document, categoryKey: update.value.categoryKey, subcategoryKey: update.value.subcategoryKey || '' } : document;
    });
  }
  const displayedDocuments = { attachments: classified(attachments, 'generated'), otherDocuments: classified(otherDocuments, 'generated'),
    projectDocuments: classified(projectDocuments, 'project'), contractDocuments: classified(contractDocuments, 'contract') };
  const classificationDocuments: ClassificationDocument[] = [
    ...[...displayedDocuments.attachments, ...displayedDocuments.otherDocuments].map(document => ({ documentId: `generated:${document.id}`, document })),
    ...displayedDocuments.projectDocuments.map(document => ({ documentId: `project:${document.id}`, document })),
    ...displayedDocuments.contractDocuments.map(document => ({ documentId: `contract:${document.id}`, document })),
  ].filter(({ document }) => document.projectId === projectId && !('isFolder' in document && document.isFolder)).map(({ documentId, document }) => ({
    documentId, fileName: document.fileName || ('title' in document ? document.title : '') || 'Document sans nom', categoryKey: document.categoryKey || null,
    subcategoryKey: document.subcategoryKey || null, sourceKey: sourceKey(documentId, document),
  }));
  function documentClassified(classification: ProjectDocumentClassification) {
    const source = rawDocuments.get(classification.documentId);
    if (!source || classification.projectId !== projectId) return;
    setClassifications(current => {
      const entries = current?.context === context ? new Map(current.entries) : new Map();
      entries.set(classification.documentId, { sourceKey: sourceKey(classification.documentId, source), value: classification });
      return { context, entries };
    });
    onClassified?.(classification);
  }
  function documentDeleted(result: ProjectDocumentDeletionResult) {
    if (result.projectId !== projectId || !rawDocuments.has(result.documentId)) return;
    setDeletedDocuments(current => ({ context, ids: new Set([...(current?.context === context ? current.ids : []), result.documentId]) }));
    onDeleted?.(result);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setCatalog(null);
    setCategoryFilter('');
    setSubcategoryFilter('');
    void fetchProjectDocumentCategories(client, { includeInactive: true }).then((items) => {
      if (active && contextRef.current === context) setCatalog({ context, items, error: '' });
    }).catch((error: unknown) => {
      if (active && contextRef.current === context) setCatalog({ context, items: [], error: error instanceof Error ? error.message : 'Impossible de charger les catégories.' });
    });
    return () => { active = false; };
  }, [client, context, loadAttempt]);

  const currentCatalog = catalog?.context === context ? catalog : null;
  const categories = currentCatalog?.items || [];
  const activeCategories = categories.filter((category) => category.active);
  const roots = activeCategories.filter((category) => category.parentKey === null);
  const labels = new Map(DEFAULT_PROJECT_DOCUMENT_CATEGORIES.map((category) => [category.key, category.label]));
  labels.set('contract_document', 'Documents contractuels');
  labels.set('project_document', 'Documents projet');
  categories.forEach((category) => labels.set(category.key, category.label));
  const categoryByKey = new Map([...DEFAULT_PROJECT_DOCUMENT_CATEGORIES, ...categories].map(category => [category.key, category]));
  const documentClassification = (document: { categoryKey?: string; subcategoryKey?: string }) => {
    const category = categoryByKey.get(document.categoryKey || '');
    return {
      categoryKey: category?.parentKey || document.categoryKey || '',
      subcategoryKey: document.subcategoryKey || (category?.parentKey ? category.key : ''),
    };
  };
  const categoryKeys = new Set([
    ...Object.values(displayedDocuments).flatMap(items => items.map(document => documentClassification(document).categoryKey)),
  ].filter(Boolean));
  const filterCategories = categories.filter((category) => category.parentKey === null && (category.active || categoryKeys.has(category.key)));
  const knownKeys = new Set(filterCategories.map((category) => category.key));
  const extraFilterKeys = [...categoryKeys].filter((key) => !knownKeys.has(key));
  const filterSubcategories = categories.filter((category) => category.parentKey === categoryFilter && (category.active || Object.values(displayedDocuments).some(items => items.some(document => documentClassification(document).subcategoryKey === category.key))));
  const uploadSubcategories = activeCategories.filter((category) => category.parentKey === uploadCategory);
  const busy = busyContext === context;
  const currentModal = modal?.context === context ? modal.kind : null;
  const currentFeedback = feedback?.context === context ? feedback : null;
  const canUpload = canManage && !archived && Boolean(currentCatalog && !currentCatalog.error && roots.length);
  const matches = (document: { categoryKey?: string; subcategoryKey?: string }) => {
    const classification = documentClassification(document);
    return (!categoryFilter || classification.categoryKey === categoryFilter)
      && (!subcategoryFilter || classification.subcategoryKey === subcategoryFilter);
  };
  const filteredDocuments = {
    attachments: displayedDocuments.attachments.filter(matches),
    otherDocuments: displayedDocuments.otherDocuments.filter(matches),
    contractDocuments: displayedDocuments.contractDocuments.filter(matches),
    projectDocuments: displayedDocuments.projectDocuments.filter(matches),
  };
  const count = filteredDocuments.attachments.length + filteredDocuments.otherDocuments.length + filteredDocuments.contractDocuments.length + filteredDocuments.projectDocuments.length;

  function isCurrent(operationContext: typeof context) {
    return mounted.current && contextRef.current === operationContext;
  }

  function beginUpload() {
    if (!canUpload || busyRef.current === context) return;
    setFile(null); setExpiresOn(''); setUploadCategory(roots[0].key); setUploadSubcategory('');
    setFeedback(null); setModal({ context, kind: 'upload' });
  }

  async function upload() {
    if (!canUpload || !file || busyRef.current === context) return;
    if (!roots.some((category) => category.key === uploadCategory)
      || (uploadSubcategory && !uploadSubcategories.some((category) => category.key === uploadSubcategory))) return;
    const operationContext = context;
    const draft: ProjectAttachmentDraft = { categoryKey: uploadCategory, expiresOn, file, id: crypto.randomUUID(), subcategoryKey: uploadSubcategory || null };
    busyRef.current = operationContext; setBusyContext(operationContext); setFeedback(null);
    try {
      const stored = await storeProjectAttachment(client, { draft, projectId });
      if (!isCurrent(operationContext)) return;
      onStored({
        categoryKey: draft.categoryKey, createdAt: new Date().toISOString(), documentType: 'project_attachment',
        expiresOn: draft.expiresOn, fileName: stored.fileName, fileSizeBytes: draft.file.size, id: stored.id,
        mimeType: (draft.file.type || inferredDocumentMimeType(draft.file.name)).split(';')[0].trim().toLowerCase(), planningOccurrenceId: null, projectId,
        sharePointFolderPath: stored.folderPath, sharePointWebUrl: stored.webUrl,
        storageBucket: stored.storageBucket || '', storagePath: stored.storagePath || '', subcategoryKey: draft.subcategoryKey || '',
      });
      setModal(null); setFile(null);
      setFeedback({ context: operationContext, message: `Le document « ${stored.fileName} » a été ajouté au projet.` });
    } catch (error) {
      if (isCurrent(operationContext)) setFeedback({ context: operationContext, error: error instanceof Error ? error.message : 'Impossible d’ajouter le document.' });
    } finally {
      if (busyRef.current === operationContext) busyRef.current = null;
      if (isCurrent(operationContext)) setBusyContext(null);
    }
  }

  function beginCategories() {
    if (!canManage || !currentCatalog || currentCatalog.error || busyRef.current === context) return;
    setDraftCategories(categories.map((category) => ({ ...category }))); setFeedback(null); setModal({ context, kind: 'categories' });
  }

  function addCategory(parentKey: string | null) {
    setDraftCategories((items) => [...items, {
      active: true, displayOrder: Math.max(0, ...items.map((item) => item.displayOrder)) + 10,
      key: newProjectDocumentCategoryKey(parentKey ? 'subcategory' : 'category'),
      label: parentKey ? 'Nouvelle sous-catégorie' : 'Nouvelle catégorie', parentKey,
    }]);
  }

  function removeCategory(key: string) {
    setDraftCategories((items) => items.map((item) => item.key === key || item.parentKey === key ? { ...item, active: false } : item));
  }

  async function saveCategories() {
    if (!canManage || busyRef.current === context) return;
    const operationContext = context;
    busyRef.current = operationContext; setBusyContext(operationContext); setFeedback(null);
    try {
      await saveProjectDocumentCategories(client, draftCategories);
      if (!isCurrent(operationContext)) return;
      setCatalog({ context: operationContext, items: draftCategories.map((item) => ({ ...item, label: item.label.trim() })), error: '' });
      setModal(null); setFeedback({ context: operationContext, message: 'Les catégories communes aux projets ont été enregistrées.' });
    } catch (error) {
      if (isCurrent(operationContext)) setFeedback({ context: operationContext, error: error instanceof Error ? error.message : 'Impossible d’enregistrer les catégories.' });
    } finally {
      if (busyRef.current === operationContext) busyRef.current = null;
      if (isCurrent(operationContext)) setBusyContext(null);
    }
  }

  return <div className="project-documents-workspace">
    <div className="project-section-heading">
      <div><strong>Documents du projet</strong><span>Classez et retrouvez les pièces du projet. Les versions historiques sont conservées.</span></div>
      {canManage ? <div className="project-documents-actions">
        <button className="sp-button sp-button--primary" disabled={busy || !canUpload} onClick={beginUpload} type="button"><Plus aria-hidden="true" size={17} /> Ajouter un document</button>
        <button className="sp-button sp-button--secondary" disabled={busy || !currentCatalog || Boolean(currentCatalog.error)} onClick={beginCategories} type="button"><FolderCog aria-hidden="true" size={17} /> Gérer les catégories</button>
      </div> : null}
    </div>
    {!currentCatalog ? <p role="status">Chargement des catégories…</p> : currentCatalog.error ? <div role="alert" className="project-documents-error">{currentCatalog.error}<button className="sp-button sp-button--secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">Réessayer les catégories</button></div> : canManage && !roots.length ? <p role="status">Ajoutez une catégorie pour classer un document.</p> : null}
    {archived ? <p role="status">Ce dossier clôturé est consultable. Réactivez le projet pour ajouter un document.</p> : null}
    <div className="project-documents-filters">
      <label>Catégorie<select onChange={(event) => { setCategoryFilter(event.target.value); setSubcategoryFilter(''); }} value={categoryFilter}>
        <option value="">Toutes les catégories</option>
        {filterCategories.map((category) => <option key={category.key} value={category.key}>{category.label}{category.active ? '' : ' (retirée)'}</option>)}
        {extraFilterKeys.map((key) => <option key={key} value={key}>{labels.get(key) || key}</option>)}
      </select></label>
      {filterSubcategories.length ? <label>Sous-catégorie<select onChange={(event) => setSubcategoryFilter(event.target.value)} value={subcategoryFilter}><option value="">Toutes les sous-catégories</option>{filterSubcategories.map((category) => <option key={category.key} value={category.key}>{category.label}{category.active ? '' : ' (retirée)'}</option>)}</select></label> : null}
      <span role="status">{count} document{count > 1 ? 's' : ''}</span>
    </div>
    {!currentModal && currentFeedback?.message ? <p role="status">{currentFeedback.message}</p> : null}
    {!currentModal && currentFeedback?.error ? <p role="alert">{currentFeedback.error}</p> : null}
    <ProjectDocumentDeletionProvider accessKey={accessKey} archived={archived} canManage={canManage} client={client} projectId={projectId} documents={classificationDocuments} onDeleted={documentDeleted}>
    <ProjectDocumentClassificationEditor accessKey={accessKey} archived={archived} canManage={canManage} categories={categories} client={client} documents={classificationDocuments}
      onClassified={documentClassified} projectId={projectId} ready={Boolean(currentCatalog && !currentCatalog.error && roots.length)}>
      <ProjectSeaOperationDocuments accessKey={accessKey} archived={archived} canManage={canManage} client={client} projectId={projectId}
        refreshKey={JSON.stringify([categories.map(category => [category.key, category.parentKey, category.label]), Object.values(displayedDocuments).map(items => items.map(item => [item.id, item.categoryKey, item.subcategoryKey, item.fileName]))])}>
        {(categoryFilter || subcategoryFilter) && !count ? <p className="project-section-empty">Aucun document dans cette catégorie.</p> : renderDocuments(filteredDocuments, labels, categories)}
      </ProjectSeaOperationDocuments>
    </ProjectDocumentClassificationEditor>
    </ProjectDocumentDeletionProvider>
    {currentModal === 'upload' ? <AppDialog title="Ajouter un document" eyebrow="Projet · Documents" description="Le fichier sera classé dans l’espace privé du projet." icon={<FileText aria-hidden="true" size={20} />} isBusy={busy} onClose={() => setModal(null)} onSubmit={(event) => { event.preventDefault(); void upload(); }} size="sm" footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} onClick={() => setModal(null)} type="button">Annuler</button><button className="sp-button sp-button--primary" disabled={busy || !file || !canUpload} type="submit"><Upload aria-hidden="true" size={17} />{busy ? 'Ajout en cours…' : 'Ajouter au projet'}</button></div>}>
      <div className="project-documents-form">
        <label>Fichier<input aria-describedby={fileHelpId} disabled={busy} onChange={(event) => setFile(event.target.files?.[0] || null)} required type="file" /></label>
        <small id={fileHelpId}>50 Mo maximum par fichier.</small>
        <label>Catégorie<select disabled={busy} onChange={(event) => { setUploadCategory(event.target.value); setUploadSubcategory(''); }} required value={uploadCategory}>{roots.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label>
        {uploadSubcategories.length ? <label>Sous-catégorie<select disabled={busy} onChange={(event) => setUploadSubcategory(event.target.value)} value={uploadSubcategory}><option value="">Sans sous-catégorie</option>{uploadSubcategories.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}</select></label> : null}
        <label>Date d’échéance (facultative)<input disabled={busy} onChange={(event) => setExpiresOn(event.target.value)} type="date" value={expiresOn} /></label>
      </div>
      {currentFeedback?.error ? <p className="project-documents-error" role="alert">{currentFeedback.error}</p> : null}
    </AppDialog> : null}
    {currentModal === 'categories' ? <AppDialog title="Catégories communes aux projets" description="Renommez les catégories et sous-catégories de la société. Retirer une catégorie conserve ses documents et leur classement historique." eyebrow="Projet · Catalogue documentaire" icon={<FolderCog aria-hidden="true" size={20} />} isBusy={busy} onClose={() => setModal(null)} onSubmit={(event) => { event.preventDefault(); void saveCategories(); }} footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} onClick={() => setModal(null)} type="button">Annuler</button><button className="sp-button sp-button--primary" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer les catégories'}</button></div>}>
      <div className="project-documents-category-editor">
        {draftCategories.filter((category) => category.active && !category.parentKey).map((category) => <section key={category.key}>
          {[category, ...draftCategories.filter((item) => item.active && item.parentKey === category.key)].map((item) => <div className={item.parentKey ? 'is-subcategory' : undefined} key={item.key}>
            <label>{item.parentKey ? 'Sous-catégorie' : 'Catégorie'}<input aria-label={`Nom de la ${item.parentKey ? 'sous-catégorie' : 'catégorie'} ${item.label}`} disabled={busy} onChange={(event) => setDraftCategories((items) => items.map((current) => current.key === item.key ? { ...current, label: event.target.value } : current))} required value={item.label} /></label>
            <button aria-label={`Retirer la ${item.parentKey ? 'sous-catégorie' : 'catégorie'} ${item.label}`} className="sp-button sp-button--secondary" disabled={busy} onClick={() => removeCategory(item.key)} type="button"><Trash2 aria-hidden="true" size={17} /> Retirer</button>
          </div>)}
          <button className="sp-button sp-button--secondary" disabled={busy} onClick={() => addCategory(category.key)} type="button"><Plus aria-hidden="true" size={16} /> Ajouter une sous-catégorie<span className="sr-only"> : {category.label}</span></button>
        </section>)}
        <button className="sp-button sp-button--secondary" disabled={busy} onClick={() => addCategory(null)} type="button"><Plus aria-hidden="true" size={16} /> Ajouter une catégorie</button>
      </div>
      {currentFeedback?.error ? <p className="project-documents-error" role="alert">{currentFeedback.error}</p> : null}
    </AppDialog> : null}
  </div>;
}
