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
  sourcePage: number;
  sourceTitle: string;
  title: string;
  family: QhseReportFamily;
  description: string;
  orientation: 'portrait' | 'landscape';
  coverage: 'complete' | 'partial';
}

export const QHSE_REPORT_CATALOG: readonly QhseReportDefinition[] = [
  { id: 'menu', sourcePage: 1, sourceTitle: 'Menu', title: 'Sommaire des rapports QHSE', family: 'Sommaire', description: 'Index des rapports et périmètre de données SeaPilot.', orientation: 'landscape', coverage: 'complete' },
  { id: 'port-call-duration', sourcePage: 2, sourceTitle: 'Durée des escales', title: 'Durée des escales', family: 'Technique & opérations', description: 'Durées, ports et motifs des escales déclarées dans les DPR.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hse-tf-tg', sourcePage: 3, sourceTitle: 'QHSE - TF-TG - Old', title: 'QHSE — taux de fréquence et de gravité', family: 'QHSE & RSE', description: 'Accidents, heures d’exposition et évolution cumulée TF/TG.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-safety-1', sourcePage: 4, sourceTitle: 'RSE - Social Sécu 1', title: 'RSE — santé et sécurité 1', family: 'QHSE & RSE', description: 'Typologie des événements et indicateurs annuels de sécurité.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-safety-2', sourcePage: 5, sourceTitle: 'RSE - Social Sécu 2', title: 'RSE — santé et sécurité 2', family: 'QHSE & RSE', description: 'Pyramide de Bird et causes documentées des événements.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-safety-vessel', sourcePage: 6, sourceTitle: 'RSE - Social Sécu Navire', title: 'RSE — sécurité navire', family: 'QHSE & RSE', description: 'Événements, exercices et actions de prévention par navire.', orientation: 'portrait', coverage: 'complete' },
  { id: 'environment', sourcePage: 7, sourceTitle: 'RSE - Environnement', title: 'RSE — environnement', family: 'QHSE & RSE', description: 'Carburant, eau, déchets et estimation des émissions de GES.', orientation: 'portrait', coverage: 'complete' },
  { id: 'social-governance', sourcePage: 8, sourceTitle: 'RSE - Social Gouvernance', title: 'RSE — social et gouvernance', family: 'QHSE & RSE', description: 'Effectifs et propositions d’amélioration ; lacunes signalées sans extrapolation.', orientation: 'portrait', coverage: 'partial' },
  { id: 'planned-maintenance', sourcePage: 9, sourceTitle: 'Technique - Maintenance Planifiée', title: 'Technique — maintenance planifiée', family: 'Technique & opérations', description: 'Arrêts techniques et visites planifiés dans SeaPilot.', orientation: 'portrait', coverage: 'partial' },
  { id: 'technical-availability', sourcePage: 10, sourceTitle: 'Technique - Availability Rate', title: 'Technique — taux de disponibilité', family: 'Technique & opérations', description: 'Disponibilité documentée à partir des arrêts techniques et avaries.', orientation: 'portrait', coverage: 'partial' },
  { id: 'port-call-tracking', sourcePage: 11, sourceTitle: 'Opérations - Suivi Escales', title: 'Opérations — suivi des escales', family: 'Technique & opérations', description: 'Synthèse chronologique des escales et de leurs motifs.', orientation: 'portrait', coverage: 'complete' },
  { id: 'port-call-tracking-v2', sourcePage: 12, sourceTitle: 'Opérations - Suivi Escales V2', title: 'Opérations — suivi des escales détaillé', family: 'Technique & opérations', description: 'Analyse mensuelle des durées d’escale et des ports fréquentés.', orientation: 'portrait', coverage: 'complete' },
  { id: 'operations-availability', sourcePage: 13, sourceTitle: 'Opérations - Taux de disponibilité', title: 'Opérations — taux de disponibilité', family: 'Technique & opérations', description: 'Disponibilité opérationnelle documentée et couverture des DPR.', orientation: 'portrait', coverage: 'partial' },
  { id: 'action-plan-global', sourcePage: 14, sourceTitle: 'Plan Action - BBTM', title: 'Plan d’action — BBTM', family: 'Plans d’action', description: 'État global des actions, échéances, responsables et clôtures.', orientation: 'landscape', coverage: 'complete' },
  { id: 'action-plan-policy', sourcePage: 15, sourceTitle: 'Plan Action - Politique', title: 'Plan d’action — politique QHSE', family: 'Plans d’action', description: 'Actions liées aux politiques, objectifs et démarches d’amélioration.', orientation: 'landscape', coverage: 'complete' },
  { id: 'visit-planning-internal', sourcePage: 16, sourceTitle: 'Planning Visites - GOURY', title: 'Planning des visites — interne', family: 'Flotte', description: 'Visites, audits et arrêts planifiés par navire.', orientation: 'landscape', coverage: 'complete' },
  { id: 'certificate-list', sourcePage: 17, sourceTitle: 'Liste Certificats - GOURY', title: 'Liste des certificats', family: 'Flotte', description: 'Référentiel des certificats et documents de la flotte.', orientation: 'landscape', coverage: 'complete' },
  { id: 'certificate-validity', sourcePage: 18, sourceTitle: 'Validité Certificats - GOURY', title: 'Validité des certificats', family: 'Flotte', description: 'Échéances, renouvellements et statuts de validité.', orientation: 'landscape', coverage: 'complete' },
  { id: 'visit-planning-client', sourcePage: 19, sourceTitle: 'Planning Visites (Version Client) - GOURY', title: 'Planning des visites — version client', family: 'Flotte', description: 'Vue épurée des visites et audits partageables avec le client.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hr-age-pyramid', sourcePage: 20, sourceTitle: 'RH - Pyramide des âges', title: 'RH — pyramide des âges', family: 'RH & QSMS', description: 'Répartition des collaborateurs par âge et genre renseigné.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hr-management', sourcePage: 21, sourceTitle: 'RH - Management', title: 'RH — management', family: 'RH & QSMS', description: 'Effectifs actifs par fonction, contrat et ancienneté.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hse-kpi-lems', sourcePage: 22, sourceTitle: 'QHSE - KPI LEMS', title: 'QHSE — KPI projet / LEMS', family: 'QHSE & RSE', description: 'Heures, événements, exercices, TBT, visites et audits HSE.', orientation: 'landscape', coverage: 'complete' },
  { id: 'hse-audit-deviations-lems', sourcePage: 23, sourceTitle: 'QHSE - Suivi Ecarts Audit LEMS', title: 'QHSE — suivi des écarts d’audit', family: 'QHSE & RSE', description: 'Écarts, actions correctives, échéances et statut de clôture.', orientation: 'landscape', coverage: 'complete' },
  { id: 'documents-list', sourcePage: 24, sourceTitle: 'Liste des Documents', title: 'QSMS — liste des documents', family: 'RH & QSMS', description: 'Procédures sources et publications contrôlées dans SeaPilot.', orientation: 'portrait', coverage: 'complete' },
  { id: 'consumption', sourcePage: 25, sourceTitle: 'RSE - Consommation', title: 'RSE — consommations par projet', family: 'QHSE & RSE', description: 'Carburant et avitaillements par mois, projet et navire.', orientation: 'portrait', coverage: 'complete' },
] as const;

export const QHSE_REPORT_FAMILIES: readonly QhseReportFamily[] = [
  'Sommaire', 'QHSE & RSE', 'Technique & opérations', 'Plans d’action', 'Flotte', 'RH & QSMS',
];

export function qhseReportFileName(report: QhseReportDefinition, year: number | number[], vesselName = ''): string {
  const slug = report.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const vessel = vesselName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const years = Array.isArray(year) ? [...year].sort((left, right) => left - right) : [year];
  const period = years.length === 1 ? String(years[0]) : `${years[0]}-${years.at(-1)}`;
  return `${String(report.sourcePage).padStart(2, '0')}-${slug}-${period}${vessel ? `-${vessel}` : ''}.pdf`;
}
