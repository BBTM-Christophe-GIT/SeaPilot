import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiftingVesselFilter } from './LiftingVesselFilter';
import { demoVessel } from './liftingPreview';

describe('register vessel expiry badges', () => {
  it('shows separate counts on all vessel icons with keyboard selection and accessible descriptions', async () => {
    const onChange = vi.fn();
    render(<LiftingVesselFilter vessels={[{ ...demoVessel, name: 'GOURY' }, { ...demoVessel, id: 2, name: 'SUROIT' }]} value={demoVessel.id} disabled={false} onChange={onChange} expiryCounts={{ [demoVessel.id]: { due: 2, expired: 1 }, 2: { due: 0, expired: 3 } }} />);
    const goury = screen.getByRole('button', { name: 'GOURY' });
    expect(goury).toHaveAccessibleDescription('2 matériels à échéance sous 30 jours ; 1 matériel périmé');
    expect(within(goury).getByRole('img', { name: '2 matériels à échéance sous 30 jours' })).toHaveClass('is-due');
    expect(within(goury).getByRole('img', { name: '1 matériel périmé' })).toHaveClass('is-expired');
    const suroit = screen.getByRole('button', { name: 'SUROIT' });
    expect(within(suroit).getByRole('img', { name: '3 matériels périmés' })).toBeInTheDocument();
    suroit.focus(); await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('distinguishes loading, unavailable and a successful zero without affecting contexts without badges', () => {
    const props = { vessels: [demoVessel], value: demoVessel.id, disabled: false, onChange: vi.fn() };
    const { rerender } = render(<LiftingVesselFilter {...props} expiryCounts={null} expiryLoading />);
    const vessel = screen.getByRole('button', { name: demoVessel.name });
    expect(vessel).toHaveAccessibleDescription('Comptages en cours…');
    rerender(<LiftingVesselFilter {...props} expiryCounts={null} />);
    expect(vessel).toHaveAccessibleDescription('Comptages indisponibles');
    expect(within(vessel).queryByRole('img')).not.toBeInTheDocument();
    rerender(<LiftingVesselFilter {...props} expiryCounts={{}} />);
    expect(vessel).toHaveAccessibleDescription('Aucun matériel à échéance sous 30 jours ni périmé.');
    expect(within(vessel).queryByRole('img')).not.toBeInTheDocument();
    rerender(<LiftingVesselFilter {...props} />);
    expect(vessel).not.toHaveAttribute('aria-describedby');
    expect(vessel.querySelector('.vessel-expiry-unavailable')).toBeNull();
  });
});
