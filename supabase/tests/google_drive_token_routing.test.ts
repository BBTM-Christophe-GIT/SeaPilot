// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import brokerRoute from '../../api/google-drive-token';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
};

function rewrittenPath(path: string): string | undefined {
  // The application's rewrite sources are exact paths or regular expressions.
  return config.rewrites.find(route => new RegExp(`^${route.source}$`).test(path))?.destination;
}

afterEach(() => vi.unstubAllEnvs());

describe('deployed Google Drive token route', () => {
  it('keeps the broker and future API routes out of the SPA rewrite', () => {
    expect(rewrittenPath('/api/google-drive-token')).toBeUndefined();
    expect(rewrittenPath('/api/another-server-route')).toBeUndefined();
    expect(rewrittenPath('/modules/certificates')).toBe('/index.html');
    expect(rewrittenPath('/auth/update-password')).toBe('/index.html');
    expect(rewrittenPath('/preview/projects')).toBe('/preview/projects/index.html');
  });

  it('exports a Vercel Web handler that rejects GET and anonymous POST without cacheable HTML', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('GOOGLE_DRIVE_TOKEN_BROKER_SECRET', 's'.repeat(64));
    const url = 'https://sea-pilot-ten.vercel.app/api/google-drive-token';
    const get = await brokerRoute.fetch(new Request(url));
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST');
    expect(get.headers.get('Cache-Control')).toBe('no-store, private');
    const post = await brokerRoute.fetch(new Request(url, { method: 'POST' }));
    expect(post.status).toBe(401);
    expect(post.headers.get('Content-Type')).toContain('application/json');
    expect(post.headers.get('Cache-Control')).toBe('no-store, private');
    expect(await post.json()).toEqual({ error: 'BROKER_UNAUTHORIZED' });
  });
});
