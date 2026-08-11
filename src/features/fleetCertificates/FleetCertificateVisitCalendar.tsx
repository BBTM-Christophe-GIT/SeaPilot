import { CalendarDays, ChevronRight, MapPin, Plus, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import type { FleetCertificateVisit } from './fleetCertificateVisits';

interface DocumentGroup {
  certificateId: number;
  documentTitle: string;
  visits: FleetCertificateVisit[];
}

interface CategoryGroup {
  label: string;
  documents: DocumentGroup[];
}

interface VesselGroup {
  name: string;
  categories: CategoryGroup[];
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function groupVisits(visits: FleetCertificateVisit[]): VesselGroup[] {
  const vessels = new Map<string, Map<string, Map<number, DocumentGroup>>>();
  visits.forEach((visit) => {
    const categories = vessels.get(visit.vesselName) || new Map<string, Map<number, DocumentGroup>>();
    const documents = categories.get(visit.categoryLabel) || new Map<number, DocumentGroup>();
    const document = documents.get(visit.certificateId) || {
      certificateId: visit.certificateId,
      documentTitle: visit.documentTitle,
      visits: [],
    };
    document.visits.push(visit);
    documents.set(visit.certificateId, document);
    categories.set(visit.categoryLabel, documents);
    vessels.set(visit.vesselName, categories);
  });
  return Array.from(vessels, ([name, categories]) => ({
    name,
    categories: Array.from(categories, ([label, documents]) => ({
      label,
      documents: Array.from(documents.values()).sort((a, b) => collator.compare(a.documentTitle, b.documentTitle)),
    })).sort((a, b) => collator.compare(a.label, b.label)),
  })).sort((a, b) => collator.compare(a.name, b.name));
}

function formatVisitDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function FleetCertificateVisitCalendar({
  visits,
  canManage,
  onSchedule,
  onSelectDocument,
}: {
  visits: FleetCertificateVisit[];
  canManage: boolean;
  onSchedule: () => void;
  onSelectDocument: (certificateId: number) => void;
}) {
  const groups = useMemo(() => groupVisits(visits), [visits]);
  return <article className="fcx-visit-calendar">
    <header><div><span className="fcx-panel-icon blue"><CalendarDays size={18} /></span><div><h2>Calendrier des visites prestataires</h2><p>Classement par navire, catégorie et document</p></div></div>{canManage && <button className="fcx-primary" onClick={onSchedule}><Plus size={16} /> Programmer une visite</button>}</header>
    {!groups.length ? <div className="fcx-empty"><CalendarDays size={20} /> Aucune visite prestataire programmée.</div> : <div className="fcx-visit-groups">
      {groups.map((vessel) => <section key={vessel.name}><h3><ChevronRight size={15} />{vessel.name}<small>{vessel.categories.reduce((sum, category) => sum + category.documents.reduce((count, document) => count + document.visits.length, 0), 0)} visite(s)</small></h3>
        {vessel.categories.map((category) => <div className="fcx-visit-category" key={category.label}><h4>{category.label}</h4>
          {category.documents.map((document) => <div className="fcx-visit-document" key={document.certificateId}><button onClick={() => onSelectDocument(document.certificateId)} type="button">{document.documentTitle}</button><div>{document.visits.flatMap((visit) => visit.assignments.map((assignment) => <article key={`${visit.id}-${assignment.providerId}-${assignment.specialtyId}`}><time>{formatVisitDate(assignment.scheduledStart || visit.scheduledStart)}</time><strong>{assignment.providerName} · {assignment.specialtyName}</strong><span><UsersRound size={13} />{assignment.contactName || 'Contact général'}</span>{visit.location && <small><MapPin size={12} />{visit.location}</small>}</article>))}</div></div>)}
        </div>)}
      </section>)}
    </div>}
  </article>;
}
