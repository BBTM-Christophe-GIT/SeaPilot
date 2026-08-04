import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchWorkingTimeProfileSignatures,
  sha256Hex,
  uploadWorkingTimeProfileSignature,
} from './workingTimeSignatureQueries';

function queryResult(data: unknown) {
  const result = { data, error: null };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
      return () => query;
    },
  });
  return query;
}

describe('working-time profile signatures', () => {
  it('maps every immutable signature version', async () => {
    const client = {
      from: vi.fn(() => queryResult([{
        id: '8', person_id: '42', version_number: '3', storage_bucket: 'working-time-signatures',
        storage_path: '1/42/signature.png', mime_type: 'image/png', file_size_bytes: '321',
        sha256: 'a'.repeat(64), valid_from: '2026-08-04T10:00:00Z', valid_to: null,
        created_at: '2026-08-04T10:00:00Z',
      }])),
    } as unknown as SupabaseClient;

    await expect(fetchWorkingTimeProfileSignatures(client, 42)).resolves.toEqual([expect.objectContaining({
      id: 8,
      personId: 42,
      versionNumber: 3,
      fileSizeBytes: 321,
      sha256: 'a'.repeat(64),
    })]);
  });

  it('hashes and registers the exact uploaded PNG in its authorized private path', async () => {
    const png = new Blob(['signature-test'], { type: 'image/png' });
    const upload = vi.fn().mockResolvedValue({ data: { path: 'uploaded' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { person_id: 42, path_prefix: '1/42/', mime_type: 'image/png' }, error: null })
      .mockResolvedValueOnce({ data: 9, error: null });
    const client = {
      rpc,
      storage: { from: vi.fn(() => ({ upload, remove })) },
    } as unknown as SupabaseClient;

    await expect(uploadWorkingTimeProfileSignature(client, 42, png)).resolves.toBe(9);
    const expectedHash = await sha256Hex(png);
    const uploadedPath = upload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^1\/42\/[0-9a-f-]+\.png$/);
    expect(upload).toHaveBeenCalledWith(uploadedPath, png, {
      cacheControl: '3600', contentType: 'image/png', upsert: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'register_working_time_profile_signature', {
      p_person_id: 42,
      p_storage_path: uploadedPath,
      p_mime_type: 'image/png',
      p_file_size_bytes: png.size,
      p_sha256: expectedHash,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes an orphaned upload if registration fails', async () => {
    const png = new Blob(['signature-test'], { type: 'image/png' });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: { person_id: 42, path_prefix: '1/42/', mime_type: 'image/png' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'registration failed' } }),
      storage: { from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'uploaded' }, error: null }),
        remove,
      })) },
    } as unknown as SupabaseClient;

    await expect(uploadWorkingTimeProfileSignature(client, 42, png)).rejects.toThrow('registration failed');
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^1\/42\/.+\.png$/)]);
  });
});
