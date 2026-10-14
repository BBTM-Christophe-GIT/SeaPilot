import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { AppShell, type AppShellOutletContext } from './AppShell';

vi.mock('../releaseNotes/ReleaseNotes', () => ({ ReleaseNotes: () => null }));
vi.mock('../serviceNotes/serviceNoteQueries', () => ({ fetchUnsignedServiceNoteNotifications: vi.fn().mockResolvedValue([]), formatServiceNoteDate: vi.fn() }));
vi.mock('../humanResources/hrDocumentNotifications', () => ({ fetchHrDocumentExpiryNotifications: vi.fn().mockResolvedValue([]), formatHrDocumentExpiryDate: vi.fn(), getHrDocumentExpiryWindow: vi.fn() }));
vi.mock('../annualReviews/annualReviewQueries', () => ({ fetchAnnualReviewNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: vi.fn().mockResolvedValue([]), markActionPlanNotificationRead: vi.fn() }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn().mockResolvedValue([]), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'disciplinary:changed' }));
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: vi.fn().mockResolvedValue([]), markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning:changed' }));

function MedicalRouteProbe() {
  const { roles } = useOutletContext<AppShellOutletContext>();
  return <div data-testid="authorized-medical-route">{roles.join(',')}</div>;
}

function renderAuthenticatedProfile(role: RoleKey, configuredVisible = true) {
  const user = { id: `${role}-medical-profile`, email: `${role}@example.test` };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      if (table === 'role_module_permissions') return { select: () => ({ in: async () => ({ data: APP_MODULES.map((module) => ({ module_key: module.key, role_key: role, is_visible: module.key === 'medicalLogbook' ? configuredVisible : module.allowedRoles.includes(role) })), error: null }) }) };
      if (table === 'people') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={['/modules/medicalLogbook']}><Routes>
    <Route element={<RequireAuth />}><Route element={<AppShell client={client as never} />}>
      <Route path="modules/medicalLogbook" element={<MedicalRouteProbe />} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
  return client;
}

describe('medical register navigation with authenticated profile fixtures', () => {
  it.each(['admin', 'capitaine'] as const)('opens the module under Registres for the authenticated %s', async (role) => {
    const client = renderAuthenticatedProfile(role);
    const link = await screen.findByRole('link', { name: 'Registre médical' });
    const registers = screen.getByRole('button', { name: 'Registres' }).closest('section')!;
    expect(within(registers).getByRole('link', { name: 'Registre médical' })).toBe(link);
    expect(link).toHaveAttribute('href', '/modules/medicalLogbook');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(registers).toHaveAttribute('data-family-theme', 'registers');
    expect(screen.getByTestId('authorized-medical-route')).toHaveTextContent(role);
    expect(client.from).toHaveBeenCalledWith('user_roles');
  });

  it.each(['direction', 'armement', 'marin'] as const)('denies direct access for %s even with a stale visible permission', async (role) => {
    renderAuthenticatedProfile(role);
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registre médical' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('authorized-medical-route')).not.toBeInTheDocument();
  });

  it('honors a removed captain navigation permission', async () => {
    renderAuthenticatedProfile('capitaine', false);
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registre médical' })).not.toBeInTheDocument();
  });
});
