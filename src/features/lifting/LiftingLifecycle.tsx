import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { annualExpiry, formatLiftingDate, liftingDeadline, todayLocal, type LiftingItem } from './liftingModel';
import { fetchLiftingCertificates, validateLiftingCertificate } from './liftingCertificateQueries';

export function useLiftingToday() {
  const [today, setToday] = useState(todayLocal);
  useEffect(() => {
    const update = () => setToday(todayLocal());
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  return today;
}

export function LiftingDueBadge({ date, today }: { date?: string | null; today: string }) {
  const state = liftingDeadline(date, today);
  if (!date) return null;
  const Icon = state === 'expired' ? CircleAlert : TriangleAlert;
  return <span className={`lifting-due ${state}`}>
    {state && <Icon size={15} aria-hidden="true" />}
    {state === 'expired' ? 'Échu le' : state === 'soon' ? 'Échéance proche :' : 'Échéance :'} {formatLiftingDate(date)}
  </span>;
}

export function LiftingReplaceForm({ client, item, busy, error, onClose, onSave }: {
  client: SupabaseClient; item: LiftingItem; busy: boolean; error: string; onClose: () => void; onSave: (date: string, files: File[]) => void;
}) {
  const [date, setDate] = useState(todayLocal);
  const [files, setFiles] = useState<File[]>([]);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [fileError, setFileError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoadError(''); setCurrentCount(null);
    fetchLiftingCertificates(client, item.id).then((rows) => {
      if (!cancelled) setCurrentCount(rows.filter((file) => file.service_version === (item.service_version ?? 1)).length);
    }).catch(() => { if (!cancelled) setLoadError('Impossible de charger les certificats existants. Réessayez.'); });
    return () => { cancelled = true; };
  }, [client, item.id, item.service_version, retry]);
  const needsCertificate = Boolean(currentCount && !files.length);
  return <AppDialog title={`Remplacer le matériel ${item.reference}`} isBusy={busy} onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); if (currentCount !== null && !needsCertificate && !fileError) onSave(date, files); }}
    footer={<><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !date || currentCount === null || needsCertificate || Boolean(fileError)}>Remplacer le matériel</button></>}>
    <p><strong>{item.description}</strong></p>
    <p>L’identifiant et les caractéristiques sont conservés. L’échéance annuelle repart de la nouvelle mise en service.</p>
    <div className="lifting-form-grid"><label>Nouvelle date de mise en service<input type="date" required min={item.commissioned_on} max={todayLocal()} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
    <p>Prochaine visite : <strong>{formatLiftingDate(annualExpiry(date))}</strong></p>
    <section className="lifting-replacement-certificates" aria-label="Certificats du nouveau matériel"><h3>Certificat</h3>
      <p>Les pièces jointes précédentes seront archivées avec l’ancien matériel. Joignez les certificats du matériel de remplacement.</p>
      {currentCount === null && !loadError && <p role="status">Chargement des certificats…</p>}
      {loadError && <p role="alert">{loadError} <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Réessayer</button></p>}
      <label>Nouveaux certificats<input type="file" multiple accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={(event) => {
        const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = '';
        try { selected.forEach(validateLiftingCertificate); setFiles((previous) => [...previous, ...selected]); setFileError(''); }
        catch (e) { setFileError(e instanceof Error ? e.message : 'Fichier non accepté.'); }
      }} /></label>
      <p className="lifting-muted">PDF, JPG ou PNG · 20 Mo maximum par fichier.{Boolean(currentCount) && ' Un nouveau certificat est requis pour remplacer les pièces jointes existantes.'}</p>
      {files.length > 0 && <ul>{files.map((file, index) => <li key={`${file.name}-${index}`}><span>{file.name}</span><button type="button" className="secondary-button" disabled={busy} aria-label={`Retirer ${file.name}`} onClick={() => { setFiles((previous) => previous.filter((_, i) => i !== index)); setFileError(''); }}>Retirer</button></li>)}</ul>}
      {fileError && <p className="lifting-error" role="alert">{fileError}</p>}
    </section>
    {error && <p className="lifting-error" role="alert">{error}</p>}
  </AppDialog>;
}
