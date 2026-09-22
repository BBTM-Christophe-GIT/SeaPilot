import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launcherOpenUri, localDrivePorts, localDriveRequest } from './localDriveLauncher';

vi.mock('../../lib/env', () => ({ loadAppEnv: () => ({ supabaseUrl: 'https://szlvyrrmvdvhzixilymh.supabase.co', supabaseAnonKey: 'public-test-key' }) }));
const connection = { url: 'http://127.0.0.1:50000/session', expiresAt: Date.now() + 100000 };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('common Windows launcher', () => {
  it('spreads discovery across bounded distinct ports, including wraparound', () => {
    for (const first of [49152, 50000, 65535]) {
      const ports = localDrivePorts(first);
      expect(ports[0]).toBe(first);
      expect(new Set(ports).size).toBe(16);
      expect(ports.every((port) => port >= 49152 && port <= 65535)).toBe(true);
    }
    expect(localDrivePorts(65535).slice(0, 3)).toEqual([65535, 50170, 51189]);
  });
  it('finds the native fallback when Windows refuses the first ports, reuses it and opens the launcher only once', async () => {
    vi.resetModules();
    const { connectLocalDrive } = await import('./localDriveLauncher');
    let firstPort = 0, nonce = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      const parts = new URL(this.href).pathname.split('/');
      firstPort = Number(parts[1]); nonce = parts[2];
    });
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (new URL(url).port !== String(localDrivePorts(firstPort)[3])) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => ({ version: '2.1.0', nonce }) };
    });
    vi.stubGlobal('fetch', fetcher);
    const pending = connectLocalDrive();
    expect(connectLocalDrive()).toBe(pending);
    const session = await pending;
    expect(session.url).toBe(`http://127.0.0.1:${localDrivePorts(firstPort)[3]}/${nonce}`);
    expect(await connectLocalDrive()).toEqual(session);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([, options]) => !options.method && !options.headers)).toBe(true);
  });
  it('does not accept a mismatched session or send credentials during discovery', async () => {
    vi.useFakeTimers(); vi.resetModules();
    const { connectLocalDrive } = await import('./localDriveLauncher');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '2.1.0', nonce: 'wrong-session' }) }));
    const result = expect(connectLocalDrive()).rejects.toThrow('le dossier déjà configuré sera conservé');
    await vi.runAllTimersAsync();
    await result;
  });
  it('still connects to an older launcher on the initial port', async () => {
    vi.resetModules();
    const { connectLocalDrive } = await import('./localDriveLauncher');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '2.0.0' }) }));
    const session = await connectLocalDrive();
    expect(session.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}$/);
  });
  it.each([['procedures', 'Procedures'], ['disciplinary', 'Sanctions Disciplinaires'], ['chemicals', 'Produits Chimiques']] as const)('uses the root protocol for %s', (module, directory) => {
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
