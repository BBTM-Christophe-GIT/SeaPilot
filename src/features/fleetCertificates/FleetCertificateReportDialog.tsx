import { CheckCircle2, FileText, Flag, Folder, Layers3, Ship, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createDefaultFleetCertificateDocumentPath,
  FleetCertificateDocumentFields,
  type FleetCertificateDocumentPath,
} from './FleetCertificateDocumentFields';
import type { FleetCertificateFinding } from './fleetCertificateFindings';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

export type FleetCertificateReportScope = 'fleet' | 'vessel' | 'category' | 'document' | 'finding';

export interface FleetCertificateReportSelection {
  scope: FleetCertificateReportScope;
  vesselName?: string;
  categoryKey?: string;
  certificateId?: number;
  findingId?: number;
}

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

const SCOPE_OPTIONS: Array<{
  description: string;
  icon: typeof Layers3;
  label: string;
  value: FleetCertificateReportScope;
}> = [
  { value: 'fleet', label: 'Toute la flotte', description: 'Tous les navires et documents', icon: Layers3 },
  { value: 'vessel', label: 'Un navire', description: 'Le registre complet d’un navire', icon: Ship },
  { value: 'category', label: 'Une catégorie', description: 'Cette catégorie sur toute la flotte', icon: Folder },
  { value: 'document', label: 'Un document', description: 'Un certificat et ses écarts', icon: FileText },
  { value: 'finding', label: 'Un écart', description: 'Une action de traitement précise', icon: Flag },
];

export function resolveFleetCertificateReportSelection(
  certificates: FleetCertificateRecord[],
  findings: FleetCertificateFinding[],
  selection: FleetCertificateReportSelection,
): { certificates: FleetCertificateRecord[]; findings: FleetCertificateFinding[] } {
  let scopedCertificates: FleetCertificateRecord[];
  if (selection.scope === 'vessel') {
    scopedCertificates = certificates.filter((certificate) => certificate.vesselName === selection.vesselName);
  } else if (selection.scope === 'category') {
    scopedCertificates = certificates.filter((certificate) => certificate.categoryKey === selection.categoryKey);
  } else if (selection.scope === 'document' || selection.scope === 'finding') {
    scopedCertificates = certificates.filter((certificate) => certificate.id === selection.certificateId);
  } else {
    scopedCertificates = certificates;
  }

  const certificateIds = new Set(scopedCertificates.map((certificate) => certificate.id));
  const scopedFindings = selection.scope === 'finding'
    ? findings.filter((finding) => finding.id === selection.findingId && certificateIds.has(finding.certificateId))
    : findings.filter((finding) => certificateIds.has(finding.certificateId));

  return { certificates: scopedCertificates, findings: scopedFindings };
}

