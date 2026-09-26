import { describe, expect, it } from 'vitest';
import { groupOrgContacts, selectedOrgContacts, toggleOrgContacts } from './organigrammeContacts';
import { ORG_DEMO } from './organigrammeFixtures';

describe('personnel and emergency selections', () => {
  it('groups aliases together and keeps captain first and people alphabetically ordered', () => {
    const groups = groupOrgContacts([...ORG_DEMO.people].reverse().map((person) => person.id === 2 ? { ...person, functionLabel: '01 - Capitaine' } : person));
    expect(groups[0].functionLabel).toBe('Capitaine');
    expect(groups[0].people.map((person) => person.name)).toEqual(['Alice LAURENT', 'Élodie MARTIN', 'Léa MOREAU']);
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
