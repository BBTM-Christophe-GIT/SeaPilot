import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { get, getDownloadUrl, head, issueSignedToken, presignUrl } from '@vercel/blob';

const MAX_BYTES = 100 * 1024 * 1024;
const WORKING_TIME_SIGNATURE_LOOKUP_BATCH_SIZE = 4;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const HEADERS = { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const mime = (value: unknown) => typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '';
type Json = Record<string, unknown>;
interface Backend { user: () => Promise<string | null>; rpc: (name: string, args: Json) => Promise<unknown> }
interface Dependencies {
  getEnv: (name: string) => string | undefined;
  backend: (jwt: string) => Backend;
  register: (record: Json) => Promise<unknown>;
  sign: typeof issueSignedToken;
  presign: typeof presignUrl;
  read: typeof get;
  metadata: typeof head;
  now?: () => number;
}
class DocumentError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DocumentError(400, 'INVALID_DOCUMENT_REQUEST');
  return value as Json;
}
function location(value: Json) {
  if (typeof value.bucket !== 'string' || !/^[a-z0-9-]{1,100}$/.test(value.bucket)
    || typeof value.path !== 'string' || !value.path || value.path.length > 2000
    || /[\\\u0000-\u001f\u007f]/.test(value.path) || value.path.startsWith('/') || /(^|\/)\.\.?($|\/)/.test(value.path)) {
    throw new DocumentError(400, 'INVALID_DOCUMENT_LOCATION');
  }
  return { bucket: value.bucket, path: value.path };
}
function document(value: unknown): Json {
  const info = object(value);
  if (typeof info.blob_pathname !== 'string' || !info.blob_pathname.startsWith('documents/')
    || /[\\\u0000-\u001f\u007f]/.test(info.blob_pathname) || /(^|\/)\.\.?($|\/)/.test(info.blob_pathname)
    || typeof info.bytes !== 'number' || !Number.isSafeInteger(info.bytes) || info.bytes < 1 || info.bytes > MAX_BYTES
    || typeof info.sha256 !== 'string' || !SHA256.test(info.sha256)
    || typeof info.mime_type !== 'string' || !info.mime_type || typeof info.file_name !== 'string'
    || !info.file_name || info.file_name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(info.file_name)) {
    throw new DocumentError(502, 'INVALID_DOCUMENT_METADATA');
  }
  return info;
}
function privateBlobUrl(raw: string, pathname: string, storeId: string): string {
  try {
    const url = new URL(raw);
    const hostname = `${storeId.replace(/^store_/, '').toLowerCase()}.private.blob.vercel-storage.com`;
    if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password || url.port
      || url.search || url.hash || decodeURIComponent(url.pathname.slice(1)) !== pathname) throw new Error('Invalid Blob URL');
    return url.href;
  } catch { throw new DocumentError(409, 'DOCUMENT_UPLOAD_MISMATCH'); }
}
/** The store credential never reaches a browser; every delegation covers one authorized object. */
export function createDocumentBlobGateway(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const response = (value: unknown, status = 200) => Response.json(value, { status, headers: HEADERS });
  const signed = async (info: Json, seconds: number, download = false) => {
    const validUntil = now() + Math.max(1, Math.min(3600, Math.floor(seconds))) * 1000;
    const pathname = info.blob_pathname as string;
    const token = await deps.sign({ pathname, operations: ['get'], validUntil });
    const { presignedUrl } = await deps.presign(token, { operation: 'get', pathname, access: 'private', validUntil });
    return { signedUrl: download ? getDownloadUrl(presignedUrl) : presignedUrl, document: info, expiresAt: validUntil };
  };
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
    try {
      const url = new URL(request.url);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new DocumentError(403, 'DOCUMENT_ORIGIN_DENIED');
      if (request.headers.get('sec-fetch-site') === 'cross-site') throw new DocumentError(403, 'DOCUMENT_ORIGIN_DENIED');
      const jwt = /^Bearer ([^\s]{1,16384})$/.exec(request.headers.get('authorization') || '')?.[1];
      if (!jwt) throw new DocumentError(401, 'DOCUMENT_AUTHENTICATION_REQUIRED');
      if (!/^(application\/json)(;|$)/i.test(request.headers.get('content-type') || '')) throw new DocumentError(400, 'DOCUMENT_JSON_REQUIRED');
      const text = await request.text();
      if (text.length > 128000) throw new DocumentError(413, 'DOCUMENT_REQUEST_TOO_LARGE');
      let body: Json;
      try { body = object(JSON.parse(text)); } catch { throw new DocumentError(400, 'INVALID_DOCUMENT_REQUEST'); }
      const backend = deps.backend(jwt);
      const userId = await backend.user();
      if (!userId || !UUID.test(userId)) throw new DocumentError(401, 'DOCUMENT_AUTHENTICATION_REQUIRED');
      const storeId = deps.getEnv('BLOB_STORE_ID');
      if (!storeId) throw new DocumentError(503, 'DOCUMENT_STORE_NOT_CONFIGURED');
      if (body.operation === 'url') {
        const key = location(body);
        const mapping = await backend.rpc('document_blob_lookup', { target_bucket: key.bucket, target_path: key.path });
        if (mapping === null) throw new DocumentError(404, 'DOCUMENT_NOT_FOUND');
        const seconds = typeof body.expiresIn === 'number' && Number.isFinite(body.expiresIn) ? body.expiresIn : 120;
        return response(await signed(document(mapping), seconds, Boolean(body.download)));
      }
      if (body.operation === 'urls') {
        if (!Array.isArray(body.paths) || body.paths.length > 200 || typeof body.bucket !== 'string') throw new DocumentError(400, 'INVALID_DOCUMENT_BATCH');
        const paths = body.paths.map(path => location({ bucket: body.bucket, path }).path);
        const values: unknown[] = [];
        const lookupBatchSize = body.bucket === 'working-time-signatures' ? WORKING_TIME_SIGNATURE_LOOKUP_BATCH_SIZE : 200;
        for (let offset = 0; offset < paths.length; offset += lookupBatchSize) {
          const batch = paths.slice(offset, offset + lookupBatchSize);
          const found = await backend.rpc('document_blob_lookup_batch', { target_bucket: body.bucket, target_paths: batch });
          if (!Array.isArray(found) || found.length !== batch.length) throw new DocumentError(502, 'INVALID_DOCUMENT_BATCH');
          values.push(...found);
        }
        const entries: Json[] = [];
        const seconds = typeof body.expiresIn === 'number' && Number.isFinite(body.expiresIn) ? body.expiresIn : 120;
        // Bound control-plane concurrency even when a large document list is requested.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, values.length) }, async () => {
          while (next < values.length) {
            const index = next++;
            const entry = object(values[index]);
            if (entry.path !== paths[index]) throw new DocumentError(502, 'INVALID_DOCUMENT_BATCH');
            if (entry.error) { entries[index] = { path: paths[index], signedUrl: null, error: 'DOCUMENT_ACCESS_DENIED' }; continue; }
            if (entry.document === null) { entries[index] = { path: paths[index], signedUrl: null, error: null, unmapped: true }; continue; }
            try { entries[index] = { path: paths[index], ...await signed(document(entry.document), seconds, Boolean(body.download)), error: null }; }
            catch { entries[index] = { path: paths[index], signedUrl: null, error: 'DOCUMENT_URL_UNAVAILABLE' }; }
          }
        }));
        return response({ entries });
      }
      if (body.operation === 'prepare') {
        const key = location(body);
        if (typeof body.bytes !== 'number' || !Number.isSafeInteger(body.bytes) || body.bytes < 1 || body.bytes > MAX_BYTES
          || typeof body.sha256 !== 'string' || !SHA256.test(body.sha256)
          || typeof body.fileName !== 'string' || !body.fileName || body.fileName.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(body.fileName)
          || typeof body.mimeType !== 'string' || !body.mimeType) throw new DocumentError(400, 'INVALID_DOCUMENT_UPLOAD');
        const scope = object(await backend.rpc('document_blob_upload_scope', {
          target_bucket: key.bucket, target_path: key.path, target_file_name: body.fileName,
          target_mime_type: body.mimeType, target_bytes: body.bytes, target_sha256: body.sha256,
          target_context: body.context === undefined ? {} : object(body.context),
        }));
        if (typeof scope.upload_id !== 'string' || !UUID.test(scope.upload_id) || scope.uploader_id !== userId) throw new DocumentError(502, 'INVALID_DOCUMENT_UPLOAD_SCOPE');
        const pathname = `documents/uploads/${scope.upload_id}`;
        const validUntil = Math.min(Date.parse(String(scope.expires_at)), now() + 15 * 60 * 1000);
        if (!Number.isFinite(validUntil) || validUntil <= now()) throw new DocumentError(409, 'DOCUMENT_UPLOAD_EXPIRED');
        const constraints = { allowedContentTypes: [body.mimeType], maximumSizeInBytes: body.bytes };
        const token = await deps.sign({ pathname, operations: ['put'], validUntil, ...constraints });
        const { presignedUrl } = await deps.presign(token, { operation: 'put', pathname, access: 'private', validUntil,
          ...constraints, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60 });
        return response({ uploadId: scope.upload_id, uploadUrl: presignedUrl, pathname, expiresAt: validUntil });
      }
      if (body.operation === 'complete') {
        if (typeof body.uploadId !== 'string' || !UUID.test(body.uploadId)) throw new DocumentError(400, 'INVALID_DOCUMENT_UPLOAD');
        const args = { target_upload_id: body.uploadId };
        const scope = object(await backend.rpc('document_blob_upload_revalidate', args));
        if (scope.uploader_id !== userId) throw new DocumentError(403, 'DOCUMENT_ACCESS_DENIED');
        const pathname = `documents/uploads/${body.uploadId}`;
        const current = await deps.read(pathname, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(180000) });
        if (!current || current.statusCode !== 200 || current.blob.pathname !== pathname || current.blob.size !== scope.bytes
          || mime(current.blob.contentType) !== mime(scope.mime_type)) throw new DocumentError(409, 'DOCUMENT_UPLOAD_MISMATCH');
        const blobUrl = privateBlobUrl(current.blob.url, pathname, storeId);
        const hash = createHash('sha256');
        let bytes = 0;
        const reader = current.stream.getReader();
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES || bytes > Number(scope.bytes)) throw new DocumentError(409, 'DOCUMENT_UPLOAD_MISMATCH');
            hash.update(part.value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        const sha256 = hash.digest('hex');
        if (bytes !== scope.bytes || sha256 !== scope.sha256) throw new DocumentError(409, 'DOCUMENT_UPLOAD_MISMATCH');
        const after = await deps.metadata(pathname);
        if (after.etag !== current.blob.etag || after.size !== bytes || mime(after.contentType) !== mime(scope.mime_type)) throw new DocumentError(409, 'DOCUMENT_UPLOAD_CHANGED');
        const live = object(await backend.rpc('document_blob_upload_revalidate', args));
        if (live.uploader_id !== userId || live.sha256 !== sha256 || live.bytes !== bytes) throw new DocumentError(403, 'DOCUMENT_ACCESS_DENIED');
        const result = await deps.register({ source_bucket: scope.source_bucket ?? scope.bucket, source_path: scope.source_path ?? scope.path,
          blob_pathname: pathname, blob_url: blobUrl, file_name: scope.file_name, mime_type: scope.mime_type,
          bytes, sha256, verified_bytes: bytes, verified_sha256: sha256, verified_mime_type: scope.mime_type,
          upload_id: body.uploadId, uploader_id: userId });
        return response({ document: result });
      }
      throw new DocumentError(400, 'UNKNOWN_DOCUMENT_OPERATION');
    } catch (error) {
      return response({ error: error instanceof DocumentError ? error.code : 'DOCUMENT_SERVICE_UNAVAILABLE' },
        error instanceof DocumentError ? error.status : 502);
    }
  };
}

