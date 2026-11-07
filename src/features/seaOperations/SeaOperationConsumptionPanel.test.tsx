import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeaOperationConsumptionDialog } from './SeaOperationConsumptionPanel';
import { calculateSeaOperationConsumption, type SeaOperationConsumption, type SeaOperationConsumptionInputs } from './seaOperationConsumption';
import { emptySeaOperation } from './seaOperationModel';
import type { SeaOperationRecord } from './seaOperationQueries';

const operation: SeaOperationRecord = {
  id: 'signed-go', companyId: 1, version: 3, status: 'signed',
  draft: { ...emptySeaOperation(), project: 'Mission de contrôle', decision: 'GO' },
  createdBy: 'marin', createdByName: 'Marin', createdAt: '', updatedBy: 'captain', updatedByName: 'Capitaine', updatedAt: '',
  signedBy: 'captain', signedByName: 'Capitaine', signedAt: '2026-11-06T07:00:00Z', captainName: 'Capitaine',
  canEdit: false, canSign: false,
};
const values: SeaOperationConsumptionInputs = {
  durationMinutes: 90, averageSpeedKnots: 12, gaugeUnit: 'percent', departureGauge: 80, arrivalGauge: 60,
  refuelLiters: 500, pricePerLiter: 1.2, actualArrival: null, completed: true,
};
const initial: SeaOperationConsumption = {
  operationId: operation.id, canEdit: true,
  calibration: { kind: 'nominal', defaultGaugeUnit: 'percent', nominalCapacityLiters: 10_000 },
  reference: { vesselId: 12, transitLitersPerNm: null, towageLitersPerNm: null, pricePerLiter: null, priceDate: null },
  record: null,
};
const saved = { ...values, ...calculateSeaOperationConsumption(values, initial.calibration), version: 2, includedInReference: true, updatedAt: '2026-11-06T10:00:00Z' };

function show(rpc: ReturnType<typeof vi.fn>) {
  const client = { rpc } as unknown as SupabaseClient;
  const onSaved = vi.fn();
  render(<SeaOperationConsumptionDialog client={client} record={operation} onClose={vi.fn()} onSaved={onSaved} />);
  return { onSaved };
}

