import type { SupabaseClient } from '@supabase/supabase-js';
import { BookOpen, BriefcaseBusiness, ClipboardList, Download, FileCheck2, FolderOpen, Layers, LoaderCircle, ReceiptText, ShieldCheck, Tags, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_PROJECT_DOCUMENT_CATEGORIES, type ProjectDocumentCategory } from './projectDocumentCategories';
import { ProjectDocumentCategoryAction } from './ProjectDocumentClassificationEditor';
import { ProjectDocumentDeleteAction } from './ProjectDocumentDeleteDialog';
import { ProjectSeaOperationDocumentCheckbox } from './ProjectSeaOperationDocuments';
import { ProjectStoredDocumentLink } from './ProjectStoredDocumentLink';
import { getSharePointDocumentLinkState } from './projectDocuments';
import type { ProjectDocumentRecord, ProjectOperationDocumentRecord } from './projectQueries';
import { ProjectDocumentThumbnail } from './ProjectDocumentThumbnail';
import { downloadProjectFiles, type ProjectFileReference } from './projectDocumentAssets';
import './ProjectDocumentChips.css';

interface Props {
  accessKey?: string;
  client: SupabaseClient;
  documents: {
    attachments: ProjectOperationDocumentRecord[];
    otherDocuments?: ProjectOperationDocumentRecord[];
    projectDocuments: ProjectDocumentRecord[];
    contractDocuments: ProjectDocumentRecord[];
  };
  categories: ProjectDocumentCategory[];
  categoryLabels: ReadonlyMap<string, string>;
  canManage: boolean;
  contractDocumentsUnavailable?: boolean;
}

type DocumentEntry = {
  id: string;
  document: ProjectDocumentRecord | ProjectOperationDocumentRecord;
  source: 'generated' | 'project' | 'contract';
};

function categoryPresentation(key: string) {
  const known = {
    commercial_offer: { Icon: BriefcaseBusiness, tone: 'commercial' },
    hse: { Icon: ShieldCheck, tone: 'hse' },
    billing: { Icon: ReceiptText, tone: 'billing' },
    toilette_de_mer: { Icon: Waves, tone: 'marine' },
    contract_document: { Icon: FileCheck2, tone: 'contract' },
    contract: { Icon: FileCheck2, tone: 'contract' },
    project_document: { Icon: FolderOpen, tone: 'project' },
    planning: { Icon: ClipboardList, tone: 'project' },
    '': { Icon: Layers, tone: 'other' },
  };
  if (Object.hasOwn(known, key)) return known[key as keyof typeof known];
  const hash = [...key].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
  return { Icon: [FolderOpen, BookOpen, ClipboardList, Layers, Tags][hash % 5], tone: ['project', 'contract', 'commercial', 'hse', 'billing', 'marine'][hash % 6] };
}

function fileReference(entry: DocumentEntry): ProjectFileReference {
  const document = entry.document;
  return { fileName: document.fileName || ('title' in document ? document.title : '') || 'Document sans nom',
    storageBucket: document.storageBucket, storagePath: document.storagePath,
    sharePointWebUrl: 'sharePointWebUrl' in document ? document.sharePointWebUrl : document.fileUrl,
    mimeType: document.mimeType, fileSizeBytes: document.fileSizeBytes ?? undefined };
}

function entryVersion(entry: DocumentEntry): string {
  return JSON.stringify([entry.id, entry.document.projectId, fileReference(entry),
    'createdAt' in entry.document ? entry.document.createdAt : [entry.document.sourceModifiedAt, entry.document.storageSha256]]);
}

function isAvailable(entry: DocumentEntry): boolean {
  const document = entry.document;
  if ('isFolder' in document && document.isFolder) return false;
  return Boolean(document.storageBucket && document.storagePath)
    || getSharePointDocumentLinkState(fileReference(entry).sharePointWebUrl || '').status === 'available';
}

function fileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} octets`;
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024 ** unit)} ${['', 'Ko', 'Mo', 'Go'][unit]}`;
}

function formattedDate(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', ...(dateOnly ? {} : { timeStyle: 'short' as const }) }).format(date);
}

