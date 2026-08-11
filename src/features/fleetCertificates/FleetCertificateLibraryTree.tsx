import {
  ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, Folder, MoreHorizontal, Ship,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  getEffectiveFleetCertificateStatus,
  type FleetCertificateRecord,
} from './fleetCertificateQueries';

interface FleetCertificateLibraryTreeProps {
  certificates: FleetCertificateRecord[];
  formatDate: (value: string) => string;
  findingCountByCertificate: ReadonlyMap<number, number>;
  revealMatches: boolean;
  selectedCertificateId?: number | null;
  onOpen: (certificate: FleetCertificateRecord) => void;
  onManage?: (certificateId: number) => void;
}

interface CategoryBranch {
  key: string;
  label: string;
  certificates: FleetCertificateRecord[];
  actionCount: number;
}

interface VesselBranch {
  key: string;
  name: string;
  categories: CategoryBranch[];
  documentCount: number;
  expiredCount: number;
  actionCount: number;
}

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function buildTree(
  certificates: FleetCertificateRecord[],
  findingCountByCertificate: ReadonlyMap<number, number>,
): VesselBranch[] {
  const vessels = new Map<string, { name: string; certificates: FleetCertificateRecord[] }>();

  certificates.forEach((certificate) => {
    const key = certificate.vesselId ? String(certificate.vesselId) : certificate.vesselName;
    const vessel = vessels.get(key) || { name: certificate.vesselName, certificates: [] };
    vessel.certificates.push(certificate);
    vessels.set(key, vessel);
  });

  return Array.from(vessels, ([key, vessel]) => {
    const categories = new Map<string, CategoryBranch>();
    vessel.certificates.forEach((certificate) => {
      const categoryKey = certificate.categoryKey || certificate.categoryLabel;
      const category = categories.get(categoryKey) || {
        key: `${key}:${categoryKey}`,
        label: certificate.categoryLabel,
        certificates: [],
        actionCount: 0,
      };
      category.certificates.push(certificate);
      category.actionCount += findingCountByCertificate.get(certificate.id) || 0;
      categories.set(categoryKey, category);
    });

    return {
      key,
      name: vessel.name,
      categories: Array.from(categories.values())
        .map((category) => ({
          ...category,
          certificates: category.certificates
            .slice()
            .sort((left, right) => frenchSort.compare(left.documentTitle, right.documentTitle)),
        }))
        .sort((left, right) => frenchSort.compare(left.label, right.label)),
      documentCount: vessel.certificates.length,
      expiredCount: vessel.certificates.filter(
        (certificate) => getEffectiveFleetCertificateStatus(certificate) === 'expired',
      ).length,
      actionCount: vessel.certificates.reduce(
        (sum, certificate) => sum + (findingCountByCertificate.get(certificate.id) || 0),
        0,
      ),
    };
  }).sort((left, right) => frenchSort.compare(left.name, right.name));
}

