import { describe, expect, it, vi } from 'vitest';
import { fetchAdminCollaborators, hasBbtmEmail, mapAdminCollaborators, type AdminCollaboratorRow } from './adminCollaborators';

const person: AdminCollaboratorRow = {
  id: 1, user_id: null, first_name: 'Alice', last_name: 'Durand',
  email: null, function_label: 'Matelot', active: true,
};

describe('administration collaborator coverage', () => {
  it.each([
    [null, false], ['', false], ['   ', false], ['alice@gmail.com', false],
    ['alice@bbtm.fr.example', false], ['alice@sub.bbtm.fr', false], ['@bbtm.fr', false],
    ['alice@@bbtm.fr', false], [' Alice@BBTM.FR ', true],
  ])('recognizes the exact BBTM domain in %s', (email, expected) => {
    expect(hasBbtmEmail(email)).toBe(expected);
  });

  it('retains active people with no account or email and excludes former collaborators', () => {
    expect(mapAdminCollaborators([person, { ...person, id: 2, active: false }], [])).toEqual([{
      id: 1, displayName: 'Alice Durand', email: '', accountEmail: '', functionLabel: 'Matelot',
      active: true, hasAccount: false, hasBbtmEmail: false,
    }]);
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

  it('reads every page of active people without filtering out missing accounts or emails', async () => {
    const firstPage = Array.from({ length: 500 }, (_, id) => ({ ...person, id }));
    const range = vi.fn().mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ ...person, id: 500 }], error: null });
    const order = vi.fn().mockReturnValue({ range });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const rows = await fetchAdminCollaborators({ from } as never);
    expect(rows).toHaveLength(501);
    expect(from).toHaveBeenCalledWith('people');
    expect(eq).toHaveBeenCalledWith('active', true);
    expect(order).toHaveBeenCalledWith('id', { ascending: true });
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('surfaces a read failure rather than returning a partial directory', async () => {
    const range = vi.fn().mockResolvedValue({ data: null, error: new Error('read denied') });
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range }) }) }) }) };
    await expect(fetchAdminCollaborators(client as never)).rejects.toThrow('read denied');
  });
});
