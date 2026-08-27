import { PROJECT_PORTS_DATA } from './projectPortsData';

export type ProjectPortCountry = 'France' | 'Angleterre';
export type ProjectPortLocodeAssociation = 'municipality' | 'published-port';

export interface ProjectPort {
  country: ProjectPortCountry;
  department: string;
  departmentCode?: string;
  locode: string;
  locodeAssociation?: ProjectPortLocodeAssociation;
  locodePort?: string;
  municipality?: string;
  parentLocode?: string;
  port: string;
  referenceCode?: string;
  referenceSystem?: string;
}

export interface ProjectPortGroup {
  country: ProjectPortCountry;
  department: string;
  ports: ProjectPort[];
}

export const PROJECT_PORTS_SOURCE = {
  france: {
    dataset: 'Ports - Espace maritime français',
    publisher: 'SANDRE / SHOM',
    updatedOn: '2026-08-25',
    url: 'https://www.data.gouv.fr/datasets/ports-espace-maritime-francais',
  },
  england: {
    dataset: 'Major and minor port list for freight statistics',
    publisher: 'UK Department for Transport',
    updatedOn: '2026-07-29',
    url: 'https://www.gov.uk/government/statistical-data-sets/port-and-domestic-waterborne-freight-statistics-port',
  },
  locode: {
    dataset: 'UN/LOCODE 2025-1',
    publisher: 'UNECE',
    url: 'https://unece.org/trade/cefact/UNLOCODE-Download',
  },
} as const;

