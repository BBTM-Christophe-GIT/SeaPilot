import { describe, expect, it } from 'vitest';
import {
  formatProjectPort,
  PROJECT_PORT_GROUPS,
  PROJECT_PORTS,
  PROJECT_PORTS_SOURCE,
} from './projectPorts';

describe('projectPorts', () => {
  it('contains the complete SharePoint LOCODE reference grouped by department', () => {
    expect(PROJECT_PORTS_SOURCE.listId).toBe('20e7b5db-85f2-4e7f-ad8d-64d75b396414');
    expect(PROJECT_PORTS).toHaveLength(53);
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
    expect(formatProjectPort(manche!.ports[1])).toBe('Cherbourg – FRCER');
  });
});