function configuration() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new DocumentError(503, 'DOCUMENT_AUTH_NOT_CONFIGURED');
  return { url, key };
}
function rpcError(error: { code?: string } | null) {
  if (error) throw new DocumentError(error.code === '42501' ? 403 : 409,
    error.code === '42501' ? 'DOCUMENT_ACCESS_DENIED' : 'DOCUMENT_STATE_INVALID');
}
async function authenticatedUser(url: string, key: string, jwt: string): Promise<string | null> {
  try {
    const result = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
      method: 'GET', headers: { apikey: key, Authorization: `Bearer ${jwt}` },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (result.status !== 200) return null;
    const user = object(await result.json());
    return typeof user.id === 'string' && UUID.test(user.id) ? user.id : null;
  } catch { return null; }
}
const handler = createDocumentBlobGateway({
  getEnv: name => process.env[name],
  backend: jwt => {
    const { url, key } = configuration();
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
    return {
      user: () => authenticatedUser(url, key, jwt),
      rpc: async (name, args) => { const result = await client.rpc(name, args); rpcError(result.error); return result.data; },
    };
  },
  register: async record => {
    const { url } = configuration();
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new DocumentError(503, 'DOCUMENT_VERIFIER_NOT_CONFIGURED');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.rpc('document_blob_register_verified', { p_record: record });
    if (result.error) {
      const code = result.error.code;
      console.error('DOCUMENT_REGISTRATION_RPC_FAILED', {
        status: Number.isInteger(result.status) && result.status >= 100 && result.status <= 599 ? result.status : 0,
        code: typeof code === 'string' && /^(?:[0-9]{2}[0-9A-Z]{3}|(?:F0|HV|P0|XX)[0-9A-Z]{3}|PGRST[0-9]{3})$/.test(code) ? code : 'UNSPECIFIED',
      });
    }
    rpcError(result.error);
    return result.data;
  },
  sign: issueSignedToken, presign: presignUrl, read: get, metadata: head,
});
export const config = { maxDuration: 300 };
export default { fetch: handler };
