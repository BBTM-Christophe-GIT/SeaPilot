import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFleetVessels, type FleetVessel } from '../fleet/fleetQueries';
import { EmploymentContractVesselSelect } from './EmploymentContractVesselSelect';

vi.mock('../fleet/fleetQueries', () => ({ fetchFleetVessels: vi.fn() }));

const client = {} as SupabaseClient;
function vessel(id: number, name: string, patch: Partial<FleetVessel> = {}): FleetVessel {
  return { id, companyId: 1, name, active: true, assetKind: 'vessel', lengthOverall: '', ...patch } as FleetVessel;
}
const fleet = [
  vessel(1, 'GOURY'), vessel(2, 'LE ROZEL', { lengthOverall: '32,25 m' }),
  vessel(3, 'Navire de démonstration', { lengthOverall: '40' }), vessel(4, 'SUROIT'),
  vessel(5, 'Longueur inconnue'), vessel(6, 'Navire archivé', { active: false, lengthOverall: '100' }),
  vessel(7, 'YARD - Le Havre', { assetKind: 'quay', lengthOverall: '200' }),
  vessel(8, 'Armement - Cherbourg', { assetKind: 'office' }),
];

beforeEach(() => {
  vi.mocked(fetchFleetVessels).mockReset().mockResolvedValue(fleet);
});

describe('contract assignment fleet selector', () => {
  it('puts the entire fleet first, sorts vessel lengths and excludes archived ships, yards and offices', async () => {
    const onChange = vi.fn();
    render(<EmploymentContractVesselSelect client={client} value="" onChange={onChange} />);
    const select = screen.getByLabelText('Navire(s) d’affectation');
    expect(select).toBeDisabled();
    await waitFor(() => expect(select).toBeEnabled());
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Ensemble de la flotte', 'Navire de démonstration', 'LE ROZEL', 'GOURY', 'SUROIT', 'Longueur inconnue', 'Non renseigné',
    ]);
    expect(select).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
    expect(fetchFleetVessels).toHaveBeenCalledWith(client);
  });

  it('emits the exact selected vessel name or aggregate text without expanding the fleet', async () => {
    const user = userEvent.setup(), onChange = vi.fn();
    function Editor() {
      const [value, setValue] = useState('GOURY');
      return <EmploymentContractVesselSelect client={client} value={value} onChange={next => { onChange(next); setValue(next); }} />;
    }
    render(<Editor />);
    const select = screen.getByLabelText('Navire(s) d’affectation');
    await waitFor(() => expect(select).toBeEnabled());
    await user.selectOptions(select, 'LE ROZEL');
    expect(onChange).toHaveBeenLastCalledWith('LE ROZEL');
    expect(select).toHaveValue('LE ROZEL');
    await user.selectOptions(select, 'Ensemble de la flotte');
    expect(onChange).toHaveBeenLastCalledWith('Ensemble de la flotte');
    expect(select).toHaveValue('Ensemble de la flotte');
    await user.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it.each(['Ancien navire', 'GOURY / Autre navire\nAffectation historique', 'Navire archivé'])('preserves the recorded legacy value %s without an automatic change', async value => {
    const onChange = vi.fn();
    render(<EmploymentContractVesselSelect client={client} value={value} onChange={onChange} />);
    const select = screen.getByLabelText('Navire(s) d’affectation');
    expect(select).toHaveValue(value);
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue(value);
    expect(within(select).getByRole('option', { name: /Valeur enregistrée/ })).toHaveValue(value);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the recorded value disabled and visible on failure, then retries without replacing it', async () => {
    const user = userEvent.setup(), onChange = vi.fn();
    vi.mocked(fetchFleetVessels).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(fleet);
    render(<EmploymentContractVesselSelect client={client} value="Affectation historique" onChange={onChange} />);
    const select = screen.getByLabelText('Navire(s) d’affectation');
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la flotte');
    expect(select).toBeDisabled();
    expect(select).toHaveValue('Affectation historique');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue('Affectation historique');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(fetchFleetVessels).toHaveBeenCalledTimes(2);
  });

  it('ignores a late response from a previous client context', async () => {
    let finish!: (vessels: FleetVessel[]) => void;
    const otherClient = {} as SupabaseClient;
    vi.mocked(fetchFleetVessels).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce([vessel(20, 'Navire du contexte courant')]);
    const { rerender } = render(<EmploymentContractVesselSelect client={client} value="" onChange={vi.fn()} />);
    rerender(<EmploymentContractVesselSelect client={otherClient} value="" onChange={vi.fn()} />);
    await screen.findByRole('option', { name: 'Navire du contexte courant' });
    await act(async () => { finish([vessel(99, 'ANCIEN_CONTEXTE')]); });
    expect(screen.queryByRole('option', { name: 'ANCIEN_CONTEXTE' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Navire du contexte courant' })).toBeInTheDocument();
  });

  it('keeps selection locked while the profile is saving', async () => {
    const user = userEvent.setup(), onChange = vi.fn();
    render(<EmploymentContractVesselSelect client={client} value="GOURY" onChange={onChange} disabled />);
    await screen.findByRole('option', { name: 'LE ROZEL' });
    const select = screen.getByLabelText('Navire(s) d’affectation');
    expect(select).toBeDisabled();
    await user.selectOptions(select, 'Ensemble de la flotte');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains an empty fleet instead of inventing a vessel or changing the existing assignment', async () => {
    const onChange = vi.fn();
    vi.mocked(fetchFleetVessels).mockResolvedValue([]);
    render(<EmploymentContractVesselSelect client={client} value="" onChange={onChange} />);
    expect(await screen.findByText('Aucun navire actif dans la flotte.')).toBeInTheDocument();
    expect(screen.getByLabelText('Navire(s) d’affectation')).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
