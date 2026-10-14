import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js';

type BucketApi = ReturnType<SupabaseClient['storage']['from']>;
type SignedOptions = Parameters<BucketApi['createSignedUrl']>[2];
type BatchOptions = Parameters<BucketApi['createSignedUrls']>[2];
type UploadBody = Parameters<BucketApi['upload']>[1];
type UploadOptions = Parameters<BucketApi['upload']>[2];
type DownloadOptions = Parameters<BucketApi['download']>[1];
type DownloadParameters = Parameters<BucketApi['download']>[2];
type RemovedFiles = NonNullable<Awaited<ReturnType<BucketApi['remove']>>['data']>;
type Result<T> = { data: T; error: null } | { data: null; error: StorageApiError };
type Json = Record<string, unknown>;
interface BlobReference { blob_pathname: string; bytes: number; sha256: string; file_name: string; mime_type: string }
const BUCKETS = new Set([
  'action-plan-evidence', 'annual-review-reports', 'documentary-audit-files', 'dpr-attachments', 'dpr-photos',
  'expense-note-pdfs', 'fleet-certificates', 'fleet-media', 'hr-documents', 'hr-portraits', 'internal-audit-photos',
  'lifting-assets', 'lifting-certificates', 'procedure-documents', 'project-catalog-media', 'project-files',
  'purchase-request-attachments', 'qhse-policy-attachments', 'service-note-files', 'vessel-visits',
  'working-time-imports', 'working-time-signatures', 'hr-drive', 'chemical-drive', 'procedure-publications-drive',
  'project-drive', 'disciplinary-drive',
  'purchase-request-external', 'service-note-source', 'service-note-external',
]);
const MAX_BYTES = 100 * 1024 * 1024;
function reference(value: unknown): BlobReference {
  const info = value && typeof value === 'object' ? value as Json : {};
  if (typeof info.blob_pathname !== 'string' || !info.blob_pathname.startsWith('documents/')
    || /[\\\u0000-\u001f\u007f]/.test(info.blob_pathname) || /(^|\/)\.\.?($|\/)/.test(info.blob_pathname)
    || typeof info.bytes !== 'number' || !Number.isSafeInteger(info.bytes) || info.bytes < 1 || info.bytes > MAX_BYTES
    || typeof info.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(info.sha256)
    || typeof info.file_name !== 'string' || !info.file_name || typeof info.mime_type !== 'string' || !info.mime_type) {
    throw new Error('La référence Vercel du document est invalide.');
  }
  return info as unknown as BlobReference;
}
async function lookup(client: SupabaseClient, bucket: string, path: string): Promise<BlobReference | null> {
  const result = await client.rpc('document_blob_lookup', { target_bucket: bucket, target_path: path });
  if (result.error) throw result.error;
  return result.data === null ? null : reference(result.data);
}
export async function hasDocumentBlobFile(client: SupabaseClient, bucket?: string | null, path?: string | null): Promise<boolean> {
  return Boolean(bucket && path && await lookup(client, bucket, path));
}
async function errorOf(error: unknown): Promise<StorageApiError> {
  if (error instanceof StorageApiError) return error;
  const detail = error && typeof error === 'object' ? error as { message?: string; code?: string } : {};
  return new StorageApiError(detail.message || 'Le document Vercel est indisponible.', detail.code === '42501' ? 403 : 502, detail.code || 'document_blob_error');
}
async function api(client: SupabaseClient, body: Json, signal?: AbortSignal): Promise<Json> {
  const initial = await client.auth.getSession();
  if (initial.error) throw initial.error;
  const session = initial.data.session;
  if (!session?.access_token || !session.user?.id) throw new Error('Reconnectez-vous pour accéder aux documents.');
  const result = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  const value: unknown = await result.json().catch(() => null);
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
  if (!result.ok) throw new StorageApiError(typeof data.error === 'string' ? data.error : 'Le service documentaire est indisponible.', result.status, String(data.error || 'document_blob_error'));
  const current = await client.auth.getSession();
  if (current.error || current.data.session?.user.id !== session.user.id) throw new Error('Le compte a changé pendant la lecture du document.');
  return data;
}
function signedUrl(data: Json): string {
  if (typeof data.signedUrl !== 'string') throw new Error('Le lien Vercel est invalide.');
  const url = new URL(data.signedUrl);
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname)) throw new Error('Le lien Vercel est invalide.');
  return data.signedUrl;
}
function inferredMime(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  const mimes: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' };
  return mimes[extension || ''] || 'application/octet-stream';
}
/** Shared HTTPS readers and direct, verified browser uploads for every document module. */
export function documentBlobStorage(client: SupabaseClient, bucket: string, legacy: BucketApi): BucketApi {
  if (!BUCKETS.has(bucket)) return legacy;
  let throwErrors = false;
  const operation = async <T>(perform: () => Promise<Result<T>>): Promise<Result<T>> => {
    try { const result = await perform(); if (result.error && throwErrors) throw result.error; return result; }
    catch (error) { const failure = await errorOf(error); if (throwErrors) throw failure; return { data: null, error: failure }; }
  };
  const createSignedUrl = (path: string, expiresIn: number, options?: SignedOptions) => operation(async () => {
    const mapped = await lookup(client, bucket, path);
    if (!mapped) return await legacy.createSignedUrl(path, expiresIn, options) as Result<{ signedUrl: string }>;
    const data = await api(client, { operation: 'url', bucket, path, expiresIn, download: options?.download || false });
    const current = reference(data.document);
    if (current.blob_pathname !== mapped.blob_pathname || current.sha256 !== mapped.sha256) throw new Error('Le document a changé. Rechargez la liste.');
    return { data: { signedUrl: signedUrl(data) }, error: null };
  });
  const download = (path: string, options?: DownloadOptions, parameters?: DownloadParameters) => {
    const result = operation<Blob>(async () => {
      const mapped = await lookup(client, bucket, path);
      if (!mapped) return await legacy.download(path, options, parameters) as Result<Blob>;
      const data = await api(client, { operation: 'url', bucket, path }, parameters?.signal);
      const info = reference(data.document);
      if (info.blob_pathname !== mapped.blob_pathname || info.sha256 !== mapped.sha256) throw new Error('Le document a changé. Rechargez la liste.');
      const response = await fetch(signedUrl(data), { ...(parameters?.signal ? { signal: parameters.signal } : {}), credentials: 'omit' });
      if (!response.ok) throw new Error('Le téléchargement Vercel a échoué.');
      const blob = await response.blob();
      if (blob.size !== info.bytes || blob.type.split(';')[0].trim().toLowerCase() !== info.mime_type.split(';')[0].trim().toLowerCase()) throw new Error('Le téléchargement du document est incomplet.');
      return { data: blob, error: null };
    });
    return Object.assign(result, { asStream: () => result.then(value => value.error ? value : { data: value.data.stream(), error: null }) });
  };
  const createSignedUrls = (paths: string[], expiresIn: number, options?: BatchOptions) => operation(async () => {
    const entries: { path: string; signedUrl: string | null; error: string | null }[] = [];
    for (let offset = 0; offset < paths.length; offset += 200) {
      const batch = paths.slice(offset, offset + 200);
      const lookup = await client.rpc('document_blob_lookup_batch', { target_bucket: bucket, target_paths: batch });
      if (lookup.error) throw lookup.error;
      if (!Array.isArray(lookup.data) || lookup.data.length !== batch.length) throw new Error('La liste des documents Vercel est invalide.');
      const mapped = new Map<string, BlobReference>();
      const fallback: string[] = [];
      const denied = new Map<string, string>();
      lookup.data.forEach((entry: Json, index: number) => {
        if (!entry || entry.path !== batch[index]) throw new Error('La liste des documents Vercel est invalide.');
        if (entry.error) denied.set(batch[index], String(entry.error));
        else if (entry.document === null) fallback.push(batch[index]);
        else mapped.set(batch[index], reference(entry.document));
      });
      const native = fallback.length ? await legacy.createSignedUrls(fallback, expiresIn, options) : null;
      const old = new Map((native?.data || []).map(entry => [entry.path, entry]));
      const resolved = new Map<string, Json>();
      if (mapped.size) {
        const requested = [...mapped.keys()];
        try {
          const result = await api(client, { operation: 'urls', bucket, paths: requested, expiresIn, download: options?.download || false });
          if (!Array.isArray(result.entries) || result.entries.length !== requested.length) throw new Error('La liste des documents Vercel est invalide.');
          result.entries.forEach((value: Json, index: number) => {
            if (!value || value.path !== requested[index]) throw new Error('La liste des documents Vercel est invalide.');
            // A mapping disappearing during the request must never revive its old source.
            if (value.unmapped || value.error) resolved.set(requested[index], { error: value.error || 'Le document a changé. Rechargez la liste.' });
            else {
              const current = reference(value.document);
              const original = mapped.get(requested[index])!;
              if (current.blob_pathname !== original.blob_pathname || current.sha256 !== original.sha256) throw new Error('Le document a changé. Rechargez la liste.');
              resolved.set(requested[index], { signedUrl: signedUrl(value) });
            }
          });
        } catch (error) {
          const failure = await errorOf(error);
          for (const path of requested) resolved.set(path, { error: failure.message });
        }
      }
      batch.forEach(path => {
        const value = resolved.get(path);
        const entry = old.get(path);
        if (denied.has(path)) entries.push({ path, signedUrl: null, error: denied.get(path)! });
        else if (mapped.has(path)) entries.push({ path, signedUrl: typeof value?.signedUrl === 'string' ? value.signedUrl : null, error: value?.error ? String(value.error) : null });
        else entries.push({ path, signedUrl: entry?.signedUrl || null, error: entry?.error || native?.error?.message || null });
      });
    }
    return { data: entries, error: null };
  });
  const upload = (path: string, body: UploadBody, options?: UploadOptions) => operation(async () => {
    // Editable procedure sources keep their existing Drive/Storage workflow.
    if (bucket === 'procedure-documents' && !path.startsWith('published/')) return await legacy.upload(path, body, options) as Result<{ id: string; path: string; fullPath: string }>;
    const blob = body instanceof Blob ? body : body instanceof ArrayBuffer || ArrayBuffer.isView(body) ? new Blob([body as BlobPart]) : null;
    if (!blob || !blob.size || blob.size > MAX_BYTES) throw new Error('Sélectionnez un fichier de 100 Mo maximum.');
    const fileName = body instanceof File ? body.name : path.split('/').pop() || 'document';
    const mimeType = (options?.contentType || blob.type || inferredMime(fileName)).split(';')[0].trim().toLowerCase();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
    const prepared = await api(client, { operation: 'prepare', bucket, path, fileName, mimeType, bytes: blob.size, sha256, context: options?.metadata || {} });
    if (typeof prepared.uploadUrl !== 'string' || typeof prepared.uploadId !== 'string') throw new Error('L’envoi du document n’a pas pu être préparé.');
    const uploadUrl = new URL(prepared.uploadUrl);
    if (uploadUrl.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)?blob(?:-api)?\.vercel-storage\.com$/.test(uploadUrl.hostname)) throw new Error('La destination du document est invalide.');
    const sent = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob, credentials: 'omit' });
    // A previous PUT may have succeeded before a connection interruption. The
    // verifier still checks every byte; the existing object is never overwritten.
    if (!sent.ok && ![400, 409, 412].includes(sent.status)) throw new Error('L’envoi du document Vercel a échoué. Relancez l’envoi.');
    const completed = await api(client, { operation: 'complete', uploadId: prepared.uploadId });
    const verified = reference(completed.document);
    if (verified.sha256 !== sha256 || verified.bytes !== blob.size || verified.mime_type !== mimeType) throw new Error('Le fichier enregistré ne correspond pas au fichier sélectionné.');
    return { data: { id: String((completed.document as Json).id || prepared.uploadId), path, fullPath: `${bucket}/${path}` }, error: null };
  });
  const remove = (paths: string[]) => operation<RemovedFiles>(async () => {
    const nativePaths: string[] = [];
    for (let offset = 0; offset < paths.length; offset += 200) {
      const batch = paths.slice(offset, offset + 200);
      const result = await client.rpc('document_blob_lookup_batch', { target_bucket: bucket, target_paths: batch });
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || result.data.length !== batch.length) throw new Error('La liste des documents Vercel est invalide.');
      result.data.forEach((value: Json, index: number) => {
        if (!value || value.path !== batch[index]) throw new Error('La liste des documents Vercel est invalide.');
        // A preceding, authorized business deletion can already have removed
        // read access. Retaining that archive needs no new permission and must
        // not trigger a destructive fallback to its historical source.
        if (value.error === '42501') return;
        if (value.error) throw new Error('La conservation du document n’a pas pu être confirmée.');
        if (value.document === null) nativePaths.push(batch[index]);
        else reference(value.document);
      });
    }
    // Business records still control visibility through their existing RLS.
    // Retain private archives and migration originals; physical purging is a
    // separate operation, never an SDK fallback to the historical provider.
    return nativePaths.length ? await legacy.remove(nativePaths) as Result<RemovedFiles> : { data: [], error: null };
  });
  const proxy = new Proxy(legacy, { get(target, property) {
    if (property === 'download') return download;
    if (property === 'createSignedUrl') return createSignedUrl;
    if (property === 'createSignedUrls') return createSignedUrls;
    if (property === 'upload') return upload;
    if (property === 'remove') return remove;
    if (property === 'throwOnError') return () => { throwErrors = true; target.throwOnError(); return proxy; };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return proxy;
}
