export type QhseReportFamily = 'Sommaire' | 'QHSE & RSE' | 'Technique & opérations' | 'Plans d’action' | 'Flotte' | 'RH & QSMS';

export type QhseReportId =
  | 'menu'
  | 'port-call-duration'
  | 'hse-tf-tg'
  | 'social-safety-1'
  | 'social-safety-2'
  | 'social-safety-vessel'
  | 'environment'
  | 'social-governance'
  | 'planned-maintenance'
  | 'technical-availability'
  | 'port-call-tracking'
  | 'port-call-tracking-v2'
  | 'operations-availability'
  | 'action-plan-global'
  | 'action-plan-policy'
  | 'visit-planning-internal'
  | 'certificate-list'
  | 'certificate-validity'
  | 'visit-planning-client'
  | 'hr-age-pyramid'
  | 'hr-management'
  | 'hse-kpi-lems'
  | 'hse-audit-deviations-lems'
  | 'documents-list'
  | 'consumption';

export interface QhseReportDefinition {
  id: QhseReportId;
  pageNumber: number;
  sourcePage: number;
  sourceTitle: string;
  title: string;
  family: QhseReportFamily;
  description: string;
  orientation: 'portrait' | 'landscape';
  coverage: 'complete' | 'partial';
}

export const QHSE_REPORT_CATALOG: readonly QhseReportDefinition[] = [
  { id: 'menu', pageNumber: 1, sourcePage: 1, sourceTitle: 'Menu', title: 'Sommaire des rapports QHSE', family: 'Sommaire', description: 'Index des rapports et périmètre de données SeaPilot.', orientation: 'landscape', coverage: 'complete' },
  { id: 'social-safety-1', pageNumber: 2, sourcePage: 4, sourceTitle: 'RSE - Social Sécu 1', title: 'RSE — santé et sécurité 1', family: 'QHSE & RSE', description: 'Typologie des événements et indicateurs annuels de sécurité.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-safety-2', pageNumber: 3, sourcePage: 5, sourceTitle: 'RSE - Social Sécu 2', title: 'RSE — santé et sécurité 2', family: 'QHSE & RSE', description: 'Pyramide de Bird et causes documentées des événements.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-safety-vessel', pageNumber: 4, sourcePage: 6, sourceTitle: 'RSE - Social Sécu Navire', title: 'RSE — sécurité navire', family: 'QHSE & RSE', description: 'Événements, exercices et actions de prévention par navire.', orientation: 'portrait', coverage: 'complete' },
  { id: 'environment', pageNumber: 5, sourcePage: 7, sourceTitle: 'RSE - Environnement', title: 'RSE — environnement', family: 'QHSE & RSE', description: 'Carburant, eau, déchets et estimation des émissions de GES.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-governance', pageNumber: 6, sourcePage: 8, sourceTitle: 'RSE - Social Gouvernance', title: 'RSE — social et gouvernance', family: 'QHSE & RSE', description: 'Effectifs et propositions d’amélioration ; lacunes signalées sans extrapolation.', orientation: 'portrait', coverage: 'partial' },
  { id: 'port-call-tracking-v2', pageNumber: 7, sourcePage: 12, sourceTitle: 'Opérations - Suivi Escales V2', title: 'Opérations — suivi des escales détaillé', family: 'Technique & opérations', description: 'Analyse mensuelle des durées d’escale et des ports fréquentés.', orientation: 'portrait', coverage: 'complete' },
  { id: 'hr-age-pyramid', pageNumber: 8, sourcePage: 20, sourceTitle: 'RH - Pyramide des âges', title: 'RH — pyramide des âges', family: 'RH & QSMS', description: 'Répartition des collaborateurs par âge et genre renseigné.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hr-management', pageNumber: 9, sourcePage: 21, sourceTitle: 'RH - Management', title: 'RH — management', family: 'RH & QSMS', description: 'Effectifs actifs par fonction, contrat et ancienneté.', orientation: 'landscape', coverage: 'complete' },
  { id: 'consumption', pageNumber: 10, sourcePage: 25, sourceTitle: 'RSE - Consommation', title: 'RSE — consommations par projet', family: 'QHSE & RSE', description: 'Eau avitaillée, fuel consommé et émissions cumulées de GES avec effet xBee.', orientation: 'portrait', coverage: 'complete' },
] as const;

export const QHSE_REPORT_FAMILIES: readonly QhseReportFamily[] = [
  'Sommaire', 'QHSE & RSE', 'Technique & opérations', 'RH & QSMS',
];

export function qhseReportFileName(report: QhseReportDefinition, year: number | number[], vesselName = '', projectName = ''): string {
  const slug = report.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const vessel = vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const project = projectName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const years = Array.isArray(year) ? [...year].sort((left, right) => left - right) : [year];
  const period = years.length === 1 ? String(years[0]) : `${years[0]}-${years.at(-1)}`;
  return `${String(report.pageNumber).padStart(2, '0')}-${slug}-${period}${vessel ? `-${vessel}` : ''}${project ? `-${project}` : ''}.pdf`;
}
