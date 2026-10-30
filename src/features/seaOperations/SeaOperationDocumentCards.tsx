import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, FolderOpen, LoaderCircle, ShieldCheck, Ship, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ProjectDocumentThumbnail } from '../projects/ProjectDocumentThumbnail';
import { ProjectDocumentDeleteAction, ProjectDocumentDeletionProvider } from '../projects/ProjectDocumentDeleteDialog';
import { loadSeaOperationProjectDocumentBlob, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';
import { downloadSeaOperationDocuments } from './seaOperationDocumentDownloads';
import '../projects/ProjectDocumentChips.css';

interface Props {
  client: SupabaseClient;
  projectId: string;
  accessKey: string;
  documents: SeaOperationProjectDocument[];
  disabled?: boolean;
  canManage?: boolean;
  onOpen: (document: SeaOperationProjectDocument) => void;
  onDeleted: (documentId: string) => void;
}

function presentation(label: string) {
  const normalized = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/hse|securite/.test(normalized)) return { Icon: ShieldCheck, tone: 'hse' };
  if (/toilette|mer/.test(normalized)) return { Icon: Waves, tone: 'marine' };
  if (/operation/.test(normalized)) return { Icon: Ship, tone: 'marine' };
  return { Icon: FolderOpen, tone: 'project' };
}

function SeaDocumentCard({ client, projectId, accessKey, document, disabled, selected, onSelect, onDownload, onOpen }: {
  client: SupabaseClient; projectId: string; accessKey: string; document: SeaOperationProjectDocument;
  disabled: boolean; selected: boolean; onSelect: (selected: boolean) => void; onDownload: () => void; onOpen: () => void;
}) {
  const version = JSON.stringify(document);
  const loadBlob = useMemo(() => (signal: AbortSignal) => loadSeaOperationProjectDocumentBlob(client, projectId, document, signal),
    [client, projectId, accessKey, version]);
  return <li className={`project-document-chip${selected ? ' is-selected' : ''}`}>
    <div className="project-document-chip__identity">
      <label className="project-document-chip__selection" title="Sélectionner pour le téléchargement"><input type="checkbox" checked={selected} disabled={disabled}
        aria-label={`Sélectionner ${document.fileName} pour le téléchargement`} onChange={event => onSelect(event.target.checked)} /></label>
      <button type="button" className="project-document-chip__open" aria-label={`Ouvrir : ${document.title || document.fileName}`} disabled={disabled} onClick={onOpen}>
        <ProjectDocumentThumbnail client={client} document={{ fileName: document.fileName, mimeType: document.mimeType }} revisionKey={`sea:${accessKey}:${projectId}:${version}`} loadBlob={loadBlob} />
        <span className="project-document-chip__copy"><strong>{document.fileName}</strong>
          {document.title !== document.fileName ? <small>{document.title}</small> : null}
          {document.subcategoryLabel ? <small>{document.subcategoryLabel}</small> : null}</span>
      </button>
    </div>
    {document.expiresOn ? <small className="project-document-chip__expiry">Échéance : {document.expiresOn}</small> : null}
    <div className="project-document-chip__actions"><button type="button" className="sp-button sp-button--secondary project-document-chip__download" aria-label={`Télécharger ${document.fileName}`}
      title="Télécharger" disabled={disabled} onClick={onDownload}><Download aria-hidden="true" size={17} /></button><ProjectDocumentDeleteAction documentId={document.id} /></div>
  </li>;
}

