import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import {
  fetchFleetCertificateVersions, validateFleetCertificateRenewal,
  type FleetCertificateRecord, type FleetCertificateVersion,
} from './fleetCertificateQueries';
import './fleetCertificateVersions.css';

const versionLabels: Record<FleetCertificateVersion['status'], string> = {
  active: 'Version actuelle', archived: 'Archivée', pending_validation: 'À valider', rejected: 'Refusée',
};

function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message) : 'Impossible de charger ou de valider cette version. Réessayez.';
}

function dateLabel(date: string): string {
  return date ? date.split('-').reverse().join('/') : 'Non renseignée';
}

export function FleetCertificateVersionsPanel({ certificate, client, canValidate, onPreview, onValidated }: {
  certificate: FleetCertificateRecord;
  client: SupabaseClient;
  canValidate: boolean;
  onPreview: (version: FleetCertificateVersion) => void;
  onValidated: () => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<{ certificateId: number; versions: FleetCertificateVersion[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validatingId, setValidatingId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetchFleetCertificateVersions(client, certificate.id)
      .then((versions) => { if (!cancelled) setLoaded({ certificateId: certificate.id, versions }); })
      .catch((caught) => { if (!cancelled) setError(errorMessage(caught)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [certificate.id, certificate.updatedAt, client, retry]);

  async function validate(version: FleetCertificateVersion) {
    if (!canValidate || validatingId !== null || version.status !== 'pending_validation') return;
    setValidatingId(version.id); setError('');
    try {
      await validateFleetCertificateRenewal(client, version.id);
      await onValidated();
      setRetry((current) => current + 1);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setValidatingId(null); }
  }

  const versions = loaded?.certificateId === certificate.id ? loaded.versions : [];
  return <section aria-label="Versions du document" className="fcx-document-versions">
    <h3>Versions du document</h3>
    {loading ? <p role="status">Chargement des versions…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button className="fcx-secondary" onClick={() => setRetry((current) => current + 1)} type="button"><RefreshCw size={14} /> Réessayer</button></div> : null}
    {!loading && !error && !versions.length ? <p>Aucune version déposée.</p> : null}
    {versions.length ? <ul>{versions.map((version) => <li key={version.id}>
      <div><FileText size={16} /><span><strong>v{version.versionNo} · {versionLabels[version.status]}</strong><small>{version.normalizedFileName || version.originalFileName}</small><small>Émission : {dateLabel(version.issuedOn)} · Échéance : {dateLabel(version.expiresOn)}</small></span></div>
      <div className="fcx-version-actions">
        <button aria-label={`Afficher la version v${version.versionNo}`} className="fcx-secondary" disabled={validatingId !== null || !version.storageBucket || !version.storagePath} onClick={() => onPreview(version)} type="button">Afficher</button>
        {canValidate && version.status === 'pending_validation' ? <button aria-label={`Valider la version v${version.versionNo}`} className="fcx-primary" disabled={validatingId !== null} onClick={() => void validate(version)} type="button"><CheckCircle2 size={15} /> {validatingId === version.id ? 'Validation…' : 'Valider'}</button> : null}
      </div>
    </li>)}</ul> : null}
  </section>;
}
