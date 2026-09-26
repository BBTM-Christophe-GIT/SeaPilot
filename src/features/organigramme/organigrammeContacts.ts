import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';
import type { OrgPerson } from './organigrammeModel';

export type OrgContactDocument = 'personnel' | 'emergency';
export interface OrgContactGroup { functionLabel: string; people: OrgPerson[] }

export function groupOrgContacts(people: OrgPerson[]): OrgContactGroup[] {
  const groups = new Map<string, OrgPerson[]>();
  for (const person of people) {
    const functionLabel = normalizeHrFunctionLabel(person.functionLabel) || 'Fonction non renseignée';
    const group = groups.get(functionLabel) || [];
    group.push({ ...person, functionLabel, email: person.email?.trim() || '', phone: person.phone?.trim() || '' });
    groups.set(functionLabel, group);
  }
  return [...groups].sort(([a], [b]) => compareHrFunctionLabels(a, b)).map(([functionLabel, members]) => ({ functionLabel, people: members.sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
}

/** null means the live default; an explicit empty set means nobody is selected. */
export function selectedOrgContacts(people: OrgPerson[], selection: Set<number> | null, kind: OrgContactDocument): OrgPerson[] {
  return groupOrgContacts(people).flatMap((group) => group.people).filter((person) => selection ? selection.has(person.id) : kind === 'personnel' || person.population === 'sedentary');
}

export function toggleOrgContacts(selected: Set<number>, ids: number[], checked: boolean): Set<number> {
  const next = new Set(selected);
  ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
  return next;
}
