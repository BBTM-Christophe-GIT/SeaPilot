import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeaOperationFleetFuel } from './SeaOperationFleetFuel';
import type { SeaOperationFleetFuelLevel } from './seaOperationFleetFuelQuery';

const vessel: SeaOperationFleetFuelLevel = {
  vesselId: 15, vesselName: 'LANDEMER', lengthOverall: '19,5 m', maxSpeedKnots: 16,
  capacityLiters: 24714, fuelLiters: 1700, measuredAt: null, source: null, baselineDate: null, baselineFuelLiters: null,
  deductedFuelLiters: null, refuelLiters: null, canSetBaseline: false, rateLitersPerHour: 200, rateSampleCount: 10,
};

async function showAutonomy(row: SeaOperationFleetFuelLevel) {
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, liters: null, costEuros: null, unpricedLiters: 0 }));
  const rpc = vi.fn().mockResolvedValue({ data: { years: [], months, costSource: 'dpr' }, error: null });
  render(<SeaOperationFleetFuel client={{ rpc } as unknown as SupabaseClient} historyRefresh={0} rows={[row]} error={undefined}
    reload={vi.fn()} averages={new Map()} onRetryAverages={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Détails carburant · LANDEMER' }));
  await screen.findByText('Aucune consommation renseignée pour cette année.');
  const autonomy = within(screen.getByRole('region', { name: 'Autonomie estimée' }));
  return {
    normal: autonomy.getByRole('region', { name: 'Vitesse moyenne' }),
    towing: autonomy.getByRole('region', { name: 'Vitesse moyenne en remorque' }),
  };
}

describe('fleet autonomy by navigation profile', () => {
  it('calculates independent distance and duration from each observed speed and fuel rate', async () => {
    const { normal, towing } = await showAutonomy({ ...vessel, navigationProfiles: {
      normal: { speedKnots: 8.5, litersPerNm: 20, sampleCount: 3 }, towing: { speedKnots: 5, litersPerNm: 42.5, sampleCount: 2 },
    } });
    expect(within(normal).getByText('8,5 nd')).toBeVisible();
    expect(within(normal).getByText('10 h · 85 NM')).toBeVisible();
    expect(within(normal).getByText('20 L/NM')).toBeVisible();
    expect(normal.querySelector('.so-speed-dial-progress')).toHaveAttribute('stroke-dasharray', '0.53125 1');
    expect(within(towing).getByText('5 nd')).toBeVisible();
    expect(within(towing).getByText('8 h · 40 NM')).toBeVisible();
    expect(within(towing).getByText('42,5 L/NM')).toBeVisible();
    expect(within(towing).getByText('16 nd')).toBeVisible();
    expect(towing.querySelector('.so-speed-dial-progress')).toHaveAttribute('stroke-dasharray', '0.3125 1');
  });

  it('shows a measured speed and autonomy without Vmax while leaving missing towing data empty', async () => {
    const { normal, towing } = await showAutonomy({ ...vessel, maxSpeedKnots: null, navigationProfiles: {
      normal: { speedKnots: 6.3, litersPerNm: 10, sampleCount: 1 }, towing: null,
    } });
    expect(within(normal).getByText('6,3 nd')).toBeVisible();
    expect(within(normal).getByText('27 h · 170 NM')).toBeVisible();
    expect(within(normal).getByText('non renseignée')).toBeVisible();
    expect(within(normal).getByText('0–10 nd')).toBeVisible();
    expect(normal.querySelector('.so-speed-dial-progress')).toHaveAttribute('stroke-dasharray', '0.63 1');
    expect(within(towing).getByText('Aucun relevé de vitesse')).toBeVisible();
    expect(within(towing).getByText('0–10 nd')).toBeVisible();
    expect(towing.querySelector('.so-speed-dial-track')).toBeInTheDocument();
    expect(towing.querySelector('.so-speed-dial-needle')).toBeNull();
    expect(within(towing).queryByText(/ NM$/)).toBeNull();
  });

  it('keeps both scales honest if an observed speed exceeds the configured Vmax', async () => {
    const { normal, towing } = await showAutonomy({ ...vessel, maxSpeedKnots: 11, navigationProfiles: {
      normal: { speedKnots: 12, litersPerNm: null, sampleCount: 1 }, towing: { speedKnots: 7.5, litersPerNm: 15, sampleCount: 2 },
    } });
    expect(within(normal).getByText('Autonomie indisponible')).toBeVisible();
    for (const profile of [normal, towing]) {
      expect(within(profile).getByText('11 nd')).toBeVisible();
      expect(within(profile).getByText('0–15 nd')).toBeVisible();
    }
    expect(normal.querySelector('.so-speed-dial-progress')).toHaveAttribute('stroke-dasharray', '0.8 1');
    expect(towing.querySelector('.so-speed-dial-progress')).toHaveAttribute('stroke-dasharray', '0.5 1');
  });
});
