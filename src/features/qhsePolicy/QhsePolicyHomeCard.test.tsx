import type { SupabaseClient } from '@supabase/supabase-js';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QhsePolicyHomeCard } from './QhsePolicyHomeCard';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { fetchQhsePolicySnapshot } from './qhsePolicyQueries';

vi.mock('./qhsePolicyQueries', () => ({ fetchQhsePolicySnapshot: vi.fn() }));
const client = {} as SupabaseClient;
function data(): QhsePolicySnapshot {
  const process = { id: 'process', name: 'Qualité', description: '', position: 0, archived: false, revision: 1, updatedAt: '' };
  const objective = { id: 'objective', processId: process.id, title: 'Objectif', description: '', ownerKind: null, ownerPersonId: null, ownerVesselId: null, ownerLabel: '', dueOn: null, progress: 60, archived: false, revision: 1, createdAt: '', updatedAt: '' };
  return { settings: null, processes: [process, { ...process, id: 'archived-process', archived: true }], objectives: [objective, { ...objective, id: 'complete', progress: 100 }, { ...objective, id: 'archived', progress: 0, archived: true }, { ...objective, id: 'archived-process-objective', processId: 'archived-process', progress: 0 }], updates: [], attachments: [], canEdit: false };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(data()); });

describe('Politique QHSE home card', () => {
  it('shows a compact active objective summary and links to the policy and objectives', async () => {
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Objectifs de la politique' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Politique QHSE' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(await screen.findByText('1/2')).toBeVisible(); expect(screen.getAllByText('80 %')).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Progression moyenne de Qualité' })).toHaveAttribute('value', '80');
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '100');
    expect(screen.getByRole('region', { name: 'Politique QHSE' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('link', { name: 'Consulter la politique' })).toHaveAttribute('href', '/modules/qhsePolicy#politique'); expect(screen.getByRole('link', { name: 'Voir les objectifs' })).toHaveAttribute('href', '/modules/qhsePolicy');
    expect(screen.queryByRole('button', { name: /Ajouter|Modifier|Archiver/ })).not.toBeInTheDocument();
  });
  it('keeps the policy link available when objectives fail to load and retries the read', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce(data());
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Le suivi des objectifs est indisponible.');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Aucun objectif défini.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consulter la politique' })).toBeVisible(); await userEvent.setup().click(screen.getByRole('button', { name: 'Actualiser les objectifs QHSE' })); expect(await screen.findByText('1/2')).toBeVisible(); expect(fetchQhsePolicySnapshot).toHaveBeenCalledTimes(2);
  });
  it('shows an empty objective state without presenting a fabricated average', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue({ ...data(), objectives: [] }); render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>); expect(await screen.findByText('Aucun objectif défini.')).toBeVisible(); expect(screen.queryByText('0 %')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Suivi par axe stratégique' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchQhsePolicySnapshot).toHaveBeenCalledExactlyOnceWith(client));
  });

  it('groups true objective progress by active strategic axis and preserves the weighted overall average', async () => {
    const snapshot = data();
    const quality = { ...snapshot.processes[0], position: 2, iconKey: 'customer' as const };
    const environment = { ...quality, id: 'environment', name: 'Environnement', position: 1, iconKey: 'environment' as const };
    const empty = { ...quality, id: 'empty', name: 'Axe sans objectif', position: 0 };
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue({
      ...snapshot,
      processes: [quality, environment, empty, snapshot.processes[1]],
      objectives: [...snapshot.objectives, { ...snapshot.objectives[0], id: 'environment-objective', processId: environment.id, progress: 0 }],
    });
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);

    expect(await screen.findByText('1/3')).toBeVisible();
    expect(screen.getByText('53,3 %')).toBeVisible();
    const rows = within(screen.getByRole('list', { name: 'Suivi par axe stratégique' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('heading', { name: 'Environnement' })).toBeVisible();
    expect(within(rows[0]).getByRole('progressbar', { name: 'Progression moyenne de Environnement' })).toHaveAttribute('value', '0');
    expect(within(rows[1]).getByRole('heading', { name: 'Qualité' })).toBeVisible();
    expect(within(rows[1]).getByRole('progressbar')).toHaveAttribute('value', '80');
    expect(within(rows[1]).getByText('1/2 objectifs réalisés')).toBeVisible();
    expect(within(rows[1]).getByRole('img', { name: 'Icône : Écoute client' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Axe sans objectif' })).not.toBeInTheDocument();
  });

  it('treats fully archived objectives as empty without fabricating a 0% progression', async () => {
    const snapshot = data();
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue({ ...snapshot, objectives: snapshot.objectives.map((objective) => ({ ...objective, archived: true })) });
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);

    expect(await screen.findByText('Aucun objectif défini.')).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('0 %')).not.toBeInTheDocument();
  });

  it('does not display a previous account snapshot when the authenticated client changes', async () => {
    let resolveFirst!: (snapshot: QhsePolicySnapshot) => void;
    let resolveSecond!: (snapshot: QhsePolicySnapshot) => void;
    vi.mocked(fetchQhsePolicySnapshot)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    const secondClient = {} as SupabaseClient;
    const view = render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);
    view.rerender(<MemoryRouter><QhsePolicyHomeCard client={secondClient} /></MemoryRouter>);

    await act(async () => { resolveFirst(data()); });
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des objectifs…');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await act(async () => { resolveSecond({ ...data(), objectives: [] }); });
    expect(screen.getByText('Aucun objectif défini.')).toBeVisible();
    expect(fetchQhsePolicySnapshot).toHaveBeenLastCalledWith(secondClient);
  });
});
