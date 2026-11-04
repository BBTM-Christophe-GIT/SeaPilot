import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { get } from '@vercel/blob';

const HEADERS = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const ROLES = ['admin', 'direction', 'armement', 'capitaine', 'marin'];
const MAX_SIGNATURE_BYTES = 1_048_576;
class SignatureError extends Error {
  status: number;
  constructor(status: number) { super('Signature privée indisponible.'); this.status = status; }
}

/** Authorize with the caller's JWT before creating a privileged storage client. */
export async function loadPlanningDocumentSignature(actor: SupabaseClient, privileged: () => SupabaseClient, jwt?: string, readBlob: typeof get = get): Promise<Blob> {
  const user = await actor.auth.getUser(jwt);
  if (user.error || !user.data.user) throw new SignatureError(401);
  const company = await actor.rpc('current_planning_company_id');
  if (company.error || !company.data) throw new SignatureError(403);
  const allowed = await actor.rpc('has_company_role', { target_company_id: company.data, required_roles: ROLES });
  if (allowed.error || allowed.data !== true) throw new SignatureError(403);
  const storage = privileged();
  const people = await storage.from('people').select('id').eq('company_id', company.data)
    .eq('active', true).ilike('first_name', 'Benjamin').ilike('last_name', 'BON').limit(2);
  if (people.error || people.data?.length !== 1) throw new SignatureError(404);
  const result = await storage.from('working_time_profile_signatures')
    .select('storage_bucket,storage_path,mime_type,file_size_bytes,sha256')
    .eq('company_id', company.data).eq('person_id', people.data[0].id)
    .is('valid_to', null).lte('valid_from', new Date().toISOString())
    .order('version_number', { ascending: false }).limit(1).maybeSingle();
  const signature = result.data;
  if (result.error || !signature || signature.storage_bucket !== 'working-time-signatures'
    || signature.mime_type !== 'image/png' || Number(signature.file_size_bytes) > MAX_SIGNATURE_BYTES) throw new SignatureError(404);
  // A migrated mapping is authoritative. It must remain bound to the fixed
  // signer's selected private Storage reference, never a caller-supplied path.
  const mapping = await storage.from('document_blob_files')
    .select('source_bucket,source_path,blob_pathname,mime_type,bytes,sha256')
    .eq('source_bucket', signature.storage_bucket).eq('source_path', signature.storage_path).eq('active', true).maybeSingle();
  if (mapping.error) throw new SignatureError(502);
  if (mapping.data) {
    const info = mapping.data;
    if (info.source_bucket !== signature.storage_bucket || info.source_path !== signature.storage_path
      || typeof info.blob_pathname !== 'string' || !info.blob_pathname.startsWith('documents/')
      || /(^|\/)\.\.?($|\/)/.test(info.blob_pathname)
      // eslint-disable-next-line no-control-regex -- Private provider paths must reject traversal and control characters.
      || /[\\\u0000-\u001f\u007f?#]/.test(info.blob_pathname)
      || info.mime_type !== 'image/png' || !Number.isSafeInteger(Number(info.bytes))
      || Number(info.bytes) < 1 || Number(info.bytes) > MAX_SIGNATURE_BYTES
      || Number(info.bytes) !== Number(signature.file_size_bytes)
      || typeof info.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(info.sha256) || info.sha256 !== signature.sha256) throw new SignatureError(502);
    const current = await readBlob(info.blob_pathname, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(20_000) });
    if (!current || current.statusCode !== 200 || current.blob.pathname !== info.blob_pathname
      || current.blob.contentType.split(';')[0].trim().toLowerCase() !== 'image/png' || current.blob.size !== Number(info.bytes)) {
      await current?.stream?.cancel().catch(() => {});
      throw new SignatureError(502);
    }
    const reader = current.stream.getReader();
    const chunks: Uint8Array[] = [];
    const digest = createHash('sha256');
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > Number(info.bytes) || bytes > MAX_SIGNATURE_BYTES) throw new SignatureError(502);
        digest.update(part.value); chunks.push(part.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (bytes !== Number(info.bytes) || digest.digest('hex') !== info.sha256) throw new SignatureError(502);
    const image = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { image.set(chunk, offset); offset += chunk.byteLength; }
    return new Blob([image.buffer], { type: 'image/png' });
  }
  const image = await storage.storage.from('working-time-signatures').download(signature.storage_path);
  if (image.error || !image.data || image.data.size < 1 || image.data.size > MAX_SIGNATURE_BYTES || image.data.type !== 'image/png') throw new SignatureError(502);
  return image.data;
}

export function createPlanningDocumentSignatureGateway(download: (jwt: string) => Promise<Blob>) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
    const url = new URL(request.url);
    if (url.search || request.headers.get('sec-fetch-site') === 'cross-site'
      || request.headers.get('origin') && request.headers.get('origin') !== url.origin) return new Response(null, { status: 403, headers: HEADERS });
    const jwt = /^Bearer ([^\s]{1,16384})$/.exec(request.headers.get('authorization') || '')?.[1];
    if (!jwt) return new Response(null, { status: 401, headers: HEADERS });
    try {
      const image = await download(jwt);
      return new Response(image, { headers: { ...HEADERS, 'Content-Type': 'image/png' } });
    } catch (error) {
      return Response.json({ error: 'La signature privée de Benjamin BON est indisponible.' },
        { status: error instanceof SignatureError ? error.status : 502, headers: HEADERS });
    }
  };
}

const handler = createPlanningDocumentSignatureGateway(async jwt => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new SignatureError(503);
  const actor = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } } });
  return loadPlanningDocumentSignature(actor, () => {
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new SignatureError(503);
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  }, jwt);
});
export const config = { maxDuration: 30 };
export default { fetch: handler };
