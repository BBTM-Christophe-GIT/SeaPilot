/** Shared matching rules for document tags and library searches. */
export function normalizeProcedureSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function normalizeProcedureTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.reduce<string[]>((tags, value) => {
    const tag = value.trim().replace(/\s+/g, ' ');
    const key = normalizeProcedureSearch(tag);
    if (key && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
    return tags;
  }, []);
}

export function parseProcedureTags(value: string): string[] {
  return normalizeProcedureTags(value.split(/[,;]/));
}
