import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverClientLogoUrl,
  normalizeProjectCatalogUrl,
  PROJECT_CATALOG_MEDIA_BUCKET,
  removeProjectCatalogImage,
  uploadProjectCatalogImage,
  validateProjectCatalogImage,
} from './projectCatalogMedia';

describe('projectCatalogMedia', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes official websites and derives the conventional favicon URL', () => {
    expect(normalizeProjectCatalogUrl('example.com')).toBe('https://example.com/');
    expect(discoverClientLogoUrl('https://example.com/fr/')).toBe('https://example.com/favicon.ico');
    expect(() => normalizeProjectCatalogUrl('javascript:alert(1)')).toThrow('http:// ou https://');
  });

  it('accepts only small raster images', () => {
    expect(() => validateProjectCatalogImage(new File(['image'], 'logo.png', { type: 'image/png' }))).not.toThrow();
    expect(() => validateProjectCatalogImage(new File(['svg'], 'logo.svg', { type: 'image/svg+xml' }))).toThrow('JPG, PNG ou WebP');
    expect(() => validateProjectCatalogImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.webp', { type: 'image/webp' }))).toThrow('5 Mo');
  });

  it('uploads into the entity-scoped private bucket and removes the exact object', async () => {
    const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
    const remove = vi.fn().mockResolvedValue({ data: {}, error: null });
    const from = vi.fn(() => ({ upload, remove }));
    const client = { storage: { from } } as never;
    vi.stubGlobal('crypto', { randomUUID: () => 'media-id' });

    await expect(uploadProjectCatalogImage(
      client,
      'clients',
      52,
      new File(['image'], 'logo.png', { type: 'image/png' }),
    )).resolves.toBe('clients/52/media-id.png');
    await removeProjectCatalogImage(client, 'clients/52/media-id.png');

    expect(from).toHaveBeenCalledWith(PROJECT_CATALOG_MEDIA_BUCKET);
    expect(upload).toHaveBeenCalledWith('clients/52/media-id.png', expect.any(File), {
      cacheControl: '3600',
      contentType: 'image/png',
      upsert: false,
    });
    expect(remove).toHaveBeenCalledWith(['clients/52/media-id.png']);
  });
});
