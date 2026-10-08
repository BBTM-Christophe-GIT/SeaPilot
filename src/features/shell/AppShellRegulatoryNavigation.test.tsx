import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useOutletContext, useParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES, type ModuleKey } from '../permissions/moduleAccess';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';
import { AppShell, type AppShellOutletContext } from './AppShell';

vi.mock('../releaseNotes/ReleaseNotes', () => ({ ReleaseNotes: () => null }));
vi.mock('../serviceNotes/serviceNoteQueries', () => ({ fetchUnsignedServiceNoteNotifications: vi.fn().mockResolvedValue([]), formatServiceNoteDate: vi.fn() }));
vi.mock('../humanResources/hrDocumentNotifications', () => ({ fetchHrDocumentExpiryNotifications: vi.fn().mockResolvedValue([]), formatHrDocumentExpiryDate: vi.fn(), getHrDocumentExpiryWindow: vi.fn() }));
vi.mock('../annualReviews/annualReviewQueries', () => ({ fetchAnnualReviewNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: vi.fn().mockResolvedValue([]), markActionPlanNotificationRead: vi.fn() }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn().mockResolvedValue([]), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'disciplinary:changed' }));
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: vi.fn().mockResolvedValue([]), markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning:changed' }));

function AuthorizedPage() {
  const { roles } = useOutletContext<AppShellOutletContext>();
  const { moduleKey } = useParams();
  return <div data-testid="authorized-regulatory-page">{moduleKey}:{roles.join(',')}</div>;
}

function renderProfile(role: RoleKey, moduleKey: ModuleKey, permissions: Partial<Record<ModuleKey, boolean>> = {}) {
  const user = { id: `${role}-regulatory-fixture`, email: `${role}@example.test` };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      if (table === 'role_module_permissions') return { select: () => ({ in: async () => ({ data: APP_MODULES.map((module) => ({ module_key: module.key, role_key: role, is_visible: permissions[module.key] ?? module.allowedRoles.includes(role) })), error: null }) }) };
      if (table === 'people') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={[`/modules/${moduleKey}`]}><Routes>
    <Route element={<RequireAuth />}><Route element={<AppShell client={client as never} />}>
      <Route path="modules/:moduleKey" element={<AuthorizedPage />} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
  return client;
}

describe('regulatory navigation with authenticated profile fixtures', () => {
  it.each(ROLE_KEYS)('loads the real %s role and opens the two regulatory categories', async (role) => {
    const client = renderProfile(role, 'regulatorySafety');
    const overview = await screen.findByRole('link', { name: 'Bibliothèque Réglementaire' });
    const family = within(overview.closest('section')!);
    expect(overview).toHaveAttribute('href', '/modules/regulatoryLibrary');
    expect(overview.closest('section')).toHaveAttribute('data-family-theme', 'regulatory');
    expect(family.getAllByRole('link')).toHaveLength(3);
    expect(family.getByRole('link', { name: 'Sécurité Maritime' })).toHaveAttribute('href', '/modules/regulatorySafety');
    expect(family.getByRole('link', { name: 'Sécurité Maritime' })).toHaveAttribute('aria-current', 'page');
    expect(family.getByRole('link', { name: 'Code des Transports' })).toHaveAttribute('href', '/modules/regulatoryTransport');
    expect(screen.getByTestId('authorized-regulatory-page')).toHaveTextContent(`regulatorySafety:${role}`);
    expect(client.from).toHaveBeenCalledWith('user_roles');
    expect(client.from).toHaveBeenCalledWith('role_module_permissions');
    const user = userEvent.setup();
    await user.click(family.getByRole('link', { name: 'Code des Transports' }));
    expect(screen.getByTestId('authorized-regulatory-page')).toHaveTextContent(`regulatoryTransport:${role}`);
  });

  it('opens the overview independently from the submenu toggle', async () => {
    renderProfile('direction', 'regulatorySafety');
    const overview = await screen.findByRole('link', { name: 'Bibliothèque Réglementaire' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Replier Bibliothèque Réglementaire' }));
    expect(screen.getByRole('button', { name: 'Déplier Bibliothèque Réglementaire' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Sécurité Maritime' })).not.toBeInTheDocument();
    expect(screen.getByTestId('authorized-regulatory-page')).toHaveTextContent('regulatorySafety:direction');
    await user.click(overview);
    expect(screen.getByTestId('authorized-regulatory-page')).toHaveTextContent('regulatoryLibrary:direction');
    expect(overview).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Déplier Bibliothèque Réglementaire' }));
    expect(screen.getByRole('link', { name: 'Sécurité Maritime' })).toBeInTheDocument();
  });

  it.each(['marin', 'capitaine'] as const)('hides the family and denies %s direct category access when the overview permission is denied', async (role) => {
    renderProfile(role, 'regulatorySafety', { regulatoryLibrary: false });
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByTestId('authorized-regulatory-page')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bibliothèque Réglementaire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sécurité Maritime' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Code des Transports' })).not.toBeInTheDocument();
  });

  it.each(['marin', 'capitaine'] as const)('retains the overview but denies %s direct access to a hidden category', async (role) => {
    renderProfile(role, 'regulatoryTransport', { regulatoryTransport: false });
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bibliothèque Réglementaire' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sécurité Maritime' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Code des Transports' })).not.toBeInTheDocument();
  });

  it('keeps the overview navigable when both category permissions are hidden', async () => {
    renderProfile('armement', 'regulatoryLibrary', { regulatorySafety: false, regulatoryTransport: false });
    const overview = await screen.findByRole('link', { name: 'Bibliothèque Réglementaire' });
    expect(within(overview.closest('section')!).getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Bibliothèque Réglementaire/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('authorized-regulatory-page')).toHaveTextContent('regulatoryLibrary:armement');
  });
});
