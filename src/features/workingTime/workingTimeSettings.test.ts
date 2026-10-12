import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { fetchWorkingTimeEditSettings, saveWorkingTimeEditSettings } from './workingTimeSettings';

function settingsClient(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) } as unknown as SupabaseClient;
}

describe('working-time editing settings', () => {
  it('reads the company setting and current account capability from the authenticated server', async () => {
    const client = settingsClient({ unrestricted_editing_enabled: true, can_use_unrestricted_editing: false });
    await expect(fetchWorkingTimeEditSettings(client)).resolves.toEqual({
      unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: false,
    });
    expect(client.rpc).toHaveBeenCalledWith('working_time_get_edit_settings');
  });

  it('keeps both permissions disabled for absent or malformed flags', async () => {
    await expect(fetchWorkingTimeEditSettings(settingsClient(null))).resolves.toEqual({
      unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false,
    });
    await expect(fetchWorkingTimeEditSettings(settingsClient({
      unrestricted_editing_enabled: 'true', can_use_unrestricted_editing: 1,
    }))).resolves.toEqual({ unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false });
  });

  it('throws a read failure so callers cannot silently offer an unverified switch', async () => {
    const error = new Error('Setting unavailable');
    await expect(fetchWorkingTimeEditSettings(settingsClient(null, error))).rejects.toBe(error);
  });

  it('persists only the editable flag and uses the returned account capability', async () => {
    const client = settingsClient({ unrestricted_editing_enabled: true, can_use_unrestricted_editing: true });
    await expect(saveWorkingTimeEditSettings(client, { unrestrictedEditingEnabled: true })).resolves.toEqual({
      unrestrictedEditingEnabled: true, canUseUnrestrictedEditing: true,
    });
    expect(client.rpc).toHaveBeenCalledWith('working_time_save_edit_settings', { p_unrestricted_editing_enabled: true });
  });

  it('accepts a singleton RPC row and confirms disabling', async () => {
    const client = settingsClient([{ unrestricted_editing_enabled: false, can_use_unrestricted_editing: false }]);
    await expect(saveWorkingTimeEditSettings(client, { unrestrictedEditingEnabled: false })).resolves.toEqual({
      unrestrictedEditingEnabled: false, canUseUnrestrictedEditing: false,
    });
  });

  it('rejects failed or unconfirmed writes instead of claiming success', async () => {
    const error = new Error('Admin only');
    await expect(saveWorkingTimeEditSettings(settingsClient(null, error), { unrestrictedEditingEnabled: true })).rejects.toBe(error);
    await expect(saveWorkingTimeEditSettings(settingsClient(null), { unrestrictedEditingEnabled: true })).rejects.toThrow('n’a pas été confirmé');
    await expect(saveWorkingTimeEditSettings(settingsClient({ unrestricted_editing_enabled: true }), { unrestrictedEditingEnabled: true })).rejects.toThrow('n’a pas été confirmé');
  });
});
