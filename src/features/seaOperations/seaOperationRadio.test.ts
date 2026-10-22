import { describe, expect, it } from 'vitest';
import { seaOperationRadioContacts } from './seaOperationRadio';

const point = (latitude: string, longitude: string) => ({ latitude, longitude });
describe('route radio contacts', () => {
  it('derives the example Plymouth/Brest contacts from coordinates and deduplicates them', () => {
    const result = seaOperationRadioContacts([point('50.35', '-4.15'), point('48.36', '-4.53'), point('48.36', '-4.53')]);
    expect(result.contacts.map((contact) => contact.id)).toEqual(expect.arrayContaining(['plymouth-port', 'brest-approaches', 'cross-corsen', 'falmouth']));
    expect(new Set(result.contacts.map((contact) => contact.id)).size).toBe(result.contacts.length);
    expect(result.contacts.find((contact) => contact.id === 'plymouth-port')?.vhf).toBe('14');
    expect(result.contacts.find((contact) => contact.id === 'brest-approaches')?.vhf).toBe('08 / 16');
  });
  it('includes a port passed between waypoints instead of testing endpoints only', () => {
    expect(seaOperationRadioContacts([point('49.65', '-2.5'), point('49.65', '-0.5')]).contacts.some((contact) => contact.id === 'cherbourg-port')).toBe(true);
  });
  it('does not infer a leg over an invalid intermediate point or invent remote contacts', () => {
    expect(seaOperationRadioContacts([point('49.65', '-2.5'), point('', ''), point('49.65', '-0.5')]).contacts.some((contact) => contact.id === 'cherbourg-port')).toBe(false);
    expect(seaOperationRadioContacts([point('-33', '151')]).contacts).toEqual([]);
    expect(seaOperationRadioContacts([point('91', '0')])).toMatchObject({ validPoints: 0, invalidPoints: 1, contacts: [] });
  });
});
