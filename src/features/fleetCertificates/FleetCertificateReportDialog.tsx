import { CheckCircle2, FileText, Flag, Folder, Layers3, ListChecks, Ship, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createDefaultFleetCertificateDocumentPath,
  FleetCertificateDocumentFields,
  type FleetCertificateDocumentPath,
} from './FleetCertificateDocumentFields';
import type { FleetCertificateFinding } from './fleetCertificateFindings';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

export type FleetCertificateReportScope = 'fleet' | 'vessel-list' | 'vessel' | 'category' | 'document' | 'finding';

export interface FleetCertificateReportSelection {
  scope: FleetCertificateReportScope;
  includeDocuments: boolean;
  includeFindings: boolean;
  vesselNames?: string[];
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
  { value: 'vessel-list', label: 'Liste des documents', description: 'Un ou plusieurs navires avec leurs échéances', icon: ListChecks },
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
  if (selection.scope === 'vessel-list') {
    const vesselNames = new Set(selection.vesselNames || []);
    scopedCertificates = certificates.filter((certificate) => vesselNames.has(certificate.vesselName));
  } else if (selection.scope === 'vessel') {
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
  const vessels = useMemo(() => Array.from(new Set(certificates.map((certificate) => certificate.vesselName)))
    .sort((left, right) => frenchSort.compare(left, right)), [certificates]);
  const [scope, setScope] = useState<FleetCertificateReportScope>('fleet');
  const [path, setPath] = useState<FleetCertificateDocumentPath>(() => createDefaultFleetCertificateDocumentPath(certificates));
  const [categoryKey, setCategoryKey] = useState(() => certificates.slice().sort((left, right) => frenchSort.compare(left.categoryLabel, right.categoryLabel))[0]?.categoryKey || '');
  const [findingId, setFindingId] = useState<number | null>(null);
  const [selectedVesselNames, setSelectedVesselNames] = useState<string[]>(() => vessels);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeFindings, setIncludeFindings] = useState(true);
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

