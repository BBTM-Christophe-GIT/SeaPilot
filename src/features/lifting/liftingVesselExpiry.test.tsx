import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { createLiftingPreviewClient, demoFleetVessels } from './liftingPreview';
import { fetchLiftingRegister, fetchLiftingVesselExpiryCounts, startLiftingInspection } from './liftingQueries';
import { todayLocal } from './liftingModel';

interface Row { id: number; vessel_id: number; kind: 'lifting' | 'towing'; active: boolean; inspection_due_on: string | null }
function inventoryClient(rows: Row[], errorOffset?: number) {
  const ranges: number[][] = [];
  const filters: [string, unknown][] = [];
  const selections: string[] = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe('lifting_inventory');
    let selected = [...rows];
    const chain = {
      select: (columns: string) => { selections.push(columns); return chain; },
      eq: (key: keyof Row, value: unknown) => { filters.push([key, value]); selected = selected.filter((row) => row[key] === value); return chain; },
      order: (key: 'id', options: { ascending: boolean }) => { expect(options.ascending).toBe(true); selected.sort((a, b) => a[key] - b[key]); return chain; },
      range: async (start: number, end: number) => {
        ranges.push([start, end]);
        return start === errorOffset ? { data: null, error: new Error('Page inaccessible') } : { data: selected.slice(start, end + 1), error: null };
      },
    };
    return chain;
  });
  return { client: { from } as unknown as SupabaseClient, from, ranges, filters, selections };
}

describe('lifting vessel expiry counts', () => {
  it('counts current active equipment at J0 and J30, separates towing, and excludes absent dates', async () => {
    const source = inventoryClient([
      { id: 1, vessel_id: 4, kind: 'lifting', active: true, inspection_due_on: '2026-10-20' },
      { id: 2, vessel_id: 4, kind: 'lifting', active: true, inspection_due_on: '2026-10-21' },
      { id: 3, vessel_id: 4, kind: 'lifting', active: true, inspection_due_on: '2026-11-20' },
      { id: 4, vessel_id: 4, kind: 'lifting', active: true, inspection_due_on: '2026-11-21' },
      { id: 5, vessel_id: 4, kind: 'lifting', active: false, inspection_due_on: '2026-01-01' },
      { id: 6, vessel_id: 4, kind: 'towing', active: true, inspection_due_on: '2026-10-01' },
      { id: 7, vessel_id: 1, kind: 'lifting', active: true, inspection_due_on: '2026-10-01' },
      { id: 8, vessel_id: 1, kind: 'lifting', active: true, inspection_due_on: null },
    ]);
    expect(await fetchLiftingVesselExpiryCounts(source.client, 'lifting', '2026-10-21')).toEqual({ 4: { due: 2, expired: 1 }, 1: { due: 0, expired: 1 } });
    expect(source.filters).toEqual([['kind', 'lifting'], ['active', true]]);
    expect(source.selections).toEqual(['vessel_id,inspection_due_on']);
    expect(await fetchLiftingVesselExpiryCounts(source.client, 'towing', '2026-10-21')).toEqual({ 4: { due: 0, expired: 1 } });
  });

  it('loads beyond a thousand records with stable page ordering across all authorized vessels', async () => {
    const source = inventoryClient(Array.from({ length: 1101 }, (_, index) => ({ id: 1101 - index, vessel_id: index < 1000 ? 4 : 1, kind: 'lifting', active: true, inspection_due_on: index < 1000 ? '2026-10-20' : '2026-11-01' })));
    expect(await fetchLiftingVesselExpiryCounts(source.client, 'lifting', '2026-10-21')).toEqual({ 4: { due: 0, expired: 1000 }, 1: { due: 101, expired: 0 } });
    expect(source.ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(source.from).toHaveBeenCalledTimes(3);
    expect(source.filters.some(([key]) => key === 'vessel_id')).toBe(false);
  });

  it('rejects a later-page failure instead of returning misleading partial counts', async () => {
    const source = inventoryClient(Array.from({ length: 600 }, (_, id) => ({ id, vessel_id: 4, kind: 'lifting', active: true, inspection_due_on: '2026-10-20' })), 500);
    await expect(fetchLiftingVesselExpiryCounts(source.client, 'lifting', '2026-10-21')).rejects.toThrow('Page inaccessible');
  });

  it('keeps fleet preview counts on current equipment even after another draft is opened', async () => {
    const client = createLiftingPreviewClient({ fleet: true });
    const before = await fetchLiftingVesselExpiryCounts(client, 'lifting', todayLocal());
    const towing = await fetchLiftingVesselExpiryCounts(client, 'towing', todayLocal());
    expect(Object.values(before).some(({ due }) => due > 0)).toBe(true);
    expect(Object.values(before).some(({ expired }) => expired > 0)).toBe(true);
    expect(Object.values(towing).some(({ due }) => due > 0)).toBe(true);
    expect(Object.values(towing).some(({ expired }) => expired > 0)).toBe(true);
    expect(before[demoFleetVessels[0].id]).not.toEqual(towing[demoFleetVessels[0].id]);
    await startLiftingInspection(client, demoFleetVessels[0].id, 'lifting', '2030-01-01', '2031-01-01');
    expect(await fetchLiftingVesselExpiryCounts(client, 'lifting', todayLocal())).toEqual(before);
    expect((await fetchLiftingRegister(client, demoFleetVessels[0].id, 'lifting')).inspections.length).toBeGreaterThan(1);
  });

  it('keeps vessel badges independent of visible inventory filters and refreshes after removal', async () => {
    const client = createLiftingPreviewClient({ fleet: true });
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    const first = demoFleetVessels.find((vessel) => vessel.name === 'GOURY')!;
    await user.click(screen.getByRole('button', { name: first.name }));
    const button = screen.getByRole('button', { name: first.name });
    await waitFor(() => expect(within(button).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument());
    await user.type(screen.getByLabelText('Rechercher un matériel'), 'aucun résultat');
    expect(within(button).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer 1' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer de l’inventaire' }));
    await waitFor(() => expect(within(screen.getByRole('button', { name: first.name })).queryByRole('img', { name: '1 matériel périmé' })).not.toBeInTheDocument());
    expect(within(screen.getByRole('button', { name: first.name })).getByRole('img', { name: '1 matériel à échéance sous 30 jours' })).toBeInTheDocument();
  });

  it('does not query vessel expiry counts for the crane section', async () => {
    const client = createLiftingPreviewClient();
    const from = vi.spyOn(client, 'from');
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} section="crane" /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Examen à Fond - Grue', level: 1 });
    expect(from).not.toHaveBeenCalled();
  });
});
