import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningAbsenceRequestDialog } from './PlanningAbsenceRequestDialog';
import { savePlanningAbsence } from './planningP12Queries';
import type { PlanningPerson } from './planningQueries';

vi.mock('./planningP12Queries', () => ({ savePlanningAbsence: vi.fn() }));
const people: PlanningPerson[] = [
  { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
];
function props() {
  return {
    client: {} as SupabaseClient,
    people, currentPerson: people[1], personalOnly: false,
    range: { start: '2026-09-14', end: '2026-09-20' },
    onClose: vi.fn(), onSaved: vi.fn().mockResolvedValue(undefined),
  };
}

describe('dedicated leave request dialog', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(savePlanningAbsence).mockResolvedValue(21); });

  it.each(['admin', 'marin', 'capitaine'])('defaults to the connected %s and sends only the request form', async (role) => {
    const user = userEvent.setup();
    const input = { ...props(), personalOnly: role !== 'admin' };
    render(<PlanningAbsenceRequestDialog {...input} />);
    const dialog = screen.getByRole('dialog', { name: 'Demandes et indisponibilités' });
    const person = within(dialog).getByLabelText('Marin');
    expect(person).toHaveValue('11');
    if (input.personalOnly) {
      expect(person).toBeDisabled();
      expect(within(person).queryByRole('option', { name: /Anne MARTIN/ })).not.toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText('Type')).toHaveValue('leave');
    expect(within(dialog).queryByRole('option', { name: 'Indisponibilité' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Nouvelle demande' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(3);
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(input.onClose).toHaveBeenCalledOnce());
    expect(savePlanningAbsence).toHaveBeenCalledWith(input.client, expect.objectContaining({ personId: 11, absenceType: 'leave', startsAt: '2026-09-14T08:00', endsAt: '2026-09-14T18:00' }));
    expect(input.onSaved).toHaveBeenCalledOnce();
  });

  it('selects a late-loaded profile even when it is absent from the displayed planning', async () => {
    const input = props();
    const { rerender } = render(<PlanningAbsenceRequestDialog {...input} people={[]} currentPerson={null} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    rerender(<PlanningAbsenceRequestDialog {...input} people={[]} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('11');
    expect(screen.getByRole('option', { name: /Paul DURAND/ })).toBeInTheDocument();
  });

  it('preserves an explicit manager selection after a profile refresh', async () => {
    const user = userEvent.setup();
    const input = props();
    const { rerender } = render(<PlanningAbsenceRequestDialog {...input} />);
    await user.selectOptions(screen.getByLabelText('Marin'), '10');
    rerender(<PlanningAbsenceRequestDialog {...input} currentPerson={{ ...input.currentPerson }} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('10');
  });

  it('keeps the request and displays an error if saving fails', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(savePlanningAbsence).mockRejectedValue(new Error('Connexion interrompue'));
    render(<PlanningAbsenceRequestDialog {...input} />);
    await user.type(screen.getByLabelText('Motif'), 'Congés familiaux');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion interrompue');
    expect(screen.getByLabelText('Motif')).toHaveValue('Congés familiaux');
    expect(input.onClose).not.toHaveBeenCalled();
    expect(input.onSaved).not.toHaveBeenCalled();
  });

  it('closes on cancellation without sending a request', async () => {
    const user = userEvent.setup();
    const input = props();
    render(<PlanningAbsenceRequestDialog {...input} />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(input.onClose).toHaveBeenCalledOnce();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
  });
});
