import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
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
  const objective = { id: 'objective', processId: process.id, title: 'Objectif', description: '', ownerLabel: '', dueOn: null, progress: 60, archived: false, revision: 1, createdAt: '', updatedAt: '' };
  return { settings: null, processes: [process, { ...process, id: 'archived-process', archived: true }], objectives: [objective, { ...objective, id: 'complete', progress: 100 }, { ...objective, id: 'archived', progress: 0, archived: true }, { ...objective, id: 'archived-process-objective', processId: 'archived-process', progress: 0 }], updates: [], canEdit: false };
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue(data()); });

describe('Politique QHSE home card', () => {
  it('shows a compact active objective summary and links to the policy and objectives', async () => {
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Politique QHSE' })).toBeVisible();
    expect(await screen.findByText('1/2')).toBeVisible(); expect(screen.getByText('80 %')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Consulter la politique' })).toHaveAttribute('href', '/modules/qhsePolicy#politique'); expect(screen.getByRole('link', { name: 'Voir les objectifs' })).toHaveAttribute('href', '/modules/qhsePolicy');
    expect(screen.queryByRole('button', { name: /Ajouter|Modifier|Archiver/ })).not.toBeInTheDocument();
  });
  it('keeps the policy link available when objectives fail to load and retries the read', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce(data());
    render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>);
    expect(await screen.findByText('Le suivi des objectifs est indisponible.')).toBeVisible(); expect(screen.getByRole('link', { name: 'Consulter la politique' })).toBeVisible(); await userEvent.setup().click(screen.getByRole('button', { name: 'Actualiser les objectifs QHSE' })); expect(await screen.findByText('1/2')).toBeVisible(); expect(fetchQhsePolicySnapshot).toHaveBeenCalledTimes(2);
  });
  it('shows an empty objective state without presenting a fabricated average', async () => {
    vi.mocked(fetchQhsePolicySnapshot).mockResolvedValue({ ...data(), objectives: [] }); render(<MemoryRouter><QhsePolicyHomeCard client={client} /></MemoryRouter>); expect(await screen.findByText('Aucun objectif défini.')).toBeVisible(); expect(screen.queryByText('0 %')).not.toBeInTheDocument(); await waitFor(() => expect(fetchQhsePolicySnapshot).toHaveBeenCalledExactlyOnceWith(client));
  });
});
