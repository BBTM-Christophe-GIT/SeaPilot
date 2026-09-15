/** Last saved assignment wins on the same ship. Different ships remain a
 * conflict until the planner explicitly resolves them in the fleet grid. */
export function comparePlanningRevision(a: { updatedAt?: string; sourceId?: number }, b: { updatedAt?: string; sourceId?: number }): number {
  return (Date.parse(a.updatedAt || '') || 0) - (Date.parse(b.updatedAt || '') || 0)
    || (a.sourceId || 0) - (b.sourceId || 0);
}

export function latestPlanningSources<T extends { vesselId: number | null; priority: number; updatedAt?: string; sourceId?: number; status?: string }>(sources: T[]): T[] {
  const selected = new Map<string, T[]>();
  sources.forEach((source) => {
    const key = `${source.priority}:${source.vesselId}`;
    const previous = selected.get(key)?.[0];
    const comparison = previous ? comparePlanningRevision(source, previous) : 1;
    if (comparison > 0) selected.set(key, [source]);
    else if (comparison === 0) {
      // Without revision evidence, contradictory states still need a decision.
      if (previous?.status !== source.status) selected.get(key)!.push(source);
      else selected.set(key, [source]);
    }
  });
  return [...selected.values()].flat();
}
