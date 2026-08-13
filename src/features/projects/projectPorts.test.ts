import { describe, expect, it } from 'vitest';
import {
  filterProjectPortGroups,
  formatProjectPort,
  PROJECT_PORT_GROUPS,
  PROJECT_PORTS,
  PROJECT_PORTS_SOURCE,
} from './projectPorts';

describe('projectPorts', () => {
  it('contains the complete SharePoint LOCODE reference grouped by department', () => {
    expect(PROJECT_PORTS_SOURCE.listId).toBe('20e7b5db-85f2-4e7f-ad8d-64d75b396414');
    expect(PROJECT_PORTS).toHaveLength(63);
    expect(PROJECT_PORT_GROUPS.map((group) => group.department)).toEqual(
      [...PROJECT_PORT_GROUPS.map((group) => group.department)].sort((left, right) =>
        left.localeCompare(right, 'fr', { sensitivity: 'base' }),
      ),
    );
  });

  it('sorts ports inside their department and formats the requested port – LOCODE label', () => {
    const manche = PROJECT_PORT_GROUPS.find((group) => group.department === 'Manche');

    expect(manche?.ports.map((port) => port.port)).toEqual([
      'Barneville-Carteret',
      'Cherbourg',
      'Diélette',
      'Granville',
    ]);
    expect(formatProjectPort(manche!.ports[1])).toBe('Cherbourg – FR CER');
  });

  it('includes the requested Atlantic, Channel and Mediterranean ports with departments and LOCODEs', () => {
    const charenteMaritime = PROJECT_PORT_GROUPS.find(
      (group) => group.department === 'Charente-Maritime (17)',
    );
    const cotesDArmor = PROJECT_PORT_GROUPS.find(
      (group) => group.department === 'Côtes-d’Armor (22)',
    );
    const hauteCorse = PROJECT_PORT_GROUPS.find(
      (group) => group.department === 'Haute-Corse (2B)',
    );
    const vendee = PROJECT_PORT_GROUPS.find((group) => group.department === 'Vendée (85)');
    const varDepartment = PROJECT_PORT_GROUPS.find((group) => group.department === 'Var (83)');
    const alpesMaritimes = PROJECT_PORT_GROUPS.find(
      (group) => group.department === 'Alpes-Maritimes (06)',
    );
    const bouchesDuRhone = PROJECT_PORT_GROUPS.find(
      (group) => group.department === 'Bouches-du-Rhône (13)',
    );

    expect(charenteMaritime?.ports.map(formatProjectPort)).toEqual(expect.arrayContaining([
      "Port de Boyardville – Saint-Georges-d'Oléron – FR GGD",
      "Port de la Cotinière – Saint-Pierre-d'Oléron – FR POZ",
      "Port du Douhet – Saint-Georges-d'Oléron – FR GGD",
    ]));
    expect(cotesDArmor?.ports.map(formatProjectPort)).toEqual(expect.arrayContaining([
      'Port de Gwin Zegal – Plouha – sans LOCODE dédié',
      'Port du Lyvet – Saint-Samson-sur-Rance – sans LOCODE dédié',
    ]));
    expect(vendee?.ports.map(formatProjectPort)).toContain(
      "Port de Morin – L'Épine (Île de Noirmoutier) – sans LOCODE dédié",
    );
    expect(hauteCorse?.ports.map(formatProjectPort)).toContain('Port de Centuri – Centuri – FR CN5');
    expect(varDepartment?.ports.map(formatProjectPort)).toContain(
      'Port de Gouron (Chicouras) – Bormes-les-Mimosas – FR XBM',
    );
    expect(alpesMaritimes?.ports.map(formatProjectPort)).toContain(
      "Port de l'Olivette – Antibes – FR ANT",
    );
    expect(bouchesDuRhone?.ports.map(formatProjectPort)).toContain(
      'Port des Goudes – Marseille – FR MRS',
    );
  });

  it('filters ports by port, department and LOCODE without requiring accents', () => {
    expect(filterProjectPortGroups('cherbourg').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Cherbourg');
    expect(filterProjectPortGroups('cotes armor').map((group) => group.department))
      .toContain('Côtes-d’Armor (22)');
    expect(filterProjectPortGroups('FR BES').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Brest');
  });
});
