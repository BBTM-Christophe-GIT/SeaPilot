// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectDocumentUploadClosedHandler } from '../functions/project-document-upload/handler';

const APP_ORIGIN = 'https://sea-pilot-ten.vercel.app';
const endpoint = 'https://fixture.supabase.co/functions/v1/project-document-upload';
const network = vi.fn().mockRejectedValue(new Error('No network operation is permitted.'));

beforeEach(() => {
  network.mockClear();
  vi.stubGlobal('fetch', network);
});
afterEach(() => vi.unstubAllGlobals());

describe('closed legacy SharePoint document writer', () => {
  it('rejects a legacy base64 upload without reading its body or performing a network operation', async () => {
    const request = new Request(endpoint, {
      method: 'POST', headers: { Origin: APP_ORIGIN, Authorization: 'Bearer historical-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 12, documentType: 'project_attachment', fileName: 'old-upload.pdf', mimeType: 'application/pdf', base64Content: 'JVBERi0xLjc=', sha256: 'a'.repeat(64) }),
    });
    const readJson = vi.spyOn(request, 'json');
    const readText = vi.spyOn(request, 'text');
    const response = createProjectDocumentUploadClosedHandler()(request);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ code: 'LEGACY_DOCUMENT_UPLOAD_CLOSED', message: 'Actualisez SeaPilot pour enregistrer vos documents dans le stockage privé Vercel.' });
    expect(request.bodyUsed).toBe(false);
    expect(readJson).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('returns the closure response for malformed input and requests without a body', async () => {
    const handler = createProjectDocumentUploadClosedHandler();
    for (const body of ['invalid JSON', undefined]) {
      const request = new Request(endpoint, { method: 'POST', body });
      expect(handler(request).status).toBe(410);
      expect(request.bodyUsed).toBe(false);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it.each([APP_ORIGIN, 'https://sea-pilot-bbtm-app.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'])('preserves CORS for %s', (origin) => {
    const response = createProjectDocumentUploadClosedHandler()(new Request(endpoint, { method: 'POST', headers: { Origin: origin } }));
    expect(response.status).toBe(410);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(network).not.toHaveBeenCalled();
  });

  it('preserves explicitly configured origins without reflecting an unconfigured origin', () => {
    const handler = createProjectDocumentUploadClosedHandler(' https://preview.example.test, ,https://second.example.test ');
    expect(handler(new Request(endpoint, { method: 'POST', headers: { Origin: 'https://preview.example.test' } })).status).toBe(410);
    const denied = handler(new Request(endpoint, { method: 'POST', headers: { Origin: 'https://untrusted.example.test' } }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(network).not.toHaveBeenCalled();
  });

  it('accepts an allowed preflight with the existing methods and headers', async () => {
    const response = createProjectDocumentUploadClosedHandler()(new Request(endpoint, { method: 'OPTIONS', headers: { Origin: APP_ORIGIN, 'Access-Control-Request-Method': 'POST' } }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, x-client-info, apikey, content-type');
    expect(network).not.toHaveBeenCalled();
  });

  it('rejects an untrusted preflight without allowing its origin', () => {
    const response = createProjectDocumentUploadClosedHandler()(new Request(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example.test' } }));
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD'])('rejects method %s without any side effect', async (method) => {
    const response = createProjectDocumentUploadClosedHandler()(new Request(endpoint, { method, headers: { Origin: APP_ORIGIN } }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST, OPTIONS');
    expect((await response.json()).code).toBe('METHOD_NOT_ALLOWED');
    expect(network).not.toHaveBeenCalled();
  });

  it('registers only the closed handler and reads only the non-secret CORS configuration', async () => {
    const serve = vi.fn();
    const get = vi.fn().mockReturnValue('https://preview.example.test');
    vi.stubGlobal('Deno', { serve, env: { get } });
    await import('../functions/project-document-upload/index');
    expect(get).toHaveBeenCalledExactlyOnceWith('SEAPILOT_ALLOWED_ORIGINS');
    expect(serve).toHaveBeenCalledOnce();
    const handler = serve.mock.calls[0][0] as (request: Request) => Response;
    expect(handler(new Request(endpoint, { method: 'POST', headers: { Origin: 'https://preview.example.test' } })).status).toBe(410);
    expect(network).not.toHaveBeenCalled();
  });
});
