import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { APP_MODULES } from '../permissions/moduleAccess';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { HomePage } from './HomePage';

function renderHome(role: RoleKey, policyHidden = false) {
  const context: AppShellOutletContext = {
    roles: [role],
    client: previewSupabaseClient,
    previewMode: true,
    ...(policyHidden ? { visibleModules: APP_MODULES.filter((module) => module.key !== 'qhsePolicy') } : {}),
    currentPerson: {
      id: 9301,
      firstName: 'Arthur',
      lastName: 'DEMO',
      functionLabel: role === 'capitaine' ? 'Capitaine' : '',
      gradeLabel: '',
      active: true, hiredOn: '2020-01-01', departedOn: '',
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

async function waitForHomeData() {
  await waitFor(() => {
    expect(screen.queryByText('Chargement des échéances…')).not.toBeInTheDocument();
    expect(screen.queryByText('Chargement des objectifs…')).not.toBeInTheDocument();
  });
}

describe('HomePage', () => {
  it('respects a disabled QHSE policy module on the home page', async () => {
    renderHome('marin', true);
    expect(screen.queryByRole('region', { name: 'Politique QHSE' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bonjour Arthur' })).toBeInTheDocument();
    await waitForHomeData();
  });
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)(
    'renders the consolidated dashboard for the %s role',
    async (role) => {
      renderHome(role);

      expect(screen.getByRole('heading', { name: 'Bonjour Arthur' })).toBeInTheDocument();
      const policy = screen.getByRole('region', { name: 'Politique QHSE' });
      expect(policy.compareDocumentPosition(screen.getByRole('heading', { name: 'Bonjour Arthur' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Objectifs de la politique' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Consulter la politique' })).toHaveAttribute('href', '/modules/qhsePolicy#politique');
      expect(screen.getByRole('heading', { name: 'Priorités & échéances' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Tâches par catégorie' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Prochaines dates clés' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Consulter les indicateurs' })).toHaveAttribute('href', '/modules/kpi');
      expect(await screen.findByText(/DA-\d{4}-086/)).toBeInTheDocument();
      await waitForHomeData();
    },
  );

  it.each(['capitaine', 'marin'] as const)(
    'limits the %s dashboard to the active watch and assigned vessel',
    async (role) => {
      renderHome(role);

      expect(await screen.findByText('Périmètre : Bordée 1 · M/V Démonstration')).toBeInTheDocument();
      expect(screen.getByText(/Ampoule feu de navigation/)).toBeInTheDocument();
      expect(screen.queryByText(/Douilles inox M12/)).not.toBeInTheDocument();
      await waitForHomeData();
    },
  );
});
