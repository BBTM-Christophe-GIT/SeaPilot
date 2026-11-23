import type { SupabaseClient } from '@supabase/supabase-js';
import { Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { compareFleetAssets, fleetAssetKind } from '../fleet/fleetDisplay';
import { getCommercialConditionsMode, type ProjectDocumentEmitter } from './projectCommercialOffer';
import type { GeneratedProjectDocument } from './projectDocumentGeneration';
import type { ProjectFuelReference } from './projectFuelEstimate';
import type { ProjectMutationResult, ProjectWriteInput } from './projectMutations';
import type { ClientRecord, ProjectOperationDocumentRecord, VesselRecord } from './projectQueries';

interface ProjectQuoteEmissionProps {
  annexDocuments: readonly ProjectOperationDocumentRecord[];
  annexFiles: readonly File[];
  brochureVessels: readonly VesselRecord[];
  client: SupabaseClient;
  emitter?: ProjectDocumentEmitter;
  form: ProjectWriteInput;
  fuelReference?: ProjectFuelReference;
  isSaving: boolean;
  onExportingChange: (value: boolean) => void;
  onIncludeLocationChange: (include: boolean) => void;
  prepareExport: () => Promise<Pick<ProjectMutationResult, 'id' | 'projectCode'> | null>;
  projectClient?: Pick<ClientRecord, 'name' | 'representedBy'>;
  vessel?: VesselRecord;
}

export function ProjectQuoteEmission({
  annexDocuments, annexFiles, brochureVessels, client, emitter, form, fuelReference, isSaving,
  onExportingChange, onIncludeLocationChange, prepareExport, projectClient, vessel,
}: ProjectQuoteEmissionProps) {
  const [includeBrochures, setIncludeBrochures] = useState(false);
  const [brochureIds, setBrochureIds] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const exporting = useRef(false);
  const [error, setError] = useState('');
  const [stored, setStored] = useState(false);
  const [exportedPdfs, setExportedPdfs] = useState<GeneratedProjectDocument[]>([]);
  const vessels = brochureVessels.filter((item) => fleetAssetKind(item) === 'vessel').sort(compareFleetAssets);
  const disabled = isSaving || isExporting;

  async function download(document: GeneratedProjectDocument) {
    const { downloadGeneratedProjectDocument } = await import('./projectDocumentGeneration');
    downloadGeneratedProjectDocument(document);
  }

  async function exportQuote() {
    if (disabled || exporting.current) return;
    exporting.current = true;
    setIsExporting(true);
    onExportingChange(true);
    setError('');
    setStored(false);
    setExportedPdfs([]);
    try {
      const saved = await prepareExport();
      if (!saved) return;
      const [{ buildProjectQuoteExport }, { storeGeneratedProjectDocument }] = await Promise.all([
        import('./projectQuoteExport'),
        import('./projectDocumentStorage'),
      ]);
      const includeAnnexes = getCommercialConditionsMode(form.supplytimeData) === 'free_text';
      const { offer, pdfs } = await buildProjectQuoteExport(client, {
        offer: {
          client: projectClient,
          contract: { ...form, feeCurrency: 'EUR', hireCurrency: 'EUR', hireUnit: 'jour' },
          emitter,
          fuelReference,
          project: {
            ...form,
            clientName: projectClient?.name || '',
            primaryVesselName: vessel?.name || '',
            projectCode: saved.projectCode,
          },
          vessel,
        },
        brochureVessels: includeBrochures ? vessels.filter((item) => brochureIds.includes(item.id)) : [],
        annexDocuments: includeAnnexes ? annexDocuments : [],
        annexFiles: includeAnnexes ? annexFiles : [],
      });
      try {
        await storeGeneratedProjectDocument(client, { document: offer, documentType: 'offer', projectId: saved.id });
        setStored(true);
      } catch (storageError) {
        setError(storageError instanceof Error ? storageError.message : 'Impossible de classer l’offre dans le projet.');
      }
      setExportedPdfs(pdfs);
      await Promise.all(pdfs.map(download));
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Impossible d’exporter l’offre commerciale.');
    } finally {
      exporting.current = false;
      setIsExporting(false);
      onExportingChange(false);
    }
  }

  return (
    <div className="project-editor-grid project-quote-emission">
      <label className="project-editor-check is-wide">
        <input checked={form.locationPlan?.includeInPdf ?? false} disabled={disabled} onChange={(event) => onIncludeLocationChange(event.target.checked)} type="checkbox" />
        Joindre la localisation au PDF
      </label>
      <label className="project-editor-check is-wide">
        <input checked={includeBrochures} disabled={disabled} onChange={(event) => setIncludeBrochures(event.target.checked)} type="checkbox" />
        Joindre la brochure du ou des navire(s)
      </label>
      {includeBrochures ? (
        <div aria-label="Brochures à joindre" className="project-editor-grid is-wide" role="group">
          {vessels.map((item) => (
            <label className="project-editor-check" key={item.id}>
              <input
                checked={brochureIds.includes(item.id)}
                disabled={disabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setBrochureIds((ids) => checked ? [...ids, item.id] : ids.filter((id) => id !== item.id));
                }}
                type="checkbox"
              />
              {item.name}
            </label>
          ))}
          {vessels.length === 0 ? <p>Aucun navire disponible.</p> : null}
        </div>
      ) : null}
      <div className="is-wide">
        <button className="sp-button sp-button--primary" disabled={disabled} onClick={() => void exportQuote()} type="button">
          <Download aria-hidden="true" size={16} />
          {isExporting ? 'Export en cours…' : 'Exporter l’offre commerciale'}
        </button>
      </div>
      {stored ? <p className="is-wide" role="status">L’offre commerciale a été classée dans le projet.</p> : null}
      {error ? <p className="form-error is-wide" role="alert">{error}</p> : null}
      {exportedPdfs.length > 0 ? (
        <div aria-label="Fichiers PDF" className="project-editor-grid is-wide" role="group">
          {exportedPdfs.map((document) => (
            <div key={document.fileName}>
              <button className="sp-button sp-button--secondary" onClick={() => void download(document)} type="button">
                <Download aria-hidden="true" size={16} />
                {document.fileName}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
