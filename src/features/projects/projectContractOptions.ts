export const DEFAULT_PROJECT_OWNER_IDENTITY = 'BBTM\n15, impasse du pou\n50340 Le Rozel';

export const DEFAULT_PROJECT_FUEL_TERMS = "A la charge de l'affréteur";

export const PROJECT_CONTRACT_TYPES = [
  'Affrètement à temps',
  'Oil Spill Response',
  'Contrat de Remorquage - BBTM',
] as const;

export const TOWAGE_CONTRACT_TYPE = 'Contrat de Remorquage - BBTM';

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
