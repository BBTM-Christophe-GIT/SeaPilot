export const DEFAULT_PROJECT_OWNER_IDENTITY = 'BBTM\n15, impasse du pou\n50340 Le Rozel';

export const DEFAULT_BAREBOAT_OWNER_IDENTITY = [
  'Benjamin Bon Travaux Maritimes sas (BBTM)',
  '15 Impasse du Pou',
  '50340 Le Rozel, France',
  'benjamin@bbtm.fr',
  'RCS Cherbourg : 884 601 170 00019',
].join('\n');

export const DEFAULT_PROJECT_FUEL_TERMS = "A la charge de l'affréteur";

export const DEFAULT_TOWAGE_CONDITIONS = 'Bonne condition de partance assurée par l’affréteur.';

const DEPRECATED_DEFAULT_TOWAGE_OPTIONAL_COSTS = new Set([
  [
    'Remorqueur au port : 3400€ HT / 24h',
    '',
    'Remorqueur en mer : 4900€ HT / 24h (fuel inclus)',
  ].join('\n'),
  'Remorqueur au port : 3400€ HT / 24h. Remorqueur en mer : 4900€ HT / 24h (fuel inclus)',
]);

export const DEFAULT_TOWAGE_OPTIONAL_COSTS = [
  'Remorqueur au port : 3400€ HT / 24h.',
  'Remorqueur en mer : 4900€ HT / 24h (fuel inclus).',
].join('\n');

export const DEFAULT_TOWAGE_PAYMENT_TERMS = [
  '- A la signature du contrat : 0%',
  '- Avant le départ du convoi : 0%',
  '- A 30 jours réception de facture : 100%',
].join('\n');

export const DEFAULT_TOWAGE_SPECIAL_CONDITIONS = 'TVA 20%';

export function towageOptionalCostsWithDefault(value?: string): string {
  if (!value || DEPRECATED_DEFAULT_TOWAGE_OPTIONAL_COSTS.has(value.replace(/\r\n/g, '\n'))) {
    return DEFAULT_TOWAGE_OPTIONAL_COSTS;
  }
  return value;
}

export function withTowageContractDefaults(data: Record<string, string>): Record<string, string> {
  return {
    ...data,
    towed_conditions: data.towed_conditions || DEFAULT_TOWAGE_CONDITIONS,
    optional_costs: towageOptionalCostsWithDefault(data.optional_costs),
    box23_payment: data.box23_payment || DEFAULT_TOWAGE_PAYMENT_TERMS,
    special_conditions: data.special_conditions || DEFAULT_TOWAGE_SPECIAL_CONDITIONS,
  };
}

export const DEFAULT_BAREBOAT_CONTRACT_FIELDS: Readonly<Record<string, string>> = {
  bareboat_contract_place: 'LE HAVRE',
  bareboat_early_termination_indemnity: '50% de la durée ferme restante',
  bareboat_insurance_payer: 'Affréteur',
  bareboat_applicable_law: 'Française',
  bareboat_jurisdiction: 'Tribunal maritime du Havre',
};

export function withBareboatContractDefaults(data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ ...DEFAULT_BAREBOAT_CONTRACT_FIELDS, ...data })
      .map(([key, value]) => [key, value || DEFAULT_BAREBOAT_CONTRACT_FIELDS[key] || '']),
  );
}

export const PROJECT_CONTRACT_TYPES = [
  'Offre Commerciale',
  'Contrat de Remorquage',
  "Contrat d'Affrètement",
  'BIMCO',
] as const;

export type ProjectContractType = (typeof PROJECT_CONTRACT_TYPES)[number];

export const COMMERCIAL_OFFER_CONTRACT_TYPE: ProjectContractType = 'Offre Commerciale';
export const TOWAGE_CONTRACT_TYPE: ProjectContractType = 'Contrat de Remorquage';
export const BAREBOAT_CONTRACT_TYPE: ProjectContractType = "Contrat d'Affrètement";
export const BIMCO_CONTRACT_TYPE: ProjectContractType = 'BIMCO';

export function normalizeProjectContractType(value?: string | null): string {
  const normalizedValue = value?.trim() || '';
  const lowered = normalizedValue.toLocaleLowerCase('fr-FR');

  if (lowered.includes('remorquage')) return TOWAGE_CONTRACT_TYPE;
  if (lowered.includes('coque nue') || lowered.includes("contrat d'affrètement") || lowered.includes('contrat d’affrètement')) {
    return BAREBOAT_CONTRACT_TYPE;
  }
  if (lowered.includes('bimco') || lowered.includes('supplytime') || lowered.includes('affrètement à temps')) {
    return BIMCO_CONTRACT_TYPE;
  }
  if (lowered === 'autre' || lowered.includes('offre') || lowered.includes('oil spill')) {
    return COMMERCIAL_OFFER_CONTRACT_TYPE;
  }
  return normalizedValue || COMMERCIAL_OFFER_CONTRACT_TYPE;
}

export const PROJECT_CURRENCIES = [
  { code: 'EUR', label: '€ — EUR' },
  { code: 'USD', label: '$ — USD' },
  { code: 'GBP', label: '£ — GBP' },
  { code: 'CHF', label: 'CHF — Franc suisse' },
  { code: 'CAD', label: '$ CA — CAD' },
  { code: 'AUD', label: '$ AU — AUD' },
  { code: 'NOK', label: 'kr — NOK' },
  { code: 'SEK', label: 'kr — SEK' },
  { code: 'DKK', label: 'kr — DKK' },
  { code: 'JPY', label: '¥ — JPY' },
  { code: 'CNY', label: '¥ — CNY' },
] as const;
