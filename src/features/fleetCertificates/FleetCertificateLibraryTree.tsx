import {
  CalendarPlus, ChevronRight, ChevronsDownUp, ChevronsUpDown, Download, FileText, Folder, RefreshCw, Ship, Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  getEffectiveFleetCertificateStatus, getFleetCertificateStatusLabel,
  type FleetCertificateRecord,
} from './fleetCertificateQueries';
import {
  getFleetCertificateCategory,
  getFleetCertificateCategoryParent,
} from './fleetCertificateCategories';

interface FleetCertificateLibraryTreeProps {
  certificates: FleetCertificateRecord[];
  formatDate: (value: string) => string;
  findingCountByCertificate: ReadonlyMap<number, number>;
  revealMatches: boolean;
  selectedCertificateId?: number | null;
  selectedDocumentIds?: ReadonlySet<number>;
  selectedScopeCategoryKey?: string;
  selectedScopeVesselName?: string;
  canManage?: boolean;
  onDelete?: (certificate: FleetCertificateRecord) => void;
  onDownload: (certificate: FleetCertificateRecord) => void;
  onRenew?: (certificate: FleetCertificateRecord) => void;
  onSchedule?: (certificate: FleetCertificateRecord) => void;
  onSelect: (certificate: FleetCertificateRecord) => void;
  onSelectCategory?: (vesselName: string, categoryKey: string, categoryLabel: string) => void;
  onSelectVessel?: (vesselName: string) => void;
  onDownloadSelected?: () => void;
  onToggleSelection?: (certificateId: number) => void;
}

export interface FleetCertificateLibraryCategoryBranch {
  key: string;
  categoryKey: string;
  label: string;
  certificates: FleetCertificateRecord[];
  actionCount: number;
  subcategories: FleetCertificateLibraryCategoryBranch[];
}

export interface FleetCertificateLibraryVesselBranch {
  key: string;
  name: string;
  categories: FleetCertificateLibraryCategoryBranch[];
  documentCount: number;
  expiredCount: number;
  actionCount: number;
}

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const EMPTY_SELECTION = new Set<number>();

