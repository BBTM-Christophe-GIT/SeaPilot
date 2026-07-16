import type {
  ProjectContractRecord,
  ProjectDocumentRecord,
  ProjectRecord,
} from './projectQueries';

export interface ProjectFilterState {
  search: string;
  status: string;
  clientName: string;
  vesselName: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_PROJECT_FILTERS: ProjectFilterState = {
  search: '',
  status: '',
  clientName: '',
  vesselName: '',
  dateFrom: '',
  dateTo: '',
};

export interface SupplytimeFieldDefinition {
  key: string;
  label: string;
}

export interface SupplytimeGroupDefinition {
  id: string;
  label: string;
  fields: SupplytimeFieldDefinition[];
}

export interface SupplytimePreviewField extends SupplytimeFieldDefinition {
  value: string;
  source: 'canonical' | 'supplytime' | 'empty';
}

export interface SupplytimePreviewGroup {
  id: string;
  label: string;
  fields: SupplytimePreviewField[];
}

export const SUPPLYTIME_GROUPS: SupplytimeGroupDefinition[] = [
  {
    id: 'parties',
    label: 'Parties et navire',
    fields: [
      { key: 'box01_owners', label: '1. Armateur / lieu d’activité' },
      { key: 'box02_charterers', label: '2. Affréteur / lieu d’activité' },
      { key: 'box03_vessel', label: '3. Navire et numéro IMO' },
    ],
  },
  {
    id: 'delivery',
    label: 'Livraison et période',
    fields: [
      { key: 'box04_delivery_date', label: '4. Date de livraison' },
      { key: 'box05_cancelling_date', label: '5. Date et heure d’annulation' },
      { key: 'box06_port_delivery', label: '6. Port / lieu de livraison' },
      { key: 'box07_delivery_range', label: '7. Zone / lieu de restitution' },
      { key: 'box08_notice_delivery', label: '8. Préavis et options de livraison' },
      { key: 'box09_period', label: '9. Période d’affrètement' },
      { key: 'box10_extension', label: '10. Prolongation' },
      { key: 'box11_continuation', label: '11. Poursuite automatique' },
    ],
  },
  {
    id: 'mobilisation',
    label: 'Mobilisation et carburant',
    fields: [
      { key: 'box12_mobilisation', label: '12. Mobilisation' },
      { key: 'box13_early_termination', label: '13. Résiliation anticipée' },
      { key: 'box14_bunker_delivery', label: '14. Carburant à la livraison' },
      { key: 'box15_declaration', label: '15. Déclaration / démobilisation' },
    ],
  },
  {
    id: 'operations',
    label: 'Opérations',
    fields: [
      { key: 'box16_area_operation', label: '16. Zone d’opération' },
      { key: 'box17_employment', label: '17. Emploi du navire' },
      { key: 'box18_delivery_hour', label: '18. Heure de livraison' },
      { key: 'box19_special_fuel', label: '19. Carburant spécial' },
    ],
  },
  {
    id: 'pricing',
    label: 'Prix et paiement',
    fields: [
      { key: 'box20_charter_hire', label: '20. Loyer d’affrètement' },
      { key: 'box21_extension_hire', label: '21. Loyer en prolongation' },
      { key: 'box22_invoice_remittance', label: '22. Facturation / remise' },
      { key: 'box23_payment', label: '23. Modalités de paiement' },
      { key: 'box24_account_group', label: '24. Groupe de comptes armateur' },
      { key: 'box25_internal_price', label: '25. Prix interne' },
      { key: 'box26_max_price', label: '26. Prix maximal d’audit' },
    ],
  },
  {
    id: 'risks',
    label: 'Risques et résiliation',
    fields: [
      { key: 'box27_war_risk', label: '27. Risques de guerre' },
      { key: 'box28_terror', label: '28. Risques de terrorisme' },
      { key: 'box29_notice_money', label: '29. Préavis financier' },
      { key: 'box30_cancellation_clause', label: '30. Clause d’annulation' },
    ],
  },
  {
    id: 'law',
    label: 'Droit et clauses',
    fields: [
      { key: 'box31_taxes', label: '31. Taxes' },
      { key: 'box32_other_law', label: '32. Autre droit / juridiction' },
      { key: 'box33_dispute_resolution', label: '33. Résolution des litiges' },
      { key: 'box34_additional_clauses', label: '34. Clauses additionnelles' },
    ],
  },
  {
    id: 'signatures',
    label: 'Signatures',
    fields: [
      { key: 'signature_owners', label: 'Signature armateur' },
      { key: 'signature_charterers', label: 'Signature affréteur' },
    ],
  },
];

export function normalizeProjectSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'fr'));
}

export function sortProjects(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort(
    (left, right) =>
      (right.deliveryAt || right.startsOn).localeCompare(left.deliveryAt || left.startsOn) ||
      left.projectCode.localeCompare(right.projectCode, 'fr') ||
      left.title.localeCompare(right.title, 'fr'),
  );
}

