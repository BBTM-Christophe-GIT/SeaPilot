// Demonstration records only: exercise all fleet/category navigation states locally.
export const ACTION_PLAN_PREVIEW_VESSELS = [
  { id: 9210, name: 'LE ROZEL', length_overall: '19.2 m' },
  { id: 9211, name: 'SUROIT', length_overall: '18.6 m' },
  { id: 9212, name: 'KROKDUR', length_overall: '15 m' },
].map((vessel) => ({ ...vessel, company_id: 1, active: true, asset_kind: 'vessel', fleet_exit_on: null }));

const types = {
  audit: ['audit_internal', 'Audit Interne - BBTM'],
  action: ['action_progress', 'Action de Progrès - BBTM'],
  visit: ['visit_hse', 'Visite HSE'],
  event: ['near_miss', 'Presqu’accident'],
};

const examples: Array<[number, string, keyof typeof types, string]> = [
  [1, 'GOURY', 'audit', 'Contrôle extincteurs pont principal'],
  [1, 'GOURY', 'audit', 'Mise à jour du registre de sécurité'],
  [1, 'GOURY', 'audit', 'Contrôle des équipements de sauvetage'],
  [1, 'GOURY', 'action', 'Remplacement du flexible hydraulique'],
  [1, 'GOURY', 'action', 'Pose de la signalisation zone de levage'],
  [1, 'GOURY', 'visit', 'Visite HSE mensuelle'],
  [1, 'GOURY', 'visit', 'Inspection des locaux techniques'],
  [9210, 'LE ROZEL', 'audit', 'Contrôle du matériel de sécurité'],
  [9210, 'LE ROZEL', 'audit', 'Vérification des registres'],
  [9210, 'LE ROZEL', 'audit', 'Inspection du pont de travail'],
  [9210, 'LE ROZEL', 'action', 'Remise en état du rangement atelier'],
  [9210, 'LE ROZEL', 'event', 'Signalement d’un risque de glissade'],
  [9211, 'SUROIT', 'audit', 'Contrôle des équipements de pont'],
  [9211, 'SUROIT', 'action', 'Actualisation des consignes de bord'],
  [9211, 'SUROIT', 'action', 'Remplacement d’un éclairage'],
  [9211, 'SUROIT', 'visit', 'Visite sécurité avant appareillage'],
  [9212, 'KROKDUR', 'action', 'Contrôle de la signalisation'],
  [3, 'Yard - LE HAVRE', 'audit', 'Inspection des zones de stockage'],
  [3, 'Yard - LE HAVRE', 'action', 'Marquage des voies de circulation'],
  [2, 'Armement - Cherbourg', 'audit', 'Contrôle des issues de secours'],
  [2, 'Armement - Cherbourg', 'action', 'Mise à jour du plan d’évacuation'],
];

export const ACTION_PLAN_FLEET_PREVIEW = examples.map(([vesselId, vesselName, category, title], index) => ({
  id: 50000 + index, company_id: 1, vessel_id: vesselId, vessel_name: vesselName,
  category_key: category === 'visit' ? 'hse_visit' : category,
  action_type_key: types[category][0], action_type: types[category][1], title,
  status: index === 2 ? 'Soldé' : 'Non soldé', workflow_status: index === 2 ? 'closed' : 'approved',
  opened_on: '2026-09-01', occurred_at: '2026-09-01T09:00:00+02:00', due_on: '2026-10-01',
  closed_on: index === 2 ? '2026-09-10' : null, priority_label: 'Normale',
  issuer_name: 'Arthur DEMO', issuer_person_id: 9301, owner_name: 'Luc MARTIN',
  description: 'Point de contrôle identifié lors de la ronde de sécurité.',
  corrective_action: 'Réaliser le contrôle, puis joindre le compte rendu au suivi.',
  location_detail: vesselName, source_label: 'preview', lost_days: 0,
}));
