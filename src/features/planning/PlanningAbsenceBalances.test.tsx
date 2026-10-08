import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type ComponentProps } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import type { RoleKey } from '../permissions/roles';
import { fetchCurrentPersonSummary, fetchCurrentUserRoles } from '../profiles/profileQueries';
import { PlanningAbsenceBalances } from './PlanningAbsenceBalances';
import type { PlanningAbsenceBalanceContext, PlanningLeaveCounterPeriod } from './planningAbsenceBalance';
import { fetchPlanningAbsenceBalanceContext, savePlanningLeaveCounterPeriod, savePlanningLeaveRightsPeriod } from './planningAbsenceBalanceQueries';
import { planningDateFromTimestamp, planningLocalDateTimeToUtc } from './planningDates';
import type { PlanningAbsenceRecord } from './planningP12';
import { getPlanningPermissions } from './planningPermissions';
import type { PlanningPerson } from './planningQueries';

vi.mock('./planningAbsenceBalanceQueries', () => ({
  fetchPlanningAbsenceBalanceContext: vi.fn(),
  savePlanningLeaveCounterPeriod: vi.fn(),
  savePlanningLeaveRightsPeriod: vi.fn(),
}));

const NOW = '2026-10-01T10:00:00.000Z';
const christophe: PlanningPerson = {
  id: 10, firstName: 'Christophe', lastName: 'MINASSIAN', functionLabel: 'Direction', gradeLabel: '', roleLabel: '',
  contractType: 'CDI', hiredOn: '2020-01-01', departedOn: '', active: true,
};
const sophie: PlanningPerson = { ...christophe, id: 11, firstName: 'Sophie', lastName: 'HAMEL', functionLabel: 'Gestionnaire' };
const crew: PlanningPerson = { ...christophe, id: 20, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot' };
type BalanceProps = ComponentProps<typeof PlanningAbsenceBalances>;

function counter(counterType: 'leave' | 'rtt', overrides: Partial<PlanningLeaveCounterPeriod> = {}): PlanningLeaveCounterPeriod {
  return { id: counterType === 'leave' ? 1 : 2, counterType, startsOn: '2026-01-01', endsOn: '2026-12-31', entitlement: counterType === 'leave' ? 25 : 8, ...overrides };
}

function absence(id: number, absenceType: PlanningAbsenceRecord['absenceType'], status: PlanningAbsenceRecord['status'], startsAt: string, endsAt: string, personId = christophe.id): PlanningAbsenceRecord {
  const start = planningLocalDateTimeToUtc(startsAt);
  const end = planningLocalDateTimeToUtc(endsAt);
  return { id, personId, absenceType, status, startsAt: start, endsAt: end, startsOn: planningDateFromTimestamp(start),
    endsOn: planningDateFromTimestamp(new Date(Date.parse(end) - 1).toISOString()), reason: '', requestedBy: '', reviewedBy: '', reviewedAt: '', reviewComment: '', createdAt: '', updatedAt: '' };
}

function staffContext(person = christophe, overrides: Partial<PlanningAbsenceBalanceContext> = {}): PlanningAbsenceBalanceContext {
  return {
    kind: 'leave_rtt', requestBalanceKind: 'leave_rtt', person, counterPeriods: [counter('leave'), counter('rtt')],
    absences: [
      // May 1 and 8 are public holidays; May 2/3 and 9/10 are weekends. Five working days remain.
      absence(1, 'leave', 'approved', '2026-05-01T00:00', '2026-05-12T00:00', person.id),
      // Only May 12 remains pending after excluding dates already approved.
      absence(2, 'leave', 'requested', '2026-05-05T00:00', '2026-05-13T00:00', person.id),
      absence(3, 'rtt', 'approved', '2026-05-26T00:00', '2026-05-28T00:00', person.id),
      absence(4, 'rtt', 'requested', '2026-05-29T00:00', '2026-06-02T00:00', person.id),
      absence(5, 'leave', 'rejected', '2026-05-19T00:00', '2026-05-21T00:00', person.id),
      absence(6, 'leave', 'cancelled', '2026-05-20T00:00', '2026-05-22T00:00', person.id),
    ],
    crewCheckpoints: [], crewSources: { assignments: [], periods: [], days: [] }, ...overrides,
  };
}

function crewContext(person = crew): PlanningAbsenceBalanceContext {
  return { kind: 'crew', requestBalanceKind: 'crew', person, counterPeriods: [], absences: [],
    crewCheckpoints: [{ personId: person.id, asOf: '2026-09-30', balance: 10 }],
    crewSources: { periods: [], days: [], assignments: [{ id: 1, crewPersonId: person.id, crewName: 'Paul DURAND',
      startsOn: '2026-10-01', endsOn: '2026-10-01', statusLabel: 'En Mer', vesselId: 2, vesselName: 'LE ROZEL',
      captainPersonId: null, captainName: '', assignmentRole: 'Matelot', confirmationStatus: 'confirmed', watchGroup: 'Bordée 1', comments: '', sourceLabel: 'seapilot' }] },
  };
}

function props(overrides: Partial<BalanceProps> = {}): BalanceProps {
  return { client: {} as SupabaseClient, personId: christophe.id, absenceType: 'leave', startsAt: '2026-05-13T08:00', endsAt: '2026-05-19T00:00', ...overrides };
}

function card(name: 'Congés' | 'RTT') { return screen.getByLabelText(`Compteur ${name}`); }
function metricValue(element: HTMLElement, label: string) {
  const term = within(element).getByText(label, { selector: 'dt' });
  const value = term.nextElementSibling;
  if (!value) throw new Error(`Missing value for ${label}`);
  return value as HTMLElement;
}
function metricNumber(element: HTMLElement, label: string): number {
  const text = metricValue(element, label).textContent || '';
  const number = text.replace(/[\u00a0\u202f]/g, ' ').match(/[-−]?\d+(?:[,.]\d+)?/);
  if (!number) throw new Error(`Missing numeric value for ${label}: ${text}`);
  return Number(number[0].replace(',', '.').replace('−', '-'));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

// The protected fixture restores a separate real account and loads its own
// user_roles and people records. No role override or administrator view simulation.
function profileClient(role: RoleKey, person: PlanningPerson) {
  const user = { id: `${role}-absence-balance-fixture`, email: `${role}@example.test` };
  const personFilter = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ error: null, data: {
    id: person.id, first_name: person.firstName, last_name: person.lastName, function_label: person.functionLabel,
    grade_label: person.gradeLabel, active: person.active, hired_on: person.hiredOn, departed_on: person.departedOn,
  } }) });
  const client = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  }, from: vi.fn((table: string) => {
    if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
    if (table === 'people') return { select: vi.fn().mockReturnValue({ eq: personFilter }) };
    throw new Error(`Unexpected authenticated profile fixture table: ${table}`);
  }) };
  return { client: client as unknown as SupabaseClient, user, personFilter };
}

