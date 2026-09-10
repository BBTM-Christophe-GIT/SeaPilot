import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Paperclip } from 'lucide-react';
import { addLiftingCertificate, downloadLiftingCertificate, fetchLiftingCertificates, type LiftingCertificate } from './liftingCertificateQueries';
import type { LiftingItem } from './liftingModel';
import { saveLiftingBlob } from './liftingPdf';

export function LiftingCertificates({ client, item }: { client: SupabaseClient; item: LiftingItem }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<LiftingCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError('');
    fetchLiftingCertificates(client, item.id).then((rows) => { if (!cancelled) setFiles(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, item.id, open]);
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <details className="lifting-certificates" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><Paperclip size={14} aria-hidden="true" /> Certificat</summary>
    {open && <div role="region" aria-label={`Certificats du matériel ${item.reference}`}>
      {loading ? <p role="status">Chargement des certificats…</p> : files.length ? <ul>{files.map((file) => <li key={file.id}>
        <span>{file.file_name}</span><button type="button" className="lifting-icon-button" disabled={busy} aria-label={`Télécharger ${file.file_name}`} onClick={() => void act(async () => saveLiftingBlob(await downloadLiftingCertificate(client, file), file.file_name))}><Download size={17} /></button>
      </li>)}</ul> : <p>Aucun certificat joint.</p>}
      <label>Ajouter un certificat<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || loading} onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) void act(async () => { await addLiftingCertificate(client, item, file); setFiles(await fetchLiftingCertificates(client, item.id)); setNotice('Certificat ajouté.'); });
      }} /></label>
      <p>PDF, JPG ou PNG · 20 Mo maximum par fichier.</p>
      {busy && <p role="status">Transfert en cours…</p>}{notice && <p role="status">{notice}</p>}
      {error && <p className="lifting-error" role="alert">{error}</p>}
    </div>}
  </details>;
}
function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de transférer le certificat. Réessayez.';
}
