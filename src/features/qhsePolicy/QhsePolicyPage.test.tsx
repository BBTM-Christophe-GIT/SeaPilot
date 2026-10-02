import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import type { RoleKey } from '../permissions/roles';
import { fetchCurrentUserRoles } from '../profiles/profileQueries';
import { QhsePolicyPage } from './QhsePolicyPage';
import type { QhsePolicyObjective, QhsePolicyObjectiveUpdate, QhsePolicySnapshot } from './qhsePolicyModel';
import { addQhsePolicyObjectiveUpdate, fetchQhsePolicySnapshot, saveQhsePolicyObjective, saveQhsePolicyProcess, setQhsePolicyObjectiveArchived, setQhsePolicyProcessArchived } from './qhsePolicyQueries';

vi.mock('./qhsePolicyQueries', () => ({
  fetchQhsePolicySnapshot: vi.fn(), saveQhsePolicyProcess: vi.fn(), saveQhsePolicyObjective: vi.fn(),
  addQhsePolicyObjectiveUpdate: vi.fn(), setQhsePolicyObjectiveArchived: vi.fn(), setQhsePolicyProcessArchived: vi.fn(),
}));
vi.mock('./QhsePolicyDocument', () => ({ QhsePolicyDocument: ({ canEdit }: { canEdit: boolean }) => <section aria-label="Politique publiée"><p>Document de la politique QHSE</p>{canEdit ? <button type="button">Modifier la politique</button> : null}</section> }));

const client = {} as SupabaseClient;
const PROCESS_QUALITY = '10000000-0000-0000-0000-000000000001';
const PROCESS_SAFETY = '10000000-0000-0000-0000-000000000002';
const PROCESS_OLD = '10000000-0000-0000-0000-000000000003';
const OBJECTIVE_ID = '20000000-0000-0000-0000-000000000001';
const objective: QhsePolicyObjective = {
  id: OBJECTIVE_ID, processId: PROCESS_QUALITY, title: 'Mettre à jour les procédures', description: 'Réviser les procédures de bord.',
  ownerLabel: 'Sophie HAMEL', dueOn: '2026-12-31', progress: 60, archived: false, revision: 4, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
};
const updates: QhsePolicyObjectiveUpdate[] = [
  { id: '30000000-0000-0000-0000-000000000001', objectiveId: OBJECTIVE_ID, kind: 'initial', progress: 0, occurredOn: '2026-09-01', note: '', actorName: 'Christophe MINASSIAN', createdAt: '2026-09-01T08:00:00Z' },
  { id: '30000000-0000-0000-0000-000000000003', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 60, occurredOn: '2026-10-01', note: 'Procédures validées', actorName: 'Sophie HAMEL', createdAt: '2026-10-01T10:00:00Z' },
  { id: '30000000-0000-0000-0000-000000000002', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 40, occurredOn: '2026-10-01', note: 'Relecture du matin', actorName: 'Christophe MINASSIAN', createdAt: '2026-10-01T07:00:00Z' },
];
function snapshot(overrides: Partial<QhsePolicySnapshot> = {}): QhsePolicySnapshot {
  return { settings: null, canEdit: true, processes: [
    { id: PROCESS_QUALITY, name: 'Qualité', description: 'Maîtrise documentaire', position: 5, archived: false, revision: 2, updatedAt: '' },
    { id: PROCESS_SAFETY, name: 'Sécurité', description: '', position: 10, archived: false, revision: 1, updatedAt: '' },
    { id: PROCESS_OLD, name: 'Ancien processus', description: '', position: 15, archived: true, revision: 3, updatedAt: '' },
  ], objectives: [objective,
    { ...objective, id: '20000000-0000-0000-0000-000000000002', processId: PROCESS_SAFETY, title: 'Former les équipages', progress: 100 },
    { ...objective, id: '20000000-0000-0000-0000-000000000003', title: 'Objectif archivé', progress: 100, archived: true },
    { ...objective, id: '20000000-0000-0000-0000-000000000004', processId: PROCESS_OLD, title: 'Objectif ancien processus', progress: 0 },
  ], updates, ...overrides };
}
function ContextOutlet({ sessionClient, roles }: { sessionClient: SupabaseClient; roles: RoleKey[] }) {
  return <Outlet context={{ client: sessionClient, roles, currentPerson: null, previewMode: false }} />;
}
function PageFixture({ sessionClient = client, roles = ['admin'] as RoleKey[] }: { sessionClient?: SupabaseClient; roles?: RoleKey[] }) {
  return <MemoryRouter><Routes><Route element={<ContextOutlet sessionClient={sessionClient} roles={roles} />}><Route path="*" element={<QhsePolicyPage />} /></Route></Routes></MemoryRouter>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((finish) => { resolve = finish; }); return { promise, resolve }; }

