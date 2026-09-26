import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';
import type { OrgPerson } from './organigrammeModel';

export type OrgContactDocument = 'personnel' | 'emergency';
export interface OrgContactGroup { key: string; functionLabel: string; people: OrgPerson[] }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
const french = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const namedPriorities = new Map([['julien lecocq', 1], ['christophe minassian', 2], ['sophie hamel', 3]]);

function contactIdentity(person: OrgPerson) {
  if (person.firstName !== undefined && person.lastName !== undefined) return { firstName: person.firstName.trim(), lastName: person.lastName.trim() };
  // Compatibility with previously loaded snapshots and demonstration fixtures.
  const words = person.name.trim().split(/\s+/);
  const surname = words.findIndex((word, index) => index > 0 && word === word.toLocaleUpperCase('fr') && word !== word.toLocaleLowerCase('fr'));
  const split = surname > 0 ? surname : 1;
  return { firstName: words.slice(0, split).join(' '), lastName: words.slice(split).join(' ') };
}

function priority(person: OrgPerson) {
  const role = normalize(person.functionLabel);
  if (/\bstagiaires?\b/.test(role)) return 5;
  if (/^president\b/.test(role)) return 0;
  const identity = contactIdentity(person);
  const name = normalize(`${identity.firstName} ${identity.lastName}`);
  return namedPriorities.get(name) ?? 4;
}

export function groupOrgContacts(people: OrgPerson[]): OrgContactGroup[] {
  const groups = new Map<string, OrgContactGroup>();
  for (const person of people) {
    const functionLabel = normalizeHrFunctionLabel(person.functionLabel) || 'Fonction non renseignée';
    const identity = contactIdentity(person);
    const contact = { ...person, ...identity, name: [identity.firstName, identity.lastName.toLocaleUpperCase('fr')].filter(Boolean).join(' '), functionLabel, email: person.email?.trim() || '', phone: person.phone?.trim() || '' };
    // Named priorities remain ahead of all other crew, even when they share a function.
    const key = `${priority(contact)}:${functionLabel}`;
    const group = groups.get(key) || { key, functionLabel, people: [] };
    group.people.push(contact);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => priority(a.people[0]) - priority(b.people[0]) || compareHrFunctionLabels(a.functionLabel, b.functionLabel)).map((group) => ({ ...group, people: group.people.sort((a, b) => french.compare(a.lastName!, b.lastName!) || french.compare(a.firstName!, b.firstName!) || a.id - b.id) }));
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
