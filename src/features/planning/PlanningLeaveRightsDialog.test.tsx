import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningLeaveRightsDialog } from './PlanningLeaveRightsDialog';
import type { PlanningAbsenceBalanceContext } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import type { PlanningPerson } from './planningQueries';

vi.mock('./planningAbsenceBalanceQueries', () => ({
  fetchPlanningAbsenceBalanceContext: vi.fn(),
  savePlanningLeaveCounterPeriod: vi.fn(),
  savePlanningLeaveRightsPeriod: vi.fn(),
}));

const client = {} as SupabaseClient;
const christophe: PlanningPerson = {
  id: 10, firstName: 'Christophe', lastName: 'MINASSIAN', functionLabel: 'Direction', gradeLabel: '', roleLabel: '',
  contractType: 'CDI', hiredOn: '2020-01-01', departedOn: '', active: true,
};
const sophie: PlanningPerson = { ...christophe, id: 11, firstName: 'Sophie', lastName: 'HAMEL', functionLabel: 'Gestionnaire' };
const crew: PlanningPerson = { ...christophe, id: 20, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot' };

function context(person = christophe, leave = 25, rtt = 8): PlanningAbsenceBalanceContext {
  return {
    kind: 'leave_rtt', person,
    counterPeriods: [
      { id: 1, counterType: 'leave', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement: leave },
      { id: 2, counterType: 'rtt', startsOn: '2026-06-01', endsOn: '2027-05-31', entitlement: rtt },
    ],
    absences: [], crewCheckpoints: [], crewSources: { assignments: [], periods: [], days: [] },
  };
}

function props(initialContext = context()) {
  return { client, initialContext, people: [christophe, sophie, crew], anchor: '2026-10-02', onClose: vi.fn(), onSaved: vi.fn() };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe('annual leave rights management window', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(context());
    vi.mocked(savePlanningLeaveCounterPeriod).mockResolvedValue(undefined);
    vi.mocked(savePlanningLeaveRightsPeriod).mockResolvedValue(undefined);
  });

  it('creates a June-to-May period for a selected start year and saves both totals together', async () => {
    const input = props();
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...input} />);
    const dialog = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    await user.selectOptions(within(dialog).getByLabelText('Période de droits'), 'new');
    fireEvent.change(within(dialog).getByLabelText('Année de début'), { target: { value: '2027' } });
    expect(within(dialog).getByLabelText('Début de période')).toHaveValue('2027-06-01');
    expect(within(dialog).getByLabelText('Fin de période')).toHaveValue('2028-05-31');
    expect(within(dialog).getByLabelText('Début de période')).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Fin de période')).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Total Congés (jours)')).toHaveValue('');
    expect(within(dialog).getByLabelText('Total RTT (jours)')).toHaveValue('');
    await user.type(within(dialog).getByLabelText('Total Congés (jours)'), '30,5');
    await user.type(within(dialog).getByLabelText('Total RTT (jours)'), '0');
    const updated = { ...context(), counterPeriods: context().counterPeriods.map((period) => ({ ...period, startsOn: '2027-06-01', endsOn: '2028-05-31', entitlement: period.counterType === 'leave' ? 30.5 : 0 })) };
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(updated);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer les droits' }));
    await waitFor(() => expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledExactlyOnceWith(client, {
      personId: christophe.id, startsOn: '2027-06-01', endsOn: '2028-05-31', leaveEntitlement: 30.5, rttEntitlement: 0,
    }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/Droits enregistrés/);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledExactlyOnceWith(client, christophe.id);
    expect(input.onSaved).toHaveBeenCalledExactlyOnceWith(updated);
    expect(input.onClose).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
  });

  it('adjusts legacy Congés and RTT independently while preserving the original period dates', async () => {
    const legacy = { ...context(), counterPeriods: context().counterPeriods.map((period) => ({ ...period, startsOn: '2026-01-01', endsOn: '2026-12-31' })) };
    const input = props(legacy);
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...input} />);
    await user.selectOptions(screen.getByLabelText('Période de droits'), '2026-01-01:2026-12-31');
    expect(screen.getByLabelText('Début de période')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('Fin de période')).toHaveValue('2026-12-31');
    expect(screen.queryByRole('button', { name: 'Enregistrer les droits' })).not.toBeInTheDocument();
    const updated = { ...legacy, counterPeriods: legacy.counterPeriods.map((period) => period.counterType === 'leave' ? { ...period, entitlement: 30 } : period) };
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(updated);
    await user.clear(screen.getByLabelText('Total Congés (jours)'));
    await user.type(screen.getByLabelText('Total Congés (jours)'), '30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les droits Congés' }));
    await screen.findByRole('status');
    expect(savePlanningLeaveCounterPeriod).toHaveBeenNthCalledWith(1, client, { personId: christophe.id, counterType: 'leave', startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: 30 });
    expect(screen.getByLabelText('Total RTT (jours)')).toHaveValue('8');
    await user.clear(screen.getByLabelText('Total RTT (jours)'));
    await user.type(screen.getByLabelText('Total RTT (jours)'), '9.5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les droits RTT' }));
    await waitFor(() => expect(savePlanningLeaveCounterPeriod).toHaveBeenNthCalledWith(2, client, { personId: christophe.id, counterType: 'rtt', startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: 9.5 }));
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(input.onClose).not.toHaveBeenCalled();
  });

  it.each(['-1', '2,555', 'abc'])('preserves invalid total %s and makes no rights write', async (amount) => {
    const input = props();
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...input} />);
    const leave = screen.getByLabelText('Total Congés (jours)');
    await user.clear(leave);
    await user.type(leave, amount);
    await user.click(screen.getByRole('button', { name: 'Enregistrer les droits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/positifs ou nuls.*deux décimales/);
    expect(leave).toHaveValue(amount);
    expect(screen.getByLabelText('Total RTT (jours)')).toHaveValue('8');
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(input.onSaved).not.toHaveBeenCalled();
    expect(input.onClose).not.toHaveBeenCalled();
  });

  it('discards a delayed response from the previous collaborator instead of exposing their rights', async () => {
    const previous = deferred<PlanningAbsenceBalanceContext>();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockReturnValueOnce(previous.promise).mockResolvedValueOnce(context(sophie, 40, 12));
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...props()} />);
    await user.selectOptions(screen.getByLabelText('Collaborateur'), String(crew.id));
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des droits');
    expect(screen.queryByLabelText('Total Congés (jours)')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Collaborateur'), String(sophie.id));
    expect(await screen.findByLabelText('Total Congés (jours)')).toHaveValue('40');
    expect(screen.getByLabelText('Total RTT (jours)')).toHaveValue('12');
    await act(async () => { previous.resolve(context(crew, 100, 20)); });
    expect(screen.getByLabelText('Collaborateur')).toHaveValue(String(sophie.id));
    expect(screen.getByLabelText('Total Congés (jours)')).toHaveValue('40');
    expect(screen.getByLabelText('Total RTT (jours)')).toHaveValue('12');
  });

  it('recovers a failed balance refresh after saved rights without repeating the write', async () => {
    const updated = context(christophe, 30, 8);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockRejectedValueOnce(new Error('Actualisation interrompue')).mockResolvedValueOnce(updated);
    const input = props();
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...input} />);
    await user.clear(screen.getByLabelText('Total Congés (jours)'));
    await user.type(screen.getByLabelText('Total Congés (jours)'), '30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les droits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Droits enregistrés, mais les soldes n’ont pas pu être actualisés.');
    expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledExactlyOnceWith(client, {
      personId: christophe.id, startsOn: '2026-06-01', endsOn: '2027-05-31', leaveEntitlement: 30, rttEntitlement: 8,
    });
    expect(screen.getByLabelText('Total Congés (jours)')).toHaveValue('30');
    expect(screen.getByLabelText('Total Congés (jours)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer les droits' })).toBeDisabled();
    expect(screen.getByLabelText('Collaborateur')).toBeDisabled();
    expect(input.onSaved).not.toHaveBeenCalled();
    expect(input.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Actualiser les soldes' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Droits enregistrés/);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Collaborateur')).toBeEnabled();
    expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledOnce();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(input.onSaved).toHaveBeenCalledExactlyOnceWith(updated);
    expect(input.onClose).not.toHaveBeenCalled();
  });

  it('blocks collaborator changes and dismissal while saving, then keeps the confirmed rights visible', async () => {
    const pending = deferred<void>();
    vi.mocked(savePlanningLeaveRightsPeriod).mockReturnValue(pending.promise);
    const input = props();
    const user = userEvent.setup();
    render(<PlanningLeaveRightsDialog {...input} />);
    await user.click(screen.getByRole('button', { name: 'Enregistrer les droits' }));
    expect(screen.getByLabelText('Collaborateur')).toBeDisabled();
    expect(screen.getByLabelText('Période de droits')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(input.onClose).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(); });
    expect(await screen.findByRole('status')).toHaveTextContent(/Droits enregistrés/);
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).toBeEnabled();
    expect(input.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(input.onClose).toHaveBeenCalledOnce();
  });
});