export function FleetCertificateReportDialog({
  certificates,
  findings,
  onClose,
  onGenerate,
}: {
  certificates: FleetCertificateRecord[];
  findings: FleetCertificateFinding[];
  onClose: () => void;
  onGenerate: (selection: FleetCertificateReportSelection) => Promise<void>;
}) {
  const [scope, setScope] = useState<FleetCertificateReportScope>('fleet');
  const [path, setPath] = useState<FleetCertificateDocumentPath>(() => createDefaultFleetCertificateDocumentPath(certificates));
  const [categoryKey, setCategoryKey] = useState(() => certificates.slice().sort((left, right) => frenchSort.compare(left.categoryLabel, right.categoryLabel))[0]?.categoryKey || '');
  const [findingId, setFindingId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const categories = useMemo(
    () => Array.from(new Map(certificates
      .slice()
      .sort((left, right) => frenchSort.compare(left.categoryLabel, right.categoryLabel))
      .map((certificate) => [certificate.categoryKey, certificate.categoryLabel]))),
    [certificates],
  );
  const documentFindings = findings.filter((finding) => finding.certificateId === path.certificateId);
  const effectiveFindingId = documentFindings.some((finding) => finding.id === findingId)
    ? findingId
    : documentFindings[0]?.id || null;

  const selection: FleetCertificateReportSelection = scope === 'fleet'
    ? { scope }
    : scope === 'vessel'
      ? { scope, vesselName: path.vesselName }
      : scope === 'category'
        ? { scope, categoryKey }
        : scope === 'document'
          ? { scope, certificateId: path.certificateId || undefined }
          : { scope, certificateId: path.certificateId || undefined, findingId: effectiveFindingId || undefined };
  const resolved = resolveFleetCertificateReportSelection(certificates, findings, selection);
  const vesselCount = new Set(resolved.certificates.map((certificate) => certificate.vesselName)).size;
  const selectedCertificate = certificates.find((certificate) => certificate.id === path.certificateId);
  const selectedFinding = findings.find((finding) => finding.id === effectiveFindingId);
  const selectedCategory = categories.find(([key]) => key === categoryKey)?.[1] || '';
  const selectionComplete = scope === 'fleet'
    || (scope === 'vessel' && Boolean(path.vesselName))
    || (scope === 'category' && Boolean(categoryKey))
    || (scope === 'document' && Boolean(path.certificateId))
    || (scope === 'finding' && Boolean(path.certificateId && effectiveFindingId));
  const perimeterLabel = scope === 'fleet'
    ? 'Toute la flotte'
    : scope === 'vessel'
      ? path.vesselName
      : scope === 'category'
        ? selectedCategory
        : scope === 'document'
          ? `${selectedCertificate?.vesselName || ''} · ${selectedCertificate?.documentTitle || ''}`
          : `${selectedCertificate?.vesselName || ''} · ${selectedFinding?.reference || ''} · ${selectedFinding?.title || ''}`;

  async function generate() {
    if (!selectionComplete) return;
    setGenerating(true);
    setError('');
    try {
      await onGenerate(selection);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de générer le rapport.');
    } finally {
      setGenerating(false);
    }
  }

  return <div className="fcx-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section aria-modal="true" aria-label="Générer un rapport" className="fcx-modal fcx-report-dialog" role="dialog">
      <header><div><small>Certificats flotte</small><h2>Générer un rapport</h2><p>Définissez précisément les informations à inclure.</p></div><button aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>
      <div className="fcx-report-dialog-body">
        <section className="fcx-report-scope-section" aria-labelledby="fleet-report-scope-title">
          <div className="fcx-dialog-section-title"><span>1</span><div><h3 id="fleet-report-scope-title">Périmètre du rapport</h3><p>Choisissez le niveau d’analyse attendu.</p></div></div>
          <div className="fcx-report-scope-options" role="radiogroup" aria-label="Périmètre du rapport">
            {SCOPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return <button aria-checked={scope === option.value} className={scope === option.value ? 'is-active' : ''} key={option.value} onClick={() => setScope(option.value)} role="radio" type="button"><Icon size={18} /><span><b>{option.label}</b><small>{option.description}</small></span>{scope === option.value ? <CheckCircle2 size={16} /> : null}</button>;
            })}
          </div>
        </section>

        {scope !== 'fleet' ? <section className="fcx-report-details-section" aria-labelledby="fleet-report-details-title">
          <div className="fcx-dialog-section-title"><span>2</span><div><h3 id="fleet-report-details-title">Sélection détaillée</h3><p>Les listes suivantes se mettent à jour selon votre choix.</p></div></div>
          {scope === 'category' ? <div className="fcx-document-path-fields is-single"><label>Catégorie
            <select aria-label="Catégorie du rapport" required value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          </label></div> : <FleetCertificateDocumentFields certificates={certificates} level={scope === 'vessel' ? 'vessel' : 'document'} onChange={(next) => { setPath(next); setFindingId(null); }} value={path} />}
          {scope === 'finding' ? <div className="fcx-report-finding-field"><label>Écart
            <select aria-label="Écart" required value={effectiveFindingId || ''} onChange={(event) => setFindingId(Number(event.target.value) || null)}>
              {documentFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.reference} · {finding.title}</option>)}
            </select>
            {!documentFindings.length ? <small>Aucun écart n’est rattaché à ce document.</small> : null}
          </label></div> : null}
        </section> : null}

        <section className="fcx-report-summary" aria-label="Récapitulatif du rapport">
          <span><CheckCircle2 size={18} /></span><div><small>Récapitulatif</small><h3>{perimeterLabel || 'Sélection incomplète'}</h3><p>{vesselCount} navire{vesselCount > 1 ? 's' : ''} · {resolved.certificates.length} document{resolved.certificates.length > 1 ? 's' : ''} · {resolved.findings.length} écart{resolved.findings.length > 1 ? 's' : ''}</p></div>
        </section>
        {error ? <p className="fcx-visit-error" role="alert">{error}</p> : null}
      </div>
      <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={!selectionComplete || generating} onClick={generate} type="button"><FileText size={16} />{generating ? 'Génération…' : 'Générer le rapport'}</button></footer>
    </section>
  </div>;
}
