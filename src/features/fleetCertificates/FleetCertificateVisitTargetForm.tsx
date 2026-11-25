import { CalendarPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { compareFleetAssets, type FleetDisplayAsset } from '../fleet/fleetDisplay';
import {
  createDefaultFleetCertificateDocumentPath,
  FleetCertificateDocumentFields,
  type FleetCertificateDocumentPath,
} from './FleetCertificateDocumentFields';
import { getFleetCertificateVesselLabel, type FleetCertificateVessel } from './fleetCertificateCategoryQueries';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

interface FleetCertificateVisitTargetFormProps {
  certificates: FleetCertificateRecord[];
  vessels: FleetCertificateVessel[];
  initialVesselId: number | null;
  onClose: () => void;
  onSelect: (certificateId: number) => void;
  onAddDocument: (vesselId: number) => void;
}

interface VisitVesselOption extends FleetDisplayAsset {
  key: string;
  vesselId: number | null;
  certificates: FleetCertificateRecord[];
}

const NO_CERTIFICATES: FleetCertificateRecord[] = [];

function buildVisitVesselOptions(
  vessels: FleetCertificateVessel[],
  certificates: FleetCertificateRecord[],
): VisitVesselOption[] {
  const options = new Map<string, VisitVesselOption>(vessels.map((vessel) => [
    String(vessel.id), { ...vessel, key: String(vessel.id), vesselId: vessel.id, certificates: [] },
  ]));
  const fleetKeysByName = new Map(vessels.map((vessel) => [vessel.name, String(vessel.id)]));
  for (const certificate of certificates) {
    const vesselKey = certificate.vesselId !== null
      ? String(certificate.vesselId)
      : fleetKeysByName.get(certificate.vesselName) ?? `legacy:${certificate.vesselName}`;
    const option: VisitVesselOption = options.get(vesselKey) ?? {
      key: vesselKey, name: certificate.vesselName, vesselId: null, certificates: [],
    };
    option.certificates.push(certificate);
    options.set(vesselKey, option);
  }
  return Array.from(options.values()).sort(compareFleetAssets);
}

export function FleetCertificateVisitTargetForm({
  certificates,
  vessels,
  initialVesselId,
  onClose,
  onSelect,
  onAddDocument,
}: FleetCertificateVisitTargetFormProps) {
  const options = useMemo(() => buildVisitVesselOptions(vessels, certificates), [vessels, certificates]);
  const defaultVessel = options.find((option) => option.vesselId !== null && option.vesselId === initialVesselId)
    ?? options.find((option) => option.certificates.length)
    ?? options[0];
  const [vesselKey, setVesselKey] = useState(defaultVessel?.key ?? '');
  const [documentPath, setDocumentPath] = useState<FleetCertificateDocumentPath | null>(null);
  const selectedVessel = options.find((option) => option.key === vesselKey) ?? defaultVessel;
  const vesselCertificates = selectedVessel?.certificates ?? NO_CERTIFICATES;
  const path = documentPath && vesselCertificates.some((certificate) => certificate.id === documentPath.certificateId)
    ? documentPath
    : createDefaultFleetCertificateDocumentPath(vesselCertificates);
  const selectedCertificate = vesselCertificates.find((certificate) => certificate.id === path.certificateId);
  const vesselLabel = selectedVessel ? getFleetCertificateVesselLabel(selectedVessel.name) : '';
  const vesselId = selectedVessel?.vesselId ?? null;

  return (
    <AppDialog
      description="Sélectionnez le navire, la catégorie et le document concernés."
      footer={(
        <div className="app-dialog__actions">
          <button className="sp-button sp-button--secondary" onClick={onClose} type="button">Annuler</button>
          {!selectedCertificate && vesselId !== null ? (
            <button className="sp-button sp-button--primary" onClick={() => onAddDocument(vesselId)} type="button">
              Ajouter un document
            </button>
          ) : null}
          <button className="sp-button sp-button--primary" disabled={!selectedCertificate} type="submit">
            Continuer
          </button>
        </div>
      )}
      icon={<CalendarPlus aria-hidden="true" size={20} />}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (selectedCertificate) onSelect(selectedCertificate.id);
      }}
      title="Document de la visite"
    >
      <div className="fcx-form fcx-visit-target-form">
        <FleetCertificateDocumentFields
          certificates={vesselCertificates}
          onChange={setDocumentPath}
          value={path}
          vesselField={(
            <label>Navire
              <select
                disabled={!options.length}
                onChange={(event) => { setVesselKey(event.target.value); setDocumentPath(null); }}
                value={selectedVessel?.key ?? ''}
              >
                {!options.length ? <option value="">Aucun navire disponible</option> : null}
                {options.map((option) => (
                  <option key={option.key} value={option.key}>{getFleetCertificateVesselLabel(option.name)}</option>
                ))}
              </select>
            </label>
          )}
        />
        {selectedCertificate ? (
          <p className="fcx-visit-target-summary">
            <CalendarPlus aria-hidden="true" size={18} />
            <span><small>Visite à programmer</small><b>{selectedCertificate.documentTitle}</b><em>{vesselLabel} · {selectedCertificate.categoryLabel}</em></span>
          </p>
        ) : selectedVessel ? (
          <p className="fcx-field-help" role="status">Aucun document pour {vesselLabel}. Ajoutez un document pour continuer.</p>
        ) : null}
      </div>
    </AppDialog>
  );
}
