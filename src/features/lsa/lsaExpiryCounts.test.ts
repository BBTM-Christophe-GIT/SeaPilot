import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchLsaRegister, fetchLsaVesselExpiryCounts } from './lsaQueries';
import { createLsaPreviewClient } from './lsaPreview';
import { demoFleetVessels } from '../lifting/liftingPreview';

interface ExpiryRow { id: number; vessel_id: number; expires_on: string | null; deleted_at?: string | null }
const TODAY = '2026-10-20';

function clientFor(rows: ExpiryRow[], failPage?: number) {
  const select = vi.fn();
  const is = vi.fn();
  const lte = vi.fn();
  const order = vi.fn();
  const range = vi.fn();
  const from = vi.fn((table: string) => {
    if (table !== 'lsa_items') throw new Error(`Unexpected table: ${table}`);
    let selected = [...rows];
    const query = {
      select: (columns: string) => { select(columns); return query; },
      is: (key: string, value: unknown) => { is(key, value); selected = selected.filter((row) => row.deleted_at == null); return query; },
      lte: (key: string, value: string) => { lte(key, value); selected = selected.filter((row) => row.expires_on !== null && row.expires_on <= value); return query; },
      order: (key: string) => { order(key); selected.sort((left, right) => left.id - right.id); return query; },
      range: async (start: number, end: number) => {
        range(start, end);
        return Math.floor(start / 750) === failPage
          ? { data: null, error: new Error('Compteurs LSA indisponibles') }
          : { data: selected.slice(start, end + 1), error: null };
      },
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from, select, is, lte, order, range };
}

describe('LSA vessel expiry counts', () => {
  it('counts current equipment across authorized vessels with J0 and J30 inclusive, excluding unknown, deleted and J31', async () => {
    const { client, from, select, is, lte } = clientFor([
      { id: 1, vessel_id: 10, expires_on: '2026-10-20' },
      { id: 2, vessel_id: 10, expires_on: '2026-11-19' },
      { id: 3, vessel_id: 10, expires_on: '2026-10-19' },
      { id: 4, vessel_id: 11, expires_on: '2025-10-20' },
      { id: 5, vessel_id: 11, expires_on: null },
      { id: 6, vessel_id: 11, expires_on: '2026-11-20' },
      { id: 7, vessel_id: 11, expires_on: '2026-10-19', deleted_at: '2026-10-18T00:00:00Z' },
    ]);
    expect(await fetchLsaVesselExpiryCounts(client, TODAY)).toEqual({ 10: { due: 2, expired: 1 }, 11: { due: 0, expired: 1 } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('lsa_items');
    expect(select).toHaveBeenCalledWith('id,vessel_id,expires_on');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
    expect(lte).toHaveBeenCalledWith('expires_on', '2026-11-19');
  });

  it('reads every page and counts each equipment ID once', async () => {
    const rows = Array.from({ length: 751 }, (_, index) => ({ id: index + 1, vessel_id: 10, expires_on: '2026-10-20' }));
    rows.push({ ...rows[749] });
    const { client, range } = clientFor(rows);
    expect(await fetchLsaVesselExpiryCounts(client, TODAY)).toEqual({ 10: { due: 751, expired: 0 } });
    expect(range.mock.calls).toEqual([[0, 749], [750, 1499]]);
  });

  it('rejects a failed later page instead of reporting a partial successful snapshot', async () => {
    const rows = Array.from({ length: 751 }, (_, index) => ({ id: index + 1, vessel_id: 10, expires_on: '2026-10-19' }));
    await expect(fetchLsaVesselExpiryCounts(clientFor(rows, 1).client, TODAY)).rejects.toThrow('Compteurs LSA indisponibles');
    expect(await fetchLsaVesselExpiryCounts(clientFor([]).client, TODAY)).toEqual({});
  });

  it('keeps demo dates relative to the Paris day and does not count an equipment again after deleting it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T23:00:00Z'));
    try {
      const client = createLsaPreviewClient();
      const counts = await fetchLsaVesselExpiryCounts(client, TODAY);
      const vessels = demoFleetVessels.filter((vessel) => !vessel.name.startsWith('YARD'));
      expect(counts).toEqual(Object.fromEntries(vessels.map(({ id }) => [id, { due: 1, expired: 1 }])));
      const register = await fetchLsaRegister(client, vessels[0].id);
      const expired = register.items.find((item) => item.expires_on && item.expires_on < TODAY)!;
      await client.rpc('delete_lsa_item', { p_id: expired.id, p_expected_updated_at: expired.updated_at });
      expect((await fetchLsaVesselExpiryCounts(client, TODAY))[vessels[0].id]).toEqual({ due: 1, expired: 0 });
      expect((await fetchLsaVesselExpiryCounts(client, TODAY))[vessels[1].id]).toEqual({ due: 1, expired: 1 });
    } finally { vi.useRealTimers(); }
  });
});