function enter(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const save = () => screen.getByRole('button', { name: 'Enregistrer la consommation' });

describe('Conso after signed navigation', () => {
  it('calculates the readout and saves a valid form without a confirmation checkbox', async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === 'sea_operation_consumption' ? initial : { ...initial, record: saved }, error: null }));
    const { onSaved } = show(rpc);
    await screen.findByLabelText('Heures');
    expect(save()).toBeDisabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    enter('Heures', '1');
    enter('Minutes', '30');
    enter('Vitesse moyenne (nœuds)', '12');
    enter('Jauge au départ après avitaillement (%)', '80');
    enter('Jauge à l’arrivée (%)', '60');
    enter('Avitaillement avant départ (L, facultatif)', '500');
    enter('Prix du fuel HT en €/L', '1.2');

    const preview = within(screen.getByRole('region', { name: 'Récapitulatif calculé' }));
    expect(preview.getByText('18 NM')).toBeVisible();
    expect(preview.getByText(/8\s000 L/)).toBeVisible();
    expect(preview.getByText(/2\s000 L/)).toBeVisible();
    expect(preview.getByText(/1\s333,33 L\/h/)).toBeVisible();
    expect(preview.getByText('111,11 L/NM')).toBeVisible();
    expect(preview.getByText(/2\s400,00\s€/)).toBeVisible();
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledExactlyOnceWith({ ...initial, record: saved }));
    expect(rpc).toHaveBeenCalledWith('sea_operation_save_consumption', { p_id: operation.id, p_expected_version: null, p_inputs: values });
    expect(operation.version).toBe(3);
    expect(operation.canEdit).toBe(false);
  });

  it('allows consultation without fields or writes when the server refuses editing', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...initial, canEdit: false, record: saved }, error: null });
    show(rpc);
    expect(await screen.findByText('Relevé inclus dans la référence de consommation Projet.')).toBeVisible();
    expect(screen.getByText(/2\s000 L/)).toBeVisible();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer la consommation' })).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledExactlyOnceWith('sea_operation_consumption', { p_id: operation.id });
  });

  it('uses the Suroît’s native gauge unit and clears both readings when the unit changes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...initial, calibration: { kind: 'suroit', defaultGaugeUnit: 'cm', nominalCapacityLiters: 14_000 } }, error: null });
    show(rpc);
    await screen.findByLabelText('Jauge au départ après avitaillement (cm)');
    enter('Jauge au départ après avitaillement (cm)', '100');
    enter('Jauge à l’arrivée (cm)', '80');
    enter('Unité des jauges', 'percent');
    expect(screen.getByLabelText('Jauge au départ après avitaillement (%)')).toHaveValue(null);
    expect(screen.getByLabelText('Jauge à l’arrivée (%)')).toHaveValue(null);
    expect(screen.getByText(/capacité nominale des soutes/)).toBeVisible();
  });

  it('accepts optional avitaillement for a stationary operation and can reload after a concurrent edit', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: initial, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'Relevez la version actualisée.' } })
      .mockResolvedValueOnce({ data: { ...initial, record: saved }, error: null });
    const { onSaved } = show(rpc);
    await screen.findByLabelText('Heures');
    enter('Heures', '1');
    enter('Vitesse moyenne (nœuds)', '0');
    enter('Jauge au départ après avitaillement (%)', '80');
    enter('Jauge à l’arrivée (%)', '60');
    expect(screen.getByText('0 NM')).toBeVisible();
    expect(screen.getByText(/2\s000 L\/h/)).toBeVisible();
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Relevez la version actualisée.');
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_consumption', { p_id: operation.id, p_expected_version: null,
      p_inputs: { ...values, durationMinutes: 60, averageSpeedKnots: 0, refuelLiters: null, pricePerLiter: null } });
    expect(save()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Recharger le relevé' }));
    const modify = await screen.findByRole('button', { name: 'Modifier le relevé' });
    fireEvent.click(modify);
    expect(screen.getByLabelText('Minutes')).toHaveValue(30);
    expect(save()).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('prefills a completed GPS trace and shows the saved mission dashboard', async () => {
    const rpc = vi.fn(async (name: string, args: { p_inputs: SeaOperationConsumptionInputs }) => ({
      data: name === 'sea_operation_consumption' ? initial : {
        ...initial, record: { ...saved, ...args.p_inputs, ...calculateSeaOperationConsumption(args.p_inputs, initial.calibration) },
      }, error: null,
    }));
    show(rpc);
    await screen.findByLabelText('Heures');
    const xml = '<gpx version="1.1"><trk><trkseg>'
      + '<trkpt lat="0" lon="0"><time>2026-09-23T08:00:00Z</time></trkpt>'
      + '<trkpt lat="0" lon="0.001"><time>2026-09-23T08:05:00Z</time></trkpt>'
      + '</trkseg></trk></gpx>';
    const file = new File([xml], 'mission.gpx');
    Object.defineProperty(file, 'text', { value: async () => xml });
    fireEvent.change(screen.getByLabelText('Importer une trace GPX'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText('Minutes')).toHaveValue(5));
    expect(screen.getByLabelText('Vitesse moyenne (nœuds)')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Arrivée réelle (heure de Paris, facultative)')).toHaveValue('2026-09-23T10:05');
    expect(screen.getByLabelText('Jauge au départ après avitaillement (%)')).toHaveValue(null);
    enter('Jauge au départ après avitaillement (%)', '80');
    enter('Jauge à l’arrivée (%)', '60');
    fireEvent.click(save());
    expect(await screen.findByRole('heading', { name: 'Bilan de consommation' })).toBeVisible();
    expect(screen.getByRole('img', { name: /Profil de vitesse GPS/ })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Modifier le relevé' })).toBeVisible();
    expect(rpc).toHaveBeenLastCalledWith('sea_operation_save_consumption', expect.objectContaining({
      p_inputs: expect.objectContaining({ trace: expect.objectContaining({ pointCount: 2, durationMinutes: 5 }) }),
    }));
  });
});
