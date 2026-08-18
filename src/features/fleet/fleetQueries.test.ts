import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchFleetVessels, saveFleetVessel } from './fleetQueries';

describe('fleetQueries', () => {
  it('maps the canonical vessels table and keeps an absent capacity empty', async () => {
    const secondOrder = vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'GOURY', acronym: 'GRY', active: true }],
      error: null,
    });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const select = vi.fn().mockReturnValue({ order: firstOrder });
    const client = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;

    await expect(fetchFleetVessels(client)).resolves.toEqual([
      expect.objectContaining({ id: 1, name: 'GOURY', acronym: 'GRY', maxPeople: null, active: true }),
    ]);
    expect(client.from).toHaveBeenCalledWith('vessels');
  });

  it('rejects an empty vessel name before any write', async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(saveFleetVessel(client, {
      name: ' ', acronym: '', typeLabel: '', unitTypeLabel: '', registrationNumber: '', imoNumber: '',
      registrationPort: '', callSign: '', mmsi: '', grossTonnage: '', maxPeople: null,
      crewMembers: '', medicalDotation: '', lengthOverall: '',
    })).rejects.toThrow('au moins deux caractères');
    expect(client.from).not.toHaveBeenCalled();
  });
});
