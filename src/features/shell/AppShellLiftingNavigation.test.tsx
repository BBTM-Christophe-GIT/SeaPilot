import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { RequireAuth } from '../auth/RequireAuth';
import { APP_MODULES } from '../permissions/moduleAccess';
import { LIFTING_SECTIONS } from '../lifting/liftingSections';
import { RELEASE_NOTES } from '../releaseNotes/releaseNotesCatalog';
import { AppShell, type AppShellOutletContext } from './AppShell';

vi.mock('../serviceNotes/serviceNoteQueries', () => ({ fetchUnsignedServiceNoteNotifications: vi.fn().mockResolvedValue([]), formatServiceNoteDate: vi.fn() }));
vi.mock('../humanResources/hrDocumentNotifications', () => ({ fetchHrDocumentExpiryNotifications: vi.fn().mockResolvedValue([]), formatHrDocumentExpiryDate: vi.fn(), getHrDocumentExpiryWindow: vi.fn() }));
vi.mock('../annualReviews/annualReviewQueries', () => ({ fetchAnnualReviewNotifications: vi.fn().mockResolvedValue([]) }));
vi.mock('../actionPlan/actionPlanQueries', () => ({ fetchActionPlanNotifications: vi.fn().mockResolvedValue([]), markActionPlanNotificationRead: vi.fn() }));
vi.mock('../disciplinary/disciplinaryWorkflow', () => ({ fetchDisciplinaryNotifications: vi.fn().mockResolvedValue([]), markDisciplinaryNotificationRead: vi.fn(), DISCIPLINARY_NOTIFICATIONS_CHANGED: 'disciplinary:changed' }));

function NavigationBlockProbe() {
  const { setLiftingNavigationBlocked } = useOutletContext<AppShellOutletContext>();
  return <div>Registre autorisé<button onClick={() => setLiftingNavigationBlocked?.(true)}>Modifier le contrôle</button><button onClick={() => setLiftingNavigationBlocked?.(false)}>Enregistrer le contrôle</button></div>;
}

function renderProfile(role: 'marin' | 'capitaine', path: string, visible: boolean) {
  const user = { id: `${role}-lifting-fixture`, email: `${role}@example.test` };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_roles') return { select: vi.fn().mockResolvedValue({ data: [{ role_key: role }], error: null }) };
      if (table === 'role_module_permissions') return { select: () => ({ in: async () => ({ data: APP_MODULES.map((module) => ({ module_key: module.key, role_key: role, is_visible: module.key === 'lifting' ? visible : module.allowedRoles.includes(role) })), error: null }) }) };
      if (table === 'people') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 42, first_name: 'Alex', last_name: 'DUPONT', function_label: role }, error: null }) }) }) };
      if (table === 'user_release_note_states') return { select: () => ({ eq: async () => ({ data: RELEASE_NOTES.map((note) => ({ note_id: note.id, read_at: '2026-09-23' })), error: null }) }) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  render(<AuthProvider client={client as never}><MemoryRouter initialEntries={[`/modules/lifting/${path}`]}><Routes>
    <Route element={<RequireAuth />}><Route element={<AppShell client={client as never} />}>
      <Route path="modules/lifting/:section" element={<NavigationBlockProbe />} />
    </Route></Route>
  </Routes></MemoryRouter></AuthProvider>);
}

describe('Levage with authenticated profile fixtures and the real permission loading path', () => {
  it('preserves the section-switch guard while controls are being edited', async () => {
    const user = userEvent.setup();
    renderProfile('capitaine', 'apparaux', true);
    await user.click(await screen.findByRole('button', { name: 'Modifier le contrôle' }));
    const towing = screen.getByRole('link', { name: 'Registre des Remorques' });
    expect(towing).toHaveAttribute('aria-disabled', 'true');
    await user.click(towing);
    expect(screen.getByRole('link', { name: 'Registre des Apparaux de Levage' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le contrôle' }));
    await user.click(towing);
    expect(towing).toHaveAttribute('aria-current', 'page');
  });
  it.each((['marin', 'capitaine'] as const).flatMap((role) => LIFTING_SECTIONS.map((section) => ({ role, ...section }))))('$role can open $path and sees the three direct sections', async ({ role, path }) => {
    renderProfile(role, path, true);
    expect(await screen.findByText('Registre autorisé')).toBeInTheDocument();
    const navigation = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    expect(navigation.queryByRole('link', { name: 'Levage' })).not.toBeInTheDocument();
    for (const section of LIFTING_SECTIONS) {
      const link = navigation.getByRole('link', { name: section.title });
      expect(link).toHaveAttribute('href', `/modules/lifting/${section.path}`);
      if (section.path === path) expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it.each((['marin', 'capitaine'] as const).flatMap((role) => LIFTING_SECTIONS.map((section) => ({ role, ...section }))))('$role cannot bypass a denied Levage permission via $path', async ({ role, path }) => {
    renderProfile(role, path, false);
    expect(await screen.findByText('Acces refuse pour ce module.')).toBeInTheDocument();
    expect(screen.queryByText('Registre autorisé')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Levage' })).not.toBeInTheDocument();
    for (const section of LIFTING_SECTIONS) expect(screen.queryByRole('link', { name: section.title })).not.toBeInTheDocument();
  });
});
