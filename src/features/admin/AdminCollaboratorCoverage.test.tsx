import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminCollaboratorCoverage } from './AdminCollaboratorCoverage';
import type { AdminCollaboratorRow } from './adminCollaborators';
import type { AdminUser } from './adminQueries';

const people: AdminCollaboratorRow[] = [
  { id: 1, user_id: null, first_name: 'Alice', last_name: 'SansCompte', email: 'alice@bbtm.fr', function_label: 'Marin', active: true },
  { id: 2, user_id: 'bob', first_name: 'Bob', last_name: 'Externe', email: 'bob@example.test', function_label: 'Capitaine', active: true },
  { id: 3, user_id: null, first_name: 'Claire', last_name: 'SansEmail', email: null, function_label: null, active: true },
  { id: 4, user_id: 'david', first_name: 'David', last_name: 'Complet', email: 'david@bbtm.fr', function_label: null, active: true },
  { id: 5, user_id: null, first_name: 'Ancien', last_name: 'Collaborateur', email: null, function_label: null, active: false },
];
const users: AdminUser[] = [
  { id: 'bob', email: 'bob@example.test', displayName: 'Bob', roles: ['capitaine'] },
  { id: 'david', email: 'david@bbtm.fr', displayName: 'David', roles: ['marin'] },
];

function createClient(data = people) {
  const range = vi.fn().mockResolvedValue({ data, error: null });
  return { range, client: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range }) }) }) }) } };
}

describe('AdminCollaboratorCoverage', () => {
  it('shows active collaborators once and filters each category, including missing email', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<AdminCollaboratorCoverage client={client as never} users={users} />);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByText('David Complet')).not.toBeInTheDocument();
    expect(screen.getByText('Non renseignée')).toBeVisible();
    expect(screen.queryByText('Ancien Collaborateur')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sans compte SeaPilot 2' }));
    expect(screen.getByText('Alice SansCompte')).toBeVisible();
    expect(screen.getByText('Claire SansEmail')).toBeVisible();
    expect(screen.queryByText('Bob Externe')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sans adresse @bbtm.fr 2' }));
    expect(screen.getByText('Bob Externe')).toBeVisible();
    expect(screen.getByText('Claire SansEmail')).toBeVisible();
    expect(screen.queryByText('Alice SansCompte')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sans adresse @bbtm.fr 2' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Tous les cas 3' }));
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('refreshes after account creation or deletion while retaining the selected filter', async () => {
    const user = userEvent.setup();
    const { client, range } = createClient([people[0]]);
    const { rerender } = render(<AdminCollaboratorCoverage client={client as never} users={[]} />);
    await user.click(await screen.findByRole('button', { name: 'Sans compte SeaPilot 1' }));
    range.mockResolvedValue({ data: [{ ...people[0], user_id: 'alice' }], error: null });
    rerender(<AdminCollaboratorCoverage client={client as never} users={[
      { id: 'alice', displayName: 'Alice', email: 'alice@bbtm.fr', roles: ['marin'] },
    ]} />);
    expect(await screen.findByText('Aucun collaborateur dans cette catégorie.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sans compte SeaPilot 0' })).toHaveAttribute('aria-pressed', 'true');
    range.mockResolvedValue({ data: [people[0]], error: null });
    rerender(<AdminCollaboratorCoverage client={client as never} users={[]} />);
    expect(await screen.findByText('Alice SansCompte')).toBeVisible();
    await waitFor(() => expect(range).toHaveBeenCalledTimes(3));
  });

  it('shows a loading state and an explicit error without misleading zero counts', async () => {
    const { client, range } = createClient();
    let resolve!: (value: unknown) => void;
    range.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<AdminCollaboratorCoverage client={client as never} users={users} />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des collaborateurs');
    resolve({ data: null, error: new Error('Access denied') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les collaborateurs');
    expect(screen.queryByRole('button', { name: /Tous les cas/ })).not.toBeInTheDocument();
  });
});
