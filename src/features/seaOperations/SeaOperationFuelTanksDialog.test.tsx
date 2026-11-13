import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeaOperationFuelTanksDialog } from './SeaOperationFuelTanksDialog';
import type { SeaOperationFleetFuelLevel, SeaOperationFuelTanks } from './seaOperationFleetFuelQuery';

const landemer: SeaOperationFleetFuelLevel = {
  vesselId: 2, vesselName: 'LANDEMER', lengthOverall: '19,50 m', maxSpeedKnots: null, capacityLiters: 24714,
  fuelLiters: null, measuredAt: null, source: null, baselineDate: null, baselineFuelLiters: null, deductedFuelLiters: null,
  refuelLiters: null, canSetBaseline: true, rateLitersPerHour: null, rateSampleCount: 0,
};
const tanks: SeaOperationFuelTanks['tanks'] = [
  { key: 'main-1', name: 'S1 avant', capacityLiters: 12357, calibration: 'landemer-v1' },
  { key: 'main-2', name: 'Cuve Bâbord', capacityLiters: 12357, calibration: 'landemer-v1' },
  { key: 'day', name: 'Caisse journalière', capacityLiters: 500 },
];
const water = { key: 'capacity-15ec0862-374d-4bbb-82aa-1887a015fbfa', name: 'Cuve centrale', capacityLiters: 1000, sectionName: 'Eau douce' };
const waste = { key: 'capacity-5655ef99-66a3-4004-a6a0-93fd71e435d2', name: 'Cuve arrière', capacityLiters: 800, sectionName: 'Eaux usées' };
const today = '2026-11-08';
const configuration: SeaOperationFuelTanks = { vesselId: 2, date: today, time: null, times: [], canSetBaseline: true, updatesFuelBaseline: true, tanks, reading: null };
const tank = (name: string) => within(screen.getByRole('group', { name }));
const submit = () => screen.getByRole('button', { name: 'Enregistrer les niveaux' });

afterEach(() => vi.useRealTimers());

