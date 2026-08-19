import type { FleetCertificateRecord } from './fleetCertificateQueries';

export interface FleetCertificateCategoryOption {
  key: string;
  label: string;
  parentKey?: string;
}

export const FLEET_CERTIFICATE_CATEGORY_CATALOG: FleetCertificateCategoryOption[] = [
  { key: '06-incendie', label: '06 - Incendie' },
  { key: '06-1-extincteurs-portatifs', label: '06.1 - Extincteurs portatifs', parentKey: '06-incendie' },
  { key: '06-2-extinction-fixe', label: '06.2 - Extinction fixe', parentKey: '06-incendie' },
  { key: '06-3-tenue-pompier-ari', label: '06.3 - Tenue de pompier, ARI', parentKey: '06-incendie' },
  { key: '07-lsa', label: '07 - LSA' },
  { key: '07-1-radeaux-hru', label: '07.1 - Radeaux / HRU', parentKey: '07-lsa' },
  { key: '07-2-life-jacket', label: '07.2 - Life Jacket', parentKey: '07-lsa' },
  { key: '07-3-combinaison-survie', label: '07.3 - Combinaison de survie', parentKey: '07-lsa' },
  { key: '07-4-gmdss', label: '07.4 - GMDSS', parentKey: '07-lsa' },
  { key: '07-5-personal-locator-beacon-ais', label: '07.5 - Personal Locator Beacon, AIS', parentKey: '07-lsa' },
  { key: '07-6-pyrotechnie', label: '07.6 - Pyrotechnie', parentKey: '07-lsa' },
  { key: '07-7-lance-amarre', label: '07.7 - Lance Amarre', parentKey: '07-lsa' },
  { key: '07-8-bouee-feux-retournement-mob', label: '07.8 - Bouée, Feux à retournement et MOB', parentKey: '07-lsa' },
  { key: '07-9-defibrilateur', label: '07.9 - Défibrilateur', parentKey: '07-lsa' },
  { key: '08-levage', label: '08 - Levage' },
  { key: '08-1-grue', label: '08.1 - Grue', parentKey: '08-levage' },
  { key: '08-2-bossoir', label: '08.2 - Bossoir', parentKey: '08-levage' },
  { key: '08-3-accessoires-levage', label: '08.3 - Accessoires de levage', parentKey: '08-levage' },
  { key: '08-4-treuils', label: '08.4 - Treuils', parentKey: '08-levage' },
  { key: '08-5-remorques', label: '08.5 - Remorques', parentKey: '08-levage' },
  { key: '15-dotation-medicale', label: '15 - Dotation Médicale' },
  { key: '16-registre-produits-dangereux', label: '16 - Registre des produits dangereux' },
  { key: '16-1-liste-produits-dangereux', label: '16.1 - Liste des produits Dangereux', parentKey: '16-registre-produits-dangereux' },
  { key: '16-2-fiches-donnee-securite', label: '16.2 - Fiches de Donnée de Sécurité', parentKey: '16-registre-produits-dangereux' },
];

const frenchSort = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const categoryByKey = new Map(FLEET_CERTIFICATE_CATEGORY_CATALOG.map((category) => [category.key, category]));
const categoryByLabel = new Map(FLEET_CERTIFICATE_CATEGORY_CATALOG.map((category) => [category.label, category]));

function normalizeCategory(key: string, label: string): FleetCertificateCategoryOption {
  const normalizedLabel = label.toLocaleLowerCase('fr').replaceAll('&', 'et');
  if (key === '08-grue-et-bossoir' || normalizedLabel.includes('08 - grue et bossoir')) {
    return { key: '08-levage', label: '08 - Levage' };
  }
  return { key, label };
}

export function getFleetCertificateCategory(
  key: string,
  label: string,
): FleetCertificateCategoryOption {
  const normalized = normalizeCategory(key, label);
  return categoryByKey.get(normalized.key)
    || categoryByLabel.get(normalized.label)
    || normalized;
}

export function getFleetCertificateCategoryParent(
  category: FleetCertificateCategoryOption,
): FleetCertificateCategoryOption | null {
  return category.parentKey ? categoryByKey.get(category.parentKey) || null : null;
}

export function getFleetCertificateCategoryOptions(
  certificates: Array<Pick<FleetCertificateRecord, 'categoryKey' | 'categoryLabel'>>,
): FleetCertificateCategoryOption[] {
  const categories = new Map<string, FleetCertificateCategoryOption>();
  certificates.forEach((certificate) => {
    const category = getFleetCertificateCategory(certificate.categoryKey, certificate.categoryLabel);
    categories.set(category.key, category);
  });
  FLEET_CERTIFICATE_CATEGORY_CATALOG.forEach((category) => categories.set(category.key, category));
  return Array.from(categories.values()).sort((left, right) => frenchSort.compare(left.label, right.label));
}
