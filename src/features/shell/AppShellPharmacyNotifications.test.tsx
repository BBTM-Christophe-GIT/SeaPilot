import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import { fetchPharmacyNotifications } from '../pharmacy/pharmacyQueries';
import { AppShell } from './AppShell';

const fixture = vi.hoisted(() => ({ roles: ['marin'] as RoleKey[], visible: true }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'pharmacy-user', email: 'pharmacy@example.invalid' } }, signOut: vi.fn() }) }));
vi.mock('../profiles/profileQueries', () => ({ fetchCurrentUserRoles: async () => fixture.roles, fetchCurrentPersonSummary: async () => null }));
vi.mock('../permissions/navigationPermissions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../permissions/navigationPermissions')>();
  return { ...original, fetchVisibleModulesForRoles: async (_client: unknown, roles: RoleKey[]) => original.getDefaultVisibleModules(roles).filter((module) => module.key !== 'pharmacy' || fixture.visible) };
});
vi.mock('../serviceNotes/serviceNoteQueries', async (importOriginal) => ({ ...await importOriginal<typeof import('../serviceNotes/serviceNoteQueries')>(), fetchUnsignedServiceNoteNotifications: async () => [] }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: async () => [], markActionPlanNotificationRead: vi.fn() }));
vi.mock('../planning/planningLeaveNotifications', () => ({ fetchPlanningLeaveNotifications: async () => [], markPlanningLeaveNotificationRead: vi.fn(), PLANNING_NOTIFICATIONS_CHANGED: 'planning-notifications:changed' }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: async () => [], markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'seapilot:disciplinary-notifications' }));
vi.mock('../pharmacy/pharmacyQueries', () => ({ fetchPharmacyNotifications: vi.fn() }));

const notices = [{ id: 'control-1', kind: 'control' as const, vessel_id: 4, vessel_name: 'SUROIT', title: 'Contrôle Pharmacie', expires_on: '2026-10-19', days_until_expiry: -1, item_id: null }];
function renderShell() {
  return render(<MemoryRouter><Routes><Route element={<AppShell client={{} as never} />}><Route index element={<div>Accueil</div>} /><Route path="modules/pharmacy" element={<div>Pharmacie ouverte</div>} /></Route></Routes></MemoryRouter>);
}

describe('pharmacy expiry notifications', () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.roles = ['marin']; fixture.visible = true; vi.mocked(fetchPharmacyNotifications).mockResolvedValue(notices); });
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as RoleKey[])('displays scoped server alerts for the real %s role', async (role) => {
    fixture.roles = [role]; const user = userEvent.setup(); renderShell();
    await user.click(await screen.findByRole('button', { name: /Notifications, 1 élément/ }));
    const link = screen.getByRole('link', { name: /SUROIT.*Contrôle Pharmacie/ });
    expect(link).toHaveAttribute('href', '/modules/pharmacy?vessel=4&filter=expiry');
    expect(screen.getByText('Échéance dépassée de 1 jour(s)')).toBeInTheDocument();
    await user.click(link);
    expect(await screen.findByText('Pharmacie ouverte')).toBeInTheDocument();
    // Opening an alert must not dismiss an unresolved expired control.
    expect(screen.getByRole('button', { name: /Notifications, 1 élément/ })).toBeInTheDocument();
  });
  it('does not fetch alerts when the pharmacy module is hidden', async () => {
    fixture.visible = false; renderShell();
    await screen.findByRole('button', { name: 'Notifications' });
    expect(fetchPharmacyNotifications).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Inventaire Pharmacie' })).not.toBeInTheDocument();
  });
  it('refreshes when a pharmacy record changes', async () => {
    vi.mocked(fetchPharmacyNotifications).mockResolvedValue([]); renderShell();
    await waitFor(() => expect(fetchPharmacyNotifications).toHaveBeenCalledOnce());
    vi.mocked(fetchPharmacyNotifications).mockResolvedValue(notices);
    act(() => window.dispatchEvent(new Event('pharmacy:changed')));
    await screen.findByRole('button', { name: /Notifications, 1 élément/ });
  });
});