export function buildFleetCertificateLibraryTree(
  certificates: FleetCertificateRecord[],
  findingCountByCertificate: ReadonlyMap<number, number>,
): FleetCertificateLibraryVesselBranch[] {
  const vessels = new Map<string, { name: string; certificates: FleetCertificateRecord[] }>();

  certificates.forEach((certificate) => {
    const key = certificate.vesselId ? String(certificate.vesselId) : certificate.vesselName;
    const vessel = vessels.get(key) || { name: certificate.vesselName, certificates: [] };
    vessel.certificates.push(certificate);
    vessels.set(key, vessel);
  });

  return Array.from(vessels, ([key, vessel]) => {
    const categories = new Map<string, FleetCertificateLibraryCategoryBranch>();
    vessel.certificates.forEach((certificate) => {
      const resolvedCategory = getFleetCertificateCategory(
        certificate.categoryKey || certificate.categoryLabel,
        certificate.categoryLabel,
      );
      const parentCategory = getFleetCertificateCategoryParent(resolvedCategory);
      const topLevelCategory = parentCategory || resolvedCategory;
      const category = categories.get(topLevelCategory.key) || {
        key: `${key}:${topLevelCategory.key}`,
        categoryKey: topLevelCategory.key,
        label: topLevelCategory.label,
        certificates: [],
        actionCount: 0,
        subcategories: [],
      };
      if (parentCategory) {
        let subcategory = category.subcategories.find((item) => item.categoryKey === resolvedCategory.key);
        if (!subcategory) {
          subcategory = {
            key: `${key}:${resolvedCategory.key}`,
            categoryKey: resolvedCategory.key,
            label: resolvedCategory.label,
            certificates: [],
            actionCount: 0,
            subcategories: [],
          };
          category.subcategories.push(subcategory);
        }
        subcategory.certificates.push(certificate);
        subcategory.actionCount += findingCountByCertificate.get(certificate.id) || 0;
      } else {
        category.certificates.push(certificate);
      }
      category.actionCount += findingCountByCertificate.get(certificate.id) || 0;
      categories.set(topLevelCategory.key, category);
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
          subcategories: category.subcategories
            .map((subcategory) => ({
              ...subcategory,
              certificates: subcategory.certificates
                .slice()
                .sort((left, right) => frenchSort.compare(left.documentTitle, right.documentTitle)),
            }))
            .sort((left, right) => frenchSort.compare(left.label, right.label)),
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
  selectedDocumentIds = EMPTY_SELECTION,
  selectedScopeCategoryKey = '',
  selectedScopeVesselName = '',
  canManage = false,
  onDelete,
  onDownload,
  onRenew,
  onSchedule,
  onSelect,
  onSelectCategory,
  onSelectVessel,
  onDownloadSelected,
  onToggleSelection,
}: FleetCertificateLibraryTreeProps) {
  const branches = useMemo(
    () => buildFleetCertificateLibraryTree(certificates, findingCountByCertificate),
    [certificates, findingCountByCertificate],
  );
  const allVesselKeys = useMemo(() => branches.map((vessel) => vessel.key), [branches]);
  const allCategoryKeys = useMemo(
    () => branches.flatMap((vessel) => vessel.categories.flatMap((category) => [
      category.key,
      ...category.subcategories.map((subcategory) => subcategory.key),
    ])),
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

  function renderDocuments(category: FleetCertificateLibraryCategoryBranch, isSubcategory = false) {
    return <div className={`fcx-tree-documents${isSubcategory ? ' is-subcategory' : ''}`} role="group">
      {category.certificates.map((certificate) => {
        const state = getEffectiveFleetCertificateStatus(certificate);
        const actionCount = findingCountByCertificate.get(certificate.id) || 0;
        const hasFile = Boolean(certificate.storageBucket && certificate.storagePath);
        return <div aria-label={`Document ${certificate.documentTitle}`} key={certificate.id} role="treeitem">
          <div className={`fcx-library-row-wrap${selectedCertificateId === certificate.id ? ' is-selected' : ''}`}>
          <div className="fcx-library-document-actions">
            {onToggleSelection ? <input aria-label={`Sélectionner ${certificate.documentTitle}`} checked={selectedDocumentIds.has(certificate.id)} disabled={!hasFile} onChange={() => onToggleSelection(certificate.id)} title={hasFile ? 'Sélectionner pour le téléchargement' : 'Aucun fichier à télécharger'} type="checkbox" /> : null}
            {canManage && onSchedule ? <button aria-label={`Programmer une visite pour ${certificate.documentTitle}`} onClick={() => onSchedule(certificate)} title="Programmer une visite" type="button"><CalendarPlus size={15} /></button> : null}
            {canManage && onDelete ? <button aria-label={`Supprimer ${certificate.documentTitle}`} className="danger" onClick={() => onDelete(certificate)} title="Supprimer" type="button"><Trash2 size={15} /></button> : null}
            {canManage && onRenew ? <button aria-label={`Renouveler ${certificate.documentTitle}`} onClick={() => onRenew(certificate)} title="Renouveler" type="button"><RefreshCw size={15} /></button> : null}
            <button aria-label={`Télécharger ${certificate.documentTitle}`} disabled={!hasFile} onClick={() => onDownload(certificate)} title={hasFile ? 'Télécharger' : 'Aucun fichier à télécharger'} type="button"><Download size={15} /></button>
          </div>
          <button aria-label={`Prévisualiser ${certificate.documentTitle}`} className="fcx-library-row" onClick={() => onSelect(certificate)} type="button">
            <span><FileText size={17} /><span><b>{certificate.documentTitle}</b><small>{certificate.fileName || 'Aucun fichier joint'}</small><small className="fcx-mobile-doc-meta">{formatDate(certificate.expiresOn)} · {getFleetCertificateStatusLabel(state)}</small></span>{actionCount > 0 && <i className="fcx-action-count">{actionCount} à traiter</i>}</span>
            <span>{formatDate(certificate.expiresOn)}</span>
            <em className={state}>{getFleetCertificateStatusLabel(state)}</em>
          </button>
          </div>
        </div>;
      })}
    </div>;
  }

  if (!branches.length) {
    return <div className="fcx-library-empty"><FileText size={20} /> Aucun document ne correspond aux filtres.</div>;
  }

  return <>
    <div className="fcx-tree-toolbar">
      <span>Classement&nbsp;: <b>Navire</b><i>›</i><b>Catégorie</b><i>›</i><b>Sous-catégorie</b><i>›</i><b>Document</b></span>
      <div className="fcx-tree-toolbar-actions">
        {onDownloadSelected ? <button aria-label={selectedDocumentIds.size ? `Télécharger (${selectedDocumentIds.size})` : 'Télécharger'} disabled={!selectedDocumentIds.size} onClick={onDownloadSelected} type="button"><Download size={15} /> Télécharger</button> : null}
        <button onClick={toggleAll} type="button">
          {everythingOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
          {everythingOpen ? 'Tout replier' : 'Tout déplier'}
        </button>
      </div>
    </div>
    <div className="fcx-library-head"><span>Arborescence documentaire</span><span>Échéance</span><span>État</span><span /></div>
    <div className="fcx-tree" role="tree" aria-label="Documents classés par navire et catégorie">
      {branches.map((vessel) => {
        const vesselOpen = openVessels.has(vessel.key);
        return <div aria-label={`Navire ${vessel.name}`} className="fcx-tree-vessel" key={vessel.key} role="treeitem" aria-expanded={vesselOpen}>
          <button className={`fcx-tree-vessel-row${selectedScopeVesselName === vessel.name && !selectedScopeCategoryKey ? ' is-scope-selected' : ''}`} onClick={() => { setOpenVessels((current) => toggleKey(current, vessel.key)); onSelectVessel?.(vessel.name); }} type="button">
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
              const categoryDocumentCount = category.certificates.length + category.subcategories.reduce(
                (total, subcategory) => total + subcategory.certificates.length,
                0,
              );
              return <div aria-label={`Catégorie ${category.label}`} className="fcx-tree-category" key={category.key} role="treeitem" aria-expanded={categoryOpen}>
                <button className={`fcx-tree-category-row${selectedScopeVesselName === vessel.name && selectedScopeCategoryKey === category.categoryKey ? ' is-scope-selected' : ''}`} onClick={() => { setOpenCategories((current) => toggleKey(current, category.key)); onSelectCategory?.(vessel.name, category.categoryKey, category.label); }} type="button">
                  <ChevronRight className={categoryOpen ? 'is-open' : ''} size={16} />
                  <span className="fcx-tree-icon category"><Folder size={16} /></span>
                  <strong>{category.label}</strong>
                  {category.actionCount > 0 && <em className="fcx-action-count">{category.actionCount} à traiter</em>}
                  <small>{categoryDocumentCount} document{categoryDocumentCount > 1 ? 's' : ''}</small>
                </button>
                {categoryOpen && <div role="group">
                  {category.certificates.length ? renderDocuments(category) : null}
                  {category.subcategories.map((subcategory) => {
                    const subcategoryOpen = openCategories.has(subcategory.key);
                    return <div aria-label={`Sous-catégorie ${subcategory.label}`} className="fcx-tree-subcategory" key={subcategory.key} role="treeitem" aria-expanded={subcategoryOpen}>
                      <button className={`fcx-tree-subcategory-row${selectedScopeVesselName === vessel.name && selectedScopeCategoryKey === subcategory.categoryKey ? ' is-scope-selected' : ''}`} onClick={() => { setOpenCategories((current) => toggleKey(current, subcategory.key)); onSelectCategory?.(vessel.name, subcategory.categoryKey, subcategory.label); }} type="button">
                        <ChevronRight className={subcategoryOpen ? 'is-open' : ''} size={15} />
                        <span className="fcx-tree-icon subcategory"><Folder size={15} /></span>
                        <strong>{subcategory.label}</strong>
                        {subcategory.actionCount > 0 && <em className="fcx-action-count">{subcategory.actionCount} à traiter</em>}
                        <small>{subcategory.certificates.length} document{subcategory.certificates.length > 1 ? 's' : ''}</small>
                      </button>
                      {subcategoryOpen ? renderDocuments(subcategory, true) : null}
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
