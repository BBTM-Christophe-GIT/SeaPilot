import type { ManagerHomeItem, ManagerHomeSourceRows } from './managerHomeData';

export interface ManagerHomeVessel {
  key: string;
  name: string;
}

export function normalizeHomeVesselName(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/^(?:m\s*\/?\s*v|mv)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Resolve names only when they identify one known vessel. Explicit IDs always win.
export function buildManagerHomeVessels(sources: ManagerHomeSourceRows) {
  const vesselsById = new Map<number, ManagerHomeVessel>();
  const idsByName = new Map<string, Set<number>>();
  const assignments = sources.assignments || [];
  const namedRows = [
    ...assignments.map((assignment) => {
      const vessel = Array.isArray(assignment.vessels) ? assignment.vessels[0] : assignment.vessels;
      return { vessel_id: assignment.vessel_id, vessel_name: vessel?.name };
    }),
    ...sources.purchases,
    ...sources.fleetCertificates,
  ];
  for (const row of namedRows) {
    if (row.vessel_id == null) continue;
    const name = row.vessel_name?.trim();
    const existing = vesselsById.get(row.vessel_id);
    if (!existing || (name && existing.name === `Navire #${row.vessel_id}`)) {
      vesselsById.set(row.vessel_id, { key: `vessel:${row.vessel_id}`, name: name || `Navire #${row.vessel_id}` });
    }
    const normalized = normalizeHomeVesselName(name);
    if (!normalized) continue;
    const ids = idsByName.get(normalized) || new Set<number>();
    ids.add(row.vessel_id);
    idsByName.set(normalized, ids);
  }
  const vesselsByKey = new Map([...vesselsById.values()].map((vessel) => [vessel.key, vessel]));
  const forRow = (id: number | null | undefined, name: string | null | undefined): ManagerHomeVessel[] => {
    if (id != null) return [vesselsById.get(id) || { key: `vessel:${id}`, name: name?.trim() || `Navire #${id}` }];
    const normalized = normalizeHomeVesselName(name);
    if (!normalized) return [];
    const ids = idsByName.get(normalized);
    if (ids?.size === 1) return [vesselsById.get([...ids][0])!];
    const key = `name:${normalized}`;
    if (!vesselsByKey.has(key)) vesselsByKey.set(key, { key, name: name!.trim() });
    return [vesselsByKey.get(key)!];
  };
  namedRows.forEach((row) => forRow(row.vessel_id, row.vessel_name));
  sources.procedures.forEach((row) => forRow(null, row.vessel_name));
  const byPerson = new Map<number, Map<string, ManagerHomeVessel>>();
  for (const assignment of assignments) {
    const vessel = forRow(assignment.vessel_id, null)[0];
    for (const personId of [assignment.crew_person_id, assignment.captain_person_id]) {
      if (personId == null) continue;
      const personVessels = byPerson.get(personId) || new Map<string, ManagerHomeVessel>();
      personVessels.set(vessel.key, vessel);
      byPerson.set(personId, personVessels);
    }
  }
  return {
    vessels: [...vesselsByKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    forRow,
    forPerson: (personId: number | null | undefined): ManagerHomeVessel[] => [...(byPerson.get(personId ?? -1)?.values() || [])],
  };
}

export type ManagerHomeVesselIndex = ReturnType<typeof buildManagerHomeVessels>;

export function itemMatchesVessel(item: ManagerHomeItem, vesselKey: string): boolean {
  if (vesselKey === 'all') return true;
  if (vesselKey === 'unassigned') return item.vessels.length === 0;
  return item.vessels.some((vessel) => vessel.key === vesselKey);
}
