import { describe, expect, it } from 'vitest';
import { compareCrewNames, crewFunctionRank, formatCrewName } from './planningCrewPreferences';

describe('crew display preferences', () => {
  it('formats compound names without changing the person record', () => {
    const person = { firstName: ' Jean-Pierre ', lastName: ' de la Rivière ' };
    expect(formatCrewName(person, 'last_first')).toBe('DE LA RIVIÈRE Jean-Pierre');
    expect(formatCrewName(person, 'first_last')).toBe('Jean-Pierre DE LA RIVIÈRE');
    expect(person.lastName).toBe(' de la Rivière ');
    expect(formatCrewName({ firstName: '', lastName: 'Martin' }, 'last_first')).toBe('MARTIN');
  });

  it.each([
    ['Capitaine', 0], ['Chef Mécanicien', 1], ['2nd Capitaine', 2], ['Second capitaine', 2],
    ["Maître d'Equipage", 3], ['Maitre d’équipage', 3], ['Maître Machine', 4],
    ['Matelot', 5], ['Matelot Qualifié', 5], ['Matelot polyvalent', 5], ['Stagiaire', 6], ['', 6],
  ])('ranks %s as %s', (role, expected) => { expect(crewFunctionRank(role)).toBe(expected); });

  it('sorts by French last name then first name, ignoring accents and case', () => {
    const people = [{ firstName: 'Zoé', lastName: 'Émile' }, { firstName: 'Paul', lastName: 'DUPONT' }, { firstName: 'Alice', lastName: 'emile' }];
    expect(people.sort(compareCrewNames).map((person) => person.firstName)).toEqual(['Paul', 'Alice', 'Zoé']);
  });
});
