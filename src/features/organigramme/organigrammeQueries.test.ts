import { describe, expect, it, vi } from 'vitest';
import { fetchOrganigramme, saveOrgEmergencyDefault } from './organigrammeQueries';
import { ORG_DEMO } from './organigrammeFixtures';
import { orgContactPeople } from './organigrammeContacts';
import { buildOrganigramme } from './organigrammeModel';
vi.mock('./organigrammeMedia', () => ({ loadOrgVesselIcons: async (vessels: unknown[]) => vessels }));
describe('organigramme snapshot', () => {
  it('uses the office display function for contact lists without editing HR qualifications', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...ORG_DEMO, support: ORG_DEMO.support.map((entry) => entry.personId === 11 ? { ...entry, functionLabel: 'Capitaine d’Armement - Superintendant Technique' } : entry) }, error: null });
    const data = await fetchOrganigramme({ rpc } as never, '2026-09-26');
    expect(orgContactPeople(data).find((person) => person.id === 11)?.functionLabel).toBe('Capitaine d’Armement - Superintendant Technique');
    expect(data.people.find((person) => person.id === 11)?.functionLabel).toBe('Directeur QHSE / Chef de Projet');
    expect(ORG_DEMO.people.find((person) => person.id === 11)?.functionLabel).toBe('Directeur QHSE / Chef de Projet');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps a captain’s inherited vessel role separate from the office responsibility', async () => {
    const person = { id: 16, name: 'Antoine MONCEAUX', functionLabel: 'Capitaine', population: 'sedentary' };
    const office = 'Responsable Yard du Havre · Vérificateur équipements levage';
    const rpc = vi.fn().mockResolvedValue({ data: { ...ORG_DEMO, people: [person], support: [{ id: 8, personId: 16, name: person.name, functionLabel: office, category: 'office', position: 1 }], memberships: [{ personId: 16, vesselId: 1, watchGroup: 'Bordée 1', functionLabel: '', source: 'manual' }] }, error: null });
    const data = await fetchOrganigramme({ rpc } as never, ORG_DEMO.asOf);
    const sections = buildOrganigramme(data, { view: 'vessels', vesselIds: null, includeOffice: true, includeExternal: false, includeUnassigned: false, showVessels: true });
    expect(sections.find((section) => section.kind === 'vessel')?.columns[0].members[0].functionLabel).toBe('Capitaine');
    expect(sections.find((section) => section.kind === 'office')?.columns[0].members[0].functionLabel).toBe(office);
    expect(orgContactPeople(data)[0].functionLabel).toBe(office);
  });
  it('saves an explicit empty default and reports rejected writes', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'denied' } });
    await saveOrgEmergencyDefault({ rpc } as never, []);
    expect(rpc).toHaveBeenCalledWith('save_organigramme_emergency_default', { p_person_ids: [] });
    await expect(saveOrgEmergencyDefault({ rpc } as never, [1])).rejects.toThrow('Impossible d’enregistrer');
  });
});
