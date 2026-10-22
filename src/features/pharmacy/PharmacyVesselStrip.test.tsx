import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PharmacyVesselStrip } from './PharmacyVesselStrip';
import type { PharmacyVessel } from './pharmacyModel';

const vessels: PharmacyVessel[] = [
  { id: 1, company_id: 1, name: 'GOURY', acronym: 'GRY', can_manage: true },
  { id: 2, company_id: 1, name: 'SUROIT', acronym: 'SUR', can_manage: true },
  { id: 3, company_id: 1, name: 'HIRONDELLE DE LA MANCHE', acronym: 'HDM', can_manage: true },
];

describe('PharmacyVesselStrip', () => {
  it('uses existing fleet illustrations, exact vessel names and native selection buttons', async () => {
    const onChange = vi.fn();
    render(<PharmacyVesselStrip counts={{ 1: { due: 2, expired: 3 }, 2: { due: 0, expired: 0 }, 3: { due: 0, expired: 0 } }} disabled={false} onChange={onChange} value={1} vessels={vessels} />);
    const goury = screen.getByRole('button', { name: 'GOURY' });
    expect(goury).toHaveAttribute('aria-pressed', 'true');
    expect(goury.querySelector('img')).toHaveAttribute('src', '/vessels/bbtm/goury-16db2dd97c49c0d1.webp');
    const hirondelle = screen.getByRole('button', { name: 'HIRONDELLE DE LA MANCHE' });
    expect(hirondelle).toHaveAttribute('title', 'HIRONDELLE DE LA MANCHE');
    await userEvent.click(hirondelle);
    expect(onChange).toHaveBeenCalledWith(3);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows separate orange and red counts with accessible due and expired descriptions', () => {
    render(<PharmacyVesselStrip counts={{ 1: { due: 2, expired: 3 } }} disabled={false} onChange={vi.fn()} value={1} vessels={[vessels[0]]} />);
    const goury = screen.getByRole('button', { name: 'GOURY' });
    expect(within(goury).getByRole('img', { name: '2 articles à échéance sous 30 jours' })).toHaveTextContent('2');
    expect(within(goury).getByRole('img', { name: '3 articles périmés' })).toHaveTextContent('3');
    expect(goury).toHaveAccessibleDescription('2 articles à échéance sous 30 jours ; 3 articles périmés');
  });

  it('does not show badges for zero counts and handles singular articles', () => {
    render(<PharmacyVesselStrip counts={{ 1: { due: 1, expired: 1 }, 2: { due: 0, expired: 0 } }} disabled={false} onChange={vi.fn()} value={1} vessels={vessels.slice(0, 2)} />);
    expect(screen.getByRole('img', { name: '1 article à échéance sous 30 jours' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 article périmé' })).toBeInTheDocument();
    const suroit = screen.getByRole('button', { name: 'SUROIT' });
    expect(within(suroit).queryByRole('img')).not.toBeInTheDocument();
    expect(suroit).toHaveAccessibleDescription('Aucun article à échéance sous 30 jours ni périmé.');
    expect(within(suroit).queryByText('0')).not.toBeInTheDocument();
  });

  it('does not turn unavailable counts into fictitious zero counts', () => {
    const { rerender } = render(<PharmacyVesselStrip counts={null} disabled={false} onChange={vi.fn()} value={1} vessels={[vessels[0]]} />);
    let goury = screen.getByRole('button', { name: 'GOURY' });
    expect(within(goury).getByText('Comptages indisponibles')).toBeInTheDocument();
    expect(goury).toHaveAccessibleDescription('Comptages indisponibles');
    expect(within(goury).queryByRole('img')).not.toBeInTheDocument();
    rerender(<PharmacyVesselStrip counts={null} disabled={false} loading onChange={vi.fn()} value={1} vessels={[vessels[0]]} />);
    goury = screen.getByRole('button', { name: 'GOURY' });
    expect(within(goury).getByText('Comptages en cours…')).toBeInTheDocument();
    expect(goury).toHaveAccessibleDescription('Comptages en cours…');
    rerender(<PharmacyVesselStrip counts={{}} disabled={false} onChange={vi.fn()} value={1} vessels={[vessels[0]]} />);
    goury = screen.getByRole('button', { name: 'GOURY' });
    expect(within(goury).queryByText('Comptages indisponibles')).not.toBeInTheDocument();
    expect(within(goury).queryByRole('img')).not.toBeInTheDocument();
    expect(goury).toHaveAccessibleDescription('Aucun article à échéance sous 30 jours ni périmé.');
  });

  it('prevents selection while disabled and supports keyboard activation otherwise', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PharmacyVesselStrip counts={null} disabled onChange={onChange} value={1} vessels={vessels} />);
    await userEvent.click(screen.getByRole('button', { name: 'SUROIT' }));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<PharmacyVesselStrip counts={null} disabled={false} onChange={onChange} value={1} vessels={vessels} />);
    screen.getByRole('button', { name: 'SUROIT' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('falls back to a vessel icon when the catalog has no image or the photo fails', () => {
    const other: PharmacyVessel = { ...vessels[0], id: 4, name: 'NOUVEAU NAVIRE', acronym: 'NNV' };
    render(<PharmacyVesselStrip counts={null} disabled={false} onChange={vi.fn()} value={1} vessels={[vessels[0], other]} />);
    const goury = screen.getByRole('button', { name: 'GOURY' });
    fireEvent.error(goury.querySelector('img')!);
    expect(goury.querySelector('img')).not.toBeInTheDocument();
    expect(within(goury).getByText('GRY')).toBeInTheDocument();
    const unknown = screen.getByRole('button', { name: 'NOUVEAU NAVIRE' });
    expect(unknown.querySelector('img')).not.toBeInTheDocument();
    expect(within(unknown).getByText('NNV')).toBeInTheDocument();
  });
});
