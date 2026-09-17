import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AdminCollaboratorCoverage } from './AdminCollaboratorCoverage';
import { mapAdminCollaborators, type AdminCollaboratorRow } from './adminCollaborators';
import type { AdminUser } from './adminQueries';

const dates = { hired_on: '2020-01-01', departed_on: null };
const people: AdminCollaboratorRow[] = [
  { ...dates, id: 1, user_id: null, first_name: 'Alice', last_name: 'SansCompte', email: 'alice@bbtm.fr', function_label: 'Marin', active: true },
  { ...dates, id: 2, user_id: 'bob', first_name: 'Bob', last_name: 'Externe', email: 'bob@example.test', function_label: 'Capitaine', active: true },
  { ...dates, id: 3, user_id: null, first_name: 'Claire', last_name: 'SansEmail', email: null, function_label: null, active: true },
  { ...dates, id: 4, user_id: 'david', first_name: 'David', last_name: 'Complet', email: 'david@bbtm.fr', function_label: null, active: true },
  { ...dates, id: 5, user_id: null, first_name: 'Ancien', last_name: 'Collaborateur', email: null, function_label: null, active: true, departed_on: '2025-12-18' },
];
const users: AdminUser[] = [
  { id: 'bob', email: 'bob@example.test', displayName: 'Bob', roles: ['capitaine'] },
  { id: 'david', email: 'david@bbtm.fr', displayName: 'David', roles: ['marin'] },
];

describe('AdminCollaboratorCoverage', () => {
  it('shows current collaborators once and filters each category, excluding departed active records', async () => {
    const user = userEvent.setup();
    render(<AdminCollaboratorCoverage collaborators={mapAdminCollaborators(people, users)} population="current" />);
    const table = screen.getByRole('table');
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
    await user.click(screen.getByRole('button', { name: 'Tous les cas 3' }));
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('updates counts when former/all populations are chosen, preserving the category filter', async () => {
    const user = userEvent.setup();
    const collaborators = mapAdminCollaborators(people, users);
    const { rerender } = render(<AdminCollaboratorCoverage collaborators={collaborators} population="current" />);
    await user.click(screen.getByRole('button', { name: 'Sans compte SeaPilot 2' }));
    rerender(<AdminCollaboratorCoverage collaborators={collaborators} population="former" />);
    expect(screen.getByText('Ancien Collaborateur')).toBeVisible();
    expect(screen.getByText('Ancien collaborateur · Départ le 18/12/2025')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sans compte SeaPilot 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Alice SansCompte')).not.toBeInTheDocument();
    rerender(<AdminCollaboratorCoverage collaborators={collaborators} population="all" />);
    expect(screen.getByText('Alice SansCompte')).toBeVisible();
    expect(screen.getByText('Ancien Collaborateur')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sans compte SeaPilot 3' })).toHaveAttribute('aria-pressed', 'true');
  });
});
