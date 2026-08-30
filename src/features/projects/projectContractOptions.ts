export const DEFAULT_PROJECT_OWNER_IDENTITY = 'BBTM\n15, impasse du pou\n50340 Le Rozel';

export const DEFAULT_PROJECT_FUEL_TERMS = "A la charge de l'affréteur";

export const PROJECT_CONTRACT_TYPES = [
  'Offre Commerciale',
  'Contrat de Remorquage',
  'BIMCO',
] as const;

export type ProjectContractType = (typeof PROJECT_CONTRACT_TYPES)[number];

export const COMMERCIAL_OFFER_CONTRACT_TYPE: ProjectContractType = 'Offre Commerciale';
export const TOWAGE_CONTRACT_TYPE: ProjectContractType = 'Contrat de Remorquage';
export const BIMCO_CONTRACT_TYPE: ProjectContractType = 'BIMCO';

export function normalizeProjectContractType(value?: string | null): string {
  const normalizedValue = value?.trim() || '';
  const lowered = normalizedValue.toLocaleLowerCase('fr-FR');

  if (lowered.includes('remorquage')) return TOWAGE_CONTRACT_TYPE;
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