function AuthenticatedBalances({ client }: { client: SupabaseClient }) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<{ personId: number; roles: RoleKey[] } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([fetchCurrentUserRoles(client), fetchCurrentPersonSummary(client)]).then(([roles, person]) => {
      if (active && person) setProfile({ roles, personId: person.id });
    });
    return () => { active = false; };
  }, [client, session?.user.id]);
  return profile ? <PlanningAbsenceBalances {...props({ client, personId: profile.personId, canManage: getPlanningPermissions(profile.roles).canReviewAbsences })} /> : <p>Chargement du profil…</p>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(staffContext());
  vi.mocked(savePlanningLeaveCounterPeriod).mockResolvedValue(undefined);
  vi.mocked(savePlanningLeaveRightsPeriod).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe('absence balances in the request form', () => {
  it('does not load or display balances before a person is selected', () => {
    render(<PlanningAbsenceBalances {...props({ personId: null })} />);
    expect(screen.queryByRole('region', { name: 'Soldes et droits' })).not.toBeInTheDocument();
    expect(fetchPlanningAbsenceBalanceContext).not.toHaveBeenCalled();
  });

  it.each([christophe, sophie])('shows independent working-day Congés and RTT counters for $firstName $lastName', async (person) => {
    const context = staffContext(person);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(context);
    const input = props({ personId: person.id });
    render(<PlanningAbsenceBalances {...input} />);
    expect(screen.getByText('Chargement des soldes…')).toBeVisible();
    await screen.findByLabelText('Compteur Congés');
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toBeVisible();
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledWith(input.client, person.id);
    expect(metricNumber(card('Congés'), 'Droits')).toBe(25);
    expect(metricNumber(card('Congés'), 'Jours validés')).toBe(5);
    expect(metricNumber(card('Congés'), 'En attente')).toBe(1);
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(20);
    expect(within(card('Congés')).getByRole('meter', { name: 'Solde disponible Congés' })).toHaveAttribute('aria-valuenow', '20');
    expect(within(card('Congés')).getByRole('meter', { name: 'Solde disponible Congés' })).toHaveAttribute('aria-valuemax', '25');
    // Ascension on May 14 and the weekend do not consume rights.
    expect(metricNumber(card('Congés'), 'Cette demande')).toBe(3);
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(17);
    expect(metricNumber(card('RTT'), 'Droits')).toBe(8);
    expect(metricNumber(card('RTT'), 'Jours validés')).toBe(2);
    expect(metricNumber(card('RTT'), 'En attente')).toBe(2);
    expect(metricNumber(card('RTT'), 'Solde disponible')).toBe(6);
    expect(screen.queryByRole('button', { name: /les droits/ })).not.toBeInTheDocument();
  });

  it('recalculates the selected counter when the request changes to RTT without reloading its context', async () => {
    const input = props();
    const { rerender } = render(<PlanningAbsenceBalances {...input} />);
    await screen.findByLabelText('Compteur Congés');
    rerender(<PlanningAbsenceBalances {...input} absenceType="rtt" startsAt="2026-05-28T08:00" endsAt="2026-06-02T00:00" />);
    expect(metricNumber(card('RTT'), 'Cette demande')).toBe(3);
    expect(metricNumber(card('RTT'), 'Après validation')).toBe(3);
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(20);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledOnce();
  });

  it('distinguishes initialized zero rights from an uninitialized counter', async () => {
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(staffContext(christophe, { counterPeriods: [counter('leave', { entitlement: 0 })], absences: [] }));
    render(<PlanningAbsenceBalances {...props({ canManage: true })} />);
    await screen.findByLabelText('Compteur Congés');
    expect(metricNumber(card('Congés'), 'Droits')).toBe(0);
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(0);
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(-3);
    expect(screen.getByRole('button', { name: 'Périodes de Droits Congés' })).toBeVisible();
    expect(within(card('Congés')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card('RTT')).queryByRole('button')).not.toBeInTheDocument();
    expect(metricValue(card('RTT'), 'Droits')).not.toHaveTextContent(/\d/);
    expect(metricValue(card('RTT'), 'Solde disponible')).not.toHaveTextContent(/\d/);
    const zero = within(card('Congés')).getByRole('meter', { name: 'Solde disponible Congés' });
    expect(zero).toHaveAttribute('aria-valuenow', '0');
    expect(zero).toHaveAttribute('aria-valuemax', '0');
    expect(zero).toHaveAttribute('aria-valuetext', '0 j disponibles sur 0 j');
    const uninitialized = within(card('RTT')).getByRole('status', { name: 'Solde disponible RTT' });
    expect(uninitialized).toHaveTextContent('À initialiser');
    expect(uninitialized).not.toHaveAttribute('aria-valuenow');
  });

  it('keeps an overdrawn balance and projection negative in both the circular gauge and the accessible metrics', async () => {
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(staffContext(christophe, { counterPeriods: [counter('leave', { entitlement: 3 }), counter('rtt')] }));
    render(<PlanningAbsenceBalances {...props()} />);
    await screen.findByLabelText('Compteur Congés');
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(-2);
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(-5);
    const gauge = within(card('Congés')).getByRole('meter', { name: 'Solde disponible Congés' });
    expect(gauge).toHaveAttribute('aria-valuenow', '-2');
    expect(gauge).toHaveAttribute('aria-valuemin', '-2');
    expect(gauge).toHaveAttribute('aria-valuemax', '3');
    expect(gauge).toHaveAttribute('aria-valuetext', '-2 j disponibles sur 3 j');
    expect(gauge).toHaveAttribute('aria-live', 'polite');
  });

  it('splits a request across two entitlement periods and does not consume the New Year holiday', async () => {
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(staffContext(christophe, {
      counterPeriods: [counter('leave', { entitlement: 10 }), counter('leave', { id: 3, startsOn: '2027-01-01', endsOn: '2027-12-31', entitlement: 12 }), counter('rtt')],
      absences: [absence(1, 'leave', 'approved', '2026-12-29T08:00', '2026-12-29T18:00'), absence(2, 'leave', 'approved', '2027-01-06T08:00', '2027-01-06T18:00')],
    }));
    render(<PlanningAbsenceBalances {...props({ startsAt: '2026-12-30T08:00', endsAt: '2027-01-05T18:00' })} />);
    const counters = await screen.findAllByLabelText(/^Compteur Congés/);
    expect(counters).toHaveLength(2);
    const firstPeriod = counters.find((element) => metricNumber(element, 'Droits') === 10)!;
    const nextPeriod = counters.find((element) => metricNumber(element, 'Droits') === 12)!;
    expect(metricNumber(firstPeriod, 'Jours validés')).toBe(1);
    expect(metricNumber(firstPeriod, 'Cette demande')).toBe(2);
    expect(metricNumber(firstPeriod, 'Après validation')).toBe(7);
    expect(metricNumber(nextPeriod, 'Jours validés')).toBe(1);
    expect(metricNumber(nextPeriod, 'Cette demande')).toBe(2);
    expect(metricNumber(nextPeriod, 'Après validation')).toBe(9);
  });

  it('excludes the absence being edited instead of charging the same approved days twice', async () => {
    const context = staffContext();
    context.absences.push(absence(41, 'leave', 'approved', '2026-05-13T08:00', '2026-05-19T00:00'));
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(context);
    render(<PlanningAbsenceBalances {...props({ absenceId: 41, endsAt: '2026-05-16T00:00' })} />);
    await screen.findByLabelText('Compteur Congés');
    expect(metricNumber(card('Congés'), 'Jours validés')).toBe(5);
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(20);
    expect(metricNumber(card('Congés'), 'Cette demande')).toBe(2);
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(18);
  });

  it.each(['marin', 'capitaine'] as const)('loads the own crew balance through the authenticated %s account with read-only permissions', async (role) => {
    const person = { ...crew, id: role === 'marin' ? 20 : 21, functionLabel: role === 'marin' ? 'Matelot' : 'Capitaine' };
    const fixture = profileClient(role, person);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue(crewContext(person));
    render(<AuthProvider client={fixture.client}><MemoryRouter initialEntries={['/absence']}><Routes>
      <Route element={<RequireAuth />}><Route path="absence" element={<AuthenticatedBalances client={fixture.client} />} /></Route>
    </Routes></MemoryRouter></AuthProvider>);
    expect(await screen.findByText('Au 01/10/2026')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Solde de Congés/Repos' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toHaveTextContent('11,05');
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toHaveTextContent('En Mer');
    expect(fixture.personFilter).toHaveBeenCalledWith('user_id', fixture.user.id);
    expect(fixture.client.from).toHaveBeenCalledWith('user_roles');
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledExactlyOnceWith(fixture.client, person.id);
    expect(screen.queryByLabelText('Compteur Congés')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Compteur RTT')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /les droits/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
  });

  it.each(['marin', 'capitaine'] as const)('keeps the crew calculation for the authenticated %s even with legacy annual periods', async (role) => {
    const person = { ...crew, id: role === 'marin' ? 20 : 21, functionLabel: role === 'marin' ? 'Matelot' : 'Capitaine' };
    const fixture = profileClient(role, person);
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue({ ...crewContext(person), kind: 'leave_rtt', counterPeriods: [counter('leave'), counter('rtt')] });
    render(<AuthProvider client={fixture.client}><MemoryRouter initialEntries={['/absence']}><Routes>
      <Route element={<RequireAuth />}><Route path="absence" element={<AuthenticatedBalances client={fixture.client} />} /></Route>
    </Routes></MemoryRouter></AuthProvider>);
    await screen.findByText('Au 01/10/2026');
    expect(screen.getByRole('heading', { name: 'Solde de Congés/Repos' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toHaveTextContent('11,05 j');
    expect(screen.queryByLabelText('Compteur Congés')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Compteur RTT')).not.toBeInTheDocument();
    expect(fixture.personFilter).toHaveBeenCalledWith('user_id', fixture.user.id);
    expect(fixture.client.from).toHaveBeenCalledWith('user_roles');
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledExactlyOnceWith(fixture.client, person.id);
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
  });

  it('discards a delayed response for the previous person after the manager selects somebody else', async () => {
    const oldResponse = deferred<PlanningAbsenceBalanceContext>();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(staffContext(sophie, { counterPeriods: [counter('leave', { entitlement: 40 }), counter('rtt')] }));
    const input = props({ canManage: true });
    const { rerender } = render(<PlanningAbsenceBalances {...input} />);
    rerender(<PlanningAbsenceBalances {...input} personId={sophie.id} />);
    await screen.findByLabelText('Compteur Congés');
    expect(metricNumber(card('Congés'), 'Droits')).toBe(40);
    await act(async () => { oldResponse.resolve(staffContext()); });
    expect(metricNumber(card('Congés'), 'Droits')).toBe(40);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenNthCalledWith(2, input.client, sophie.id);
  });

  it('does not restore an old client error after a session/client switch has loaded the new balance', async () => {
    const oldResponse = deferred<PlanningAbsenceBalanceContext>();
    const nextClient = {} as SupabaseClient;
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockReturnValueOnce(oldResponse.promise).mockResolvedValueOnce(staffContext(christophe, { counterPeriods: [counter('leave', { entitlement: 32 }), counter('rtt')] }));
    const input = props();
    const { rerender } = render(<PlanningAbsenceBalances {...input} />);
    rerender(<PlanningAbsenceBalances {...input} client={nextClient} />);
    await screen.findByLabelText('Compteur Congés');
    await act(async () => { oldResponse.reject(new Error('Ancienne session expirée')); });
    expect(metricNumber(card('Congés'), 'Droits')).toBe(32);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenNthCalledWith(2, nextClient, christophe.id);
  });

  it('discards an in-flight response when the selected person is cleared', async () => {
    const response = deferred<PlanningAbsenceBalanceContext>();
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockReturnValueOnce(response.promise);
    const input = props();
    const { rerender } = render(<PlanningAbsenceBalances {...input} />);
    rerender(<PlanningAbsenceBalances {...input} personId={null} />);
    await act(async () => { response.resolve(staffContext()); });
    expect(screen.queryByRole('region', { name: 'Soldes et droits' })).not.toBeInTheDocument();
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledOnce();
  });

  it('keeps the error visible and retries without changing the selected request', async () => {
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce(staffContext());
    const input = props();
    render(<PlanningAbsenceBalances {...input} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion interrompue');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByLabelText('Compteur Congés');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(17);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenNthCalledWith(2, input.client, input.personId);
  });

  it('opens a separate rights window from the unique management button and closes without saving', async () => {
    const input = props({ canManage: true, people: [christophe, sophie, crew], onEditingChange: vi.fn() });
    const { container } = render(<PlanningAbsenceBalances {...input} />);
    const user = userEvent.setup();
    await screen.findByLabelText('Compteur Congés');
    expect(screen.getAllByRole('button', { name: 'Périodes de Droits Congés' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /(?:Modifier|Saisir) les droits/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter une période de droits' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Périodes de Droits Congés' }));
    const dialog = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    expect(container).not.toContainElement(dialog);
    expect(within(dialog).getByLabelText('Collaborateur')).toHaveValue(String(christophe.id));
    expect(within(dialog).getByLabelText('Début de période')).toHaveValue('2025-06-01');
    expect(within(dialog).getByLabelText('Fin de période')).toHaveValue('2026-05-31');
    expect(input.onEditingChange).toHaveBeenLastCalledWith(true);
    await user.click(within(dialog).getByRole('button', { name: 'Fermer la fenêtre' }));
    expect(screen.queryByRole('dialog', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(20);
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(input.onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('shows only the crew balance at entry time for managers even if the request is in the future', async () => {
    const input = props({ personId: crew.id, canManage: true, people: [christophe, sophie, crew] });
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValue({ ...crewContext(), kind: 'leave_rtt', counterPeriods: [counter('leave')] });
    const { rerender } = render(<PlanningAbsenceBalances {...input} startsAt="2027-05-10T08:00" endsAt="2027-05-14T18:00" />);
    expect(await screen.findByText('Au 01/10/2026')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toHaveTextContent('11,05 j');
    expect(screen.queryByLabelText('Compteur Congés')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Compteur RTT')).not.toBeInTheDocument();
    expect(screen.queryByText('Cette demande')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Périodes de Droits Congés' })).not.toBeInTheDocument();
    rerender(<PlanningAbsenceBalances {...input} startsAt="2027-08-10T08:00" endsAt="2027-08-14T18:00" />);
    expect(screen.getByRole('region', { name: 'Soldes et droits' })).toHaveTextContent('11,05 j');
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledOnce();
    expect(savePlanningLeaveRightsPeriod).not.toHaveBeenCalled();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
  });

  it('reloads the request balance when the manager closes after a committed rights write whose refresh failed', async () => {
    const initial = staffContext(christophe, { absences: [], counterPeriods: [
      counter('leave', { startsOn: '2025-06-01', endsOn: '2026-05-31' }),
      counter('rtt', { startsOn: '2025-06-01', endsOn: '2026-05-31' }),
    ] });
    const updated = { ...initial, counterPeriods: initial.counterPeriods.map((period) => period.counterType === 'leave' ? { ...period, entitlement: 30 } : period) };
    vi.mocked(fetchPlanningAbsenceBalanceContext).mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('Actualisation interrompue')).mockResolvedValueOnce(updated);
    const input = props({ canManage: true });
    const user = userEvent.setup();
    render(<PlanningAbsenceBalances {...input} />);
    await user.click(await screen.findByRole('button', { name: 'Périodes de Droits Congés' }));
    const dialog = screen.getByRole('dialog', { name: 'Périodes de Droits Congés' });
    await user.clear(within(dialog).getByLabelText('Total Congés (jours)'));
    await user.type(within(dialog).getByLabelText('Total Congés (jours)'), '30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer les droits' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Droits enregistrés, mais les soldes n’ont pas pu être actualisés.');
    expect(metricNumber(card('Congés'), 'Droits')).toBe(25);
    await user.click(within(dialog).getByRole('button', { name: 'Fermer la fenêtre' }));
    await screen.findByLabelText('Compteur Congés');
    expect(metricNumber(card('Congés'), 'Droits')).toBe(30);
    expect(metricNumber(card('Congés'), 'Solde disponible')).toBe(30);
    expect(metricNumber(card('Congés'), 'Après validation')).toBe(27);
    expect(fetchPlanningAbsenceBalanceContext).toHaveBeenCalledTimes(3);
    expect(savePlanningLeaveRightsPeriod).toHaveBeenCalledOnce();
    expect(savePlanningLeaveCounterPeriod).not.toHaveBeenCalled();
  });
});
