import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launcherOpenUri, localDriveRequest } from './localDriveLauncher';

vi.mock('../../lib/env', () => ({ loadAppEnv: () => ({ supabaseUrl: 'https://szlvyrrmvdvhzixilymh.supabase.co', supabaseAnonKey: 'public-test-key' }) }));
const connection = { url: 'http://127.0.0.1:50000/session', expiresAt: Date.now() + 100000 };
afterEach(() => vi.unstubAllGlobals());

describe('common Windows launcher', () => {
  it.each([['procedures', 'Procedures'], ['disciplinary', 'Sanctions Disciplinaires']] as const)('uses the root protocol for %s', (module, directory) => {
    const uri = launcherOpenUri(module, 'Équipe/Courrier.docx');
    expect(uri).toMatch(/^seapilot-drive:\/\/root\/open\/[A-Za-z0-9_-]+$/);
    const payload = uri.split('/').pop()!.replace(/-/g, '+').replace(/_/g, '/');
    expect(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0)))).toBe(`${directory}/Équipe/Courrier.docx`);
  });
  it('requires an authenticated session before contacting the local writer', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) } } as unknown as SupabaseClient;
    await expect(localDriveRequest(client, connection, { action: 'write' })).rejects.toThrow('Reconnectez-vous');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('passes authorization to the launcher and surfaces its refusal', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Profil non autorisé' }) }); vi.stubGlobal('fetch', fetcher);
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-session' } }, error: null }) } } as unknown as SupabaseClient;
    await expect(localDriveRequest(client, connection, { action: 'write' })).rejects.toThrow('Profil non autorisé');
    expect(fetcher).toHaveBeenCalledWith(`${connection.url}/request`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
    }));
  });
});
