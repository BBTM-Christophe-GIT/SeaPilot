const DEFAULT_APP_URL = 'https://sea-pilot-ten.vercel.app';

/** The legacy SharePoint writer is closed; this handler never reads its body or performs I/O. */
export function createProjectDocumentUploadClosedHandler(configuredOrigins = '') {
  const allowedOrigins = new Set([
    DEFAULT_APP_URL,
    'https://sea-pilot-bbtm-app.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredOrigins.split(',').map(origin => origin.trim()).filter(Boolean),
  ]);

  return (request: Request): Response => {
    const origin = request.headers.get('origin') || '';
    const allowed = allowedOrigins.has(origin);
    const headers = {
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': allowed ? origin : DEFAULT_APP_URL,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    const json = (status: number, body: Record<string, string>, extraHeaders = {}) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });

    if (origin && !allowed) return json(403, { code: 'ORIGIN_NOT_ALLOWED', message: 'Origine non autorisée.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json(405, { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' }, { Allow: 'POST, OPTIONS' });
    return json(410, {
      code: 'LEGACY_DOCUMENT_UPLOAD_CLOSED',
      message: 'Actualisez SeaPilot pour enregistrer vos documents dans le stockage privé Vercel.',
    });
  };
}
