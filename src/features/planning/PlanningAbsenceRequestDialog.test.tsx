import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningAbsenceRequestDialog } from './PlanningAbsenceRequestDialog';
import type { PlanningAbsenceBalanceContext } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import { savePlanningAbsence } from './planningP12Queries';
import type { PlanningPerson } from './planningQueries';

vi.mock('./planningP12Queries', () => ({ savePlanningAbsence: vi.fn() }));
vi.mock('./planningAbsenceBalanceQueries', () => ({ fetchPlanningAbsenceBalanceContext: vi.fn(), savePlanningLeaveCounterPeriod: vi.fn(), savePlanningLeaveRightsPeriod: vi.fn() }));
vi.mock('./planningDates', async (importOriginal) => ({
  ...await importOriginal<typeof import('./planningDates')>(),
  todayPlanningDate: () => '2026-09-10',
}));
const people: PlanningPerson[] = [
  { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
];
function balanceContext(personId: number, staff = false): PlanningAbsenceBalanceContext {
  return {
    kind: staff ? 'leave_rtt' : 'crew', requestBalanceKind: staff ? 'leave_rtt' : 'crew', person: people.find((person) => person.id === personId)!,
    counterPeriods: staff ? [
      { id: 1, counterType: 'leave', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement: 25 },
      { id: 2, counterType: 'rtt', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement: 8 },
    ] : [],
    absences: [], crewCheckpoints: [], crewSources: { assignments: [], periods: [], days: [] },
  };
}
function props() {
  return {
    client: {} as SupabaseClient,
    people, currentPerson: people[1], personalOnly: false,
    range: { start: '2026-09-14', end: '2026-09-20' },
    onClose: vi.fn(), onSaved: vi.fn().mockResolvedValue(undefined),
  };
}

describe('dedicated leave request dialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(savePlanningAbsence).mockResolvedValue(21);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockImplementation(async (_client, personId) => balanceContext(personId));
    vi.mocked(savePlanningLeaveCounterPeriod).mockResolvedValue(undefined);
    vi.mocked(savePlanningLeaveRightsPeriod).mockResolvedValue(undefined);
  });

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
    expect(within(dialog).getByRole('button', { name: /Période/ })).toBeVisible();
    expect(within(dialog).queryByLabelText('Début')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Fin')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('region', { name: 'Soldes et droits' })).not.toBeInTheDocument();
    expect(fetchPlanningAbsenceBalanceContext).not.toHaveBeenCalled();
    rerender(<PlanningAbsenceRequestDialog {...input} people={[]} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('11');
    expect(screen.getByRole('option', { name: /Paul DURAND/ })).toBeInTheDocument();
    await waitFor(() => expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledWith(input.client, 11));
  });

  it('preserves an explicit manager selection after a profile refresh', async () => {
    const user = userEvent.setup();
    const input = props();
    const { rerender } = render(<PlanningAbsenceRequestDialog {...input} />);
    await user.selectOptions(screen.getByLabelText('Marin'), '10');
    rerender(<PlanningAbsenceRequestDialog {...input} currentPerson={{ ...input.currentPerson }} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('10');
  });

  it('offers only people employed today even when a historical planning is open', () => {
    const input = props();
    render(<PlanningAbsenceRequestDialog {...input} range={{ start: '2025-01-01', end: '2025-01-31' }} people={[
      ...people,
      { ...people[0], id: 12, firstName: 'Ancien', departedOn: '2026-09-09' },
      { ...people[0], id: 13, firstName: 'Départ aujourd’hui', departedOn: '2026-09-10' },
      { ...people[0], id: 14, firstName: 'Inactif', active: false },
      { ...people[0], id: 15, firstName: 'Future embauche', hiredOn: '2026-09-11' },
      { ...people[0], id: 16, firstName: 'Encore en poste', hiredOn: '2026-09-10', departedOn: '2026-09-11' },
    ]} />);
    const select = screen.getByLabelText('Marin');
    expect(within(select).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['', '10', '11', '16']);
    expect(select).toHaveValue('11');
  });

  it.each(['admin', 'marin', 'capitaine'])('does not reinsert a departed connected %s from the profile fallback', async (role) => {
    const input = props();
    const departed = { ...input.currentPerson, departedOn: '2026-09-09' };
    const { rerender } = render(<PlanningAbsenceRequestDialog {...input} currentPerson={departed} people={[]} personalOnly={role !== 'admin'} />);
    expect(screen.queryByRole('option', { name: /Paul DURAND/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Marin')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    // A stale profile summary must not bypass the fresher Planning employment dates.
    rerender(<PlanningAbsenceRequestDialog {...input} people={[people[0], departed]} personalOnly={role !== 'admin'} />);
    expect(screen.queryByRole('option', { name: /Paul DURAND/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
  });

  it('clears a selection that is no longer employed after a people refresh', async () => {
    const user = userEvent.setup();
    const input = props();
    const { rerender } = render(<PlanningAbsenceRequestDialog {...input} />);
    await user.selectOptions(screen.getByLabelText('Marin'), '10');
    rerender(<PlanningAbsenceRequestDialog {...input} people={[{ ...people[0], departedOn: '2026-09-09' }, people[1]]} />);
    expect(screen.getByLabelText('Marin')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(savePlanningAbsence).not.toHaveBeenCalled();
  });

  it('keeps the request and displays an error if saving fails', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(savePlanningAbsence).mockRejectedValue(new Error('Connexion interrompue'));
    render(<PlanningAbsenceRequestDialog {...input} />);
    // AppDialog focuses its close button on the next animation frame. Wait
    // for that mount effect before typing so it cannot steal the test's focus.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus());
    await user.type(screen.getByLabelText('Motif'), 'Congés familiaux');
    expect(screen.getByLabelText('Motif')).toHaveValue('Congés familiaux');
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

  it('shows both balances and sends a RTT request for the selected person', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(balanceContext(11, true));
    render(<PlanningAbsenceRequestDialog {...input} />);
    await screen.findByLabelText('Compteur Congés');
    await user.selectOptions(screen.getByLabelText('Type'), 'rtt');
    const rtt = screen.getByLabelText('Compteur RTT');
    const remaining = within(rtt).getByText('Après validation', { selector: 'dt' }).nextElementSibling;
    expect(remaining).toHaveTextContent('7 j');
    expect(screen.queryByRole('button', { name: /les droits/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(input.onClose).toHaveBeenCalledOnce());
    expect(savePlanningAbsence).toHaveBeenCalledWith(input.client, expect.objectContaining({ personId: 11, absenceType: 'rtt' }));
  });

  it('edits rights without sending or dismissing the absence request and reloads the saved balance', async () => {
    const user = userEvent.setup();
    const input = props();
    const context = balanceContext(11, true);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(context);
    render(<PlanningAbsenceRequestDialog {...input} canManageBalances />);
    await user.click(await screen.findByRole('button', { name: 'Périodes de Droits Congés' }));
    const editor = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    const request = screen.getByRole('dialog', { name: 'Demandes et indisponibilités' });
    expect(editor.closest('form')).toBeNull();
    expect(editor.querySelector('form')).not.toBeNull();
    expect(request).not.toContainElement(editor);
    expect(request.querySelector('form')).toBeNull();
    expect(within(editor).getByLabelText('Collaborateur')).toHaveValue('11');
    expect(within(editor).getByLabelText('Début de période')).toHaveValue('2026-06-01');
    expect(within(editor).getByLabelText('Fin de période')).toHaveValue('2027-05-31');
    expect(within(editor).getByLabelText('Début de période')).toHaveAttribute('readonly');
    expect(within(editor).getByLabelText('Fin de période')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    expect(screen.getByLabelText('Marin')).toBeDisabled();
    expect(within(request).getByRole('button', { name: 'Fermer' })).toBeDisabled();
    const amount = within(editor).getByLabelText('Total RTT (jours)');
    await user.clear(amount);
    await user.type(amount, '12');
    fireEvent.submit(request);
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue({ ...context, counterPeriods: context.counterPeriods.map((period) => period.counterType === 'rtt' ? { ...period, entitlement: 12 } : period) });
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer les droits' }));
    await waitFor(() => expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledExactlyOnceWith(input.client, { personId: 11, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 25, rttEntitlement: 12 }));
    await waitFor(() => expect(within(screen.getByLabelText('Compteur RTT')).getByText('Droits', { selector: 'dt' }).nextElementSibling).toHaveTextContent('12 j'));
    expect(editor).toBeVisible();
    expect(within(editor).getByRole('status')).toHaveTextContent(/Droits enregistrés/);
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledTimes(2);
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(input.onClose).not.toHaveBeenCalled();
    expect(input.onSaved).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeEnabled();
    expect(input.onClose).not.toHaveBeenCalled();
  });

  it('keeps failed rights edits visible and Escape cancels only the rights editor', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(balanceContext(11, true));
    vi.mocked(savePlanningLeaveRightsPeriod).mockRejectedValue(new Error('Droits non enregistrés'));
    render(<PlanningAbsenceRequestDialog {...input} canManageBalances />);
    await user.click(await screen.findByRole('button', { name: 'Périodes de Droits Congés' }));
    const editor = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    const amount = within(editor).getByLabelText('Total Congés (jours)');
    await user.clear(amount);
    await user.type(amount, '30');
    await user.click(within(editor).getByRole('button', { name: 'Enregistrer les droits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Droits non enregistrés');
    expect(amount).toHaveValue('30');
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    await user.click(amount);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeEnabled();
    expect(input.onClose).not.toHaveBeenCalled();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
  });

  it('keeps another crew collaborator read-only in the rights window while preserving the request', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockImplementation(async (_client, personId) => balanceContext(personId, personId === 11));
    render(<PlanningAbsenceRequestDialog {...input} canManageBalances />);
    const request = screen.getByRole('dialog', { name: 'Demandes et indisponibilités' });
    await waitFor(() => expect(within(request).getByRole('button', { name: 'Fermer' })).toHaveFocus());
    await user.type(within(request).getByLabelText('Motif'), 'Demande à conserver');
    await user.click(await screen.findByRole('button', { name: 'Périodes de Droits Congés' }));
    const editor = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    await user.selectOptions(within(editor).getByLabelText('Collaborateur'), '10');
    await waitFor(() => expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledWith(input.client, 10));
    expect(await within(editor).findByText(/Les droits annuels ne s’appliquent pas/)).toBeVisible();
    expect(within(editor).getByText('Solde de Congés/Repos au 10/09/2026')).toBeVisible();
    expect(within(editor).queryByLabelText('Total Congés (jours)')).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText('Total RTT (jours)')).not.toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: 'Enregistrer les droits' })).not.toBeInTheDocument();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(within(request).getByLabelText('Marin')).toHaveValue('11');
    expect(within(request).getByLabelText('Motif')).toHaveValue('Demande à conserver');
    expect(within(screen.getByLabelText('Compteur RTT')).getByText('Droits', { selector: 'dt' }).nextElementSibling).toHaveTextContent('8 j');
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(input.onSaved).not.toHaveBeenCalled();
    expect(input.onClose).not.toHaveBeenCalled();
    await user.click(within(editor).getByRole('button', { name: 'Fermer la fenêtre' }));
    await user.click(within(request).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(savePlanningAbsence).toHaveBeenCalledExactlyOnceWith(input.client, expect.objectContaining({ personId: 11, reason: 'Demande à conserver' })));
  });

  it('prevents starting a rights edit while the absence request is saving', async () => {
    const user = userEvent.setup();
    const input = props();
    let finishSave!: (id: number) => void;
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(balanceContext(11, true));
    vi.mocked(savePlanningAbsence).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    render(<PlanningAbsenceRequestDialog {...input} canManageBalances />);
    await screen.findByRole('button', { name: 'Périodes de Droits Congés' });
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    finishSave(21);
    await waitFor(() => expect(input.onClose).toHaveBeenCalledOnce());
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
  });

  it('applies a calendar range, updates the counter projection and sends the chosen dates only on submission', async () => {
    const user = userEvent.setup();
    const input = props();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(balanceContext(11, true));
    render(<PlanningAbsenceRequestDialog {...input} canManageBalances />);
    await screen.findByLabelText('Compteur Congés');
    await user.click(screen.getByRole('button', { name: /^Période :/ }));
    const calendar = screen.getByRole('dialog', { name: 'Choisir la période' });
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    await user.click(within(calendar).getByRole('button', { name: 'lundi 14 septembre 2026' }));
    await user.click(within(calendar).getByRole('button', { name: 'vendredi 18 septembre 2026' }));
    fireEvent.submit(screen.getByRole('dialog', { name: 'Demandes et indisponibilités' }));
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    await user.click(within(calendar).getByRole('button', { name: 'Appliquer' }));
    expect(screen.getByRole('button', { name: /^Période :/ })).toHaveTextContent('Du 14 au 18 septembre 2026');
    expect(within(screen.getByLabelText('Compteur Congés')).getByText('Après validation', { selector: 'dt' }).nextElementSibling).toHaveTextContent('20 j');
    expect(input.onClose).not.toHaveBeenCalled();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(savePlanningAbsence).toHaveBeenCalledExactlyOnceWith(input.client, expect.objectContaining({ startsAt: '2026-09-14T08:00', endsAt: '2026-09-18T18:00' })));
  });

  it('Escape discards the calendar draft without closing or submitting the request', async () => {
    const user = userEvent.setup();
    const input = props();
    render(<PlanningAbsenceRequestDialog {...input} />);
    const trigger = screen.getByRole('button', { name: /^Période :/ });
    await user.click(trigger);
    await user.click(within(screen.getByRole('dialog', { name: 'Choisir la période' })).getByRole('button', { name: 'vendredi 18 septembre 2026' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choisir la période' })).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('14 septembre 2026');
    expect(trigger).toHaveFocus();
    expect(input.onClose).not.toHaveBeenCalled();
    expect(savePlanningAbsence).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Envoyer la demande' })).toBeEnabled();
  });
});
