import { describe, expect, it } from 'vitest';
import {
  filterProjectPortGroups,
  formatProjectOfferPort,
  formatProjectPort,
  PROJECT_PORT_GROUPS,
  PROJECT_PORTS,
  PROJECT_PORTS_SOURCE,
} from './projectPorts';

describe('projectPorts', () => {
  it('contains the official French and English references while keeping France first', () => {
    expect(PROJECT_PORTS_SOURCE.france.publisher).toBe('SANDRE / SHOM');
    expect(PROJECT_PORTS_SOURCE.england.publisher).toBe('UK Department for Transport');
    expect(PROJECT_PORTS_SOURCE.locode.publisher).toBe('UNECE');
    expect(PROJECT_PORTS.length).toBeGreaterThanOrEqual(871);
    expect(PROJECT_PORTS.filter((port) => port.country === 'France').length).toBeGreaterThanOrEqual(669);
    expect(PROJECT_PORTS.filter((port) => port.country === 'Angleterre')).toHaveLength(202);

    const firstEnglishGroup = PROJECT_PORT_GROUPS.findIndex((group) => group.country === 'Angleterre');
    expect(firstEnglishGroup).toBeGreaterThan(0);
    expect(PROJECT_PORT_GROUPS.slice(0, firstEnglishGroup).every((group) => group.country === 'France')).toBe(true);
    expect(PROJECT_PORT_GROUPS.slice(firstEnglishGroup).every((group) => group.country === 'Angleterre')).toBe(true);
  });

  it('sorts ports inside their department and retains the Channel ports', () => {
    const manche = PROJECT_PORT_GROUPS.find((group) => group.department === 'Manche');
    const names = manche?.ports.map((port) => port.port) || [];

    expect(names).toEqual(
      [...names].sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' })),
    );
    expect(names).toEqual(expect.arrayContaining([
      'Port de Cherbourg',
      'Port de Goury',
      'Port de Saint-Vaast-la-Hougue',
    ]));
    expect(formatProjectPort(manche!.ports.find((port) => port.port === 'Port de Cherbourg')!))
      .toBe('Port de Cherbourg – Cherbourg-en-Cotentin – FR CER');
  });

  it('removes legacy duplicates when an official port already covers the LOCODE', () => {
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const normalizedPortName = (value: string) => normalize(value)
      .replace(/^port\s+(?:(?:de|du|des|le|la)\s+|d\s+)?/, '')
      .replace(/^(?:le|la|les|l)\s+/, '');
    const identities = PROJECT_PORTS
      .filter((port) => Boolean(port.locode))
      .map((port) => `${port.country}:${normalize(port.locode)}:${normalizedPortName(port.port)}`);

    expect(new Set(identities).size).toBe(identities.length);
    expect(PROJECT_PORTS.some((port) => port.port === 'Diélette')).toBe(false);
    expect(PROJECT_PORTS.some((port) => port.port === 'Port Diélette')).toBe(true);
    expect(PROJECT_PORTS.some((port) => port.port === 'Cherbourg')).toBe(false);
    expect(PROJECT_PORTS.some((port) => port.port === 'Port de Cherbourg')).toBe(true);
  });

  it('explains associated LOCODEs, reporting-port links and ports without a dedicated LOCODE', () => {
    const boyardville = PROJECT_PORTS.find((port) => port.port === 'Port de Boyardville')!;
    const cattewater = PROJECT_PORTS.find((port) => port.port === 'Cattewater Harbour')!;
    const saintJeanCapFerrat = PROJECT_PORTS.find((port) => port.port === 'Port de Saint-Jean-Cap-Ferrat')!;

    expect(formatProjectPort(boyardville)).toBe(
      "Port de Boyardville – Saint-Georges-d'Oléron – LOCODE associé FR GGD (Saint-Georges-d'Oléron)",
    );
    expect(formatProjectPort(cattewater)).toBe(
      'Cattewater Harbour – GB 144 · rattaché à Plymouth (GB PLY)',
    );
    expect(formatProjectPort(saintJeanCapFerrat)).toBe(
      'Port de Saint-Jean-Cap-Ferrat – Saint-Jean-Cap-Ferrat – sans LOCODE dédié',
    );
  });

  it('filters every port field without requiring accents or LOCODE spacing', () => {
    expect(filterProjectPortGroups('cherbourg').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Port de Cherbourg');
    expect(filterProjectPortGroups('cotes armor').map((group) => group.department))
      .toContain('Côtes-d’Armor (22)');
    expect(filterProjectPortGroups('FR BES').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Port de Brest');
    expect(filterProjectPortGroups('GB PLY').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Cattewater Harbour');
    expect(filterProjectPortGroups('dover').flatMap((group) => group.ports.map((port) => port.port)))
      .toContain('Dover');
  });

  it('places the appropriate LOCODE below a known offer port', () => {
    expect(formatProjectOfferPort('Brest')).toBe('Brest\nFR BES');
    expect(formatProjectOfferPort('Nantes - Saint-Nazaire')).toBe('Nantes - Saint-Nazaire\nFR NTE');
    expect(formatProjectOfferPort('Port de Boyardville')).toBe(
      "Port de Boyardville\nFR GGD (LOCODE de Saint-Georges-d'Oléron)",
    );
    expect(formatProjectOfferPort('Port libre')).toBe('Port libre');
  });
});
