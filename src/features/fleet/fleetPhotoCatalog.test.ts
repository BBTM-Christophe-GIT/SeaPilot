import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BBTM_FLEET_PHOTOS } from './fleetPhotoCatalog';

describe('fleet thumbnail performance budget', () => {
  it('ships only content-addressed WebP thumbnails, under 20 KB each and 120 KB total', () => {
    const directory = resolve('public/vessels/bbtm');
    expect(readdirSync(directory).sort()).toEqual(BBTM_FLEET_PHOTOS.map((photo) => photo.thumbnail).sort());
    let total = 0;
    for (const photo of BBTM_FLEET_PHOTOS) {
      const bytes = readFileSync(resolve(directory, photo.thumbnail));
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.thumbnailSha256);
      expect(photo.thumbnail).toContain(photo.thumbnailSha256.slice(0, 16));
      expect(bytes.length).toBe(photo.thumbnailBytes);
      expect(bytes.length).toBeLessThanOrEqual(20_000);
      total += bytes.length;
    }
    expect(total).toBeLessThanOrEqual(120_000);
  });
});
