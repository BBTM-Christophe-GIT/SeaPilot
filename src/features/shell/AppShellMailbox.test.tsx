import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { APP_MODULES } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { AppShell } from './AppShell';
import { loadGmailAuthorization, type GoogleTokenClient, type GoogleTokenClientConfig } from '../mailbox/gmailAuthorization';
import { fetchGmailUnreadCount, GmailUnreadError, GMAIL_COUNTER_SCOPES } from '../mailbox/gmailUnread';

vi.mock('../mailbox/gmailAuthorization', async (importOriginal) => ({
  ...await importOriginal<typeof import('../mailbox/gmailAuthorization')>(), loadGmailAuthorization: vi.fn(),
}));
vi.mock('../mailbox/gmailUnread', async (importOriginal) => ({
  ...await importOriginal<typeof import('../mailbox/gmailUnread')>(), fetchGmailUnreadCount: vi.fn(),
}));

let authorizationRequests: GoogleTokenClientConfig[];
let requestAccessToken: Mock<GoogleTokenClient['requestAccessToken']>;

beforeEach(() => {
  vi.stubEnv('VITE_GMAIL_CLIENT_ID', '');
  authorizationRequests = [];
  requestAccessToken = vi.fn<GoogleTokenClient['requestAccessToken']>();
  vi.mocked(loadGmailAuthorization).mockResolvedValue({ initTokenClient: vi.fn((config: GoogleTokenClientConfig) => {
    authorizationRequests.push(config);
    return { requestAccessToken };
  }) });
  vi.mocked(fetchGmailUnreadCount).mockResolvedValue(5);
});

