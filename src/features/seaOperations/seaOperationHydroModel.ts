export interface ShomChart { id: string; number: string; title: string; scale: number; catalogueUrl: string }
export interface ShomChartLookup { charts: ShomChart[]; fetchedAt: string; sourceUrl: string; truncated: boolean }

export function isShomChart(value: unknown): value is ShomChart {
  if (!value || typeof value !== 'object') return false;
  const chart = value as Record<string, unknown>;
  return typeof chart.id === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(chart.id)
    && typeof chart.number === 'string' && /^\d{1,8}$/.test(chart.number)
    && typeof chart.title === 'string' && chart.title.length > 0 && chart.title.length <= 500
    && typeof chart.scale === 'number' && Number.isSafeInteger(chart.scale) && chart.scale > 0
    && chart.catalogueUrl === `https://diffusion.shom.fr/catalogsearch/result/?q=${chart.number}`;
}

/** Preserve manually retained chart references and make repeated additions idempotent. */
export function addShomChartReference(value: string, number: string): string {
  if (!/^\d{1,8}$/.test(number)) return value;
  if (value.split(/[^A-Za-z0-9]+/).some((token) => token === number)) return value;
  return value.trim() ? `${value.trim()}; ${number}` : number;
}
