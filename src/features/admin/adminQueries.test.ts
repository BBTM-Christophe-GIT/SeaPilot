import { describe, expect, it, vi } from 'vitest';
import { assignUserRole, fetchAdminUsers, mapAdminProfileRows, removeUserRole } from './adminQueries';

describe('mapAdminProfileRows', () => {
  it('maps profiles and filters unknown roles', () => {
    expect(
      mapAdminProfileRows([
        {
          id: 'user-1',
          email: 'captain@example.test',
          display_name: 'Captain',
          user_roles: [{ role_key: 'capitaine' }, { role_key: 'unknown' }],
        },
      ]),
    ).toEqual([
      {
        id: 'user-1',
        email: 'captain@example.test',
        displayName: 'Captain',
        roles: ['capitaine'],
      },
    ]);
  });

  it('falls back to email when display name is empty', () => {
    expect(
      mapAdminProfileRows([
        {
          id: 'user-2',
          email: 'marin@example.test',
          display_name: '',
          user_roles: null,
        },
      ]),
    ).toEqual([
      {
        id: 'user-2',
        email: 'marin@example.test',
        displayName: 'marin@example.test',
        roles: [],
      },
    ]);
  });
});

describe('fetchAdminUsers', () => {
  it('loads profiles with role rows', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'user-1',
          email: 'admin@example.test',
          display_name: 'Admin',
          user_roles: [{ role_key: 'admin' }],
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });

    await expect(fetchAdminUsers({ from } as never)).resolves.toEqual([
      {
        id: 'user-1',
        email: 'admin@example.test',
        displayName: 'Admin',
        roles: ['admin'],
      },
    ]);
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id, email, display_name, user_roles!user_roles_user_id_fkey(role_key)');
    expect(order).toHaveBeenCalledWith('email', { ascending: true });
  });

  it('throws Supabase errors', async () => {
    const error = new Error('RLS denied');
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error }),
        }),
      }),
    };

    await expect(fetchAdminUsers(client as never)).rejects.toThrow(error);
  });
});

describe('role mutations', () => {
  it('inserts a role assignment', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });

    await assignUserRole({ from } as never, 'user-1', 'direction');

    expect(from).toHaveBeenCalledWith('user_roles');
    expect(insert).toHaveBeenCalledWith({ user_id: 'user-1', role_key: 'direction' });
  });

  it('deletes a role assignment', async () => {
    const eqRole = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqRole });
    const deleteRequest = vi.fn().mockReturnValue({ eq: eqUser });
    const from = vi.fn().mockReturnValue({ delete: deleteRequest });

    await removeUserRole({ from } as never, 'user-1', 'marin');

    expect(from).toHaveBeenCalledWith('user_roles');
    expect(deleteRequest).toHaveBeenCalled();
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqRole).toHaveBeenCalledWith('role_key', 'marin');
  });
});