function renderAccount({ role = 'marin', previewMode = false }: { role?: RoleKey; previewMode?: boolean } = {}) {
  const user = { id: `${role}-account`, email: `${role}+connexion@example.test`, user_metadata: { email: 'autre-profil@example.test' } };
  const personResult = vi.fn().mockResolvedValue({ data: { id: 42, first_name: 'Luc', last_name: 'MARTIN', email: 'personne-rh@example.test', active: true }, error: null });
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user } }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const data = table === 'user_roles' ? [{ role_key: role }]
        : table === 'role_module_permissions' ? APP_MODULES.filter((module) => module.allowedRoles.includes(role)).map((module) => ({
          module_key: module.key, role_key: role, is_visible: true,
        })) : [];
      const result = Promise.resolve({ data, error: null });
      return {
        then: result.then.bind(result),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: personResult,
      };
    }),
  };

  render(
    <AuthProvider client={client as never}>
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell client={client as never} previewMode={previewMode} />}>
            <Route index element={<div>Account home</div>} />
            <Route element={<div>Manuel affiché</div>} path="/manual" />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  return { client, personResult };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('AppShell mailbox shortcut', () => {
  it.each(['marin', 'capitaine'] as const)('uses the actual login email for a real %s account fixture and keeps the header order', async (role) => {
    renderAccount({ role });
    const shortcut = await screen.findByRole('link', { name: `Ouvrir Gmail pour ${role}+connexion@example.test dans une nouvelle fenêtre` });
    await screen.findByRole('button', { name: /Luc MARTIN/ });

    expect(shortcut).toHaveAttribute('href', `https://mail.google.com/mail/?authuser=${role}%2Bconnexion%40example.test#inbox`);
    expect(shortcut.previousElementSibling).toHaveClass('topbar-notifications');
    expect(shortcut.nextElementSibling).toHaveAccessibleName('Manuel d’utilisation');
    expect(screen.queryByRole('combobox', { name: 'Vue de profil' })).not.toBeInTheDocument();
    expect(shortcut.querySelector('.topbar-mail-badge')).not.toBeInTheDocument();
    expect(loadGmailAuthorization).not.toHaveBeenCalled();
  });

  it('closes the notification and account menus on opening Gmail while keeping help available', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAccount();
    const shortcut = await screen.findByRole('link', { name: /Ouvrir Gmail pour marin/ });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByRole('navigation', { name: 'Raccourcis notifications' })).toBeInTheDocument();
    await user.click(shortcut);
    expect(screen.queryByRole('navigation', { name: 'Raccourcis notifications' })).not.toBeInTheDocument();
    expect(shortcut).toHaveFocus();

    await user.click(userButton);
    expect(screen.getByRole('menuitem', { name: 'Deconnexion' })).toBeInTheDocument();
    await user.click(shortcut);
    expect(screen.queryByRole('menuitem', { name: 'Deconnexion' })).not.toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('link', { name: 'Manuel d’utilisation' }));
    expect(screen.getByText('Manuel affiché')).toBeInTheDocument();
  });

  it('keeps the shortcut inactive in preview even with a real authenticated account', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAccount({ role: 'admin', previewMode: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Boîte mail indisponible' })).toBeDisabled());

    expect(screen.queryByRole('link', { name: /Ouvrir Gmail/ })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Boîte mail indisponible' }));
    expect(open).not.toHaveBeenCalled();
    expect(loadGmailAuthorization).not.toHaveBeenCalled();
  });

  it('does not retain the previous account mailbox while the replacement identity loads', async () => {
    const { client, personResult } = renderAccount();
    await screen.findByRole('button', { name: /Luc MARTIN/ });
    let finishPerson!: (result: Awaited<ReturnType<typeof personResult>>) => void;
    personResult.mockReturnValueOnce(new Promise((resolve) => { finishPerson = resolve; }));
    const nextUser = { id: 'second-account', email: 'nouveau@example.test', user_metadata: { email: 'ancien-profil@example.test' } };
    client.auth.getUser.mockResolvedValue({ data: { user: nextUser }, error: null });

    await act(async () => { client.auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: nextUser }); });

    expect(screen.queryByRole('link', { name: /Ouvrir Gmail pour marin/ })).not.toBeInTheDocument();
    await act(async () => { finishPerson({ data: null, error: null }); });
    expect(await screen.findByRole('link', { name: /Ouvrir Gmail pour nouveau@example.test/ })).toHaveAttribute('href', 'https://mail.google.com/mail/?authuser=nouveau%40example.test#inbox');
  });

  it.each(['marin', 'capitaine'] as const)('activates a real %s account’s optional counter only from its menu', async (role) => {
    vi.stubEnv('VITE_GMAIL_CLIENT_ID', '123456789-counter.apps.googleusercontent.com');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAccount({ role });
    const shortcut = await screen.findByRole('link', { name: /Ouvrir Gmail/ });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });
    const user = userEvent.setup();

    expect(screen.queryByRole('menuitem', { name: 'Activer le compteur Gmail' })).not.toBeInTheDocument();
    await user.click(shortcut);
    expect(open).toHaveBeenCalledOnce();
    expect(requestAccessToken).not.toHaveBeenCalled();
    expect(fetchGmailUnreadCount).not.toHaveBeenCalled();
    await user.click(userButton);
    const activate = await screen.findByRole('menuitem', { name: 'Activer le compteur Gmail' });
    expect(activate).toBeEnabled();
    await user.click(activate);
    expect(requestAccessToken).toHaveBeenCalledExactlyOnceWith({ prompt: 'consent', login_hint: `${role}+connexion@example.test`, include_granted_scopes: false });
    await act(async () => { authorizationRequests[0].callback({ access_token: 'test-google-token', expires_in: 3600, scope: GMAIL_COUNTER_SCOPES }); });

    expect(shortcut.querySelector('.topbar-mail-badge')).toHaveTextContent('5');
    expect(shortcut).toHaveAccessibleName(expect.stringContaining('5 messages non lus'));
    expect(screen.getByRole('menuitem', { name: 'Actualiser le compteur Gmail' })).toBeEnabled();
    await user.click(screen.getByRole('menuitem', { name: 'Actualiser le compteur Gmail' }));
    expect(fetchGmailUnreadCount).toHaveBeenCalledOnce();
    expect(shortcut.querySelector('.topbar-mail-badge')).toHaveTextContent('5');

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    vi.mocked(fetchGmailUnreadCount).mockRejectedValueOnce(new GmailUnreadError('wrong_account'));
    await user.click(screen.getByRole('menuitem', { name: 'Actualiser le compteur Gmail' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Le compte Google ne correspond pas au compte SeaPilot.'));
    expect(shortcut.querySelector('.topbar-mail-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reconnecter le compteur Gmail' })).toBeEnabled();
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('does not expose activation or request the SDK in configured preview', async () => {
    vi.stubEnv('VITE_GMAIL_CLIENT_ID', '123456789-counter.apps.googleusercontent.com');
    renderAccount({ role: 'admin', previewMode: true });
    await userEvent.setup().click(await screen.findByRole('button', { name: /Luc MARTIN/ }));

    expect(screen.queryByRole('menuitem', { name: /compteur Gmail/ })).not.toBeInTheDocument();
    expect(loadGmailAuthorization).not.toHaveBeenCalled();
  });
});
