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

/** Preserve manual references and merge identified numbers in waypoint order. */
export function addShomChartReferences(value: string, numbers: readonly string[]): string {
  const valid = numbers.filter((number) => /^\d{1,8}$/.test(number));
  if (!valid.length) return value;
  const references = value.split(/\s*;\s*|\s+-\s+/).map((reference) => reference.trim()).filter(Boolean);
  const retained = new Set(references.join(' ').split(/[^A-Za-z0-9]+/));
  for (const number of valid) {
    if (retained.has(number)) continue;
    references.push(number);
    retained.add(number);
  }
  return references.join(' - ');
}
