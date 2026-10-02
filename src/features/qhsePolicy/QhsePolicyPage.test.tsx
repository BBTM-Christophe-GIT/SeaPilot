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
import type { QhsePolicyAttachment, QhsePolicyObjective, QhsePolicyObjectiveUpdate, QhsePolicySnapshot } from './qhsePolicyModel';
import { fetchQhsePolicyOwnerOptions, fetchQhsePolicySnapshot, saveQhsePolicyObjective, saveQhsePolicyProcess, setQhsePolicyObjectiveArchived, setQhsePolicyProcessArchived } from './qhsePolicyQueries';
import { readQhsePolicyAttachment, saveQhsePolicyObjectiveUpdateWithAttachments } from './qhsePolicyAttachments';
import { readQhsePolicyDocument } from './qhsePolicyFiles';
import { buildQhsePolicyExport } from './qhsePolicyExport';

vi.mock('./qhsePolicyQueries', () => ({
  fetchQhsePolicySnapshot: vi.fn(), saveQhsePolicyProcess: vi.fn(), saveQhsePolicyObjective: vi.fn(),
  fetchQhsePolicyOwnerOptions: vi.fn(), setQhsePolicyObjectiveArchived: vi.fn(), setQhsePolicyProcessArchived: vi.fn(),
}));
vi.mock('./qhsePolicyAttachments', async (importOriginal) => ({ ...await importOriginal<typeof import('./qhsePolicyAttachments')>(), readQhsePolicyAttachment: vi.fn(), saveQhsePolicyObjectiveUpdateWithAttachments: vi.fn() }));
vi.mock('./qhsePolicyFiles', () => ({ readQhsePolicyDocument: vi.fn() }));
vi.mock('./qhsePolicyExport', () => ({ buildQhsePolicyExport: vi.fn() }));
vi.mock('./QhsePolicyDocument', () => ({ QhsePolicyDocument: ({ canEdit }: { canEdit: boolean }) => <section aria-label="Politique publiée"><p>Document de la politique QHSE</p>{canEdit ? <button type="button">Modifier la politique</button> : null}</section> }));

const client = {} as SupabaseClient;
const PROCESS_QUALITY = '10000000-0000-0000-0000-000000000001';
const PROCESS_SAFETY = '10000000-0000-0000-0000-000000000002';
const PROCESS_OLD = '10000000-0000-0000-0000-000000000003';
const OBJECTIVE_ID = '20000000-0000-0000-0000-000000000001';
const objective: QhsePolicyObjective = {
  id: OBJECTIVE_ID, processId: PROCESS_QUALITY, title: 'Mettre à jour les procédures', description: 'Réviser les procédures de bord.',
  ownerLabel: 'Sophie HAMEL', dueOn: '2026-12-31', progress: 60, archived: false, revision: 4, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
  ownerKind: null, ownerPersonId: null, ownerVesselId: null,
};
const updates: QhsePolicyObjectiveUpdate[] = [
  { id: '30000000-0000-0000-0000-000000000001', objectiveId: OBJECTIVE_ID, kind: 'initial', progress: 0, occurredOn: '2026-09-01', note: '', actorName: 'Christophe MINASSIAN', ownerLabel: 'Bureau Qualité', createdAt: '2026-09-01T08:00:00Z' },
  { id: '30000000-0000-0000-0000-000000000003', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 60, occurredOn: '2026-10-01', note: 'Procédures validées', actorName: 'Sophie HAMEL', ownerLabel: 'Sophie HAMEL', createdAt: '2026-10-01T10:00:00Z' },
  { id: '30000000-0000-0000-0000-000000000002', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 40, occurredOn: '2026-10-01', note: 'Relecture du matin', actorName: 'Christophe MINASSIAN', ownerLabel: 'Sophie HAMEL', createdAt: '2026-10-01T07:00:00Z' },
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
  ], updates, attachments: [], ...overrides };
}
function ContextOutlet({ sessionClient, roles }: { sessionClient: SupabaseClient; roles: RoleKey[] }) {
  return <Outlet context={{ client: sessionClient, roles, currentPerson: null, previewMode: false }} />;
}
function PageFixture({ sessionClient = client, roles = ['admin'] as RoleKey[] }: { sessionClient?: SupabaseClient; roles?: RoleKey[] }) {
  return <MemoryRouter><Routes><Route element={<ContextOutlet sessionClient={sessionClient} roles={roles} />}><Route path="*" element={<QhsePolicyPage />} /></Route></Routes></MemoryRouter>;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((finish) => { resolve = finish; }); return { promise, resolve }; }