export function getProjectVesselNames(project: ProjectRecord): string[] {
  return [project.primaryVesselName, project.secondaryVesselName].filter(Boolean);
}

function getProjectStart(project: ProjectRecord): string {
  return project.deliveryAt || project.charterStartsAt || project.startsOn;
}

function getProjectEnd(project: ProjectRecord): string {
  return project.redeliveryAt || project.charterEndsAt || project.endsOn;
}

export function projectMatchesFilters(project: ProjectRecord, filters: ProjectFilterState): boolean {
  if (filters.status && project.status !== filters.status) {
    return false;
  }

  if (filters.clientName && project.clientName !== filters.clientName) {
    return false;
  }

  if (filters.vesselName && !getProjectVesselNames(project).includes(filters.vesselName)) {
    return false;
  }

  const projectStart = getProjectStart(project) || getProjectEnd(project);
  const projectEnd = getProjectEnd(project) || getProjectStart(project);

  if (filters.dateFrom && projectEnd && projectEnd.slice(0, 10) < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && projectStart && projectStart.slice(0, 10) > filters.dateTo) {
    return false;
  }

  const search = normalizeProjectSearch(filters.search);
  if (!search) {
    return true;
  }

  return normalizeProjectSearch(
    [
      project.title,
      project.projectCode,
      project.clientName,
      project.primaryVesselName,
      project.secondaryVesselName,
      project.status,
      project.description,
      project.contractType,
      project.operationArea,
      project.deliveryPort,
      project.redeliveryPort,
      project.sourceLabel,
    ].join(' '),
  ).includes(search);
}

export function documentBelongsToProject(document: ProjectDocumentRecord, project: ProjectRecord): boolean {
  return Boolean(
    (document.projectId && document.projectId === project.id) ||
      (document.projectSharePointItemId && document.projectSharePointItemId === project.sharePointItemId) ||
      (document.projectCode && document.projectCode === project.projectCode) ||
      (document.projectTitle && document.projectTitle === project.title),
  );
}

export function filterDocumentsForProjects(
  documents: ProjectDocumentRecord[],
  projects: ProjectRecord[],
): ProjectDocumentRecord[] {
  if (projects.length === 0) {
    return [];
  }

  return documents.filter((document) => projects.some((project) => documentBelongsToProject(document, project)));
}

export function resolveSelectedProject(
  projects: ProjectRecord[],
  selectedProjectId: number | null,
): ProjectRecord | null {
  return projects.find((project) => project.id === selectedProjectId) || projects[0] || null;
}

function canonicalSupplytimeValue(
  project: ProjectRecord,
  contract: ProjectContractRecord | undefined,
  key: string,
): string {
  const vessels = getProjectVesselNames(project).join(' / ');
  const periodStart = project.deliveryAt || project.charterStartsAt || project.startsOn;
  const periodEnd = project.redeliveryAt || project.charterEndsAt || project.endsOn;
  const money = (value: number | null | undefined, currency: string, unit = '') => {
    if (value === null || value === undefined) return '';
    return [
      new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value),
      currency,
      unit ? `/ ${unit}` : '',
    ].filter(Boolean).join(' ');
  };
  const extension = contract?.extensionCount !== null && contract?.extensionCount !== undefined
    && contract.extensionDuration !== null
    ? `${contract.extensionCount} x ${contract.extensionDuration} ${contract.extensionUnit}`.trim()
    : '';

  const canonicalValues: Record<string, string> = {
    box01_owners: contract?.ownerIdentity || '',
    box02_charterers: project.clientName,
    box03_vessel: vessels,
    box04_delivery_date: project.deliveryAt || project.startsOn,
    box06_port_delivery: project.deliveryPort,
    box07_delivery_range: project.redeliveryPort,
    box09_period: [periodStart, periodEnd].filter(Boolean).join(' — '),
    box10_extension: extension,
    box11_continuation: contract?.autoExtensionPeriod || '',
    box12_mobilisation: money(contract?.mobilisationFee, contract?.feeCurrency || ''),
    box15_declaration: money(contract?.demobilisationFee, contract?.feeCurrency || ''),
    box16_area_operation: project.operationArea,
    box17_employment: project.title,
    box20_charter_hire: money(contract?.charterHire, contract?.hireCurrency || '', contract?.hireUnit),
    box21_extension_hire: money(contract?.extensionHire, contract?.hireCurrency || '', contract?.hireUnit),
    box26_max_price: contract?.maxAuditPeriod || '',
  };

  return canonicalValues[key] || '';
}

export function buildSupplytimePreview(
  project: ProjectRecord,
  contract: ProjectContractRecord | undefined,
): SupplytimePreviewGroup[] {
  return SUPPLYTIME_GROUPS.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const canonicalValue = canonicalSupplytimeValue(project, contract, field.key);
      const storedValue = contract?.supplytimeData[field.key] || '';

      return {
        ...field,
        value: canonicalValue || storedValue,
        source: canonicalValue ? 'canonical' : storedValue ? 'supplytime' : 'empty',
      };
    }),
  }));
}
