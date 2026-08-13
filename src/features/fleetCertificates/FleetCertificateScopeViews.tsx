import { CheckCircle2, ChevronDown, FileText, Folder, Ship } from 'lucide-react';
import { useMemo } from 'react';
import type { FleetCertificateFinding } from './fleetCertificateFindings';
import type { FleetCertificateRecord } from './fleetCertificateQueries';

interface FindingDocumentGroup {
  certificate: FleetCertificateRecord;
  findings: FleetCertificateFinding[];
}

interface CertificateCategoryGroup {
  label: string;
  documents: FleetCertificateRecord[];
}

interface FindingCategoryGroup {
  label: string;
  documents: FindingDocumentGroup[];
}

interface CertificateVesselGroup {
  name: string;
  categories: CertificateCategoryGroup[];
}

interface FindingVesselGroup {
  name: string;
  categories: FindingCategoryGroup[];
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function groupCertificates(certificates: FleetCertificateRecord[]): CertificateVesselGroup[] {
  const vessels = new Map<string, Map<string, FleetCertificateRecord[]>>();
  certificates.forEach((certificate) => {
    const categories = vessels.get(certificate.vesselName) || new Map<string, FleetCertificateRecord[]>();
    const documents = categories.get(certificate.categoryLabel) || [];
    documents.push(certificate);
    categories.set(certificate.categoryLabel, documents);
    vessels.set(certificate.vesselName, categories);
  });
  return Array.from(vessels, ([name, categories]) => ({
    name,
    categories: Array.from(categories, ([label, documents]) => ({
      label,
      documents: documents.slice().sort((left, right) => collator.compare(left.documentTitle, right.documentTitle)),
    })).sort((left, right) => collator.compare(left.label, right.label)),
  })).sort((left, right) => collator.compare(left.name, right.name));
}

function groupFindings(
  certificates: FleetCertificateRecord[],
  findings: FleetCertificateFinding[],
): FindingVesselGroup[] {
  const certificateById = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  const findingsByCertificate = new Map<number, FleetCertificateFinding[]>();
  findings.forEach((finding) => findingsByCertificate.set(
    finding.certificateId,
    [...(findingsByCertificate.get(finding.certificateId) || []), finding],
  ));
  return groupCertificates(certificates.filter((certificate) => findingsByCertificate.has(certificate.id)))
    .map((vessel) => ({
      name: vessel.name,
      categories: vessel.categories.map((category) => ({
        label: category.label,
        documents: category.documents.map((certificate) => ({
          certificate: certificateById.get(certificate.id) || certificate,
          findings: (findingsByCertificate.get(certificate.id) || [])
            .slice()
            .sort((left, right) => collator.compare(left.title, right.title)),
        })),
      })),
    }));
}

export function FleetCertificateFindingsByScope({
  certificates,
  findings,
  formatDate,
  isOverdue,
  onSelectFinding,
  typeTone,
}: {
  certificates: FleetCertificateRecord[];
  findings: FleetCertificateFinding[];
  formatDate: (value: string) => string;
  isOverdue: (finding: FleetCertificateFinding) => boolean;
  onSelectFinding: (certificateId: number, findingId: number) => void;
  typeTone: (findingType: FleetCertificateFinding['findingType']) => string;
}) {
  const groups = useMemo(() => groupFindings(certificates, findings), [certificates, findings]);
  if (!groups.length) return <div className="fcx-empty"><CheckCircle2 /> Aucun écart ouvert dans ce périmètre.</div>;
  return <div className="fcx-scope-groups">
    {groups.map((vessel) => <section key={vessel.name}>
      <h3><Ship size={15} /> {vessel.name}</h3>
      {vessel.categories.map((category) => <div className="fcx-scope-category" key={category.label}>
        <h4><Folder size={14} /> {category.label}</h4>
        {category.documents.map(({ certificate, findings: documentFindings }) => <div className="fcx-scope-document" key={certificate.id}>
          <h5><FileText size={14} /> {certificate.documentTitle}</h5>
          <div className="fcx-global-finding-list">
            {documentFindings.map((finding) => <button key={finding.id} onClick={() => onSelectFinding(certificate.id, finding.id)} type="button">
              <span className={`fcx-type-dot ${typeTone(finding.findingType)}`} />
              <span><b>{finding.title}</b><small>{finding.reference}</small></span>
              <em className={isOverdue(finding) ? 'late' : ''}>{isOverdue(finding) ? 'En retard' : formatDate(finding.treatmentDueOn)}</em>
            </button>)}
          </div>
        </div>)}
      </div>)}
    </section>)}
  </div>;
}

export function FleetCertificateDeadlinesByScope({
  certificates,
  daysFromToday,
  formatDate,
  onSelectDocument,
}: {
  certificates: FleetCertificateRecord[];
  daysFromToday: (value: string) => number;
  formatDate: (value: string) => string;
  onSelectDocument: (certificate: FleetCertificateRecord) => void;
}) {
  const groups = useMemo(() => groupCertificates(certificates), [certificates]);
  if (!groups.length) return <div className="fcx-empty"><CheckCircle2 /> Aucune échéance à traiter dans ce périmètre.</div>;
  return <div className="fcx-scope-groups fcx-deadline-scope-groups">
    {groups.map((vessel) => <section key={vessel.name}>
      <h3><Ship size={15} /> {vessel.name}</h3>
      {vessel.categories.map((category) => <div className="fcx-scope-category" key={category.label}>
        <h4><Folder size={14} /> {category.label}</h4>
        <div className="fcx-deadline-list">
          {category.documents.map((certificate) => {
            const days = daysFromToday(certificate.expiresOn);
            return <button key={certificate.id} onClick={() => onSelectDocument(certificate)} type="button">
              <span className={`fcx-days ${days <= 30 ? 'urgent' : ''}`}><b>{days < 0 ? `J+${Math.abs(days)}` : `J-${days}`}</b><small>{formatDate(certificate.expiresOn)}</small></span>
              <span><b>{certificate.documentTitle}</b><small>{certificate.categoryLabel}</small></span>
              <ChevronDown className="rotate" size={17} />
            </button>;
          })}
        </div>
      </div>)}
    </section>)}
  </div>;
}