describe('Soutes fuel readings', () => {
  it('positions tanks by side, converts mixed units and saves all measured tanks', async () => {
    vi.setSystemTime(new Date('2026-11-07T23:30:00Z'));
    const rpc = vi.fn().mockResolvedValue({ data: configuration, error: null });
    const onSaved = vi.fn();
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[
      { ...landemer, vesselId: 3, vesselName: 'SUROÎT', lengthOverall: '18,60 m' },
      { ...landemer, vesselId: 1, vesselName: 'GOURY', lengthOverall: '30,62 m', canSetBaseline: false }, landemer,
    ]} onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('group', { name: 'Cuve Bâbord' });
    expect(screen.getAllByRole('option').slice(0, 2).map(option => option.textContent)).toEqual(['LANDEMER', 'SUROÎT']);
    expect(screen.getByLabelText('Date de référence')).toHaveValue(today);
    expect(screen.getByLabelText('Heure du relevé')).toHaveValue('00:30');
    expect(rpc).toHaveBeenCalledWith('sea_operation_fuel_tanks', { p_vessel_id: 2, p_date: today, p_time: null });
    expect(screen.getByRole('group', { name: 'Cuve Bâbord' }).closest('.so-soutes-port')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'S1 avant' }).closest('.so-soutes-starboard')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Caisse journalière' }).closest('.so-soutes-day')).not.toBeNull();

    fireEvent.change(tank('Cuve Bâbord').getByLabelText('Unité'), { target: { value: 'percent' } });
    fireEvent.change(tank('Cuve Bâbord').getByLabelText('Niveau'), { target: { value: '101' } });
    expect(tank('Cuve Bâbord').getByLabelText('Niveau')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(tank('Cuve Bâbord').getByLabelText('Niveau'), { target: { value: '60.442' } });
    expect(tank('Cuve Bâbord').getByText('7,469 m³')).toBeVisible();
    fireEvent.change(tank('S1 avant').getByLabelText('Unité'), { target: { value: 'm3' } });
    fireEvent.change(tank('S1 avant').getByLabelText('Niveau'), { target: { value: '4' } });
    expect(submit()).toBeDisabled();
    fireEvent.change(tank('Caisse journalière').getByLabelText('Niveau'), { target: { value: '100' } });
    const stock = within(screen.getByRole('region', { name: 'Stock de carburant mesuré' }));
    expect(stock.getByText('11,569 m³')).toBeVisible();
    expect(stock.getByText(/cuves principales · 11,469 m³/)).toBeVisible();
    fireEvent.click(submit());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_fuel_tanks', {
      p_vessel_id: 2, p_date: today, p_time: '00:30', p_expected_version: null,
      p_readings: [{ key: 'main-1', unit: 'm3', value: 4 }, { key: 'main-2', unit: 'percent', value: 60.442 }, { key: 'day', unit: 'liters', value: 100 }],
    });
  });

  it('converts reference heights only for calibrated Goury tanks and preserves earlier volume entries', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const goury = { ...landemer, vesselId: 1, vesselName: 'GOURY' };
    const port = { key: 'main-1', name: 'Caisse 1 - 25-P', capacityLiters: 13280, soundingCode: '25P' };
    const starboard = { key: 'main-2', name: 'Caisse 2 - 20-S', capacityLiters: 16790, soundingCode: '20S' };
    const day = tanks[2];
    const reading: SeaOperationFuelTanks['reading'] = {
      version: 1, savedAt: '2026-11-08T10:00:00Z', mainLiters: 12600, superseded: false, updatesFuelBaseline: true,
      tanks: [{ key: port.key, name: port.name, capacityLiters: port.capacityLiters, unit: 'm3', value: 4.2, liters: 4200 },
        { ...starboard, unit: 'm', value: 2.48, liters: 8400 }, { ...day, unit: 'liters', value: 0, liters: 0 }],
    };
    const rpc = vi.fn(async (_name: string, params: { p_time: string | null }) => ({
      data: { ...configuration, vesselId: 1, time: params.p_time, times: ['08:30'], reading: params.p_time ? reading : null,
        tanks: [{ ...port, soundingPoints: [[740, 660], [3920, 13020]] },
          { ...starboard, soundingPoints: [[800, 840], [2480, 8400], [2810, 10070], [3960, 16450]] }, day] }, error: null,
    }));
    const onSaved = vi.fn();
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[goury]} onClose={vi.fn()} onSaved={onSaved} />);

    const selector = await screen.findByLabelText('Relevés de la journée');
    fireEvent.change(selector, { target: { value: '08:30' } });
    const height = await screen.findByLabelText('Hauteur');
    expect(tank(port.name).getByLabelText('Niveau')).toHaveValue(4.2);
    expect(tank(port.name).getByRole('option', { name: 'm' })).toBeVisible();
    expect(tank(day.name).queryByRole('option', { name: 'm' })).not.toBeInTheDocument();
    expect(height).toHaveValue(2.48);
    expect(height).toHaveAccessibleDescription('Hauteur au-dessus de la ligne de base 0H (Ref Ht Z/0H), sans assiette ni gîte. De 0,8 à 3,96 m.');
    expect(tank(starboard.name).getByText('8,4 m³')).toBeVisible();

    fireEvent.change(height, { target: { value: '0.799' } });
    expect(height).toHaveAttribute('aria-invalid', 'true');
    expect(submit()).toBeDisabled();
    fireEvent.change(height, { target: { value: '3.961' } });
    expect(height).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(height, { target: { value: '2.481' } });
    expect(tank(starboard.name).getByText('8,405 m³')).toBeVisible();
    fireEvent.click(submit());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_fuel_tanks', {
      p_vessel_id: 1, p_date: today, p_time: '08:30', p_expected_version: 1,
      p_readings: [{ key: port.key, unit: 'm3', value: 4.2 }, { key: starboard.key, unit: 'm', value: 2.481, soundingCode: '20S' },
        { key: day.key, unit: 'liters', value: 0 }],
    });
  });

  it('preserves renamed fuel readings and requires a fresh entry after a capacity change', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const reading: SeaOperationFuelTanks['reading'] = {
      version: 3, savedAt: '2026-11-08T10:00:00Z', mainLiters: 7469, superseded: true, updatesFuelBaseline: true,
      tanks: [{ ...tanks[0], capacityLiters: 10000, unit: 'liters', value: 200, liters: 200 },
        { ...tanks[1], name: 'Ancienne cuve', unit: 'percent', value: 60.442, liters: 7469 },
        { ...tanks[2], name: 'Ancienne caisse', unit: 'liters', value: 0, liters: 0 }],
    };
    const rpc = vi.fn(async (_name: string, params: { p_time: string | null }) => ({
      data: { ...configuration, time: params.p_time, times: ['08:30', '09:00'], reading: params.p_time ? reading : null }, error: null,
    }));
    const onSaved = vi.fn();
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[landemer]} onClose={vi.fn()} onSaved={onSaved} />);
    const selector = await screen.findByLabelText('Relevés de la journée');
    expect(selector).toHaveValue('');
    expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual(['Nouveau relevé', '08:30', '09:00']);
    expect(tank('Cuve Bâbord').getByLabelText('Niveau')).toHaveValue(null);
    fireEvent.change(selector, { target: { value: '08:30' } });
    expect(await screen.findByText(/Un stock global a remplacé ce relevé détaillé/)).toBeVisible();
    expect(screen.getByLabelText('Heure du relevé')).toHaveValue('08:30');
    expect(screen.getByLabelText('Heure du relevé')).toHaveAttribute('readonly');
    expect(tank('S1 avant').getByLabelText('Niveau')).toHaveValue(null);
    expect(tank('Cuve Bâbord').getByLabelText('Niveau')).toHaveValue(60.442);
    expect(tank('Caisse journalière').getByLabelText('Niveau')).toHaveValue(0);
    expect(submit()).toBeDisabled();
    fireEvent.click(screen.getByText('Consulter le relevé précédent'));
    expect(screen.getByText(/Ancienne caisse · 0 L/)).toBeVisible();
    fireEvent.change(tank('S1 avant').getByLabelText('Niveau'), { target: { value: '0' } });
    fireEvent.click(submit());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_fuel_tanks', expect.objectContaining({ p_time: '08:30', p_expected_version: 3 }));
  });

  it('groups selected cuves by capacity section and keeps their levels out of the partial fuel total', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const rpc = vi.fn().mockResolvedValue({
      data: { ...configuration, updatesFuelBaseline: false, tanks: [tanks[1], water, waste] }, error: null,
    });
    const onSaved = vi.fn();
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[landemer]} onClose={vi.fn()} onSaved={onSaved} />);
    const freshwater = within(await screen.findByRole('region', { name: 'Eau douce' }));
    const wastewater = within(screen.getByRole('region', { name: 'Eaux usées' }));
    const fuel = within(screen.getByRole('region', { name: 'Carburant' }));
    expect(screen.queryByRole('group', { name: 'S1 avant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Caisse journalière' })).not.toBeInTheDocument();
    expect(screen.getByText(/La mise à jour du stock de référence carburant/)).toBeVisible();
    fireEvent.change(fuel.getByLabelText('Niveau'), { target: { value: '100' } });
    fireEvent.change(freshwater.getByLabelText('Niveau'), { target: { value: '200' } });
    expect(submit()).toBeDisabled();
    fireEvent.change(wastewater.getByLabelText('Niveau'), { target: { value: '300' } });
    const stock = within(screen.getByRole('region', { name: 'Stock de carburant mesuré' }));
    expect(stock.getByText('0,1 m³')).toBeVisible();
    expect(stock.getByText('1/1 niveau saisi')).toBeVisible();
    fireEvent.click(submit());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_fuel_tanks', expect.objectContaining({
      p_readings: [{ key: 'main-2', unit: 'liters', value: 100 },
        { key: water.key, unit: 'liters', value: 200 }, { key: waste.key, unit: 'liters', value: 300 }],
    }));
  });

  it('loads a custom-only historical reading through tank and section renames and preserves it if the selection changes', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const reading: SeaOperationFuelTanks['reading'] = {
      version: 1, savedAt: '2026-11-08T10:00:00Z', mainLiters: 0, superseded: false, updatesFuelBaseline: false,
      tanks: [{ ...water, name: 'Ancienne cuve', sectionName: 'Ancienne section', unit: 'percent', value: 20, liters: 200 }],
    };
    const rpc = vi.fn(async (_name: string, params: { p_time: string | null }) => ({
      data: { ...configuration, time: params.p_time, times: ['08:30', '09:00'], updatesFuelBaseline: false,
        tanks: params.p_time === '09:00' ? [waste] : [water], reading: params.p_time ? reading : null }, error: null,
    }));
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[landemer]}
      onClose={vi.fn()} onSaved={vi.fn()} />);
    const selector = await screen.findByLabelText('Relevés de la journée');
    fireEvent.change(selector, { target: { value: '08:30' } });
    await waitFor(() => expect(tank(water.name).getByLabelText('Niveau')).toHaveValue(20));
    expect(screen.queryByRole('region', { name: /stock.*mesuré/i })).not.toBeInTheDocument();
    expect(submit()).toBeEnabled();

    fireEvent.change(selector, { target: { value: '09:00' } });
    expect(await screen.findByText(/La sélection des cuves a changé/)).toBeVisible();
    expect(tank(waste.name).getByLabelText('Niveau')).toBeDisabled();
    expect(submit()).toBeDisabled();
    fireEvent.click(screen.getByText('Consulter le relevé précédent'));
    expect(screen.getByText(/Ancienne section · Ancienne cuve · 20 % · 200 L/)).toBeVisible();
  });

  it('preselects the assigned writable vessel and keeps the user’s choice on a historical date', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const rpc = vi.fn(async (_name: string, params: { p_vessel_id: number; p_date: string; p_time: string | null }) => ({
      data: { ...configuration, vesselId: params.p_vessel_id, date: params.p_date, time: params.p_time }, error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient;
    const vessels = [landemer, { ...landemer, vesselId: 3, vesselName: 'SUROÎT', lengthOverall: '18,60 m' },
      { ...landemer, vesselId: 1, vesselName: 'GOURY', lengthOverall: '30,62 m', canSetBaseline: false }];
    const dialog = (preferredVesselId: number) => <SeaOperationFuelTanksDialog client={client} vessels={vessels}
      preferredVesselId={preferredVesselId} onClose={vi.fn()} onSaved={vi.fn()} />;
    const { rerender } = render(dialog(1));
    expect(screen.getByLabelText('Navire')).toHaveValue('2');
    await screen.findByRole('group', { name: 'Cuve Bâbord' });
    rerender(dialog(3));
    expect(screen.getByLabelText('Navire')).toHaveValue('3');
    await screen.findByRole('group', { name: 'Cuve Bâbord' });
    fireEvent.change(screen.getByLabelText('Navire'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Date de référence'), { target: { value: '2026-11-07' } });
    await screen.findByRole('group', { name: 'Cuve Bâbord' });
    expect(screen.getByLabelText('Navire')).toHaveValue('2');
    expect(screen.getByLabelText('Heure du relevé')).toHaveValue('00:00');
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_fuel_tanks', { p_vessel_id: 2, p_date: '2026-11-07', p_time: null });
    fireEvent.change(tank('Cuve Bâbord').getByLabelText('Niveau'), { target: { value: '100' } });
    rerender(dialog(3));
    expect(tank('Cuve Bâbord').getByLabelText('Niveau')).toHaveValue(100);
  });

  it('preserves draft levels when another reader saves the same minute first', async () => {
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const rpc = vi.fn(async (name: string, params: { p_time: string | null }) => {
      if (name === 'sea_operation_fuel_tanks') return { data: configuration, error: null };
      return params.p_time === '10:00' ? { data: null, error: { code: '40001', message: 'Un relevé existe déjà.' } } : { data: null, error: null };
    });
    const onSaved = vi.fn();
    render(<SeaOperationFuelTanksDialog client={{ rpc } as unknown as SupabaseClient} vessels={[landemer]} onClose={vi.fn()} onSaved={onSaved} />);
    await screen.findByRole('group', { name: 'Cuve Bâbord' });
    fireEvent.change(screen.getByLabelText('Heure du relevé'), { target: { value: '10:00' } });
    for (const name of ['S1 avant', 'Cuve Bâbord', 'Caisse journalière']) {
      fireEvent.change(tank(name).getByLabelText('Niveau'), { target: { value: '10' } });
    }
    fireEvent.click(submit());
    expect(await screen.findByText('Un relevé existe déjà à 10:00.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le relevé de 10:00' })).toBeVisible();
    expect(screen.getByLabelText('Relevés de la journée')).toHaveValue('');
    expect(submit()).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(tank('Cuve Bâbord').getByLabelText('Niveau')).toHaveValue(10);
    fireEvent.change(screen.getByLabelText('Heure du relevé'), { target: { value: '10:01' } });
    fireEvent.click(submit());
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_fuel_tanks', expect.objectContaining({ p_time: '10:01', p_expected_version: null }));
  });
});
