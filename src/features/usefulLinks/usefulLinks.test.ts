import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { faviconUrl, validateLink, saveUsefulLink, deleteDirectoryItem } from './usefulLinks';
import { getDefaultNavigationPermissions, getVisibleModulesForPermissions } from '../permissions/navigationPermissions';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';

describe('useful links', () => {
  it('rejects preview writes without returning a fake saved row', async () => {
    await expect(saveUsefulLink(previewSupabaseClient, { title: 'Preview', url: 'https://example.org/', category_id: null })).rejects.toMatchObject({ message: expect.stringContaining('démonstratives') });
    await expect(deleteDirectoryItem(previewSupabaseClient, 'category', 'category-0')).rejects.toMatchObject({ message: expect.stringContaining('démonstratives') });
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:password@example.com/', 'not a URL'])('rejects unsafe or invalid address %s', (url) => {
    expect(() => validateLink({ title: 'Portail', url, category_id: null })).toThrow();
  });
  it('keeps meeting parameters and anchors while trimming the title', () => {
    const url = 'https://teams.microsoft.com/join?meeting=123&context=%7B%7D#join';
    expect(validateLink({ title: ' Réunion ', url, category_id: '' })).toEqual({ title: 'Réunion', url, category_id: null });
  });
  it('never passes private paths or queries to the icon service', () => {
    expect(faviconUrl('https://teams.microsoft.com/private?secret=abc#token')).toBe('https://www.google.com/s2/favicons?domain=teams.microsoft.com&sz=64');
    expect(faviconUrl('javascript:alert(1)')).toBe('');
  });
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('lets Administration revoke useful links for %s', (role) => {
    const defaults = getDefaultNavigationPermissions();
    expect(getVisibleModulesForPermissions([role], defaults).some((module) => module.key === 'usefulLinks')).toBe(true);
    const revoked = defaults.map((p) => p.roleKey === role && p.moduleKey === 'usefulLinks' ? { ...p, isVisible: false } : p);
    expect(getVisibleModulesForPermissions([role], revoked).some((module) => module.key === 'usefulLinks')).toBe(false);
  });
  it('surfaces failed or RLS-filtered mutations instead of showing false success', async () => {
    const failure = { code: 'PGRST116', message: 'No rows returned' };
    const query = { update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: failure }) };
    const client = { from: () => query } as unknown as SupabaseClient;
    await expect(saveUsefulLink(client, { title: 'Test', url: 'https://example.com', category_id: null }, 'missing')).rejects.toEqual(failure);
    await expect(deleteDirectoryItem(client, 'link', 'missing')).rejects.toEqual(failure);
  });
});