function toggleKey(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function FleetCertificateLibraryTree({
  certificates,
  formatDate,
  findingCountByCertificate,
  revealMatches,
  selectedCertificateId,
  onOpen,
  onManage,
}: FleetCertificateLibraryTreeProps) {
  const branches = useMemo(
    () => buildTree(certificates, findingCountByCertificate),
    [certificates, findingCountByCertificate],
  );
  const allVesselKeys = useMemo(() => branches.map((vessel) => vessel.key), [branches]);
  const allCategoryKeys = useMemo(
    () => branches.flatMap((vessel) => vessel.categories.map((category) => category.key)),
    [branches],
  );
  const [openVessels, setOpenVessels] = useState<Set<string>>(
    () => revealMatches ? new Set(allVesselKeys) : new Set(),
  );
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => revealMatches ? new Set(allCategoryKeys) : new Set(),
  );

  const everythingOpen = allVesselKeys.every((key) => openVessels.has(key))
    && allCategoryKeys.every((key) => openCategories.has(key));

  function toggleAll() {
    if (everythingOpen) {
      setOpenVessels(new Set());
      setOpenCategories(new Set());
    } else {
      setOpenVessels(new Set(allVesselKeys));
      setOpenCategories(new Set(allCategoryKeys));
    }
  }

  if (!branches.length) {
    return <div className="fcx-library-empty"><FileText size={20} /> Aucun document ne correspond aux filtres.</div>;
  }

  return <>
    <div className="fcx-tree-toolbar">
      <span>Classement&nbsp;: <b>Navire</b><i>›</i><b>Catégorie</b><i>›</i><b>Document</b></span>
      <button onClick={toggleAll} type="button">
        {everythingOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        {everythingOpen ? 'Tout replier' : 'Tout déplier'}
      </button>
    </div>
    <div className="fcx-library-head"><span>Arborescence documentaire</span><span>Échéance</span><span>État</span><span /></div>
    <div className="fcx-tree" role="tree" aria-label="Documents classés par navire et catégorie">
      {branches.map((vessel) => {
        const vesselOpen = openVessels.has(vessel.key);
        return <div aria-label={`Navire ${vessel.name}`} className="fcx-tree-vessel" key={vessel.key} role="treeitem" aria-expanded={vesselOpen}>
          <button className="fcx-tree-vessel-row" onClick={() => setOpenVessels((current) => toggleKey(current, vessel.key))} type="button">
            <ChevronRight className={vesselOpen ? 'is-open' : ''} size={17} />
            <span className="fcx-tree-icon vessel"><Ship size={17} /></span>
            <strong>{vessel.name}</strong>
            {vessel.actionCount > 0 && <em className="fcx-action-count">{vessel.actionCount} à traiter</em>}
            {vessel.expiredCount > 0 && <em>{vessel.expiredCount} échu{vessel.expiredCount > 1 ? 's' : ''}</em>}
            <small>{vessel.documentCount} document{vessel.documentCount > 1 ? 's' : ''}</small>
          </button>
          {vesselOpen && <div className="fcx-tree-children" role="group">
            {vessel.categories.map((category) => {
              const categoryOpen = openCategories.has(category.key);
              return <div aria-label={`Catégorie ${category.label}`} className="fcx-tree-category" key={category.key} role="treeitem" aria-expanded={categoryOpen}>
                <button className="fcx-tree-category-row" onClick={() => setOpenCategories((current) => toggleKey(current, category.key))} type="button">
                  <ChevronRight className={categoryOpen ? 'is-open' : ''} size={16} />
                  <span className="fcx-tree-icon category"><Folder size={16} /></span>
                  <strong>{category.label}</strong>
                  {category.actionCount > 0 && <em className="fcx-action-count">{category.actionCount} à traiter</em>}
                  <small>{category.certificates.length} document{category.certificates.length > 1 ? 's' : ''}</small>
                </button>
                {categoryOpen && <div className="fcx-tree-documents" role="group">
                  {category.certificates.map((certificate) => {
                    const state = getEffectiveFleetCertificateStatus(certificate);
                    const actionCount = findingCountByCertificate.get(certificate.id) || 0;
                    return <div aria-label={`Document ${certificate.documentTitle}`} key={certificate.id} role="treeitem">
                      <div className={`fcx-library-row-wrap${selectedCertificateId === certificate.id ? ' is-selected' : ''}`}>
                      <button aria-label={`Ouvrir la pièce jointe ${certificate.documentTitle}`} className="fcx-library-row" onClick={() => onOpen(certificate)} type="button">
                        <span><FileText size={17} /><span><b>{certificate.documentTitle}</b><small>{certificate.fileName}</small><small className="fcx-mobile-doc-meta">{formatDate(certificate.expiresOn)} · {state === 'expired' ? 'Échu' : state === 'renew_due' ? 'À renouveler' : 'Valide'}</small></span>{actionCount > 0 && <i className="fcx-action-count">{actionCount} à traiter</i>}</span>
                        <span>{formatDate(certificate.expiresOn)}</span>
                        <em className={state}>{state === 'expired' ? 'Échu' : state === 'renew_due' ? 'À renouveler' : 'Valide'}</em>
                      </button>
                      {onManage && <button aria-label={`Gérer ${certificate.documentTitle}`} className="fcx-library-manage" onClick={() => onManage(certificate.id)} title="Gérer le document" type="button"><MoreHorizontal size={18} /></button>}
                      </div>
                    </div>;
                  })}
                </div>}
              </div>;
            })}
          </div>}
        </div>;
      })}
    </div>
  </>;
}
