import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmploymentPeriodsPanel } from './EmploymentPeriodsPanel';
import { mapPersonRows } from './peopleQueries';

const row = { id: 1, first_name: 'Jean', last_name: 'MARTIN', hired_on: '2024-01-01', departed_on: '2025-03-01', contract_type: 'CDI', departure_reason: 'Démission' };

describe('employment history editor', () => {
  it('saves a rehire while keeping the original period', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const single = vi.fn().mockResolvedValue({ data: { ...row, hired_on: '2026-04-01', departed_on: null, employment_periods: [
      { hiredOn: '2024-01-01', departedOn: '2025-03-01', contractType: 'CDI', departureReason: 'Démission' },
      { hiredOn: '2026-04-01', departedOn: '', contractType: 'CDI', departureReason: '' },
    ] }, error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
    const client = { from: vi.fn().mockReturnValue({ update }) };
    render(<EmploymentPeriodsPanel client={client as never} person={mapPersonRows([row as never])[0]} canEdit onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Gérer les périodes' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une réembauche' }));
    await user.type(screen.getByLabelText('Embauche · période 2'), '2026-04-01');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les périodes' }));
    expect(update).toHaveBeenCalledWith({ active: true, employment_periods: [
      { hiredOn: '2024-01-01', departedOn: '2025-03-01', contractType: 'CDI', departureReason: 'Démission' },
      { hiredOn: '2026-04-01', departedOn: '', contractType: 'CDI', departureReason: '' },
    ] });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ employmentPeriods: expect.any(Array) }));
    expect(await screen.findByRole('status')).toHaveTextContent('indicateurs RH sont recalculés');
  });

  it('does not expose employment editing to a read-only profile', () => {
    render(<EmploymentPeriodsPanel client={{} as never} person={mapPersonRows([row as never])[0]} canEdit={false} onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Gérer les périodes' })).not.toBeInTheDocument();
    expect(screen.getByText('01/01/2024 → 01/03/2025')).toBeInTheDocument();
  });
});
