import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { fetchDisciplinaryNotifications, markDisciplinaryNotificationRead } from '../disciplinary/disciplinaryWorkflow';
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
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: async () => [], markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning-notifications:changed' }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn(), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'seapilot:disciplinary-notifications' }));

const notices = [{ id: 'notice-1', case_id: 'case-1', title: 'Courrier partagé pour relecture', created_at: '2026-09-15T12:00:00Z' }];
function renderShell() {
  return render(<MemoryRouter><Routes><Route element={<AppShell client={{} as never} />}><Route index element={<div>Accueil</div>} /><Route path="modules/disciplinary" element={<div>Dossier ouvert</div>} /></Route></Routes></MemoryRouter>);
}
describe('confidential disciplinary bell notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.roles = ['direction']; vi.mocked(fetchDisciplinaryNotifications).mockResolvedValue(notices); vi.mocked(markDisciplinaryNotificationRead).mockResolvedValue(undefined); });
  it.each(['admin', 'direction'] as RoleKey[])('notifies the real %s profile and opens the exact case review', async (role) => {
    fixture.roles = [role]; const user = userEvent.setup(); renderShell();
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 élément/ }));
    const link = screen.getByRole('link', { name: /Courrier partagé pour relecture/ });
    expect(link).toHaveAttribute('href', '/modules/disciplinary?case=case-1&tab=review');
    await user.click(link);
    expect(await screen.findByText('Dossier ouvert')).toBeInTheDocument();
    await waitFor(() => expect(markDisciplinaryNotificationRead).toHaveBeenCalledWith(expect.anything(), 'notice-1'));
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });
  it.each(['marin', 'capitaine', 'armement'] as RoleKey[])('does not request disciplinary notifications for %s', async (role) => {
    fixture.roles = [role]; const user = userEvent.setup(); renderShell();
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(fetchDisciplinaryNotifications).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Sanctions disciplinaires' })).not.toBeInTheDocument();
  });
  it('refreshes on focus and retains the notification when marking read fails', async () => {
    const user = userEvent.setup(); vi.mocked(fetchDisciplinaryNotifications).mockResolvedValue([]); renderShell();
    await screen.findByRole('button', { name: 'Notifications' });
    vi.mocked(fetchDisciplinaryNotifications).mockResolvedValue(notices);
    act(() => window.dispatchEvent(new Event('focus')));
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 élément/ }));
    vi.mocked(markDisciplinaryNotificationRead).mockRejectedValue(new Error('Hors connexion'));
    await user.click(screen.getByRole('link', { name: /Courrier partagé pour relecture/ }));
    await screen.findByText('Dossier ouvert');
    expect(screen.getByRole('button', { name: /Notifications, 1 élément/ })).toBeInTheDocument();
  });
});
