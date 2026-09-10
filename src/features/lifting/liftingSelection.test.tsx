import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { LiftingVesselFilter } from './LiftingVesselFilter';
import { createLiftingPreviewClient, demoFleetVessels, demoVessel } from './liftingPreview';
import { fetchInspectionEntries, fetchLiftingRegister, fetchLiftingVessels, startLiftingInspection } from './liftingQueries';

describe('lifting vessel photo selection', () => {
  it('uses only role-scoped thumbnails without signing or loading original photos', async () => {
    const storageFrom = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: [
      { ...demoVessel, id: 1, photo_url: '/old-goury.jpg', illustration_storage_bucket: 'fleet-media', illustration_storage_path: '1/1/original.png', illustration_thumbnail_url: '/vessels/bbtm/goury.webp' },
      { ...demoVessel, id: 2, photo_storage_bucket: 'fleet-media', photo_storage_path: '1/2/large.png', illustration_thumbnail_url: null },
    ], error: null });
    const from = vi.fn();
    const result = await fetchLiftingVessels({ rpc, from, storage: { from: storageFrom } } as unknown as SupabaseClient);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('lifting_available_vessels');
    expect(from).not.toHaveBeenCalled();
    expect(result.map((v) => v.id)).toEqual([1, 2]);
    expect(storageFrom).not.toHaveBeenCalled();
    render(<LiftingVesselFilter vessels={result} value={1} disabled={false} onChange={vi.fn()} />);
    const images = document.querySelectorAll('.lifting-vessel-photo img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/vessels/bbtm/goury.webp');
    expect(images[0]).toHaveAttribute('loading', 'lazy');
    expect(images[0]).toHaveAttribute('width', '256');
    expect(screen.getByText('Photo à venir')).toBeInTheDocument();
  });

  it('changes inventory and report context with the photo filter while keeping the selected view', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient({ fleet: true })} roles={['admin']} /></MemoryRouter>);
    const suroit = await screen.findByRole('button', { name: 'SUROIT' });
    await screen.findByText('CROCHET À LINGUET — 2 T');
    expect(suroit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Navire' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'HOLENN EUSA' }));
    await waitFor(() => expect(screen.queryByText('CROCHET À LINGUET — 2 T')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'HOLENN EUSA' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Rapports de contrôle' }));
    await user.click(screen.getByRole('button', { name: 'GOURY' }));
    expect(screen.getByRole('button', { name: 'Rapports de contrôle' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('button', { name: 'Reprendre' }));
    await screen.findByRole('heading', { name: /Contrôle annuel 2026 · LEV-\d+/ });
    expect(screen.getByText(/GOURY · 09\/09\/2026/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('article', { name: 'Matériel 1' })).getByRole('checkbox', { name: 'V1' }));
    expect(screen.getByRole('button', { name: 'SUROIT' })).toBeDisabled();
  });

  it('keeps per-vessel annual reports and inventory snapshots separate in the fleet preview', async () => {
    const client = createLiftingPreviewClient({ fleet: true });
    const [goury, hirondelle] = demoFleetVessels;
    const first = await startLiftingInspection(client, goury.id, 'lifting', '2030-09-10', '2031-09-10');
    const second = await startLiftingInspection(client, hirondelle.id, 'lifting', '2030-09-10', '2031-09-10');
    expect(first).not.toBe(second);
    expect((await fetchInspectionEntries(client, first)).every((row) => row.item_snapshot.vessel_id === goury.id)).toBe(true);
    expect((await fetchInspectionEntries(client, second)).every((row) => row.item_snapshot.vessel_id === hirondelle.id)).toBe(true);
    expect((await fetchLiftingRegister(client, hirondelle.id, 'lifting')).inspections.some((row) => row.id === first)).toBe(false);
  });

  it('keeps a named keyboard-operable filter when an image fails', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<LiftingVesselFilter vessels={[{ ...demoVessel, illustration_thumbnail_url: '/missing.webp' }]} value={0} disabled={false} onChange={onChange} />);
    const button = screen.getByRole('button', { name: demoVessel.name });
    fireEvent.error(button.querySelector('img')!);
    expect(within(button).getByText('Photo à venir')).toBeInTheDocument();
    button.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(demoVessel.id);
  });
});
