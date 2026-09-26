import type { OrgData } from './organigrammeModel';

// Entirely fictional fixture shared by the public preview and UI tests.
export const ORG_DEMO: OrgData = {
  asOf: '2026-09-26',
  people: [
    { id: 1, name: 'Camille DUMONT', functionLabel: 'Président', population: 'sedentary' },
    { id: 2, name: 'Élodie MARTIN', functionLabel: 'Capitaine', population: 'offshore' },
    { id: 3, name: 'Louis BERNARD', functionLabel: 'Chef Mécanicien', population: 'offshore' },
    { id: 4, name: 'Emma ROBERT', functionLabel: '2nd Capitaine', population: 'offshore' },
    { id: 5, name: 'Arthur PETIT', functionLabel: 'Matelot polyvalent', population: 'offshore' },
    { id: 6, name: 'Léa MOREAU', functionLabel: 'Capitaine', population: 'offshore' },
    { id: 7, name: 'Gabriel SIMON', functionLabel: 'Chef Mécanicien', population: 'offshore' },
    { id: 8, name: 'Alice LAURENT', functionLabel: 'Capitaine', population: 'offshore' },
    { id: 9, name: 'Hugo MICHEL', functionLabel: 'Matelot Qualifié', population: 'offshore' },
    { id: 10, name: 'Chloé GARCIA', functionLabel: 'Matelot polyvalent', population: 'offshore' },
    { id: 11, name: 'Jules ROUX', functionLabel: 'Directeur QHSE / Chef de Projet', population: 'sedentary' },
    { id: 12, name: 'Louise FAURE', functionLabel: 'Directrice Administrative et Financière', population: 'sedentary' },
  ],
  vessels: [{ id: 1, name: 'GOURY', lengthOverall: 30.62 }, { id: 2, name: 'LE ROZEL', lengthOverall: 19.2 }],
  memberships: [
    { personId: 2, vesselId: 1, watchGroup: 'Bordée 1', functionLabel: 'Capitaine', source: 'assignment' },
    { personId: 3, vesselId: 1, watchGroup: 'Bordée 1', functionLabel: 'Chef Mécanicien', source: 'assignment' },
    { personId: 4, vesselId: 1, watchGroup: 'Bordée 1', functionLabel: '2nd Capitaine', source: 'assignment' },
    { personId: 5, vesselId: 1, watchGroup: 'Bordée 1', functionLabel: 'Matelot polyvalent', source: 'assignment' },
    { personId: 6, vesselId: 1, watchGroup: 'Bordée 2', functionLabel: 'Capitaine', source: 'board' },
    { personId: 7, vesselId: 1, watchGroup: 'Bordée 2', functionLabel: 'Chef Mécanicien', source: 'board' },
    { personId: 8, vesselId: 2, watchGroup: 'Bordée 1', functionLabel: 'Capitaine', source: 'board' },
    { personId: 9, vesselId: 2, watchGroup: 'Bordée 1', functionLabel: 'Matelot Qualifié', source: 'board' },
  ],
  support: [
    { id: 1, personId: null, name: 'Cabinet comptable · Démo', functionLabel: 'RH / Comptabilité', category: 'external', position: 1 },
    { id: 2, personId: null, name: 'Assistance maritime · Démo', functionLabel: 'Accompagnement technique & décisionnel', category: 'external', position: 2 },
    { id: 3, personId: null, name: 'Cabinet juridique · Démo', functionLabel: 'Accompagnement légal et contrats', category: 'external', position: 3 },
  ],
};

export const ORG_LINKS_DEMO: OrgData = { ...ORG_DEMO, links: [
  { id: 1, sourceCategory: 'external', targetKind: 'category', targetKey: 'office', targetSection: '', label: 'Conseil et accompagnement' },
  { id: 2, sourceCategory: 'external', targetKind: 'group', targetKey: '1-Bordée 1', targetSection: 'vessel-1', label: 'Assistance technique' },
  { id: 3, sourceCategory: 'external', targetKind: 'person', targetKey: '2', targetSection: '', label: 'Référente opérationnelle' },
] };
