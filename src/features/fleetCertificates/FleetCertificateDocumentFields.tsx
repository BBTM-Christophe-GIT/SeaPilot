import { useMemo } from 'react';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

export interface FleetCertificateDocumentPath {
  vesselName: string;
  categoryKey: string;
  certificateId: number | null;
}

type FleetCertificateDocumentLevel = 'vessel' | 'category' | 'document';

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function sortCertificates(certificates: FleetCertificateRecord[]): FleetCertificateRecord[] {
  return certificates.slice().sort((left, right) => (
    frenchSort.compare(left.vesselName, right.vesselName)
    || frenchSort.compare(left.categoryLabel, right.categoryLabel)
    || frenchSort.compare(left.documentTitle, right.documentTitle)
  ));
}

export function createDefaultFleetCertificateDocumentPath(
  certificates: FleetCertificateRecord[],
): FleetCertificateDocumentPath {
  const first = sortCertificates(certificates)[0];
  return {
    vesselName: first?.vesselName || '',
    categoryKey: first?.categoryKey || '',
    certificateId: first?.id || null,
  };
}

export function FleetCertificateDocumentFields({
  certificates,
  level = 'document',
  onChange,
  value,
}: {
  certificates: FleetCertificateRecord[];
  level?: FleetCertificateDocumentLevel;
  onChange: (value: FleetCertificateDocumentPath) => void;
  value: FleetCertificateDocumentPath;
}) {
  const sortedCertificates = useMemo(() => sortCertificates(certificates), [certificates]);
  const vessels = useMemo(
    () => Array.from(new Set(sortedCertificates.map((certificate) => certificate.vesselName))),
    [sortedCertificates],
  );
  const vesselCertificates = sortedCertificates.filter((certificate) => certificate.vesselName === value.vesselName);
  const categories = Array.from(new Map(vesselCertificates.map((certificate) => [certificate.categoryKey, certificate.categoryLabel])));
  const categoryCertificates = vesselCertificates.filter((certificate) => certificate.categoryKey === value.categoryKey);

  function selectVessel(vesselName: string) {
    const first = sortedCertificates.find((certificate) => certificate.vesselName === vesselName);
    onChange({
      vesselName,
      categoryKey: first?.categoryKey || '',
      certificateId: first?.id || null,
    });
  }

  function selectCategory(categoryKey: string) {
    const first = vesselCertificates.find((certificate) => certificate.categoryKey === categoryKey);
    onChange({ ...value, categoryKey, certificateId: first?.id || null });
  }

  return <div className="fcx-document-path-fields">
    <label>Navire
      <select aria-label="Navire" required value={value.vesselName} onChange={(event) => selectVessel(event.target.value)}>
        {vessels.map((vessel) => <option key={vessel} value={vessel}>{vessel}</option>)}
      </select>
    </label>
    {level !== 'vessel' ? <label>Catégorie
      <select aria-label="Catégorie" required value={value.categoryKey} onChange={(event) => selectCategory(event.target.value)}>
        {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label> : null}
    {level === 'document' ? <label>Document
      <select aria-label="Document" required value={value.certificateId || ''} onChange={(event) => onChange({ ...value, certificateId: Number(event.target.value) || null })}>
        {categoryCertificates.map((certificate) => <option key={certificate.id} value={certificate.id}>{certificate.documentTitle}</option>)}
      </select>
    </label> : null}
  </div>;
}
