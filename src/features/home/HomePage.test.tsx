import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { HomePage } from './HomePage';

function renderHome(role: RoleKey) {
  const context: AppShellOutletContext = {
    roles: [role],
    client: previewSupabaseClient,
    previewMode: true,
    currentPerson: {
      id: 9301,
      firstName: 'Arthur',
      lastName: 'DEMO',
      functionLabel: role === 'capitaine' ? 'Capitaine' : '',
      gradeLabel: '',
    },
  };

  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)(
    'renders the consolidated dashboard for the %s role',
    async (role) => {
      renderHome(role);

      expect(screen.getByRole('heading', { name: 'Bonjour Arthur' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Priorités & échéances' })).toBeInTheDocument();
      expect(screen.getByText('File consolidée')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Prochaines dates clés' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Consulter les indicateurs' })).toHaveAttribute('href', '/modules/kpi');
      expect(await screen.findByText(/DA-\d{4}-086/)).toBeInTheDocument();
    },
  );

  it.each(['capitaine', 'marin'] as const)(
    'limits the %s dashboard to the active watch and assigned vessel',
    async (role) => {
      renderHome(role);

      expect(await screen.findByText('Périmètre : Bordée 1 · M/V Démonstration')).toBeInTheDocument();
      expect(screen.getByText(/Ampoule feu de navigation/)).toBeInTheDocument();
      expect(screen.queryByText(/Douilles inox M12/)).not.toBeInTheDocument();
    },
  );
});