function attachment(overrides: Partial<QhsePolicyAttachment> = {}): QhsePolicyAttachment {
  return { id: '40000000-0000-0000-0000-000000000001', objectiveId: OBJECTIVE_ID, updateId: '30000000-0000-0000-0000-000000000004', fileName: 'Rapport de revue.pdf', mimeType: 'application/pdf', sizeBytes: 6, storageBucket: 'qhse-policy-attachments', storagePath: `1/${OBJECTIVE_ID}/40000000-0000-0000-0000-000000000001.pdf`, createdAt: '2026-10-02T10:30:00Z', ...overrides };
}

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
  vi.mocked(fetchQhsePolicyOwnerOptions).mockResolvedValue({ people: [{ id: 17, label: 'Christophe MINASSIAN' }, { id: 18, label: 'Sophie HAMEL' }], vessels: [{ id: 7, label: 'ALIZÉ' }, { id: 8, label: 'SIRIUS' }] });
  vi.mocked(saveQhsePolicyProcess).mockResolvedValue(PROCESS_QUALITY);
  vi.mocked(saveQhsePolicyObjective).mockResolvedValue(OBJECTIVE_ID);
  vi.mocked(saveQhsePolicyObjectiveUpdateWithAttachments).mockResolvedValue('30000000-0000-0000-0000-000000000004');
  vi.mocked(setQhsePolicyObjectiveArchived).mockResolvedValue(undefined); vi.mocked(setQhsePolicyProcessArchived).mockResolvedValue(undefined);
  vi.mocked(readQhsePolicyDocument).mockResolvedValue({ blob: new Blob(['policy'], { type: 'application/pdf' }), title: 'Politique QHSE', fileName: 'politique.pdf' });
  vi.mocked(buildQhsePolicyExport).mockResolvedValue({ blob: new Blob(['complete'], { type: 'application/pdf' }), fileName: 'Politique-QHSE-complete.pdf', pageCount: 5 });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:qhse-policy-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Politique QHSE objectives', () => {
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('lets the own authenticated %s account read the policy, progress and immutable history', async (role) => {
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
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled(); expect(saveQhsePolicyObjectiveUpdateWithAttachments).not.toHaveBeenCalled();
    expect(fetchQhsePolicyOwnerOptions).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
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
    await user.selectOptions(await within(dialog).findByLabelText('Collaborateur responsable'), '17');
    fireEvent.change(within(dialog).getByLabelText('Échéance (facultatif)'), { target: { value: '2026-12-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenCalledExactlyOnceWith(client, { processId: PROCESS_QUALITY, title: 'Réviser les consignes', description: '', ownerKind: 'person', ownerPersonId: 17, ownerVesselId: null, ownerLabel: '', dueOn: '2026-12-15', initialProgress: 0 }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const article = screen.getByRole('article', { name: `Objectif ${objective.title}` });
    await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Modifier l’objectif' }));
    const edit = screen.getByRole('dialog', { name: 'Modifier l’objectif' });
    expect(within(edit).queryByLabelText(/Progression/)).not.toBeInTheDocument();
    await user.click(within(edit).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenNthCalledWith(2, client, { id: OBJECTIVE_ID, processId: PROCESS_QUALITY, title: objective.title, description: objective.description, ownerKind: null, ownerPersonId: null, ownerVesselId: null, ownerLabel: objective.ownerLabel, dueOn: objective.dueOn, expectedRevision: 4 }));
  });

  it('adds new processes after the existing processes including archives', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un processus' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un processus' });
    await user.type(within(dialog).getByLabelText('Nom du processus'), 'Environnement');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyProcess).toHaveBeenCalledExactlyOnceWith(client, { name: 'Environnement', description: '', position: 16 }));
  });

  it.each([
    { kind: 'person', label: 'Collaborateur responsable', value: '18', ownerPersonId: 18, ownerVesselId: null, ownerLabel: '' },
    { kind: 'vessel', label: 'Navire responsable', value: '7', ownerPersonId: null, ownerVesselId: 7, ownerLabel: '' },
    { kind: 'office', label: 'Bureau responsable', value: 'Armement - Cherbourg', ownerPersonId: null, ownerVesselId: null, ownerLabel: 'Armement - Cherbourg' },
  ] as const)('assigns an objective to a $kind responsible without sending stale identifiers', async ({ kind, label, value, ...owner }) => {
    const user = userEvent.setup(); render(<PageFixture roles={['direction']} />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' });
    expect(fetchQhsePolicyOwnerOptions).not.toHaveBeenCalled();
    await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un objectif' });
    await user.type(within(dialog).getByLabelText('Intitulé de l’objectif'), 'Revue QHSE');
    await user.selectOptions(within(dialog).getByLabelText('Collaborateur responsable'), '17');
    await user.selectOptions(within(dialog).getByLabelText('Type de responsable'), kind);
    if (kind === 'office') await user.type(within(dialog).getByLabelText(label), value);
    else await user.selectOptions(within(dialog).getByLabelText(label), value);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenCalledExactlyOnceWith(client, { processId: PROCESS_QUALITY, title: 'Revue QHSE', description: '', ownerKind: kind, ...owner, dueOn: null, initialProgress: 0 }));
    expect(fetchQhsePolicyOwnerOptions).toHaveBeenCalledExactlyOnceWith(client);
  });

  it('preserves an existing responsible who is no longer in the active personnel list', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, ownerKind: 'person', ownerPersonId: 99 }] }));
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` });
    await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Modifier l’objectif' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier l’objectif' });
    expect(within(dialog).getByLabelText('Collaborateur responsable')).toHaveValue('99');
    expect(within(dialog).getByRole('option', { name: 'Sophie HAMEL (responsable actuel)' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({ ownerKind: 'person', ownerPersonId: 99, ownerVesselId: null, expectedRevision: 4 })));
  });

  it('retains the objective draft when loading private responsible options fails, and retries only the read', async () => {
    vi.mocked(fetchQhsePolicyOwnerOptions).mockRejectedValueOnce(new Error('Liste des responsables indisponible')).mockResolvedValueOnce({ people: [], vessels: [] });
    const user = userEvent.setup(); render(<PageFixture />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' }); await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un objectif' });
    await user.type(within(dialog).getByLabelText('Intitulé de l’objectif'), 'Revue documentaire');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Liste des responsables indisponible');
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    fireEvent.submit(dialog); expect(saveQhsePolicyObjective).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    expect(within(dialog).getByLabelText('Intitulé de l’objectif')).toHaveValue('Revue documentaire');
    await user.selectOptions(within(dialog).getByLabelText('Type de responsable'), 'office');
    await user.type(within(dialog).getByLabelText('Bureau responsable'), 'Armement - Cherbourg');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveQhsePolicyObjective).toHaveBeenCalledOnce());
    expect(fetchQhsePolicyOwnerOptions).toHaveBeenCalledTimes(2);
  });

  it.each(['client', 'roles'] as const)('does not show private responsible options or a draft from an old %s scope', async (change) => {
    const oldOptions = deferred<Awaited<ReturnType<typeof fetchQhsePolicyOwnerOptions>>>();
    vi.mocked(fetchQhsePolicyOwnerOptions).mockReturnValueOnce(oldOptions.promise).mockResolvedValueOnce({ people: [{ id: 19, label: 'Nouveau responsable' }], vessels: [] });
    const user = userEvent.setup(); const { rerender } = render(<PageFixture />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' }); await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    await user.type(screen.getByLabelText('Intitulé de l’objectif'), 'Ancienne saisie');
    const nextClient = change === 'client' ? {} as SupabaseClient : client;
    rerender(<PageFixture sessionClient={nextClient} roles={['direction']} />);
    await screen.findByText(objective.title); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('region', { name: 'Processus Qualité' })).getByRole('button', { name: 'Ajouter un objectif' }));
    await act(async () => { oldOptions.resolve({ people: [{ id: 33, label: 'Ancien responsable privé' }], vessels: [] }); });
    expect(screen.getByLabelText('Intitulé de l’objectif')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Nouveau responsable' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Ancien responsable privé' })).not.toBeInTheDocument();
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled();
  });

  it('saves native date input when creating, changing and clearing an objective deadline', async () => {
    const user = userEvent.setup(); render(<PageFixture />);
    const process = await screen.findByRole('region', { name: 'Processus Qualité' });
    await user.click(within(process).getByRole('button', { name: 'Ajouter un objectif' }));
    let dialog = screen.getByRole('dialog', { name: 'Ajouter un objectif' });
    await user.type(within(dialog).getByLabelText('Intitulé de l’objectif'), 'Préparer la revue');
    await user.selectOptions(within(dialog).getByLabelText('Collaborateur responsable'), '18');
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
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, progress: 50, revision: 5 }], updates: [...updates, { id: '30000000-0000-0000-0000-000000000004', objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 50, occurredOn: '2026-10-02', note: 'Correction après revue documentaire', actorName: 'Christophe MINASSIAN', ownerLabel: 'Sophie HAMEL', createdAt: '2026-10-02T10:30:00Z' }] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(saveQhsePolicyObjectiveUpdateWithAttachments).toHaveBeenCalledExactlyOnceWith(client, { objectiveId: OBJECTIVE_ID, expectedRevision: 4, progress: 50, occurredOn: '2026-10-02', note: 'Correction après revue documentaire' }, []));
    await screen.findByText('Suivi enregistré. L’historique est actualisé.');
    expect(screen.getByRole('progressbar', { name: `Progression de ${objective.title}` })).toHaveAttribute('value', '50');
    const history = within(article).getAllByRole('listitem'); expect(history).toHaveLength(4); expect(history[0]).toHaveTextContent('Correction après revue documentaire'); expect(history[0]).toHaveTextContent('Christophe MINASSIAN'); expect(history[0]).toHaveTextContent('02/10/2026 12:30');
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled();
  });

  it('preserves a rejected follow-up draft and prevents dismissal or duplicate writes while saving', async () => {
    const pending = deferred<string>(); vi.mocked(saveQhsePolicyObjectiveUpdateWithAttachments).mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('Le suivi n’a pas été enregistré.'));
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` }); await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' }); await user.type(within(dialog).getByLabelText('Note de suivi'), 'Revue en cours'); await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeDisabled(); await user.keyboard('{Escape}'); fireEvent.submit(dialog); expect(saveQhsePolicyObjectiveUpdateWithAttachments).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve('30000000-0000-0000-0000-000000000004'); }); await screen.findByText('Suivi enregistré. L’historique est actualisé.');
    await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' })); const retryDialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' }); await user.type(within(retryDialog).getByLabelText('Note de suivi'), 'Note à conserver'); await user.click(within(retryDialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    expect(await within(retryDialog).findByRole('alert')).toHaveTextContent('Le suivi n’a pas été enregistré.'); expect(within(retryDialog).getByLabelText('Note de suivi')).toHaveValue('Note à conserver'); expect(retryDialog).toBeVisible(); expect(within(retryDialog).getByRole('button', { name: 'Enregistrer le suivi' })).toBeEnabled();
  });

  it('keeps selected attachments and the note after an atomic follow-up fails, then displays the saved files with history', async () => {
    const document = new File(['report'], 'Rapport de revue.pdf', { type: 'application/pdf' });
    const removed = new File(['photo'], 'Photo.jpg', { type: 'image/jpeg' });
    vi.mocked(saveQhsePolicyObjectiveUpdateWithAttachments).mockRejectedValueOnce(new Error('Le transfert a échoué. Le suivi n’a pas été enregistré.')).mockResolvedValueOnce(attachment().updateId);
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` });
    await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' });
    await user.clear(within(dialog).getByLabelText('Progression (%)')); await user.type(within(dialog).getByLabelText('Progression (%)'), '70');
    await user.type(within(dialog).getByLabelText('Note de suivi'), 'Revue accompagnée du rapport');
    await user.upload(within(dialog).getByLabelText('Pièces jointes (facultatif)'), [document, removed]);
    await user.click(within(dialog).getByRole('button', { name: 'Retirer Photo.jpg' }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Le suivi n’a pas été enregistré');
    expect(within(dialog).getByLabelText('Note de suivi')).toHaveValue('Revue accompagnée du rapport');
    expect(within(dialog).getByText('Rapport de revue.pdf')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: `Progression de ${objective.title}` })).toHaveAttribute('value', '60');
    expect(fetchQhsePolicySnapshot).toHaveBeenCalledOnce();
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(snapshot({ objectives: [{ ...objective, progress: 70, revision: 5 }], updates: [...updates, { id: attachment().updateId, objectiveId: OBJECTIVE_ID, kind: 'progress', progress: 70, occurredOn: '2026-10-02', note: 'Revue accompagnée du rapport', actorName: 'Direction', ownerLabel: 'Sophie HAMEL', createdAt: '2026-10-02T10:30:00Z' }], attachments: [attachment()] }));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saveQhsePolicyObjectiveUpdateWithAttachments).toHaveBeenNthCalledWith(2, client, { objectiveId: OBJECTIVE_ID, expectedRevision: 4, progress: 70, occurredOn: '2026-10-02', note: 'Revue accompagnée du rapport' }, [document]);
    expect(screen.getByRole('progressbar', { name: `Progression de ${objective.title}` })).toHaveAttribute('value', '70');
    expect(within(article).getByText('Responsable au moment du suivi : Bureau Qualité')).toBeVisible();
    expect(within(article).getByRole('button', { name: 'Télécharger Rapport de revue.pdf' })).toBeVisible();
    expect(within(article).getByRole('button', { name: 'Aperçu de Rapport de revue.pdf' })).toBeVisible();
  });

  it('blocks a follow-up containing too many files until the extra selected file is removed', async () => {
    const files = Array.from({ length: 11 }, (_, index) => new File(['x'], `Note-${index + 1}.txt`, { type: 'text/plain' }));
    const user = userEvent.setup(); render(<PageFixture />);
    const article = await screen.findByRole('article', { name: `Objectif ${objective.title}` });
    await user.click(within(article).getByText('Détails et suivi')); await user.click(within(article).getByRole('button', { name: 'Ajouter un suivi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un suivi' });
    await user.type(within(dialog).getByLabelText('Note de suivi'), 'Documents de revue');
    await user.upload(within(dialog).getByLabelText('Pièces jointes (facultatif)'), files);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('maximum 10 pièces jointes');
    expect(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' })).toBeDisabled();
    fireEvent.submit(dialog); expect(saveQhsePolicyObjectiveUpdateWithAttachments).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Retirer Note-11.txt' }));
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(saveQhsePolicyObjectiveUpdateWithAttachments).toHaveBeenCalledExactlyOnceWith(client, expect.objectContaining({ note: 'Documents de revue' }), files.slice(0, 10)));
  });

  it('exports the complete snapshot including hidden archives and attachments regardless of the current process filter', async () => {
    const fullSnapshot = snapshot({ attachments: [attachment({ updateId: updates[1].id })] });
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(fullSnapshot);
    const blob = new Blob(['report']); vi.mocked(readQhsePolicyAttachment).mockResolvedValue(blob);
    const downloads: string[] = [];
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    const user = userEvent.setup(); render(<PageFixture />); await screen.findByText(objective.title);
    await user.selectOptions(screen.getByLabelText('Processus'), PROCESS_SAFETY);
    expect(screen.queryByText(objective.title)).not.toBeInTheDocument(); expect(screen.queryByText('Objectif archivé')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByText('PDF préparé. Le téléchargement a démarré.');
    const input = vi.mocked(buildQhsePolicyExport).mock.calls[0][0];
    expect(input.snapshot).toBe(fullSnapshot); expect(input.snapshot.objectives).toHaveLength(4); expect(input.snapshot.processes).toHaveLength(3); expect(input.snapshot.attachments).toHaveLength(1);
    expect(readQhsePolicyDocument).toHaveBeenCalledExactlyOnceWith(client, fullSnapshot.settings);
    expect(await input.readAttachment(fullSnapshot.attachments[0])).toBe(blob);
    expect(readQhsePolicyAttachment).toHaveBeenCalledExactlyOnceWith(client, fullSnapshot.attachments[0]);
    expect(downloads).toEqual(['Politique-QHSE-complete.pdf']);
  });

  it.each(['policy', 'export'] as const)('reports a failed %s PDF read without downloading a partial file and allows a retry', async (failure) => {
    if (failure === 'policy') vi.mocked(readQhsePolicyDocument).mockRejectedValueOnce(new Error('Politique inaccessible'));
    else vi.mocked(buildQhsePolicyExport).mockRejectedValueOnce(new Error('Pièce jointe inaccessible'));
    const user = userEvent.setup(); render(<PageFixture />); await screen.findByText(objective.title);
    await user.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'policy' ? 'Politique inaccessible' : 'Pièce jointe inaccessible');
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await screen.findByText('PDF préparé. Le téléchargement a démarré.');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(saveQhsePolicyObjective).not.toHaveBeenCalled(); expect(saveQhsePolicyObjectiveUpdateWithAttachments).not.toHaveBeenCalled();
  });

  it.each(['client', 'roles'] as const)('cancels an old export result when the %s scope changes', async (change) => {
    const pending = deferred<Awaited<ReturnType<typeof buildQhsePolicyExport>>>(); vi.mocked(buildQhsePolicyExport).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); const { rerender } = render(<PageFixture />); await screen.findByText(objective.title);
    await user.click(screen.getByRole('button', { name: 'Exporter le PDF' }));
    await waitFor(() => expect(buildQhsePolicyExport).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeDisabled();
    const nextClient = change === 'client' ? {} as SupabaseClient : client;
    rerender(<PageFixture sessionClient={nextClient} roles={['direction']} />); await screen.findByText(objective.title);
    await act(async () => { pending.resolve({ blob: new Blob(['old']), fileName: 'ancien-profil.pdf', pageCount: 1 }); });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled(); expect(screen.queryByText('PDF préparé. Le téléchargement a démarré.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
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