function DocumentChip({ entry, client, labels, canManage, selected, busy, onSelect, onDownload, accessKey }: {
  entry: DocumentEntry; client: SupabaseClient; labels: ReadonlyMap<string, string>; canManage: boolean;
  selected: boolean; busy: boolean; onSelect: (selected: boolean) => void; onDownload: () => void;
  accessKey: string;
}) {
  const { document, source, id } = entry;
  const file = fileReference(entry);
  const name = file.fileName;
  const extension = name.includes('.') ? name.split('.').at(-1)?.toUpperCase() : '';
  const subcategory = document.subcategoryKey ? labels.get(document.subcategoryKey) || document.subcategoryKey : '';
  const generated = 'documentType' in document;
  const available = isAvailable(entry);
  const canSelectForSea = source === 'project' ? !('isFolder' in document && document.isFolder)
    : generated && ['operation_attachment', 'project_attachment'].includes(document.documentType);
  const date = generated ? document.createdAt : document.sourceModifiedAt;
  const metadata = [extension, fileSize(document.fileSizeBytes), date ? `${generated ? 'Ajouté' : 'Modifié'} le ${formattedDate(date)}` : '',
    source === 'contract' ? 'Document contractuel' : 'Document du projet'].filter(Boolean).join(' · ');
  const identity = <><ProjectDocumentThumbnail client={client} document={file} revisionKey={`${accessKey}:${entryVersion(entry)}`} />
    <span className="project-document-chip__copy"><strong>{name}</strong>{subcategory ? <small>{subcategory}</small> : null}</span></>;

  return <li className={`project-document-chip${selected ? ' is-selected' : ''}`}>
    <div className="project-document-chip__identity">
      <label className="project-document-chip__selection" title="Sélectionner pour le téléchargement">
        <input aria-label={`Sélectionner ${name} pour le téléchargement`} type="checkbox" checked={selected} disabled={busy || !available} onChange={event => onSelect(event.target.checked)} />
      </label>
      {available ? <ProjectStoredDocumentLink client={client} document={file} className="project-document-chip__open" title={metadata}>{identity}</ProjectStoredDocumentLink>
        : <div className="project-document-chip__unavailable">{identity}</div>}
    </div>
    {!available ? <span className="project-missing-link">{getSharePointDocumentLinkState(file.sharePointWebUrl || '').status === 'missing' ? 'URL SharePoint absente' : 'URL SharePoint invalide ou non autorisée'}</span> : null}
    {generated && document.expiresOn ? <small className="project-document-chip__expiry">Échéance : {formattedDate(document.expiresOn)}</small> : null}
    {document.projectId === null ? <small className="project-document-warning">Rattachement au projet Supabase non résolu</small> : null}
    <div className="project-document-chip__actions">
      <button type="button" className="sp-button sp-button--secondary project-document-chip__download" aria-label={`Télécharger ${name}`} title="Télécharger" disabled={busy || !available} onClick={onDownload}><Download aria-hidden="true" size={17} /></button>
      <ProjectDocumentCategoryAction documentId={id} />
      <ProjectDocumentDeleteAction documentId={id} />
      {canManage && canSelectForSea ? <ProjectSeaOperationDocumentCheckbox documentId={id} documentName={name} showLabel /> : null}
    </div>
  </li>;
}

