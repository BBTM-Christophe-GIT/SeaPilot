import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES, type ModuleKey } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { AppShell } from '../shell/AppShell';
import { UserManualPage } from './UserManualPage';
import { getManualModules, MANUAL_GUIDES } from './manualGuides';

vi.mock('../serviceNotes/serviceNoteQueries', () => ({ fetchUnsignedServiceNoteNotifications: vi.fn().mockResolvedValue([]), formatServiceNoteDate: vi.fn() }));
vi.mock('../humanResources/hrDocumentNotifications', () => ({ fetchHrDocumentExpiryNotifications: vi.fn().mockResolvedValue([]), formatHrDocumentExpiryDate: vi.fn(), getHrDocumentExpiryWindow: vi.fn() }));
vi.mock('../annualReviews/annualReviewQueries', () => ({ fetchAnnualReviewNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: vi.fn().mockResolvedValue([]), markActionPlanNotificationRead: vi.fn() }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn().mockResolvedValue([]), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'disciplinary:changed' }));

// Authenticated role fixtures go through the production role/matrix loading path.
// No administrator session, rolesOverride or previewMode is used.
function renderManual({ role = 'marin', route = '/manual', hidden = [], signedIn = true, permissionError = false }: {
  role?: RoleKey; route?: string; hidden?: ModuleKey[]; signedIn?: boolean; permissionError?: boolean;
} = {}) {
  const user = { id: `${role}-manual-fixture`, email: `${role}@example.test` };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: signedIn ? { user } : null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: signedIn ? user : null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      if (table === 'role_module_permissions') return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({
        data: APP_MODULES.map((module) => ({ module_key: module.key, role_key: role, is_visible: module.allowedRoles.includes(role) && !hidden.includes(module.key) })),
        error: permissionError ? new Error('Permissions unavailable') : null,
      }) }) };
      if (table === 'people') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 42, first_name: 'Alex', last_name: 'DUPONT', function_label: role === 'marin' ? 'Matelot' : 'Capitaine', grade_label: '' }, error: null,
      }) }) }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={[route]}><Routes>
    <Route path="login" element={<div>Connexion requise</div>} />
    <Route element={<RequireAuth />}><Route element={<AppShell client={client as never} />}>
      <Route index element={<div>Accueil du compte</div>} />
      <Route path="manual/:moduleKey?" element={<UserManualPage />} />
      <Route path="modules/:moduleKey" element={<div>Module ouvert</div>} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
  return client;
}

describe('Manuel d’utilisation', () => {
  it('covers every module permitted by the Marin catalog, including the documentary route', () => {
    const modules = APP_MODULES.filter((module) => module.allowedRoles.includes('marin'));
    expect(getManualModules(modules).map((module) => module.key)).toEqual(modules.map((module) => module.key));
    expect(MANUAL_GUIDES.marad?.access).toContain('attente de migration');
    expect(MANUAL_GUIDES.technicalDocuments?.access).toContain('attente de migration');
  });

  it.each(['marin', 'capitaine'] as const)('opens through the gear between notifications and identity for an authenticated %s', async (role) => {
    const user = userEvent.setup();
    const client = renderManual({ role, route: '/' });
    const gear = await screen.findByRole('link', { name: 'Manuel d’utilisation' });
    expect(gear.previousElementSibling).toContainElement(screen.getByRole('button', { name: 'Notifications' }));
    expect(gear.nextElementSibling).toHaveClass('user-menu');
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(gear);
    expect(await screen.findByRole('heading', { level: 1, name: 'Manuel d’utilisation' })).toBeInTheDocument();
    expect(screen.queryByText('Vous êtes à jour.')).not.toBeInTheDocument();
    expect(client.from).toHaveBeenCalledWith('user_roles');
    expect(client.from).toHaveBeenCalledWith('role_module_permissions');
    const navigation = screen.getByRole('navigation', { name: 'Modules du manuel' });
    for (const module of APP_MODULES.filter((item) => item.allowedRoles.includes('marin'))) {
      expect(within(navigation).getByRole('link', { name: module.label })).toHaveAttribute('href', `/manual/${module.key}`);
    }
    expect(within(navigation).queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('opens a notice, moves focus to the article and links to the correct module', async () => {
    const user = userEvent.setup();
    renderManual();
    const navigation = await screen.findByRole('navigation', { name: 'Modules du manuel' });
    await user.click(within(navigation).getByRole('link', { name: 'Daily Progress Report' }));
    expect(screen.getByRole('article')).toHaveFocus();
    expect(screen.getByRole('article')).toHaveTextContent('3 jours suivant sa création');
    expect(screen.getByRole('link', { name: 'Ouvrir le module' })).toHaveAttribute('href', '/modules/dpr');
    await user.click(screen.getByRole('link', { name: 'Ouvrir le module' }));
    expect(screen.getByText('Module ouvert')).toBeInTheDocument();
  });

  it('searches content without accents and recovers from no results', async () => {
    const user = userEvent.setup();
    renderManual();
    const input = await screen.findByRole('searchbox', { name: 'Rechercher dans le manuel' });
    await user.type(input, 'indemnites kilometriques');
    expect(within(screen.getByRole('navigation', { name: 'Modules du manuel' })).getAllByRole('link')).toHaveLength(1);
    await user.click(within(screen.getByRole('navigation', { name: 'Modules du manuel' })).getByRole('link', { name: 'Notes de frais' }));
    expect(screen.getByRole('article')).toHaveTextContent('Émettre une note de frais');
    await user.clear(input);
    await user.type(input, 'zzzzzz');
    expect(screen.getByText('Aucune notice ne correspond à votre recherche.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(input).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('21 notices disponibles');
  });

  it.each(['/manual/dpr', '/manual/unknown'])('refuses a hidden or unknown direct notice at %s', async (route) => {
    renderManual({ route, hidden: ['dpr'] });
    expect(await screen.findByRole('heading', { name: 'Notice indisponible' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ouvrir le module' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Modules du manuel' })).queryByRole('link', { name: 'Daily Progress Report' })).not.toBeInTheDocument();
  });

  it('fails closed when permissions cannot load', async () => {
    renderManual({ permissionError: true });
    expect(await screen.findByText("Impossible de charger vos droits d'acces.")).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Modules du manuel' })).not.toBeInTheDocument();
  });

  it('requires a signed-in account for direct manual links', async () => {
    renderManual({ signedIn: false, route: '/manual/planning' });
    expect(await screen.findByText('Connexion requise')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Manuel d’utilisation' })).not.toBeInTheDocument();
  });
});
