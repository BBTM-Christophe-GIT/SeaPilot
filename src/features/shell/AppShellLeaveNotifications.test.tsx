import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { fetchPlanningLeaveNotifications, markPlanningLeaveNotificationRead } from '../planning/planningLeaveNotifications';
import { AppShell } from './AppShell';

const fixture = vi.hoisted(() => ({ roles: ['marin'] as RoleKey[] }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'requester', email: 'requester@example.invalid' } }, signOut: vi.fn() }) }));
vi.mock('../profiles/profileQueries', () => ({ fetchCurrentUserRoles: async () => fixture.roles, fetchCurrentPersonSummary: async () => null }));
vi.mock('../permissions/navigationPermissions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../permissions/navigationPermissions')>();
  return { ...original, fetchVisibleModulesForRoles: async (_client: unknown, roles: RoleKey[]) => original.getDefaultVisibleModules(roles) };
});
vi.mock('../serviceNotes/serviceNoteQueries', async (importOriginal) => ({ ...await importOriginal<typeof import('../serviceNotes/serviceNoteQueries')>(), fetchUnsignedServiceNoteNotifications: async () => [] }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: async () => [], markActionPlanNotificationRead: vi.fn() }));
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: vi.fn(), markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning-notifications:changed' }));

const notices = [
  { id: 1, absenceId: 10, title: 'Congés acceptés', body: 'Du 11/01/2027 au 12/01/2027. Commentaire : Bon repos.', createdAt: '2026-09-10T12:00:00Z' },
  { id: 2, absenceId: 11, title: 'Congés refusés', body: 'Du 01/02/2027 au 02/02/2027. Commentaire : Effectif insuffisant.', createdAt: '2026-09-10T13:00:00Z' },
];
function renderShell() {
  return render(<MemoryRouter><Routes><Route element={<AppShell client={{} as never} />}><Route index element={<div>Accueil</div>} /><Route path="modules/planning" element={<div>Planning ouvert</div>} /></Route></Routes></MemoryRouter>);
}

describe('leave decisions in the authenticated notification bell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.roles = ['marin'];
    vi.mocked(fetchPlanningLeaveNotifications).mockResolvedValue(notices);
    vi.mocked(markPlanningLeaveNotificationRead).mockResolvedValue(undefined);
  });

  it.each(['admin', 'marin', 'capitaine'] as RoleKey[])('shows approvals and refusals to a %s requester and marks the opened notice read', async (role) => {
    fixture.roles = [role];
    const user = userEvent.setup();
    renderShell();
    await user.click(await screen.findByRole('button', { name: /Notifications, 2 élément/ }));
    expect(screen.getByRole('heading', { name: 'Demandes de congés' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Congés refusés/ })).toHaveTextContent('Effectif insuffisant');
    await user.click(screen.getByRole('link', { name: /Congés acceptés/ }));
    expect(await screen.findByText('Planning ouvert')).toBeInTheDocument();
    await waitFor(() => expect(markPlanningLeaveNotificationRead).toHaveBeenCalledWith(expect.anything(), 1));
    expect(await screen.findByRole('button', { name: /Notifications, 1 élément/ })).toBeInTheDocument();
  });

  it('refreshes after another session decides a request and the window regains focus', async () => {
    vi.mocked(fetchPlanningLeaveNotifications).mockResolvedValue([]);
    renderShell();
    await screen.findByRole('button', { name: 'Notifications' });
    vi.mocked(fetchPlanningLeaveNotifications).mockResolvedValue([notices[1]]);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByRole('button', { name: /Notifications, 1 élément/ })).toBeInTheDocument();
  });

  it('keeps an unread decision when marking it read fails', async () => {
    const user = userEvent.setup();
    vi.mocked(markPlanningLeaveNotificationRead).mockRejectedValue(new Error('Hors connexion'));
    renderShell();
    await user.click(await screen.findByRole('button', { name: /Notifications, 2 élément/ }));
    await user.click(screen.getByRole('link', { name: /Congés refusés/ }));
    await screen.findByText('Planning ouvert');
    expect(screen.getByRole('button', { name: /Notifications, 2 élément/ })).toBeInTheDocument();
  });
});