// Each protected fixture restores its own account and loads that account's
// user_roles. No administrator-session role override is used for these profiles.
function authenticatedClient(role: RoleKey) {
  const user = { id: `${role}-qhse-policy-account`, email: `${role}@example.test` };
  const roleSelect = vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null });
  const value = { auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }), getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  }, from: vi.fn((table: string) => { if (table === 'user_roles') return { select: roleSelect }; throw new Error(`Unexpected profile table ${table}`); }) };
  return { client: value as unknown as SupabaseClient, user, roleSelect };
}
function AuthenticatedOutlet({ sessionClient }: { sessionClient: SupabaseClient }) {
  const { session } = useAuth();
  const [roles, setRoles] = useState<RoleKey[] | null>(null);
  useEffect(() => { let active = true; void fetchCurrentUserRoles(sessionClient).then((value) => { if (active) setRoles(value); }); return () => { active = false; }; }, [sessionClient, session?.user.id]);
  return roles ? <ContextOutlet sessionClient={sessionClient} roles={roles} /> : <p>Chargement du profil…</p>;
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot());
  vi.mocked(saveQhsePolicyProcess).mockResolvedValue(PROCESS_QUALITY);
  vi.mocked(saveQhsePolicyObjective).mockResolvedValue(OBJECTIVE_ID);
  vi.mocked(addQhsePolicyObjectiveUpdate).mockResolvedValue('30000000-0000-0000-0000-000000000004');
  vi.mocked(setQhsePolicyObjectiveArchived).mockResolvedValue(undefined); vi.mocked(setQhsePolicyProcessArchived).mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

