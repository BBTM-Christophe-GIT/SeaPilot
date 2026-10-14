import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabaseClient';

const bucket = 'fleet-certificates';
const path = '1/RZL/legacy/081-B-4-RZL-ASSURANCE-P-et-I-LE-ROZEL.pdf';
const endpoint = 'https://example.supabase.co';
const signedUrl = `${endpoint}/functions/v1/document-drive?ticket=authorized-insurance`;
const document = { drive_file_id: 'rozel-insurance', mime_type: 'application/pdf',
  file_name: 'ASSURANCE P&I - LE ROZEL.pdf', bytes: 70_000, version: '117' };
const env = { VITE_SUPABASE_URL: endpoint, VITE_SUPABASE_ANON_KEY: 'test-anon-key', VITE_APP_BASE_URL: 'http://localhost:5173' };

beforeEach(() => {
  window.history.replaceState({}, '', '/modules/certificates');
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Supabase browser client document access', () => {
  it('automatically routes the migrated certificate through the real SDK using the current session', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === `${endpoint}/rest/v1/rpc/document_drive_lookup`) return Response.json(document);
      if (url === `${endpoint}/functions/v1/document-drive`) {
        expect(JSON.parse(String(init?.body))).toEqual({ operation: 'url', bucket, path, expiresIn: 300 });
        return Response.json({ signedUrl, document, chunkSize: 4 * 1024 * 1024 });
      }
      throw new Error(`Unexpected document endpoint: ${url}`);
    });
    vi.stubGlobal('fetch', send);
    // Exercise the application factory and the actual SDK, without installing
    // the adapter in the test. Removing its factory hook must fail this test.
    const client = createSupabaseBrowserClient(env);
    let accessToken = 'current-real-profile-token';
    vi.spyOn(client.auth, 'getSession').mockImplementation(async () => ({
      data: { session: { access_token: accessToken } as Session }, error: null,
    }));
    try {
      expect(await client.storage.from(bucket).createSignedUrl(path, 300)).toEqual({ data: { signedUrl }, error: null });
      expect(send).toHaveBeenCalledTimes(2);
      expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({ target_bucket: bucket, target_path: path });
      for (const [, init] of send.mock.calls) expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${accessToken}`);
      accessToken = 'refreshed-real-profile-token';
      await client.storage.from(bucket).createSignedUrl(path, 300);
      for (const [, init] of send.mock.calls.slice(2)) expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${accessToken}`);
      expect(send.mock.calls.every(([input]) => !String(input).includes('/storage/v1/'))).toBe(true);
    } finally {
      client.auth.stopAutoRefresh();
    }
  });

  it('preserves a real RPC access refusal without requesting the deleted Storage object or gateway', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: '42501', message: 'Document inaccessible pour ce profil.' }, { status: 403 }));
    vi.stubGlobal('fetch', send);
    const client = createSupabaseBrowserClient(env);
    try {
      const result = await client.storage.from(bucket).createSignedUrl(path, 300);
      expect(result.data).toBeNull();
      expect(result.error).toMatchObject({ status: 403, message: 'Document inaccessible pour ce profil.' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(String(send.mock.calls[0][0])).toBe(`${endpoint}/rest/v1/rpc/document_drive_lookup`);
    } finally {
      client.auth.stopAutoRefresh();
    }
  });
});
