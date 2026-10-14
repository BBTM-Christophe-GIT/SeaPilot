import { useState } from 'react';
import type { MedicalSignatureSnapshot } from './medicalLogbookModel';

export function MedicalSignaturePreview({ signature, url, loading = false, unavailable = false }: {
  signature: MedicalSignatureSnapshot; url?: string; loading?: boolean; unavailable?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState('');
  const visibleUrl = url && failedUrl !== url ? url : '';
  return <div className="medical-signature-preview">
    {visibleUrl ? <img src={visibleUrl} alt={`Signature de ${signature.signer_name}`} decoding="async" onError={() => setFailedUrl(visibleUrl)} /> : null}
    <span>{signature.signer_name}</span>
    <small>Signature du profil · version {signature.version_number}</small>
    {!visibleUrl && (unavailable || !!url) ? <small>Aperçu de la signature indisponible.</small> : loading ? <small>Chargement de la signature…</small> : null}
  </div>;
}
