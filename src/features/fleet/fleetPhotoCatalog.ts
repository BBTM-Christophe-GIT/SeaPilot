// Original images supplied for the BBTM fleet. Database photo fields remain the
// source of truth in connected modules; this catalog also supplies the preview.
export const BBTM_FLEET_PHOTOS = [
  { name: 'GOURY', acronym: 'GRY', file: 'GOURY.png', slug: 'goury' },
  { name: 'HIRONDELLE DE LA MANCHE', acronym: 'HIR', file: 'HIRONDELLE DE LA MANCHE.png', slug: 'hirondelle-de-la-manche' },
  { name: 'HOLENN EUSA', acronym: 'HE', file: 'HOLENN EUSA.png', slug: 'holenn-eusa' },
  { name: 'KROKDUR', acronym: 'KDR', file: 'KROKDUR.png', slug: 'krokdur' },
  { name: 'LANDEMER', acronym: 'LDM', file: 'LANDEMER.png', slug: 'landemer' },
  { name: 'LE ROZEL', acronym: 'RZL', file: 'LE ROZEL.PNG', slug: 'le-rozel' },
  { name: 'SUROIT', acronym: 'SUR', file: 'SUROIT.png', slug: 'suroit' },
  { name: 'BBTM TENDER 1', acronym: 'TND', file: 'Tender 1.png', slug: 'tender-1' },
  { name: 'YARD - Le Havre', acronym: 'YRD', file: 'Yard - LE HAVRE.png', slug: 'yard-le-havre' },
] as const;

export function fleetCatalogPhotoPath(slug: string): string {
  return `/vessels/bbtm/${slug}.png`;
}