const LEGACY_PROJECT_PORT_ALIASES: readonly ProjectPort[] = [
  { country: 'France', department: 'Seine-Maritime', locode: 'FRLEH', port: 'Le Havre' },
  { country: 'France', department: 'Nord', locode: 'FRDKK', port: 'Dunkerque' },
  { country: 'France', department: 'Loire-Atlantique', locode: 'FRNTE', port: 'Nantes - Saint-Nazaire' },
  { country: 'France', department: 'Charente-Maritime', locode: 'FRLRH', port: 'La Rochelle' },
  { country: 'France', department: 'Gironde', locode: 'FRBOD', port: 'Bordeaux' },
  { country: 'France', department: 'Bouches-du-Rhône', locode: 'FRMRS', port: 'Marseille' },
  { country: 'France', department: 'Guadeloupe', locode: 'GPPTP', port: 'Guadeloupe' },
  { country: 'France', department: 'Martinique', locode: 'MQFDF', port: 'Martinique' },
  { country: 'France', department: 'Guyane', locode: 'GFDDC', port: 'Guyane' },
  { country: 'France', department: 'La Réunion', locode: 'RELPT', port: 'La Réunion' },
  { country: 'France', department: 'Pas-de-Calais', locode: 'FRCQF', port: 'Calais' },
  { country: 'France', department: 'Pas-de-Calais', locode: 'FRBOL', port: 'Boulogne-sur-Mer' },
  { country: 'France', department: 'Seine-Maritime', locode: 'FRLTR', port: 'Le Tréport' },
  { country: 'France', department: 'Seine-Maritime', locode: 'FRDPE', port: 'Dieppe' },
  { country: 'France', department: 'Seine-Maritime', locode: 'FRFEC', port: 'Fécamp' },
  { country: 'France', department: 'Calvados', locode: 'FRCFR', port: 'Caen-Ouistreham' },
  { country: 'France', department: 'Manche', locode: 'FRCER', port: 'Cherbourg' },
  { country: 'France', department: 'Manche', locode: 'FRDIL', port: 'Diélette' },
  { country: 'France', department: 'Manche', locode: 'FRBNV', port: 'Barneville-Carteret' },
  { country: 'France', department: 'Manche', locode: 'FRGFR', port: 'Granville' },
  { country: 'France', department: 'Ille-et-Vilaine', locode: 'FRSML', port: 'Saint-Malo' },
  { country: 'France', department: 'Côtes-d’Armor', locode: 'FRSBK', port: 'Saint-Brieuc - Le Légué' },
  { country: 'France', department: 'Finistère', locode: 'FRROS', port: 'Roscoff' },
  { country: 'France', department: 'Finistère', locode: 'FRBES', port: 'Brest' },
  { country: 'France', department: 'Morbihan', locode: 'FRLRT', port: 'Lorient' },
  { country: 'France', department: 'Vendée', locode: 'FRLSO', port: 'Les Sables-d’Olonne' },
  { country: 'France', department: 'Charente-Maritime', locode: 'FRRCO', port: 'Rochefort' },
  { country: 'France', department: 'Charente-Maritime', locode: 'FRTON', port: 'Tonnay-Charente' },
  { country: 'France', department: 'Pyrénées-Atlantiques', locode: 'FRBAY', port: 'Bayonne' },
  { country: 'France', department: 'Pyrénées-Orientales', locode: 'FRPOV', port: 'Port-Vendres' },
  { country: 'France', department: 'Aude', locode: 'FRNOU', port: 'Port-la-Nouvelle' },
  { country: 'France', department: 'Hérault', locode: 'FRSET', port: 'Sète' },
  { country: 'France', department: 'Bouches-du-Rhône', locode: 'FRLCT', port: 'La Ciotat' },
  { country: 'France', department: 'Var', locode: 'FRYNR', port: 'Sanary-sur-Mer' },
  { country: 'France', department: 'Var', locode: 'FRTLN', port: 'Toulon' },
  { country: 'France', department: 'Var', locode: 'FRSTP', port: 'Saint-Tropez' },
  { country: 'France', department: 'Alpes-Maritimes', locode: 'FRCEQ', port: 'Cannes' },
  { country: 'France', department: 'Alpes-Maritimes', locode: 'FRANT', port: 'Antibes' },
  { country: 'France', department: 'Alpes-Maritimes', locode: 'FRNCE', port: 'Nice' },
  { country: 'France', department: 'Alpes-Maritimes', locode: 'FRVFM', port: 'Villefranche-sur-Mer' },
  { country: 'France', department: 'Haute-Corse', locode: 'FRBIA', port: 'Bastia' },
  { country: 'France', department: 'Haute-Corse', locode: 'FRZFB', port: 'Saint-Florent' },
  { country: 'France', department: 'Haute-Corse', locode: 'FRILR', port: 'L’Île-Rousse' },
  { country: 'France', department: 'Haute-Corse', locode: 'FRCLY', port: 'Calvi' },
  { country: 'France', department: 'Corse-du-Sud', locode: 'FRAJA', port: 'Ajaccio' },
  { country: 'France', department: 'Corse-du-Sud', locode: 'FRPRP', port: 'Propriano' },
  { country: 'France', department: 'Corse-du-Sud', locode: 'FRBON', port: 'Bonifacio' },
  { country: 'France', department: 'Corse-du-Sud', locode: 'FRPVO', port: 'Porto-Vecchio' },
  { country: 'France', department: 'Mayotte', locode: 'YTLON', port: 'Mayotte' },
  { country: 'France', department: 'Saint-Martin', locode: 'MFGES', port: 'Saint-Martin' },
  { country: 'France', department: 'Saint-Pierre-et-Miquelon', locode: 'PMFSP', port: 'Saint-Pierre-et-Miquelon' },
  { country: 'France', department: 'Saint-Barthélemy', locode: 'BLSBH', port: 'Gustavia' },
  { country: 'France', department: 'Nouvelle-Calédonie', locode: 'NCNOU', port: 'Nouméa' },
];

const officialPortNames = new Set(PROJECT_PORTS_DATA.map((port) => (
  `${port.country}:${normalizePortSearch(port.port)}`
)));
const officialPortLocodes = new Set(PROJECT_PORTS_DATA
  .map((port) => normalizePortSearch(port.locode))
  .filter(Boolean));

export const PROJECT_PORTS: readonly ProjectPort[] = [
  ...PROJECT_PORTS_DATA,
  ...LEGACY_PROJECT_PORT_ALIASES.filter((port) => (
    !officialPortNames.has(`${port.country}:${normalizePortSearch(port.port)}`)
    && !officialPortLocodes.has(normalizePortSearch(port.locode))
  )),
];

const frenchCollator = new Intl.Collator('fr', { sensitivity: 'base' });
const countryRank: Readonly<Record<ProjectPortCountry, number>> = { France: 0, Angleterre: 1 };
const PROJECT_DEPARTMENT_CODES: Readonly<Record<string, string>> = {
  'Alpes-Maritimes': '06',
  'Bouches-du-Rhône': '13',
  'Charente-Maritime': '17',
  'Côtes-d’Armor': '22',
  'Haute-Corse': '2B',
  Var: '83',
  Vendée: '85',
};

