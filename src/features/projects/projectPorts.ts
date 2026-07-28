export interface ProjectPort {
  department: string;
  locode: string;
  port: string;
}

export interface ProjectPortGroup {
  department: string;
  ports: ProjectPort[];
}

export const PROJECT_PORTS_SOURCE = {
  listId: '20e7b5db-85f2-4e7f-ad8d-64d75b396414',
  siteUrl: 'https://bbtm668.sharepoint.com/sites/QHSE',
  title: 'LOCODE',
} as const;

export const PROJECT_PORTS: readonly ProjectPort[] = [
  { department: 'Seine-Maritime', locode: 'FRLEH', port: 'Le Havre' },
  { department: 'Nord', locode: 'FRDKK', port: 'Dunkerque' },
  { department: 'Loire-Atlantique', locode: 'FRNTE', port: 'Nantes - Saint-Nazaire' },
  { department: 'Charente-Maritime', locode: 'FRLRH', port: 'La Rochelle' },
  { department: 'Gironde', locode: 'FRBOD', port: 'Bordeaux' },
  { department: 'Bouches-du-Rhône', locode: 'FRMRS', port: 'Marseille' },
  { department: 'Guadeloupe', locode: 'GPPTP', port: 'Guadeloupe' },
  { department: 'Martinique', locode: 'MQFDF', port: 'Martinique' },
  { department: 'Guyane', locode: 'GFDDC', port: 'Guyane' },
  { department: 'La Réunion', locode: 'RELPT', port: 'La Réunion' },
  { department: 'Pas-de-Calais', locode: 'FRCQF', port: 'Calais' },
  { department: 'Pas-de-Calais', locode: 'FRBOL', port: 'Boulogne-sur-Mer' },
  { department: 'Seine-Maritime', locode: 'FRLTR', port: 'Le Tréport' },
  { department: 'Seine-Maritime', locode: 'FRDPE', port: 'Dieppe' },
  { department: 'Seine-Maritime', locode: 'FRFEC', port: 'Fécamp' },
  { department: 'Calvados', locode: 'FRCFR', port: 'Caen-Ouistreham' },
  { department: 'Manche', locode: 'FRCER', port: 'Cherbourg' },
  { department: 'Manche', locode: 'FRDIL', port: 'Diélette' },
  { department: 'Manche', locode: 'FRBNV', port: 'Barneville-Carteret' },
  { department: 'Manche', locode: 'FRGFR', port: 'Granville' },
  { department: 'Ille-et-Vilaine', locode: 'FRSML', port: 'Saint-Malo' },
  { department: 'Côtes-d’Armor', locode: 'FRSBK', port: 'Saint-Brieuc - Le Légué' },
  { department: 'Finistère', locode: 'FRROS', port: 'Roscoff' },
  { department: 'Finistère', locode: 'FRBES', port: 'Brest' },
  { department: 'Morbihan', locode: 'FRLRT', port: 'Lorient' },
  { department: 'Vendée', locode: 'FRLSO', port: 'Les Sables-d’Olonne' },
  { department: 'Charente-Maritime', locode: 'FRRCO', port: 'Rochefort' },
  { department: 'Charente-Maritime', locode: 'FRTON', port: 'Tonnay-Charente' },
  { department: 'Pyrénées-Atlantiques', locode: 'FRBAY', port: 'Bayonne' },
  { department: 'Pyrénées-Orientales', locode: 'FRPOV', port: 'Port-Vendres' },
  { department: 'Aude', locode: 'FRNOU', port: 'Port-la-Nouvelle' },
  { department: 'Hérault', locode: 'FRSET', port: 'Sète' },
  { department: 'Bouches-du-Rhône', locode: 'FRLCT', port: 'La Ciotat' },
  { department: 'Var', locode: 'FRYNR', port: 'Sanary-sur-Mer' },
  { department: 'Var', locode: 'FRTLN', port: 'Toulon' },
  { department: 'Var', locode: 'FRSTP', port: 'Saint-Tropez' },
  { department: 'Alpes-Maritimes', locode: 'FRCEQ', port: 'Cannes' },
  { department: 'Alpes-Maritimes', locode: 'FRANT', port: 'Antibes' },
  { department: 'Alpes-Maritimes', locode: 'FRNCE', port: 'Nice' },
  { department: 'Alpes-Maritimes', locode: 'FRVFM', port: 'Villefranche-sur-Mer' },
  { department: 'Haute-Corse', locode: 'FRBIA', port: 'Bastia' },
  { department: 'Haute-Corse', locode: 'FRZFB', port: 'Saint-Florent' },
  { department: 'Haute-Corse', locode: 'FRILR', port: 'L’Île-Rousse' },
  { department: 'Haute-Corse', locode: 'FRCLY', port: 'Calvi' },
  { department: 'Corse-du-Sud', locode: 'FRAJA', port: 'Ajaccio' },
  { department: 'Corse-du-Sud', locode: 'FRPRP', port: 'Propriano' },
  { department: 'Corse-du-Sud', locode: 'FRBON', port: 'Bonifacio' },
  { department: 'Corse-du-Sud', locode: 'FRPVO', port: 'Porto-Vecchio' },
  { department: 'Mayotte', locode: 'YTLON', port: 'Mayotte' },
  { department: 'Saint-Martin', locode: 'MFGES', port: 'Saint-Martin' },
  { department: 'Saint-Pierre-et-Miquelon', locode: 'PMFSP', port: 'Saint-Pierre-et-Miquelon' },
  { department: 'Saint-Barthélemy', locode: 'BLSBH', port: 'Gustavia' },
  { department: 'Nouvelle-Calédonie', locode: 'NCNOU', port: 'Nouméa' },
] as const;

const frenchCollator = new Intl.Collator('fr', { sensitivity: 'base' });

export const PROJECT_PORT_GROUPS: readonly ProjectPortGroup[] = Array.from(
  PROJECT_PORTS.reduce((groups, port) => {
    const departmentPorts = groups.get(port.department) || [];
    departmentPorts.push(port);
    groups.set(port.department, departmentPorts);
    return groups;
  }, new Map<string, ProjectPort[]>()),
  ([department, ports]) => ({
    department,
    ports: ports.sort((left, right) => frenchCollator.compare(left.port, right.port)),
  }),
).sort((left, right) => frenchCollator.compare(left.department, right.department));

export function formatProjectPort(port: ProjectPort): string {
  return `${port.port} – ${port.locode}`;
}
