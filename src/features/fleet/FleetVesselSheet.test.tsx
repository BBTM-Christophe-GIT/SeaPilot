import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FleetVesselSheet } from './FleetVesselSheet';

describe('FleetVesselSheet', () => {
  it('opens the fleet record by vessel ID and displays filled values only', async () => {
    const eq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: {
      id: 21, name: 'GOURY', asset_kind: 'vessel', unit_type_label: 'Navire', type_label: 'Navire de charge',
      active: true, length_overall: '30.62 m', max_people: 12, main_engine_power_kw: 750,
    }, error: null }) });
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
    const onClose = vi.fn();
    render(<FleetVesselSheet client={{ from } as unknown as SupabaseClient} onClose={onClose} vesselId={21} vesselName="GOURY" />);

    const dialog = within(await screen.findByRole('dialog', { name: 'GOURY' }));
    expect(await dialog.findByText('750 kW')).toBeVisible();
    expect(dialog.getByText('30.62 m')).toBeVisible();
    expect(dialog.queryByText('MMSI')).not.toBeInTheDocument();
    expect(dialog.queryByRole('heading', { name: 'Capacités' })).not.toBeInTheDocument();
    expect(from).toHaveBeenCalledWith('vessels');
    expect(eq).toHaveBeenCalledWith('id', 21);
    fireEvent.keyDown(dialog.getByRole('button', { name: 'Fermer' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
