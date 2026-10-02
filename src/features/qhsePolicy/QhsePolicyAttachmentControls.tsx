import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Eye, FileText, Paperclip, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { QHSE_POLICY_ATTACHMENT_ACCEPT, readQhsePolicyAttachment, validateQhsePolicyAttachmentFiles } from './qhsePolicyAttachments';
import type { QhsePolicyAttachment } from './qhsePolicyModel';
import { qhsePolicyError } from './qhsePolicyPresentation';

const PdfReader = lazy(() => import('./QhsePolicyPdfReader'));
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function fileSize(size: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(size / (size >= 1024 * 1024 ? 1024 * 1024 : 1024)) + (size >= 1024 * 1024 ? ' Mo' : ' Ko');
}

export function downloadQhsePolicyFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function QhsePolicyFilePicker({ files, onChange, onError, busy }: {
  files: File[]; onChange: (files: File[]) => void; onError: (error: string) => void; busy: boolean;
}) {
  function select(next: File[]) {
    onChange(next);
    try { validateQhsePolicyAttachmentFiles(next); onError(''); }
    catch (reason: unknown) { onError(qhsePolicyError(reason, 'Ces pièces jointes ne peuvent pas être ajoutées.')); }
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const additions = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (additions.length) select([...files, ...additions]);
  }
  return <div className="qhse-policy-file-picker">
    <label>Pièces jointes (facultatif)<input type="file" multiple accept={QHSE_POLICY_ATTACHMENT_ACCEPT} disabled={busy} onChange={choose} /></label>
    <p className="qhse-policy-muted">10 fichiers maximum, 25 Mo par fichier. PDF, images et documents bureautiques.</p>
    {files.length ? <ul aria-label="Pièces jointes sélectionnées">{files.map((file, index) => <li key={`${file.name}-${file.size}-${index}`}><Paperclip size={15} aria-hidden="true" /><span>{file.name}<small>{fileSize(file.size)}</small></span><button type="button" aria-label={`Retirer ${file.name}`} disabled={busy} onClick={() => select(files.filter((_, position) => position !== index))}><X size={16} aria-hidden="true" /></button></li>)}</ul> : null}
  </div>;
}

interface AttachmentScope { client: SupabaseClient; scopeKey: string }
interface Preview { scope: AttachmentScope; attachment: QhsePolicyAttachment; blob: Blob; url: string; error: string }

export function QhsePolicyAttachmentList({ client, scopeKey, attachments }: {
  client: SupabaseClient; scopeKey: string; attachments: QhsePolicyAttachment[];
}) {
  const scope = useMemo(() => ({ client, scopeKey }), [client, scopeKey]);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [pending, setPending] = useState<AttachmentScope | null>(null);
  const pendingRef = useRef<AttachmentScope | null>(null);
  const [storedError, setError] = useState<{ scope: AttachmentScope; message: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const visiblePreview = preview?.scope === scope ? preview : null;
  const error = storedError?.scope === scope ? storedError.message : '';
  const busy = pending === scope;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => () => { scopeRef.current = { client, scopeKey: 'unmounted' }; }, [client, scopeKey]);

  async function open(attachment: QhsePolicyAttachment, showPreview: boolean) {
    if (pendingRef.current === scope) return;
    pendingRef.current = scope; setPending(scope); setError(null);
    try {
      const blob = await readQhsePolicyAttachment(client, attachment);
      if (scopeRef.current !== scope) return;
      if (showPreview) setPreview({ scope, attachment, blob, url: URL.createObjectURL(blob), error: '' });
      else downloadQhsePolicyFile(blob, attachment.fileName);
    } catch (reason: unknown) {
      if (scopeRef.current === scope) setError({ scope, message: qhsePolicyError(reason, 'Cette pièce jointe ne peut pas être chargée.') });
    } finally {
      if (pendingRef.current === scope) pendingRef.current = null;
      setPending((value) => value === scope ? null : value);
    }
  }
  if (!attachments.length) return null;
  return <div className="qhse-policy-attachments">
    <ul aria-label="Pièces jointes du suivi">{attachments.map((attachment) => <li key={attachment.id}>
      <FileText size={16} aria-hidden="true" /><span>{attachment.fileName}<small>{fileSize(attachment.sizeBytes)}</small></span>
      <div>{attachment.mimeType === 'application/pdf' || imageTypes.has(attachment.mimeType) ? <button type="button" disabled={busy} aria-label={`Aperçu de ${attachment.fileName}`} onClick={() => void open(attachment, true)}><Eye size={15} aria-hidden="true" />Aperçu</button> : null}<button type="button" disabled={busy} aria-label={`Télécharger ${attachment.fileName}`} onClick={() => void open(attachment, false)}><Download size={15} aria-hidden="true" />Télécharger</button></div>
    </li>)}</ul>
    {busy ? <p role="status" className="qhse-policy-muted">Chargement de la pièce jointe…</p> : null}
    {error ? <p role="alert" className="qhse-policy-feedback is-error">{error}</p> : null}
    {visiblePreview ? <div className="qhse-policy-dialog"><AppDialog title={`Pièce jointe · ${visiblePreview.attachment.fileName}`} onClose={() => setPreview(null)} size="xl" footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" onClick={() => setPreview(null)}>Fermer l’aperçu</button><button type="button" className="is-primary" onClick={() => downloadQhsePolicyFile(visiblePreview.blob, visiblePreview.attachment.fileName)}><Download size={16} aria-hidden="true" />Télécharger</button></div>}>
      {visiblePreview.attachment.mimeType === 'application/pdf' ? <Suspense fallback={<p role="status">Chargement du lecteur PDF…</p>}><PdfReader url={visiblePreview.url} title={visiblePreview.attachment.fileName} label="Pièce jointe" /></Suspense>
        : visiblePreview.error ? <p role="alert" className="qhse-policy-feedback is-error">{visiblePreview.error}</p>
          : <img className="qhse-policy-attachment-image" src={visiblePreview.url} alt={visiblePreview.attachment.fileName} onError={() => setPreview((value) => value ? { ...value, error: 'Cette image ne peut pas être affichée. Vous pouvez télécharger le fichier.' } : value)} />}
    </AppDialog></div> : null}
  </div>;
}
