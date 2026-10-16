import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES } from '../permissions/moduleAccess';
import { ROLE_KEYS, type RoleKey } from '../permissions/roles';
import { AppShell, type AppShellOutletContext } from './AppShell';

vi.mock('../releaseNotes/ReleaseNotes', () => ({ ReleaseNotes: () => null }));
vi.mock('../serviceNotes/serviceNoteQueries', () => ({ fetchUnsignedServiceNoteNotifications: vi.fn().mockResolvedValue([]), formatServiceNoteDate: vi.fn() }));
vi.mock('../humanResources/hrDocumentNotifications', () => ({ fetchHrDocumentExpiryNotifications: vi.fn().mockResolvedValue([]), formatHrDocumentExpiryDate: vi.fn(), getHrDocumentExpiryWindow: vi.fn() }));
vi.mock('../annualReviews/annualReviewQueries', () => ({ fetchAnnualReviewNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: vi.fn().mockResolvedValue([]), markActionPlanNotificationRead: vi.fn() }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn().mockResolvedValue([]), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'disciplinary:changed' }));
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: vi.fn().mockResolvedValue([]), markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning:changed' }));

function AuthorizedSeaOperation() {
  const { roles, previewMode } = useOutletContext<AppShellOutletContext>();
  return <div data-testid="authorized-sea-operation">{roles.join(',')}:{previewMode ? 'preview' : 'authenticated'}</div>;
}

function renderProfile(role: RoleKey, visible = true) {
  const user = { id: `${role}-sea-operation-fixture`, email: `${role}.sea-operation@example.test` };
  const permissionsForRole = vi.fn().mockResolvedValue({
    data: APP_MODULES.map((module) => ({
      module_key: module.key,
      role_key: role,
      is_visible: module.key === 'seaOperations' ? visible : module.allowedRoles.includes(role),
    })),
    error: null,
  });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      if (table === 'role_module_permissions') return { select: () => ({ in: permissionsForRole }) };
      if (table === 'people') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={['/modules/seaOperations']}><Routes>
    <Route element={<RequireAuth />}><Route element={<AppShell client={client as never} />}>
      <Route path="modules/seaOperations" element={<AuthorizedSeaOperation />} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
  return { client, permissionsForRole };
}

describe('sea operations navigation with distinct authenticated profile fixtures', () => {
  it.each(ROLE_KEYS)('loads the %s account role and opens Opération en Mer under Opérations', async (role) => {
    const { client, permissionsForRole } = renderProfile(role);
    expect(await screen.findByTestId('authorized-sea-operation')).toHaveTextContent(`${role}:authenticated`);
    const navigation = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    const operationsMenu = navigation.getByRole('button', { name: 'Opérations' });
    const seaOperationsLink = navigation.getByRole('link', { name: 'Opération en Mer' });
    expect(operationsMenu.closest('section')).toContainElement(seaOperationsLink);
    expect(seaOperationsLink).toHaveAttribute('href', '/modules/seaOperations');
    expect(seaOperationsLink).toHaveAttribute('aria-current', 'page');
    expect(client.from).toHaveBeenCalledWith('user_roles');
    expect(client.from).toHaveBeenCalledWith('role_module_permissions');
    expect(permissionsForRole).toHaveBeenCalledWith('role_key', [role]);
  });

  it.each(['marin', 'capitaine'] as const)('respects a denied %s permission for direct access', async (role) => {
    renderProfile(role, false);
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByTestId('authorized-sea-operation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Opération en Mer' })).not.toBeInTheDocument();
  });
});
