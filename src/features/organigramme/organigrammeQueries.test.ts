import { describe, expect, it, vi } from 'vitest';
import { fetchOrganigramme } from './organigrammeQueries';
import { ORG_DEMO } from './organigrammeFixtures';
vi.mock('./organigrammeMedia', () => ({ loadOrgVesselIcons: async (vessels: unknown[]) => vessels }));
describe('organigramme snapshot', () => {
  it('uses the office display function for contact lists without editing HR qualifications', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...ORG_DEMO, support: ORG_DEMO.support.map((entry) => entry.personId === 11 ? { ...entry, functionLabel: 'Capitaine d’Armement - Superintendant Technique' } : entry) }, error: null });
    const data = await fetchOrganigramme({ rpc } as never, '2026-09-26');
    expect(data.people.find((person) => person.id === 11)?.functionLabel).toBe('Capitaine d’Armement - Superintendant Technique');
    expect(ORG_DEMO.people.find((person) => person.id === 11)?.functionLabel).toBe('Directeur QHSE / Chef de Projet');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
