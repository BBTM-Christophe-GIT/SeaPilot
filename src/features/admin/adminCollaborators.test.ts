import { describe, expect, it, vi } from 'vitest';
import { adminEmploymentStatus, adminToday, fetchAdminCollaborators, filterAdminUsers, hasBbtmEmail, mapAdminCollaborators, type AdminCollaboratorRow } from './adminCollaborators';

const person: AdminCollaboratorRow = {
  id: 1, user_id: null, first_name: 'Alice', last_name: 'Durand',
  email: null, function_label: 'Matelot', active: true,
  hired_on: '2020-01-01', departed_on: null,
};

describe('administration collaborator coverage', () => {
  it.each([
    [null, false], ['', false], ['   ', false], ['alice@gmail.com', false],
    ['alice@bbtm.fr.example', false], ['alice@sub.bbtm.fr', false], ['@bbtm.fr', false],
    ['alice@@bbtm.fr', false], [' Alice@BBTM.FR ', true],
  ])('recognizes the exact BBTM domain in %s', (email, expected) => {
    expect(hasBbtmEmail(email)).toBe(expected);
  });

  it('retains current and former people so each population can be displayed', () => {
    expect(mapAdminCollaborators([person, { ...person, id: 2, active: false }], [])).toMatchObject([{
      id: 1, displayName: 'Alice Durand', email: '', accountEmail: '', functionLabel: 'Matelot',
      employmentStatus: 'current', hasAccount: false, hasBbtmEmail: false,
    }, { id: 2, employmentStatus: 'former' }]);
  });

  it.each([
    [{ departed_on: '2025-12-18' }, 'former'],
    [{ departed_on: '2026-09-17' }, 'former'],
    [{ departed_on: '2026-09-18' }, 'current'],
    [{ active: false }, 'former'],
    [{ hired_on: '2026-09-18' }, 'upcoming'],
    [{ hired_on: '2026-09-17' }, 'current'],
    [{ hired_on: null }, 'current'],
  ] as const)('classifies employment from HR dates even if active is still true: %j', (changes, status) => {
    expect(adminEmploymentStatus({ ...person, ...changes }, '2026-09-17')).toBe(status);
  });

  it('evaluates employment at the Paris calendar date around midnight', () => {
    expect(adminToday(new Date('2026-09-16T22:30:00Z'))).toBe('2026-09-17');
  });

  it('keeps former accounts available only in former/all populations, matching by link or email', () => {
    const users = ['current', 'linked-former', 'email-former', 'office', 'future'].map((id) => ({
      id, email: `${id}@bbtm.fr`, displayName: id, roles: [],
    }));
    const collaborators = mapAdminCollaborators([
      { ...person, user_id: 'current' },
      { ...person, id: 2, user_id: 'linked-former', departed_on: '2026-01-01' },
      { ...person, id: 3, email: ' EMAIL-FORMER@BBTM.FR ', departed_on: '2025-12-18' },
      { ...person, id: 4, user_id: 'future', hired_on: '2999-01-01' },
    ], users, '2026-09-17');
    expect(filterAdminUsers(users, collaborators, 'current').map(({ id }) => id)).toEqual(['current', 'office']);
    expect(filterAdminUsers(users, collaborators, 'former').map(({ id }) => id)).toEqual(['linked-former', 'email-former']);
    expect(filterAdminUsers(users, collaborators, 'all')).toEqual(users);
    const rehired = mapAdminCollaborators([
      { ...person, user_id: 'current' },
      { ...person, id: 2, user_id: 'current', departed_on: '2025-01-01' },
    ], users, '2026-09-17');
    expect(filterAdminUsers(users, rehired, 'former')).toEqual([]);
  });

  it('uses the linked account and its corporate email even when HR stores a personal address', () => {
    const [result] = mapAdminCollaborators([{ ...person, user_id: 'account-1', email: 'alice@gmail.com' }], [{
      id: 'account-1', email: 'alice@bbtm.fr', displayName: 'Alice', roles: ['marin'],
    }]);
    expect(result).toMatchObject({ hasAccount: true, hasBbtmEmail: true, accountEmail: 'alice@bbtm.fr' });
  });

  it('recognizes an unlinked existing account by normalized email and keeps linked accounts without a visible profile', () => {
    const result = mapAdminCollaborators([
      { ...person, email: ' ALICE@EXAMPLE.TEST ' },
      { ...person, id: 2, user_id: 'not-visible', email: 'bob@bbtm.fr' },
    ], [{ id: 'account-1', email: 'alice@example.test', displayName: 'Alice', roles: [] }]);
    expect(result.map(({ hasAccount }) => hasAccount)).toEqual([true, true]);
    expect(result[0].accountEmail).toBe('');
    expect(result[0].hasBbtmEmail).toBe(false);
  });

  it('reads every page including former people for the optional population filter', async () => {
    const firstPage = Array.from({ length: 500 }, (_, id) => ({ ...person, id }));
    const range = vi.fn().mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ ...person, id: 500 }], error: null });
    const order = vi.fn().mockReturnValue({ range });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const rows = await fetchAdminCollaborators({ from } as never);
    expect(rows).toHaveLength(501);
    expect(from).toHaveBeenCalledWith('people');
    expect(select).toHaveBeenCalledWith(expect.stringContaining('hired_on, departed_on'));
    expect(order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('surfaces a read failure rather than returning a partial directory', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: new Error('read denied') });
    const client = { from: () => ({ select: () => ({ order: () => ({ range }) }) }) };
    await expect(fetchAdminCollaborators(client as never)).rejects.toThrow('read denied');
  });
});
