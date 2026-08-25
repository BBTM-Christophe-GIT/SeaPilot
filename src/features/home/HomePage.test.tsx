import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { HomePage } from './HomePage';

function renderHome(role: RoleKey, previewMode = false) {
  const context: AppShellOutletContext = {
    roles: [role],
    client: previewSupabaseClient,
    previewMode,
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
  it.each([
    ['armement', 'Ajuster le planning', 'Préparation des relèves'],
    ['capitaine', 'Créer le DPR du jour', 'Mon navire'],
    ['marin', 'Saisir mes heures', 'Mon embarquement'],
  ] as const)('personalizes the home for the %s role', (role, primaryAction, contextLabel) => {
    renderHome(role);

    expect(screen.getByRole('heading', { name: 'Bonjour Arthur' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: primaryAction })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: contextLabel })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'À traiter aujourd’hui' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(14);
  });

  it.each(['admin', 'direction'] as const)('renders the consolidated manager dashboard for the %s role', async (role) => {
    renderHome(role);

    expect(screen.getByRole('heading', { name: 'Bonjour Arthur' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Priorités & échéances' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consulter les indicateurs' })).toHaveAttribute('href', '/modules/kpi');
    expect(screen.queryByRole('link', { name: 'Ouvrir le planning' })).not.toBeInTheDocument();
    expect(screen.queryByText('Accès rapides')).not.toBeInTheDocument();
    expect(screen.queryByText('Supervision SeaPilot')).not.toBeInTheDocument();
    expect(screen.queryByText('Contrôles recommandés')).not.toBeInTheDocument();
    expect(await screen.findByText(/DA-\d{4}-086/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Achats' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Temps de travail' })).toBeInTheDocument();
  });

  it('links the captain primary workflow to the DPR module', () => {
    renderHome('capitaine');

    expect(screen.getByRole('link', { name: 'Créer le DPR du jour' })).toHaveAttribute('href', '/modules/dpr');
    const priorities = screen.getByRole('region', { name: 'À traiter aujourd’hui' });
    expect(within(priorities).getByRole('link', { name: /^Daily Progress Report/ })).toHaveAttribute(
      'href',
      '/modules/dpr',
    );
    expect(screen.getByRole('link', { name: 'Consulter le planning' })).toHaveAttribute('href', '/modules/planning');
  });

  it('uses the demonstration vessel only in preview mode', () => {
    renderHome('capitaine', true);

    expect(screen.getByRole('heading', { name: 'M/V Démonstration' })).toBeInTheDocument();
  });
});