function CategorySelection({ label, checked, mixed, disabled, onChange }: {
  label: string; checked: boolean; mixed: boolean; disabled: boolean; onChange: (selected: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className="project-document-group__selection" title="Sélectionner toute la catégorie"><input ref={input} type="checkbox" aria-label={`Sélectionner tous les documents de ${label}`} aria-checked={mixed ? 'mixed' : checked} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /></label>;
}

export function ProjectDocumentChips({ accessKey = '', client, documents, categories, categoryLabels, canManage, contractDocumentsUnavailable = false }: Props) {
  const context = useMemo(() => ({ client, accessKey }), [client, accessKey]);
  const currentContext = useRef(context); currentContext.current = context;
  const [selection, setSelected] = useState<{ context: typeof context; entries: ReadonlyMap<string, string> } | null>(null);
  const selected = selection?.context === context ? selection.entries : new Map<string, string>();
  const [busyContext, setBusy] = useState<typeof context | null>(null);
  const busy = busyContext === context;
  const [result, setFeedback] = useState<{ context: typeof context; error?: string; message?: string } | null>(null);
  const feedback = result?.context === context ? result : null;
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); pending.current = null; }; }, [context]);
  const catalog = new Map(DEFAULT_PROJECT_DOCUMENT_CATEGORIES.map(category => [category.key, category]));
  categories.forEach(category => catalog.set(category.key, category));
  const entries: DocumentEntry[] = [
    ...[...documents.attachments, ...(documents.otherDocuments || [])].map(document => ({ document, id: `generated:${document.id}`, source: 'generated' as const })),
    ...documents.projectDocuments.map(document => ({ document, id: `project:${document.id}`, source: 'project' as const })),
    ...documents.contractDocuments.map(document => ({ document, id: `contract:${document.id}`, source: 'contract' as const })),
  ];
  const groups = new Map<string, { key: string; label: string; order: number; entries: DocumentEntry[] }>();
  entries.forEach(entry => {
    const categoryKey = entry.document.categoryKey || '';
    const category = catalog.get(categoryKey);
    const root = category?.parentKey ? catalog.get(category.parentKey) : category;
    const key = root?.key || categoryKey;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: categoryLabels.get(key) || root?.label || key || 'Sans catégorie', order: root?.displayOrder ?? Number.MAX_SAFE_INTEGER, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  });

  const selectedEntries = entries.filter(entry => selected.get(entry.id) === entryVersion(entry) && isAvailable(entry));
  function select(items: DocumentEntry[], checked: boolean) {
    setSelected(current => {
      const next = new Map(current?.context === context ? current.entries : []);
      items.forEach(entry => { if (checked && isAvailable(entry)) next.set(entry.id, entryVersion(entry)); else next.delete(entry.id); });
      return { context, entries: next };
    });
  }
  async function download(items: DocumentEntry[], archiveName: string) {
    if (pending.current || !items.length) return;
    const controller = new AbortController();
    pending.current = controller; setBusy(context); setFeedback(null);
    try {
      const result = await downloadProjectFiles(client, items.map(entry => ({ id: entry.id, file: fileReference(entry),
        categoryLabel: categoryLabels.get(entry.document.categoryKey || '') || entry.document.categoryKey || 'Sans catégorie' })), archiveName, controller.signal);
      if (mounted.current && currentContext.current === context && !controller.signal.aborted) setFeedback({ context, message: `${result.count} fichier${result.count > 1 ? 's' : ''} téléchargé${result.count > 1 ? 's' : ''}.` });
    } catch (error) {
      if (mounted.current && currentContext.current === context && !controller.signal.aborted) setFeedback({ context, error: error instanceof Error ? error.message : 'Le téléchargement a échoué. Réessayez.' });
    } finally {
      if (pending.current === controller) pending.current = null;
      if (mounted.current && currentContext.current === context && !controller.signal.aborted) setBusy(null);
    }
  }

  return <div className="project-document-groups" aria-label="Documents du projet">
    {selectedEntries.length ? <div className="project-document-selection-toolbar" aria-label="Téléchargement des documents sélectionnés">
      <span>{selectedEntries.length} fichier{selectedEntries.length > 1 ? 's' : ''} sélectionné{selectedEntries.length > 1 ? 's' : ''}</span>
      <button type="button" className="sp-button sp-button--primary" disabled={busy} onClick={() => void download(selectedEntries, 'Documents du projet.zip')}><Download aria-hidden="true" size={17} />Télécharger la sélection ({selectedEntries.length})</button>
      <button type="button" className="sp-button sp-button--secondary" disabled={busy} onClick={() => setSelected(null)}>Tout désélectionner</button>
    </div> : null}
    {busy ? <p role="status" className="project-document-download-status"><LoaderCircle aria-hidden="true" size={16} /> Préparation du téléchargement…</p> : null}
    {feedback?.error ? <p role="alert" className="project-documents-error">{feedback.error}</p> : feedback?.message ? <p role="status">{feedback.message}</p> : null}
    {[...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr')).map(group => {
      const { Icon, tone } = categoryPresentation(group.key);
      const available = group.entries.filter(isAvailable);
      const selectedCount = available.filter(entry => selected.get(entry.id) === entryVersion(entry)).length;
      return <section className="project-document-group" aria-label={group.label} key={group.key} style={{ '--project-category-color': `var(--sp-category-${tone})` } as CSSProperties}>
        <header><CategorySelection label={group.label} checked={Boolean(available.length) && selectedCount === available.length} mixed={selectedCount > 0 && selectedCount < available.length} disabled={busy || !available.length} onChange={checked => select(available, checked)} />
          <span className="project-document-group__icon"><Icon aria-hidden="true" size={20} /></span>
          <h4>{group.label}</h4><span className="project-document-group__count">{group.entries.length} document{group.entries.length > 1 ? 's' : ''}</span>
          <button type="button" className="sp-button sp-button--secondary project-document-group__download" title="Télécharger toute la catégorie" aria-label={`Télécharger la catégorie ${group.label}`} disabled={busy || !available.length} onClick={() => void download(available, `${group.label}.zip`)}><Download aria-hidden="true" size={17} /></button>
        </header>
        <ul className="project-document-chips" aria-label={`Documents · ${group.label}`}>
          {group.entries.map(entry => <DocumentChip key={entry.id} entry={entry} client={client} labels={categoryLabels} canManage={canManage}
            accessKey={accessKey}
            selected={selected.get(entry.id) === entryVersion(entry)} busy={busy} onSelect={checked => select([entry], checked)} onDownload={() => void download([entry], fileReference(entry).fileName)} />)}
        </ul>
      </section>;
    })}
    {!entries.length && !contractDocumentsUnavailable ? <p className="project-section-empty">Aucun document associé au projet.</p> : null}
    {contractDocumentsUnavailable ? <p className="project-section-empty" role="status">Documents contractuels indisponibles en raison d’une erreur de chargement.</p> : null}
  </div>;
}
