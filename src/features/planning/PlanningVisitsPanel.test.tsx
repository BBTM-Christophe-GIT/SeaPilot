import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanningVisitsPanel } from './PlanningVisitsPanel';
import type { PlanningServiceProvider } from './planningVisitQueries';

const providers: PlanningServiceProvider[] = [{
  id: 28,
  name: 'APAVE',
  category: 'Prestataire',
  serviceType: 'Visite Grue',
  activity: 'Contrôle',
  address: '',
  city: 'Montivilliers',
  phone: '',
  companyEmail: '',
  supplies: '',
  specialties: [{ id: 280, name: 'Visite Grue', active: true }],
  contactName: '',
  contactRole: '',
  contactPhone: '',
  contactEmail: '',
}, {
  id: 8,
  name: 'SERVAUX',
  category: 'Prestataire',
  serviceType: 'Visite Radeaux',
  activity: 'Maintenance',
  address: '',
  city: 'Le Havre',
  phone: '',
  companyEmail: '',
  supplies: '',
  specialties: [{ id: 80, name: 'Visite Radeaux', active: true }],
  contactName: '',
  contactRole: '',
  contactPhone: '',
  contactEmail: '',
}];

describe('PlanningVisitsPanel', () => {
  it('uses the specialty search and project-style fields for a technical stop', async () => {
    const user = userEvent.setup();
    render(<PlanningVisitsPanel
      canDelete
      canEdit
      canManageProviders
      client={{} as never}
      onClose={vi.fn()}
      onSaved={vi.fn().mockResolvedValue(undefined)}
      providers={providers}
      vessel={{ id: 1, name: 'GOURY' } as never}
      visit={null}
    />);

    const dialog = screen.getByRole('dialog', { name: 'Visite ou audit du navire' });
    await user.selectOptions(within(dialog).getByLabelText('Type de visite'), 'technical_stop');
    expect(within(dialog).getByRole('option', { name: 'Arrêt Technique' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Date de début')).toHaveAttribute('type', 'date');
    expect(within(dialog).getByLabelText('Date de fin')).toHaveAttribute('type', 'date');
    expect(within(dialog).queryByText('Date de la ou des visite(s)')).not.toBeInTheDocument();

    const provider = within(dialog).getByLabelText('Prestataire');
    await user.clear(provider);
    await user.type(provider, 'radeaux');
    expect(within(dialog).getByRole('group', { name: 'Visite Radeaux' })).toHaveTextContent('SERVAUX');
    await user.click(within(dialog).getByRole('option', { name: /SERVAUX/ }));
    expect(within(dialog).getByLabelText('Spécialités')).toHaveValue('Visite Radeaux');

    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    const companyDialog = await screen.findByRole('dialog', { name: 'Ajouter une société' });
    const serviceType = within(companyDialog).getByLabelText('Type de service');
    const serviceTypeList = document.getElementById(serviceType.getAttribute('list') || '');
    expect(Array.from(serviceTypeList?.querySelectorAll('option') || []).map((option) => option.value)).toEqual([
      'Visite Grue',
      'Visite Radeaux',
    ]);
  });

  it('keeps the standard visit fields when technical stop is not selected', () => {
    render(<PlanningVisitsPanel
      canDelete
      canEdit
      canManageProviders={false}
      client={{} as never}
      onClose={vi.fn()}
      onSaved={vi.fn().mockResolvedValue(undefined)}
      providers={providers}
      vessel={{ id: 1, name: 'GOURY' } as never}
      visit={null}
    />);

    const dialog = screen.getByRole('dialog', { name: 'Visite ou audit du navire' });
    expect(within(dialog).getByLabelText('Type de visite')).toHaveValue('water_analysis');
    expect(within(dialog).queryByLabelText('Spécialités')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Date de la ou des visite(s)')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Date de début')).not.toBeInTheDocument();
  });

  it('saves the start and end dates of a multi-day technical stop', async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    const onClose = vi.fn();
    render(<PlanningVisitsPanel
      canDelete
      canEdit
      canManageProviders={false}
      client={{ rpc } as never}
      onClose={onClose}
      onSaved={vi.fn().mockResolvedValue(undefined)}
      providers={providers}
      vessel={{ id: 1, name: 'GOURY' } as never}
      visit={null}
    />);

    const dialog = screen.getByRole('dialog', { name: 'Visite ou audit du navire' });
    await user.selectOptions(within(dialog).getByLabelText('Type de visite'), 'technical_stop');
    fireEvent.change(within(dialog).getByLabelText('Date de début'), { target: { value: '2026-08-28' } });
    fireEvent.change(within(dialog).getByLabelText('Date de fin'), { target: { value: '2026-08-31' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(rpc).toHaveBeenCalledWith('save_vessel_visit', expect.objectContaining({
      p_visit_type: 'technical_stop',
      p_scheduled_at: ['2026-08-27T22:00:00.000Z', '2026-08-31T21:59:00.000Z'],
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
