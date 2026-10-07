import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { APP_MODULES } from '../permissions/moduleAccess';
import type { RoleKey } from '../permissions/roles';
import { AppShell } from './AppShell';

function renderAccount({
  role = 'marin',
  metadata = {},
  hasPortrait = false,
  portraitDenied = false,
  portraitResult,
}: {
  role?: RoleKey;
  metadata?: Record<string, unknown>;
  hasPortrait?: boolean;
  portraitDenied?: boolean;
  portraitResult?: Promise<{ data: Blob | null; error: Error | null }>;
} = {}) {
  const user = { id: `${role}-account`, email: `${role}@example.test`, user_metadata: metadata };
  const personEq = vi.fn().mockReturnThis();
  const download = vi.fn().mockReturnValue(portraitResult || Promise.resolve(portraitDenied
    ? { data: null, error: new Error('Portrait unavailable') }
    : { data: new Blob(['portrait'], { type: 'image/jpeg' }), error: null }));
  const storageFrom = vi.fn().mockReturnValue({ download });
  const personResult = vi.fn().mockResolvedValue({ data: {
    id: 42, first_name: 'Luc', last_name: 'MARTIN', active: true,
    photo_storage_path: hasPortrait ? '42/portrait.jpg' : null,
  }, error: null });
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
        eq: table === 'people' ? personEq : vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: personResult,
      };
    }),
    storage: { from: storageFrom },
  };

  render(
    <AuthProvider client={client as never}>
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell client={client as never} />}>
            <Route index element={<div>Account home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  return { personEq, download, storageFrom, personResult, client };
}

describe('AppShell account photo', () => {
  it.each(['marin', 'capitaine'] as const)('shows the existing private RH portrait for a real %s account fixture', async (role) => {
    const { personEq, download, storageFrom } = renderAccount({
      role, hasPortrait: true, metadata: { avatar_url: 'https://example.test/provider.jpg' },
    });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });

    await waitFor(() => expect(userButton.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg;base64,/)));
    expect(storageFrom).toHaveBeenCalledWith('hr-portraits');
    await waitFor(() => expect(download).toHaveBeenCalledWith('42/portrait.jpg'));
    expect(personEq).toHaveBeenCalledWith('user_id', `${role}-account`);
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Vue de profil' })).not.toBeInTheDocument();
  });

  it.each(['avatar_url', 'picture', 'photo_url'])('uses an existing %s photo when no RH portrait is present', async (field) => {
    const { download } = renderAccount({ metadata: { [field]: 'https://example.test/account.jpg' } });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });

    expect(userButton.querySelector('img')).toHaveAttribute('src', 'https://example.test/account.jpg');
    expect(download).not.toHaveBeenCalled();
  });

  it('uses the existing account photo if its private RH portrait cannot be read', async () => {
    renderAccount({ hasPortrait: true, portraitDenied: true, metadata: { picture: 'https://example.test/account.jpg' } });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });

    expect(userButton.querySelector('img')).toHaveAttribute('src', 'https://example.test/account.jpg');
    expect(screen.getByText('Account home')).toBeInTheDocument();
  });

  it('keeps the account and its existing photo available while a private portrait loads', async () => {
    let completePortrait!: (result: { data: Blob | null; error: Error | null }) => void;
    const portraitResult = new Promise<{ data: Blob | null; error: Error | null }>((resolve) => { completePortrait = resolve; });
    const { download } = renderAccount({ hasPortrait: true, portraitResult, metadata: { avatar_url: 'https://example.test/account.jpg' } });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });

    await waitFor(() => expect(download).toHaveBeenCalledWith('42/portrait.jpg'));
    expect(userButton.querySelector('img')).toHaveAttribute('src', 'https://example.test/account.jpg');
    expect(screen.getByText('Account home')).toBeInTheDocument();
    fireEvent.click(userButton);
    expect(screen.getByRole('menuitem', { name: 'Deconnexion' })).toBeInTheDocument();

    await act(async () => { completePortrait({ data: new Blob(['portrait'], { type: 'image/jpeg' }), error: null }); });
    await waitFor(() => expect(userButton.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/jpeg;base64,/)));
  });

  it('keeps initials and the existing account menu when no usable photo is available', async () => {
    renderAccount({ hasPortrait: true, portraitDenied: true, metadata: { avatar_url: 42, picture: '  ' } });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });

    expect(userButton.querySelector('img')).toBeNull();
    expect(userButton.querySelector('.user-avatar')).toHaveTextContent('LM');
    fireEvent.click(userButton);
    expect(screen.getByRole('menuitem', { name: 'Deconnexion' })).toBeInTheDocument();
  });

  it('does not read or display the previous account’s portrait while a new identity is loading', async () => {
    let completeOldPortrait!: (result: { data: Blob | null; error: Error | null }) => void;
    const portraitResult = new Promise<{ data: Blob | null; error: Error | null }>((resolve) => { completeOldPortrait = resolve; });
    const { client, personEq, personResult, download } = renderAccount({ role: 'direction', hasPortrait: true, portraitResult });
    await screen.findByRole('button', { name: /Luc MARTIN/ });
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));

    const nextPerson = { data: { id: 43, first_name: 'Paul', last_name: 'DURAND', active: true, photo_storage_path: '43/portrait.jpg' }, error: null };
    let completeNextPerson!: (result: typeof nextPerson) => void;
    personResult.mockReturnValueOnce(new Promise<typeof nextPerson>((resolve) => { completeNextPerson = resolve; }));
    const nextUser = { id: 'second-direction-account', email: 'second@example.test', user_metadata: {} };
    client.auth.getUser.mockResolvedValue({ data: { user: nextUser }, error: null });
    await act(async () => { client.auth.onAuthStateChange.mock.calls[0][0]('SIGNED_IN', { user: nextUser }); });
    await waitFor(() => expect(personEq).toHaveBeenCalledWith('user_id', nextUser.id));

    expect(download).toHaveBeenCalledTimes(1);
    download.mockResolvedValue({ data: new Blob(['new-portrait'], { type: 'image/jpeg' }), error: null });
    await act(async () => {
      completeOldPortrait({ data: new Blob(['old-portrait'], { type: 'image/jpeg' }), error: null });
      completeNextPerson(nextPerson);
    });
    const userButton = await screen.findByRole('button', { name: /Paul DURAND/ });
    await waitFor(() => expect(userButton.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,bmV3LXBvcnRyYWl0'));
    expect(download.mock.calls.map(([path]) => path)).toEqual(['42/portrait.jpg', '43/portrait.jpg']);
  });

  it('keeps the user name and initials if the account image cannot be displayed', async () => {
    renderAccount({ metadata: { avatar_url: 'https://example.test/broken.jpg' } });
    const userButton = await screen.findByRole('button', { name: /Luc MARTIN/ });
    fireEvent.error(userButton.querySelector('img')!);

    expect(userButton).toHaveAccessibleName(/Luc MARTIN\s*Marin/);
    expect(userButton.querySelector('.user-avatar')).toHaveTextContent('LM');
    expect(userButton.querySelector('img')).toBeNull();
  });
});