function GroupSelection({ label, checked, mixed, disabled, onChange }: { label: string; checked: boolean; mixed: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className="project-document-group__selection"><input ref={input} type="checkbox" aria-label={`Sélectionner tous les documents de ${label}`}
    aria-checked={mixed ? 'mixed' : checked} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /></label>;
}

export function SeaOperationDocumentCards({ client, projectId, accessKey, documents, disabled = false, canManage = false, onOpen, onDeleted }: Props) {
  const context = useMemo(() => ({ client, projectId, accessKey }), [client, projectId, accessKey]);
  const currentContext = useRef(context); currentContext.current = context;
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [selection, setSelection] = useState<{ context: typeof context; ids: ReadonlyMap<string, string> } | null>(null);
  const [result, setResult] = useState<{ context: typeof context; busy?: boolean; error?: string; message?: string } | null>(null);
  const current = result?.context === context ? result : null;
  const selected = selection?.context === context ? selection.ids : new Map<string, string>();
  const selectedDocuments = documents.filter(document => selected.get(document.id) === JSON.stringify(document));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); pending.current = null; }; }, [context]);
  const groups = new Map<string, SeaOperationProjectDocument[]>();
  documents.forEach(document => { const items = groups.get(document.categoryLabel) || []; items.push(document); groups.set(document.categoryLabel, items); });
  function select(items: SeaOperationProjectDocument[], checked: boolean) {
    setSelection(previous => { const next = new Map(previous?.context === context ? previous.ids : []);
      items.forEach(document => { if (checked) next.set(document.id, JSON.stringify(document)); else next.delete(document.id); }); return { context, ids: next }; });
  }
  async function download(items: SeaOperationProjectDocument[], name: string) {
    if (disabled || pending.current || !items.length) return;
    const controller = new AbortController(); pending.current = controller; setResult({ context, busy: true });
    try {
      const result = await downloadSeaOperationDocuments(client, projectId, items, name, controller.signal);
      if (mounted.current && currentContext.current === context && !controller.signal.aborted) setResult({ context, message: `${result.count} fichier${result.count > 1 ? 's' : ''} téléchargé${result.count > 1 ? 's' : ''}.` });
    } catch (error) {
      if (mounted.current && currentContext.current === context && !controller.signal.aborted) setResult({ context, error: error instanceof Error ? error.message : 'Le téléchargement a échoué.' });
    } finally { if (pending.current === controller) pending.current = null; }
  }
  const blocked = disabled || Boolean(current?.busy);
  const numericProject = Number(projectId);
  const manager = canManage && Number.isSafeInteger(numericProject) && numericProject > 0;
  return <ProjectDocumentDeletionProvider accessKey={`sea:${accessKey}`} archived={false} canManage={manager} client={client} projectId={numericProject}
    documents={documents.map(document => ({ documentId: document.id, fileName: document.fileName, sourceKey: JSON.stringify(document) }))} onDeleted={result => onDeleted(result.documentId)}>
    <div className="project-document-groups" aria-label="Documents opérationnels du projet">
      {selectedDocuments.length ? <div className="project-document-selection-toolbar" aria-label="Téléchargement des documents sélectionnés"><span>{selectedDocuments.length} fichier{selectedDocuments.length > 1 ? 's' : ''} sélectionné{selectedDocuments.length > 1 ? 's' : ''}</span>
        <button className="sp-button sp-button--primary" type="button" disabled={blocked} onClick={() => void download(selectedDocuments, 'Documents opération.zip')}><Download aria-hidden="true" size={17} />Télécharger la sélection ({selectedDocuments.length})</button>
        <button className="sp-button sp-button--secondary" type="button" disabled={blocked} onClick={() => setSelection(null)}>Tout désélectionner</button></div> : null}
      {current?.busy ? <p role="status" className="project-document-download-status"><LoaderCircle aria-hidden="true" size={16} />Préparation du téléchargement…</p>
        : current?.error ? <p role="alert">{current.error}</p> : current?.message ? <p role="status">{current.message}</p> : null}
      {[...groups.entries()].map(([label, items]) => {
        const { Icon, tone } = presentation(label); const count = items.filter(document => selected.get(document.id) === JSON.stringify(document)).length;
        return <section className="project-document-group" aria-label={label} key={label} style={{ '--project-category-color': `var(--sp-category-${tone})` } as CSSProperties}>
          <header><GroupSelection label={label} checked={count === items.length} mixed={count > 0 && count < items.length} disabled={blocked} onChange={checked => select(items, checked)} />
            <span className="project-document-group__icon"><Icon aria-hidden="true" size={20} /></span><h4>{label}</h4><span className="project-document-group__count">{items.length} document{items.length > 1 ? 's' : ''}</span>
            <button className="sp-button sp-button--secondary project-document-group__download" type="button" disabled={blocked} aria-label={`Télécharger la catégorie ${label}`} title="Télécharger toute la catégorie" onClick={() => void download(items, `${label}.zip`)}><Download aria-hidden="true" size={17} /></button></header>
          <ul className="project-document-chips" aria-label={`Documents · ${label}`}>{items.map(document => <SeaDocumentCard key={document.id} client={client} projectId={projectId} accessKey={accessKey} document={document} disabled={blocked}
            selected={selected.get(document.id) === JSON.stringify(document)} onSelect={checked => select([document], checked)} onDownload={() => void download([document], document.fileName)} onOpen={() => onOpen(document)} />)}</ul>
        </section>;
      })}
    </div>
  </ProjectDocumentDeletionProvider>;
}
