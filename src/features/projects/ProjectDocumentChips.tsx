import type { SupabaseClient } from '@supabase/supabase-js';
import { BriefcaseBusiness, File, FileImage, FileSpreadsheet, FileText, Folder, Info, ReceiptText, ShieldCheck, Waves } from 'lucide-react';
import { DEFAULT_PROJECT_DOCUMENT_CATEGORIES, type ProjectDocumentCategory } from './projectDocumentCategories';
import { ProjectDocumentCategoryAction } from './ProjectDocumentClassificationEditor';
import { ProjectSeaOperationDocumentCheckbox } from './ProjectSeaOperationDocuments';
import { ProjectStoredDocumentLink } from './ProjectStoredDocumentLink';
import { getSharePointDocumentLinkState } from './projectDocuments';
import type { ProjectDocumentRecord, ProjectOperationDocumentRecord } from './projectQueries';
import './ProjectDocumentChips.css';

interface Props {
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

function filePresentation(fileName: string, mimeType: string) {
  const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || /^(png|jpe?g|gif|webp|svg|heic)$/.test(extension)) return { Icon: FileImage, label: 'Image' };
  if (/^(xlsx?|csv|ods)$/.test(extension) || /spreadsheet|excel/.test(mimeType)) return { Icon: FileSpreadsheet, label: extension.toUpperCase() || 'Tableur' };
  if (/^(pdf|docx?|odt|txt|rtf)$/.test(extension) || /pdf|word|text/.test(mimeType)) return { Icon: FileText, label: extension.toUpperCase() || 'Document' };
  return { Icon: File, label: extension.length <= 5 ? extension.toUpperCase() : 'Fichier' };
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

function categoryIcon(key: string) {
  if (key === 'commercial_offer') return BriefcaseBusiness;
  if (key === 'hse') return ShieldCheck;
  if (key === 'billing') return ReceiptText;
  if (key === 'toilette_de_mer') return Waves;
  return Folder;
}

function DocumentChip({ entry, client, labels, canManage }: {
  entry: DocumentEntry; client: SupabaseClient; labels: ReadonlyMap<string, string>; canManage: boolean;
}) {
  const { document, source, id } = entry;
  const name = document.fileName || ('title' in document ? document.title : '') || 'Document sans nom';
  const { Icon, label } = filePresentation(name, document.mimeType);
  const category = labels.get(document.categoryKey || '') || document.categoryKey || 'Sans catégorie';
  const subcategory = document.subcategoryKey ? labels.get(document.subcategoryKey) || document.subcategoryKey : '';
  const generated = 'documentType' in document;
  const linkState = !generated ? getSharePointDocumentLinkState(document.fileUrl) : null;
  const stored = Boolean(document.storageBucket && document.storagePath);
  const canOpen = generated || stored || linkState?.status === 'available';
  const canSelect = source === 'project' ? !('isFolder' in document && document.isFolder)
    : generated && ['operation_attachment', 'project_attachment'].includes(document.documentType);
  const date = generated ? document.createdAt : document.sourceModifiedAt;
  const metadata = [category, subcategory, label, fileSize(document.fileSizeBytes), date ? `${generated ? 'Ajouté' : 'Modifié'} le ${formattedDate(date)}` : '',
    source === 'contract' ? 'Document contractuel' : 'Document du projet'].filter(Boolean);

  return <li className="project-document-chip">
    <div className="project-document-chip__identity">
      <span className="project-document-chip__icon" title={label}><Icon aria-hidden="true" size={21} /></span>
      <div><strong title={name}>{name}</strong>{subcategory ? <small>{subcategory}</small> : null}</div>
    </div>
    <div className="project-document-chip__actions">
      {canOpen ? <ProjectStoredDocumentLink client={client} document={{ fileName: name, storageBucket: document.storageBucket, storagePath: document.storagePath,
        sharePointWebUrl: generated ? document.sharePointWebUrl : linkState?.status === 'available' ? linkState.href : '' }} includeIcon />
        : <span className="project-missing-link">{linkState?.status === 'missing' ? 'URL SharePoint absente' : 'URL SharePoint invalide ou non autorisée'}</span>}
      <ProjectDocumentCategoryAction documentId={id} />
      {canManage && canSelect ? <ProjectSeaOperationDocumentCheckbox documentId={id} documentName={name} showLabel /> : null}
    </div>
    <details className="project-document-chip__details">
      <summary><Info aria-hidden="true" size={14} /> Détails<span className="sr-only"> : {name}</span></summary>
      <div><span>{metadata.join(' · ')}</span>
        {generated && document.expiresOn ? <small>Échéance : {formattedDate(document.expiresOn)}</small> : null}
        {generated && document.sharePointFolderPath ? <small>{document.sharePointFolderPath}</small> : null}
        {!generated && (document.folderPath || document.notes) ? <small>{document.folderPath || document.notes}</small> : null}
        {document.projectId === null ? <small className="project-document-warning">Rattachement au projet Supabase non résolu</small> : null}
      </div>
    </details>
  </li>;
}

export function ProjectDocumentChips({ client, documents, categories, categoryLabels, canManage, contractDocumentsUnavailable = false }: Props) {
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

  return <div className="project-document-groups" aria-label="Documents du projet">
    {[...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr')).map(group => {
      const Icon = categoryIcon(group.key);
      return <section className="project-document-group" aria-label={group.label} key={group.key}>
        <header><span className="project-document-group__icon"><Icon aria-hidden="true" size={20} /></span>
          <h4>{group.label}</h4><span className="project-document-group__count">{group.entries.length} document{group.entries.length > 1 ? 's' : ''}</span>
        </header>
        <ul className="project-document-chips" aria-label={`Documents · ${group.label}`}>
          {group.entries.map(entry => <DocumentChip key={entry.id} entry={entry} client={client} labels={categoryLabels} canManage={canManage} />)}
        </ul>
      </section>;
    })}
    {!entries.length && !contractDocumentsUnavailable ? <p className="project-section-empty">Aucun document associé au projet.</p> : null}
    {contractDocumentsUnavailable ? <p className="project-section-empty" role="status">Documents contractuels indisponibles en raison d’une erreur de chargement.</p> : null}
  </div>;
}
