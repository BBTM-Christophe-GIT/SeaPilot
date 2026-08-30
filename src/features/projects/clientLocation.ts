export interface ClientLocationValue {
  address: string;
  city: string;
  country: string;
  postalCode: string;
}

export interface ClientCitySuggestion {
  name: string;
  population: number;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface FrenchCommunePayload {
  nom?: unknown;
  population?: unknown;
}

interface FrenchGeocodingPayload {
  features?: Array<{
    properties?: {
      city?: unknown;
      postcode?: unknown;
      score?: unknown;
    };
  }>;
}

const COUNTRY_ALIASES: Array<[country: string, aliases: string[]]> = [
  ['Royaume-Uni', ['royaume uni', 'united kingdom', 'great britain', 'angleterre', 'scotland', 'ecosse', 'wales']],
  ['Pays-Bas', ['pays bas', 'netherlands', 'holland']],
  ['États-Unis', ['etats unis', 'united states', 'usa']],
  ['Belgique', ['belgique', 'belgium']],
  ['Allemagne', ['allemagne', 'germany', 'deutschland']],
  ['Espagne', ['espagne', 'spain', 'espana']],
  ['Italie', ['italie', 'italy', 'italia']],
  ['Portugal', ['portugal']],
  ['Irlande', ['irlande', 'ireland']],
  ['Suisse', ['suisse', 'switzerland', 'schweiz']],
  ['Luxembourg', ['luxembourg']],
  ['Danemark', ['danemark', 'denmark']],
  ['Norvège', ['norvege', 'norway']],
  ['Suède', ['suede', 'sweden']],
  ['Finlande', ['finlande', 'finland']],
  ['Pologne', ['pologne', 'poland']],
  ['Grèce', ['grece', 'greece']],
  ['Malte', ['malte', 'malta']],
  ['Chypre', ['chypre', 'cyprus']],
  ['Monaco', ['monaco']],
  ['Maroc', ['maroc', 'morocco']],
  ['Algérie', ['algerie', 'algeria']],
  ['Tunisie', ['tunisie', 'tunisia']],
  ['Canada', ['canada']],
  ['France', ['france']],
];

const COUNTRY_CODES: Record<string, string> = {
  BE: 'Belgique',
  CH: 'Suisse',
  DE: 'Allemagne',
  DK: 'Danemark',
  ES: 'Espagne',
  FI: 'Finlande',
  FR: 'France',
  GB: 'Royaume-Uni',
  GR: 'Grèce',
  IE: 'Irlande',
  IT: 'Italie',
  LU: 'Luxembourg',
  MA: 'Maroc',
  MC: 'Monaco',
  MT: 'Malte',
  NL: 'Pays-Bas',
  NO: 'Norvège',
  PL: 'Pologne',
  PT: 'Portugal',
  SE: 'Suède',
  TN: 'Tunisie',
  UK: 'Royaume-Uni',
  US: 'États-Unis',
};

const PORT_CITY_COUNTRIES: Record<string, string> = {
  amsterdam: 'Pays-Bas',
  antwerp: 'Belgique',
  anvers: 'Belgique',
  barcelona: 'Espagne',
  bilbao: 'Espagne',
  bremen: 'Allemagne',
  dover: 'Royaume-Uni',
  genoa: 'Italie',
  genes: 'Italie',
  hamburg: 'Allemagne',
  liverpool: 'Royaume-Uni',
  london: 'Royaume-Uni',
  londres: 'Royaume-Uni',
  lisbon: 'Portugal',
  lisbonne: 'Portugal',
  rotterdam: 'Pays-Bas',
  southampton: 'Royaume-Uni',
};

function normalizedSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeClientPostalCode(value: string): string {
  const normalized = value.trim().toLocaleUpperCase('fr-FR').replace(/\s+/g, ' ');
  return /^[\d\s]+$/.test(normalized) ? normalized.replace(/\s/g, '') : normalized;
}

export function isFrenchPostalCode(value: string): boolean {
  return /^\d{5}$/.test(normalizeClientPostalCode(value));
}

export function inferClientCountry(
  location: Pick<ClientLocationValue, 'address' | 'city'>,
  frenchLocationResolved = false,
): string {
  const joined = normalizedSearchText(`${location.address}\n${location.city}`);
  for (const [country, aliases] of COUNTRY_ALIASES) {
    if (aliases.some((alias) => (` ${joined} `).includes(` ${alias} `))) return country;
  }

  const lastSegment = `${location.address}\n${location.city}`
    .split(/[\n,]/)
    .map((part) => part.trim().toLocaleUpperCase('fr-FR'))
    .filter(Boolean)
    .at(-1);
  if (lastSegment && COUNTRY_CODES[lastSegment]) return COUNTRY_CODES[lastSegment];

  const cityCountry = PORT_CITY_COUNTRIES[normalizedSearchText(location.city)];
  if (cityCountry) return cityCountry;
  return frenchLocationResolved ? 'France' : '';
}

export async function fetchFrenchCitiesByPostalCode(
  postalCode: string,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<ClientCitySuggestion[]> {
  const normalizedPostalCode = normalizeClientPostalCode(postalCode);
  if (!isFrenchPostalCode(normalizedPostalCode)) return [];

  const url = new URL('https://geo.api.gouv.fr/communes');
  url.searchParams.set('codePostal', normalizedPostalCode);
  url.searchParams.set('fields', 'nom,population');
  url.searchParams.set('format', 'json');
  const response = await (options.fetcher || fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error('Le référentiel des communes est indisponible.');
  const payload = await response.json() as FrenchCommunePayload[];
  const unique = new Map<string, ClientCitySuggestion>();
  for (const item of Array.isArray(payload) ? payload : []) {
    const name = typeof item.nom === 'string' ? item.nom.trim() : '';
    if (!name) continue;
    const population = typeof item.population === 'number' && Number.isFinite(item.population)
      ? item.population
      : 0;
    const current = unique.get(name);
    if (!current || population > current.population) unique.set(name, { name, population });
  }
  return [...unique.values()].sort((left, right) => (
    right.population - left.population || left.name.localeCompare(right.name, 'fr')
  ));
}

export async function isFrenchClientLocation(
  location: Pick<ClientLocationValue, 'address' | 'city' | 'postalCode'>,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<boolean> {
  const query = [location.address, location.postalCode, location.city].map((value) => value.trim()).filter(Boolean).join(' ');
  if (query.length < 3) return false;

  const url = new URL('https://data.geopf.fr/geocodage/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  const response = await (options.fetcher || fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error('Le service de géocodage est indisponible.');
  const payload = await response.json() as FrenchGeocodingPayload;
  const properties = payload.features?.[0]?.properties;
  if (!properties) return false;

  const score = typeof properties.score === 'number' ? properties.score : 0;
  const resultCity = typeof properties.city === 'string' ? normalizedSearchText(properties.city) : '';
  const requestedCity = normalizedSearchText(location.city);
  const resultPostalCode = typeof properties.postcode === 'string' ? properties.postcode : '';
  const requestedPostalCode = normalizeClientPostalCode(location.postalCode);
  const cityMatches = Boolean(requestedCity && resultCity && (resultCity === requestedCity || resultCity.includes(requestedCity)));
  const postalCodeMatches = Boolean(requestedPostalCode && resultPostalCode === requestedPostalCode);
  return score >= 0.55 && (cityMatches || postalCodeMatches);
}

export async function resolveClientCountry(
  location: ClientLocationValue,
  options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<string> {
  const explicitCountry = inferClientCountry(location);
  if (explicitCountry) return explicitCountry;
  try {
    if (isFrenchPostalCode(location.postalCode)) {
      const cities = await fetchFrenchCitiesByPostalCode(location.postalCode, options);
      if (cities.length > 0) return 'France';
    }
    if (await isFrenchClientLocation(location, options)) return 'France';
  } catch {
    // A network failure must not block saving an otherwise valid client.
  }
  return location.country.trim();
}
