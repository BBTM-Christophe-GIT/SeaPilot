import { ExternalLink, FileCheck2, FileText, LoaderCircle, Ship } from 'lucide-react';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

interface FleetCertificateDocumentPreviewProps {
  certificate: FleetCertificateRecord;
  previewUrl: string;
  loading: boolean;
  onOpen: () => void;
}

export function FleetCertificateDocumentPreview({
  certificate,
  previewUrl,
  loading,
  onOpen,
}: FleetCertificateDocumentPreviewProps) {
  const isImage = certificate.mimeType.startsWith('image/');
  const isPdf = certificate.mimeType === 'application/pdf' || certificate.fileName.toLocaleLowerCase('fr').endsWith('.pdf');

  return <aside className="fcx-command-card fcx-document-preview">
    <header>
      <div>
        <span>Document actif</span>
        <h2>Prévisualisation</h2>
      </div>
      <button aria-label={`Afficher ${certificate.documentTitle} dans un nouvel onglet`} onClick={onOpen} title="Afficher dans un nouvel onglet" type="button">
        <ExternalLink size={16} />
      </button>
    </header>
    <button className="fcx-preview-title" onClick={onOpen} type="button">
      <FileText size={16} />
      <span><b>{certificate.documentTitle}</b><small>{certificate.fileName}</small></span>
    </button>
    <div className="fcx-preview-stage">
      {loading ? <div className="fcx-preview-loading"><LoaderCircle className="spin" /> Préparation du document…</div>
        : previewUrl && isImage ? <img alt={`Aperçu de ${certificate.documentTitle}`} src={previewUrl} />
          : previewUrl && isPdf ? <iframe src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`} title={`Prévisualisation de ${certificate.documentTitle}`} />
            : <div className="fcx-preview-sheet" aria-label={`Aperçu synthétique de ${certificate.documentTitle}`}>
              <span className="fcx-preview-logo">BBTM</span>
              <FileCheck2 size={38} />
              <small>Certificat flotte</small>
              <h3>{certificate.documentTitle}</h3>
              <p><Ship size={13} /> {certificate.vesselName}</p>
              <dl>
                <div><dt>Catégorie</dt><dd>{certificate.categoryLabel}</dd></div>
                <div><dt>Version</dt><dd>Version {certificate.currentVersionNo}</dd></div>
                <div><dt>Format</dt><dd>{certificate.mimeType || 'Document'}</dd></div>
              </dl>
              <em>Le document complet est disponible en cliquant sur son titre.</em>
            </div>}
    </div>
  </aside>;
}