function projectPortDepartmentLabel(port: ProjectPort): string {
  if (port.country === 'Angleterre') return `Angleterre · ${port.department}`;
  const departmentCode = PROJECT_DEPARTMENT_CODES[port.department];
  return departmentCode ? `${port.department} (${departmentCode})` : port.department;
}

export const PROJECT_PORT_GROUPS: readonly ProjectPortGroup[] = Array.from(
  PROJECT_PORTS.reduce((groups, port) => {
    const department = projectPortDepartmentLabel(port);
    const key = `${port.country}:${department}`;
    const group = groups.get(key) || { country: port.country, department, ports: [] };
    group.ports.push(port);
    groups.set(key, group);
    return groups;
  }, new Map<string, ProjectPortGroup>()),
  ([, group]) => ({
    ...group,
    ports: group.ports.sort((left, right) => frenchCollator.compare(left.port, right.port)),
  }),
).sort((left, right) => (
  countryRank[left.country] - countryRank[right.country]
  || frenchCollator.compare(left.department, right.department)
));

function formatLocode(locode: string): string {
  if (!locode) return 'sans LOCODE dédié';
  return /^[A-Z]{2}[A-Z0-9]{3}$/.test(locode) ? `${locode.slice(0, 2)} ${locode.slice(2)}` : locode;
}

function formatPortCode(port: ProjectPort): string {
  if (!port.locode) {
    const reference = port.referenceCode
      ? `${port.referenceSystem || 'Référence'} ${formatLocode(port.referenceCode)}`
      : '';
    return [reference, 'sans LOCODE dédié'].filter(Boolean).join(' · ');
  }
  if (port.locodeAssociation === 'municipality') {
    return `LOCODE associé ${formatLocode(port.locode)}${port.locodePort ? ` (${port.locodePort})` : ''}`;
  }
  if (port.locodeAssociation === 'published-port' && port.parentLocode) {
    return `${formatLocode(port.locode)} · rattaché à ${port.locodePort || 'port publié'} (${formatLocode(port.parentLocode)})`;
  }
  return formatLocode(port.locode);
}

export function formatProjectPort(port: ProjectPort): string {
  return [port.port, port.municipality, formatPortCode(port)].filter(Boolean).join(' – ');
}

export function formatProjectOfferPort(value: string): string {
  const normalizedValue = normalizePortSearch(value);
  const offerName = (port: ProjectPort) => normalizePortSearch(port.port)
    .replace(/^port (?:(?:de|du|des|la)\s+|d['’]?)/, '');
  const matchRank = (port: ProjectPort) => {
    if (normalizePortSearch(port.port) === normalizedValue) return 3;
    if (offerName(port) === normalizedValue) return 2;
    if (normalizePortSearch(port.municipality || '') === normalizedValue) return 1;
    return 0;
  };
  const port = PROJECT_PORTS.filter((candidate) => matchRank(candidate) > 0).sort((left, right) => (
    matchRank(right) - matchRank(left)
    || Number(Boolean(right.locode && !right.locodeAssociation))
      - Number(Boolean(left.locode && !left.locodeAssociation))
    || frenchCollator.compare(left.port, right.port)
  ))[0];
  if (!port?.locode) return value;
  const association = port.locodeAssociation === 'municipality'
    ? ` (LOCODE de ${port.locodePort || port.municipality || 'la commune'})`
    : port.locodeAssociation === 'published-port' && port.parentLocode
      ? ` · rattaché à ${port.locodePort || 'port publié'} ${formatLocode(port.parentLocode)}`
      : '';
  return `${normalizePortSearch(port.port) === normalizedValue ? port.port : value}\n${formatLocode(port.locode)}${association}`;
}

function normalizePortSearch(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterProjectPortGroups(query: string): ProjectPortGroup[] {
  const normalizedQuery = normalizePortSearch(query);
  if (!normalizedQuery) {
    return PROJECT_PORT_GROUPS.map((group) => ({ ...group, ports: [...group.ports] }));
  }

  const queryWords = normalizedQuery.split(' ');
  return PROJECT_PORT_GROUPS.map((group) => ({
    ...group,
    ports: group.ports.filter((port) => {
      const searchText = normalizePortSearch([
        group.country,
        group.department,
        formatProjectPort(port),
        port.locode,
        port.parentLocode,
        port.referenceCode,
      ].filter(Boolean).join(' '));
      return queryWords.every((word) => searchText.includes(word));
    }),
  })).filter((group) => group.ports.length > 0);
}
