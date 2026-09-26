import { describe, expect, it } from 'vitest';
import { groupOrgContacts, selectedOrgContacts, toggleOrgContacts } from './organigrammeContacts';
import { ORG_DEMO } from './organigrammeFixtures';

describe('personnel and emergency selections', () => {
  it('puts President first, groups function aliases and orders surnames', () => {
    const groups = groupOrgContacts([...ORG_DEMO.people].reverse().map((person) => person.id === 2 ? { ...person, functionLabel: '01 - Capitaine' } : person));
    expect(groups[0].functionLabel).toBe('Président');
    expect(groups.find((group) => group.functionLabel === 'Capitaine')!.people.map((person) => person.name)).toEqual(['Alice LAURENT', 'Élodie MARTIN', 'Léa MOREAU']);
  });
  it('keeps named priorities in exact order even with a shared function and interns last in both lists', () => {
    const names = [
      ['Émile', 'ALBERT', 'Chef Mécanicien'], ['Sophie', 'Hamel', 'Administration'], ['Adam', 'DEBORDEAUX', 'Stagiaire'],
      ['Christophe', 'Minassian', 'Direction'], ['Julien', 'LECOCQ', 'Chef Mécanicien'], ['Benjamin', 'BON', 'Président'],
    ];
    const people = names.map(([firstName, lastName, functionLabel], id) => ({ id, firstName, lastName, functionLabel, name: `${firstName} ${lastName}`, population: 'sedentary' }));
    for (const kind of ['personnel', 'emergency'] as const) {
      expect(selectedOrgContacts(people, null, kind).map((person) => person.name)).toEqual(['Benjamin BON', 'Julien LECOCQ', 'Christophe MINASSIAN', 'Sophie HAMEL', 'Émile ALBERT', 'Adam DEBORDEAUX']);
      expect(selectedOrgContacts(people, new Set([0, 2, 4]), kind).map((person) => person.name)).toEqual(['Julien LECOCQ', 'Émile ALBERT', 'Adam DEBORDEAUX']);
    }
  });
  it('sorts on complete RH surnames, then given names, including accents and compound names', () => {
    const people = [['Alice', 'Zola'], ['Zoé', 'de La Tour'], ['Anne Marie', 'Évrard'], ['Anne', 'Évrard']].map(([firstName, lastName], id) => ({ id, firstName, lastName, name: 'ignored legacy name', functionLabel: 'Matelot Qualifié', population: 'offshore' }));
    expect(groupOrgContacts(people)[0].people.map((person) => person.name)).toEqual(['Zoé DE LA TOUR', 'Anne ÉVRARD', 'Anne Marie ÉVRARD', 'Alice ZOLA']);
  });
  it('defaults to all personnel or only sedentary people and respects an explicit empty selection', () => {
    expect(selectedOrgContacts(ORG_DEMO.people, null, 'personnel')).toHaveLength(12);
    expect(selectedOrgContacts(ORG_DEMO.people, null, 'emergency').map((person) => person.id).sort((a, b) => a - b)).toEqual([1, 11, 12]);
    expect(selectedOrgContacts(ORG_DEMO.people, new Set(), 'emergency')).toEqual([]);
  });
  it('keeps only selected current people, removes departed ids and handles group exceptions', () => {
    const selected = toggleOrgContacts(new Set([1]), [2, 6, 8], true);
    const next = toggleOrgContacts(selected, [6], false);
    expect([...selected]).toEqual([1, 2, 6, 8]);
    const current = ORG_DEMO.people.filter((person) => person.id !== 8);
    expect(selectedOrgContacts(current, next, 'personnel').map((person) => person.id).sort()).toEqual([1, 2]);
  });
});