  const selectionSections = { includeDocuments, includeFindings };
  const selection: FleetCertificateReportSelection = scope === 'fleet'
    ? { scope, ...selectionSections }
    : scope === 'vessel-list'
      ? { scope, vesselNames: selectedVesselNames, ...selectionSections }
    : scope === 'vessel'
      ? { scope, vesselName: path.vesselName, ...selectionSections }
      : scope === 'category'
        ? { scope, categoryKey, ...selectionSections }
        : scope === 'document'
          ? { scope, certificateId: path.certificateId || undefined, ...selectionSections }
          : { scope, certificateId: path.certificateId || undefined, findingId: effectiveFindingId || undefined, ...selectionSections };
  const resolved = resolveFleetCertificateReportSelection(certificates, findings, selection);
  const vesselCount = new Set(resolved.certificates.map((certificate) => certificate.vesselName)).size;
  const selectedCertificate = certificates.find((certificate) => certificate.id === path.certificateId);
  const selectedFinding = findings.find((finding) => finding.id === effectiveFindingId);
  const selectedCategory = categories.find(([key]) => key === categoryKey)?.[1] || '';
  const perimeterComplete = scope === 'fleet'
    || (scope === 'vessel-list' && selectedVesselNames.length > 0)
    || (scope === 'vessel' && Boolean(path.vesselName))
    || (scope === 'category' && Boolean(categoryKey))
    || (scope === 'document' && Boolean(path.certificateId))
    || (scope === 'finding' && Boolean(path.certificateId && effectiveFindingId));
  const selectionComplete = perimeterComplete && (includeDocuments || includeFindings);
  const perimeterLabel = scope === 'fleet'
    ? 'Toute la flotte'
    : scope === 'vessel-list'
      ? `${selectedVesselNames.length} navire${selectedVesselNames.length > 1 ? 's' : ''} sélectionné${selectedVesselNames.length > 1 ? 's' : ''}`
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
          {scope === 'vessel-list' ? <div className="fcx-report-vessel-selection">
            <div><strong>Navires à inclure</strong><span><button onClick={() => setSelectedVesselNames(vessels)} type="button">Tout sélectionner</button><button onClick={() => setSelectedVesselNames([])} type="button">Tout effacer</button></span></div>
            <div className="fcx-report-vessel-options">
              {vessels.map((vesselName) => {
                const checked = selectedVesselNames.includes(vesselName);
                const documentCount = certificates.filter((certificate) => certificate.vesselName === vesselName).length;
                return <label className={checked ? 'is-active' : ''} key={vesselName}><input checked={checked} onChange={() => setSelectedVesselNames((current) => checked ? current.filter((name) => name !== vesselName) : [...current, vesselName].sort((left, right) => frenchSort.compare(left, right)))} type="checkbox" /><Ship size={17} /><span><b>{vesselName}</b><small>{documentCount} document{documentCount > 1 ? 's' : ''}</small></span></label>;
              })}
            </div>
            {!selectedVesselNames.length ? <small className="fcx-report-selection-error">Sélectionnez au moins un navire.</small> : null}
          </div> : scope === 'category' ? <div className="fcx-document-path-fields is-single"><label>Catégorie
            <select aria-label="Catégorie du rapport" required value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          </label></div> : <FleetCertificateDocumentFields certificates={certificates} level={scope === 'vessel' ? 'vessel' : 'document'} onChange={(next) => { setPath(next); setFindingId(null); }} value={path} />}
          {scope === 'finding' ? <div className="fcx-report-finding-field"><label>Écart
            <select aria-label="Écart" required value={effectiveFindingId || ''} onChange={(event) => setFindingId(Number(event.target.value) || null)}>
              {documentFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.reference} · {finding.title}</option>)}
            </select>
            {!documentFindings.length ? <small>Aucun écart n’est rattaché à ce document.</small> : null}
          </label></div> : null}
        </section> : null}

        <section className="fcx-report-content-section" aria-labelledby="fleet-report-content-title">
          <div className="fcx-dialog-section-title"><span>{scope === 'fleet' ? '2' : '3'}</span><div><h3 id="fleet-report-content-title">Contenu du rapport</h3><p>Éditez la liste documentaire, la liste des écarts ou les deux.</p></div></div>
          <div className="fcx-report-content-options">
            <label className={includeDocuments ? 'is-active' : ''}><input checked={includeDocuments} onChange={(event) => setIncludeDocuments(event.target.checked)} type="checkbox" /><ListChecks size={18} /><span><b>Liste des documents</b><small>Date d’échéance et indicateur Valide ou Échu</small></span></label>
            <label className={includeFindings ? 'is-active' : ''}><input checked={includeFindings} onChange={(event) => setIncludeFindings(event.target.checked)} type="checkbox" /><Flag size={18} /><span><b>Liste des écarts</b><small>Synthèse, détails, suivis et preuves</small></span></label>
          </div>
          {!includeDocuments && !includeFindings ? <small className="fcx-report-selection-error">Sélectionnez au moins une liste à éditer.</small> : null}
        </section>

        <section className="fcx-report-summary" aria-label="Récapitulatif du rapport">
          <span><CheckCircle2 size={18} /></span><div><small>Récapitulatif</small><h3>{perimeterLabel || 'Sélection incomplète'}</h3><p>{vesselCount} navire{vesselCount > 1 ? 's' : ''}{includeDocuments ? ` · ${resolved.certificates.length} document${resolved.certificates.length > 1 ? 's' : ''}` : ' · liste documentaire exclue'}{includeFindings ? ` · ${resolved.findings.length} écart${resolved.findings.length > 1 ? 's' : ''}` : ' · liste des écarts exclue'}</p></div>
        </section>
        {error ? <p className="fcx-visit-error" role="alert">{error}</p> : null}
      </div>
      <footer><button onClick={onClose} type="button">Annuler</button><button className="fcx-primary" disabled={!selectionComplete || generating} onClick={generate} type="button"><FileText size={16} />{generating ? 'Génération…' : 'Générer le rapport'}</button></footer>
    </section>
  </div>;
}
