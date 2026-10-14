import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLICATION_LOGO_BUCKET, DEFAULT_APPLICATION_LOGO, MAX_APPLICATION_LOGO_BYTES,
  applicationLogoUrl, fetchApplicationBranding, prepareApplicationLogoFile, resetApplicationLogo, saveApplicationLogo,
} from './applicationLogo';

const userId = 'ba870000-0000-4000-8000-000000000001';
const storedPath = `logos/${userId}/ba870000-0000-4000-8000-000000000101.png`;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
let imageWidth = 300;
let imageHeight = 100;

function logoFile(bytes = png, type = 'image/png') { return new File([bytes], 'logo', { type }); }
function clientFixture() {
  const storage = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${APPLICATION_LOGO_BUCKET}/${path}` } })),
  };
  const client = { rpc: vi.fn(), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    storage: { from: vi.fn(() => storage) } };
  return { client, storage, sdk: client as unknown as SupabaseClient };
}

beforeEach(() => {
  imageWidth = 300; imageHeight = 100;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:logo-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    naturalWidth = imageWidth; naturalHeight = imageHeight;
    set src(value: string) { void value; queueMicrotask(() => this.onload?.()); }
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate); else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke); else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('application logo API', () => {
  it('reads branding before login without an authentication request', async () => {
    const { client, sdk } = clientFixture();
    client.rpc.mockResolvedValue({ data: { logoPath: null, revision: 0, canManage: false, updatedAt: null }, error: null });
    expect(await fetchApplicationBranding(sdk)).toEqual({ logoPath: null, revision: 0, canManage: false, updatedAt: null });
    expect(client.rpc).toHaveBeenCalledWith('get_application_branding');
    expect(client.auth.getUser).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { logoPath: 'https://example.invalid/logo.png', revision: 1, canManage: true },
    { logoPath: `logos/${'-'.repeat(36)}/${'-'.repeat(36)}.png`, revision: 1, canManage: false },
    { logoPath: null, revision: -1, canManage: false },
    { logoPath: null, revision: 1.5, canManage: false },
    { logoPath: null, revision: 1, canManage: 'true' },
  ])('rejects malformed public branding responses: %j', async (data) => {
    const { client, sdk } = clientFixture();
    client.rpc.mockResolvedValue({ data, error: null });
    await expect(fetchApplicationBranding(sdk)).rejects.toThrow('Impossible de lire');
  });

  it('uses the bundled logo without needing a configured storage client', () => {
    expect(applicationLogoUrl({} as SupabaseClient, { logoPath: null, revision: 0, canManage: false, updatedAt: null })).toBe(DEFAULT_APPLICATION_LOGO);
  });

  it('resolves only the dedicated public logo bucket and rejects unsafe protocols', () => {
    const { sdk, storage, client } = clientFixture();
    const branding = { logoPath: storedPath, revision: 1, canManage: false, updatedAt: null };
    expect(applicationLogoUrl(sdk, branding)).toContain(`/application-branding/${storedPath}`);
    expect(client.storage.from).toHaveBeenCalledWith(APPLICATION_LOGO_BUCKET);
    storage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'javascript:alert(1)' } });
    expect(() => applicationLogoUrl(sdk, branding)).toThrow('Adresse de logo invalide');
  });

  it.each([
    ['image/png', png],
    ['image/jpeg', new Uint8Array([255, 216, 255, 0])],
    ['image/webp', new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])],
  ])('accepts a decodable %s and releases its temporary preview URL', async (type, bytes) => {
    const file = logoFile(bytes, type);
    expect(await prepareApplicationLogoFile(file)).toBe(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-test');
  });

  it('blocks SVG, forged PNG headers and oversized files before upload', async () => {
    const { sdk, storage } = clientFixture();
    await expect(saveApplicationLogo(sdk, logoFile(png, 'image/svg+xml'), 0)).rejects.toThrow('PNG, JPEG ou WebP');
    await expect(saveApplicationLogo(sdk, logoFile(new TextEncoder().encode('<svg/>')), 0)).rejects.toThrow('contenu du fichier');
    await expect(saveApplicationLogo(sdk, logoFile(new Uint8Array(MAX_APPLICATION_LOGO_BYTES + 1)), 0)).rejects.toThrow('2 Mo');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects excessive decoded dimensions while releasing preview media', async () => {
    imageWidth = 4097;
    await expect(prepareApplicationLogoFile(logoFile())).rejects.toThrow('4 096 pixels');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:logo-test');
  });

  it('uploads an immutable owned object and publishes with the expected revision', async () => {
    const { sdk, client, storage } = clientFixture();
    client.rpc.mockImplementation(async (_name: string, args: { p_logo_path: string }) => ({ data: {
      logoPath: args.p_logo_path, revision: 8, canManage: true, updatedAt: '2026-10-14T07:00:00Z',
    }, error: null }));
    const file = logoFile();
    const result = await saveApplicationLogo(sdk, file, 7);
    const path = storage.upload.mock.calls[0][0] as string;
    expect(path).toMatch(new RegExp(`^logos/${userId}/[0-9a-f-]{36}[.]png$`));
    expect(storage.upload).toHaveBeenCalledWith(path, file, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
    expect(client.rpc).toHaveBeenCalledWith('save_application_logo', { p_logo_path: path, p_expected_revision: 7 });
    expect(result).toMatchObject({ logoPath: path, revision: 8 });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('cleans an unpublished upload after a revision conflict and preserves the useful error', async () => {
    const { sdk, client, storage } = clientFixture();
    client.rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
    storage.remove.mockRejectedValue(new Error('Cleanup unavailable'));
    await expect(saveApplicationLogo(sdk, logoFile(), 2)).rejects.toThrow('modifié depuis un autre écran');
    expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0][0]]);
  });

  it('preserves the save error when an ambiguous commit makes server cleanup refuse the current logo', async () => {
    const { sdk, client, storage } = clientFixture();
    client.rpc.mockRejectedValue(new Error('Response lost'));
    storage.remove.mockResolvedValue({ error: { code: '42501' } });
    await expect(saveApplicationLogo(sdk, logoFile(), 2)).rejects.toThrow('Response lost');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it('does not publish after a failed transfer', async () => {
    const { sdk, client, storage } = clientFixture();
    storage.upload.mockResolvedValue({ error: { message: 'Denied' } });
    await expect(saveApplicationLogo(sdk, logoFile(), 0)).rejects.toThrow('transférer le logo');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('resets through the guarded revision RPC without touching Storage', async () => {
    const { sdk, client } = clientFixture();
    client.rpc.mockResolvedValue({ data: { logoPath: null, revision: 4, canManage: true, updatedAt: null }, error: null });
    expect(await resetApplicationLogo(sdk, 3)).toMatchObject({ logoPath: null, revision: 4 });
    expect(client.rpc).toHaveBeenCalledWith('save_application_logo', { p_logo_path: null, p_expected_revision: 3 });
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});
