import { describe, expect, it, vi } from 'vitest';
import { fetchCurrentPersonSummary, fetchCurrentUserRoles, mapRoleRows } from './profileQueries';

describe('mapRoleRows', () => {
  it('maps Supabase role rows to role keys', () => {
    expect(mapRoleRows([{ role_key: 'admin' }, { role_key: 'marin' }])).toEqual(['admin', 'marin']);
  });

  it('ignores unknown role keys', () => {
    expect(mapRoleRows([{ role_key: 'unknown' }, { role_key: 'direction' }])).toEqual(['direction']);
  });
});

describe('fetchCurrentUserRoles', () => {
  it('selects current user role keys and maps them', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ role_key: 'admin' }, { role_key: 'unknown' }, { role_key: 'capitaine' }],
      error: null,
    });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from };

    await expect(fetchCurrentUserRoles(client as never)).resolves.toEqual(['admin', 'capitaine']);
    expect(from).toHaveBeenCalledWith('user_roles');
    expect(select).toHaveBeenCalledWith('role_key');
  });

  it('throws Supabase errors', async () => {
    const error = new Error('RLS denied');
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error }),
      }),
    };

    await expect(fetchCurrentUserRoles(client as never)).rejects.toThrow(error);
  });
});

describe('fetchCurrentPersonSummary', () => {
  it('loads the HR identity linked to the authenticated user', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 12, first_name: 'Paul', last_name: 'DURAND', function_label: '2nd Capitaine', grade_label: 'Pont' },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-12' } }, error: null }) },
      from: vi.fn().mockReturnValue({ select }),
    };

    await expect(fetchCurrentPersonSummary(client as never)).resolves.toEqual({
      id: 12,
      firstName: 'Paul',
      lastName: 'DURAND',
      functionLabel: '2nd Capitaine',
      gradeLabel: 'Pont',
    });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-12');
  });
});