describe('Politique QHSE objectives', () => {
  it.each(['armement', 'capitaine', 'marin'] as const)('lets the own authenticated %s account read the policy, progress and immutable history', async (role) => {
    const fixture = authenticatedClient(role);
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ canEdit: false }));
    render(<AuthProvider client={fixture.client}><MemoryRouter><Routes><Route element={<RequireAuth />}><Route element={<AuthenticatedOutlet sessionClient={fixture.client} />}><Route path="*" element={<QhsePolicyPage />} /></Route></Route></Routes></MemoryRouter></AuthProvider>);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` });
    expect(screen.getByRole('region', { name: 'Politique publiée' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: `Progression de ${objective.title}` })).toHaveAttribute('value', '60');
    expect(screen.getByText('1/2')).toBeVisible(); expect(screen.getByText('80 %')).toBeVisible();
    await userEvent.setup().click(within(article).getByText('Détails et suivi'));
    const history = within(article).getAllByRole('listitem');
    expect(history.map((entry) => entry.textContent)).toEqual([expect.stringContaining('Procédures validées'), expect.stringContaining('Relecture du matin'), expect.stringContaining('Initialisation')]);
    expect(history[0]).toHaveTextContent('Sophie HAMEL'); expect(history[0]).toHaveTextContent('01/10/2026');
    expect(screen.queryByRole('button', { name: /Ajouter|Modifier|Archiver|Réactiver/ })).not.toBeInTheDocument();
    expect(fixture.client.from).toHaveBeenCalledWith('user_roles'); expect(fixture.roleSelect).toHaveBeenCalledOnce();
    expect(fetchQhsePolicySnapshot).toHaveBeenCalledExactlyOnceWith(fixture.client);
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled(); expect(addQhsePolicyObjectiveUpdate).not.toHaveBeenCalled();
  });

  it('requires the server editing permission even for an administrator role', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ canEdit: false }));
    render(<PageFixture />); await screen.findByText(objective.title);
    expect(screen.queryByRole('button', { name: 'Ajouter un processus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier la politique' })).not.toBeInTheDocument();
  });

  it('filters processes and archives without including archived processes in the active summary', async () => {
    const user = userEvent.setup(); render(<PageFixture />); await screen.findByText(objective.title);
    expect(screen.queryByText('Objectif archivé')).not.toBeInTheDocument(); expect(screen.queryByText('Objectif ancien processus')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Processus'), PROCESS_SAFETY);
    expect(screen.getByText('Former les équipages')).toBeVisible(); expect(screen.queryByText(objective.title)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Afficher les archives')); await user.selectOptions(screen.getByLabelText('Processus'), PROCESS_OLD);
    expect(screen.getByText('Objectif ancien processus')).toBeVisible(); expect(screen.getByText('1/2')).toBeVisible(); expect(screen.getByText('80 %')).toBeVisible();
    await user.click(screen.getByLabelText('Afficher les archives'));
    expect(screen.getByLabelText('Processus')).toHaveValue(''); expect(screen.getByText(objective.title)).toBeVisible();
  });

  it.each(['admin', 'direction'] as const)('lets %s rename a process while preserving its order and expected revision', async (role) => {
    const user = userEvent.setup(); render(<PageFixture roles={[role]} />);
    await user.click(await screen.findByRole('button', { name: 'Modifier le processus Qualité' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier le processus' });
    await user.clear(within(dialog).getByLabelText('Nom du processus')); await user.type(within(dialog).getByLabelText('Nom du processus'), 'Qualité documentaire');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyProcess).toHaveBeenCalledExactlyOnceWith(client, { id: PROCESS_QUALITY, name: 'Qualité documentaire', description: 'Maîtrise documentaire', position: 5, expectedRevision: 2 }));
    expect(await screen.findByText('Processus enregistré.')).toBeVisible();
  });

  it('creates a classified objective with an initial progress and keeps progress out of metadata edits', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' });
    await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un objectif' });
    expect(within(dialog).getByLabelText('Processus')).toHaveValue(PROCESS_QUALITY);
    await user.type(within(dialog).getByLabelText('Intitulé de l’objectif'), 'Réviser les consignes');
    await user.type(within(dialog).getByLabelText('Responsable (facultatif)'), 'Christophe');
    fireEvent.change(within(dialog).getByLabelText('Échéance (facultatif)'), { target: { value: '2026-12-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenCalledExactlyOnceWith(client, { processId: PROCESS_QUALITY, title: 'Réviser les consignes', description: '', ownerLabel: 'Christophe', dueOn: '2026-12-15', initialProgress: 0 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const article = screen.getByRole('article', { name: `Objectif ${objective.title}` });
    await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Modifier l’objectif' }));
    const edit = screen.getByRole('dialog', { name: 'Modifier l’objectif' });
    expect(within(edit).queryByLabelText(/Progression/)).not.toBeInTheDocument();
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenNthCalledWith(2, client, { id: OBJECTIVE_ID, processId: PROCESS_QUALITY, title: objective.title, description: objective.description, ownerLabel: objective.ownerLabel, dueOn: objective.dueOn, expectedRevision: 4 }));
  });

  it('adds new processes after the existing processes including archives', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un processus' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un processus' });
    await user.type(within(dialog).getByLabelText('Nom du processus'), 'Environnement');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyProcess).toHaveBeenCalledExactlyOnceWith(client, { name: 'Environnement', description: '', position: 16 }));
  });

  it('saves native date input when creating, changing and clearing an objective deadline', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' });
    await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    let dialog = screen.getByRole('dialog', { name: 'Ajouter un objectif' });
    await user.type(within(dialog).getByLabelText('Intitulé de l’objectif'), 'Préparer la revue');
    fireEvent.input(within(dialog).getByLabelText('Échéance (facultatif)'), { target: { value: '2026-12-15' } });
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, title: 'Préparer la revue', dueOn: '2026-12-15', revision: 1 }] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenNthCalledWith(1, client, expect.objectContaining({ dueOn: '2026-12-15' })));
    let article = await screen.findByRole('article', { name: 'Objectif Préparer la revue' });
    expect(within(article).getByText('Échéance : 15/12/2026')).toBeVisible();
    await user.click(within(article).getByText('Détails et suivi'));
    await user.click(within(article).getByRole('button', { name: 'Modifier l’objectif' }));
    dialog = screen.getByRole('dialog', { name: 'Modifier l’objectif' });
    expect(within(dialog).getByLabelText('Échéance (facultatif)')).toHaveValue('2026-12-15');
    fireEvent.input(within(dialog).getByLabelText('Échéance (facultatif)'), { target: { value: '2027-01-31' } });
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, title: 'Préparer la revue', dueOn: '2027-01-31', revision: 2 }] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenNthCalledWith(2, client, expect.objectContaining({ dueOn: '2027-01-31', expectedRevision: 1 })));
    article = await screen.findByRole('article', { name: 'Objectif Préparer la revue' });
    await within(article).findByText('Échéance : 31/01/2027');
    await user.click(within(article).getByRole('button', { name: 'Modifier l’objectif' }));
    dialog = screen.getByRole('dialog', { name: 'Modifier l’objectif' });
    fireEvent.input(within(dialog).getByLabelText('Échéance (facultatif)'), { target: { value: '' } });
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, title: 'Préparer la revue', dueOn: null, revision: 3 }] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenNthCalledWith(3, client, expect.objectContaining({ dueOn: null, expectedRevision: 2 })));
    expect(await within(article).findByText('Sans échéance')).toBeVisible();
  });

  it('adds a correction as a new dated history entry and shows its actor and publication timestamp', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' });
    await user.clear(within(dialog).getByLabelText('Progression (%)')); await user.type(within(dialog).getByLabelText('Progression (%)'), '50');
    await user.type(within(dialog).getByLabelText('Note de suivi'), 'Correction après revue documentaire');
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, progress: 50, revision: 5 }], updates: [...updates, { id: '30000000-0000-0000-0000-000000000004', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 50, occurredOn: '2026-10-02', note: 'Correction après revue documentaire', actorName: 'Christophe MINASSIAN', createdAt: '2026-10-02T10:30:00Z' }] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(addQhsePolicyObjectiveUpdate).toHaveBeenCalledExactlyOnceWith(client, { objectiveId: OBJECTIVE_ID, expectedRevision: 4, progress: 50, occurredOn: '2026-10-02', note: 'Correction après revue documentaire' }));
    await screen.findByText('Suivi enregistré. L’historique est actualisé.');
    expect(screen.getByRole('progressbar', { name: `Progression de ${objective.title}` })).toHaveAttribute('value', '50');
    const history = within(article).getAllByRole('listitem'); expect(history).toHaveLength(4); expect(history[0]).toHaveTextContent('Correction après revue documentaire'); expect(history[0]).toHaveTextContent('Christophe MINASSIAN'); expect(history[0]).toHaveTextContent('02/10/2026 12:30');
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled();
  });

  it('preserves a rejected follow-up draft and prevents dismissal or duplicate writes while saving', async () => {
    const pending = deferred<string>(); vi.mocked(addQhsePolicyObjectiveUpdate).mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('Le suivi n’a pas été enregistré.'));
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' }); await user.type(within(dialog).getByLabelText('Note de suivi'), 'Revue en cours'); await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeDisabled(); await user.keyboard('{Escape}'); fireEvent.submit(dialog); expect(addQhsePolicyObjectiveUpdate).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve('30000000-0000-0000-0000-000000000004'); }); await screen.findByText('Suivi enregistré. L’historique est actualisé.');
    await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' })); const retryDialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' }); await user.type(within(retryDialog).getByLabelText('Note de suivi'), 'Note à conserver'); await user.click(within(retryDialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    expect(await within(retryDialog).findByRole('alert')).toHaveTextContent('Le suivi n’a pas été enregistré.'); expect(within(retryDialog).getByLabelText('Note de suivi')).toHaveValue('Note à conserver'); expect(retryDialog).toBeVisible(); expect(within(retryDialog).getByRole('button', { name: 'Enregistrer le suivi' })).toBeEnabled();
  });

  it('archives objectives after confirmation and offers only restoration on an archived objective', async () => {
    const user = userEvent.setup(); render(<PageFixture />); const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Archiver l’objectif' }));
    const confirm = screen.getByRole('dialog', { name: 'Archiver cet objectif ?' }); expect(confirm).toHaveTextContent('Son historique sera conservé');
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, archived: true, revision: 5 }] })); await user.click(within(confirm).getByRole('button', { name: 'Archiver l’objectif' }));
    await waitFor(() => expect(setQhsePolicyObjectiveArchived).toHaveBeenCalledExactlyOnceWith(client, OBJECTIVE_ID, true, 4)); await screen.findByText('Objectif archivé.'); await user.click(screen.getByLabelText('Afficher les archives'));
    const archived = await screen.findByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(archived).getByText('Détails et suivi'));
    expect(within(archived).queryByRole('button', { name: 'Modifier l’objectif' })).not.toBeInTheDocument(); expect(within(archived).queryByRole('button', { name: 'Ajouter un suivi' })).not.toBeInTheDocument(); await user.click(within(archived).getByRole('button', { name: 'Réactiver l’objectif' })); await user.click(within(screen.getByRole('dialog', { name: 'Réactiver cet objectif ?' })).getByRole('button', { name: 'Réactiver l’objectif' }));
    await waitFor(() => expect(setQhsePolicyObjectiveArchived).toHaveBeenNthCalledWith(2, client, OBJECTIVE_ID, false, 5));
  });

  it('archives and restores a process while preserving the objective history', async () => {
    const user = userEvent.setup(); render(<PageFixture />); await user.click(await screen.findByRole('button', { name: 'Archiver le processus Qualité' }));
    const confirm = screen.getByRole('dialog', { name: 'Archiver ce processus ?' }); vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ processes: snapshot().processes.map((process) => process.id === PROCESS_QUALITY ? { ...process, archived: true, revision: 3 } : process) })); await user.click(within(confirm).getByRole('button', { name: 'Archiver le processus' }));
    await waitFor(() => expect(setQhsePolicyProcessArchived).toHaveBeenCalledExactlyOnceWith(client, PROCESS_QUALITY, true, 2)); await screen.findByText('Processus archivé.'); await user.click(screen.getByLabelText('Afficher les archives'));
    const process = await screen.findByRole('region', { name: 'Processus Qualité' }); const article = within(process).getByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(article).getByText('Détails et suivi')); expect(within(article).getAllByRole('listitem')).toHaveLength(3); expect(within(process).queryByRole('button', { name: 'Ajouter un objectif' })).not.toBeInTheDocument();
    await user.click(within(process).getByRole('button', { name: 'Réactiver le processus Qualité' })); await user.click(within(screen.getByRole('dialog', { name: 'Réactiver ce processus ?' })).getByRole('button', { name: 'Réactiver le processus' })); await waitFor(() => expect(setQhsePolicyProcessArchived).toHaveBeenNthCalledWith(2, client, PROCESS_QUALITY, false, 3));
  });

  it('blocks writes after a committed save whose refresh failed and retries only the snapshot read', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValueOnce(snapshot()).mockRejectedValueOnce(new Error('Actualisation interrompue')).mockResolvedValueOnce(snapshot());
    const user = userEvent.setup(); render(<PageFixture />); await user.click(await screen.findByRole('button', { name: 'Ajouter un processus' })); const dialog = screen.getByRole('dialog', { name: 'Ajouter un processus' }); await user.type(within(dialog).getByLabelText('Nom du processus'), 'Environnement'); await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Actualisation interrompue'); expect(screen.getByText('Processus enregistré.')).toBeVisible(); expect(screen.getByRole('button', { name: 'Ajouter un processus' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Réessayer' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter un processus' })).toBeEnabled()); expect(saveQhsePolicyProcess).toHaveBeenCalledOnce(); expect(fetchQhsePolicySnapshot).toHaveBeenCalledTimes(3);
  });

  it.each(['client', 'roles'] as const)('discards an editor when the %s scope changes and ignores an old save completion', async (change) => {
    const pending = deferred<string>(); vi.mocked(saveQhsePolicyProcess).mockReturnValue(pending.promise);
    const user = userEvent.setup(); const { rerender } = render(<PageFixture />); await user.click(await screen.findByRole('button', { name: 'Ajouter un processus' })); const dialog = screen.getByRole('dialog', { name: 'Ajouter un processus' }); await user.type(within(dialog).getByLabelText('Nom du processus'), 'Ancienne session'); await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    const nextClient = change === 'client' ? {} as SupabaseClient : client; rerender(<PageFixture sessionClient={nextClient} roles={['direction']} />); await screen.findByText(objective.title); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(PROCESS_QUALITY); }); expect(screen.queryByText('Processus enregistré.')).not.toBeInTheDocument(); expect(fetchQhsePolicySnapshot).toHaveBeenCalledTimes(2); expect(screen.getByRole('button', { name: 'Ajouter un processus' })).toBeEnabled();
  });
});
