import { StorageApiError, type SupabaseClient } from '@supabase/supabase-js';

type BucketApi = ReturnType<SupabaseClient['storage']['from']>;
type SignedOptions = Parameters<BucketApi['createSignedUrl']>[2];
type BatchOptions = Parameters<BucketApi['createSignedUrls']>[2];
type DownloadOptions = Parameters<BucketApi['download']>[1];
type DownloadParameters = Parameters<BucketApi['download']>[2];
type Result<T> = { data: T; error: null } | { data: null; error: StorageApiError };
type SignedEntry = { path: string | null; signedUrl: string | null; error: string | null };

interface DriveReference {
  drive_file_id: string;
  mime_type: string;
}

// Photos and signatures keep using their existing Storage policies and APIs.
const DOCUMENT_EXTENSION = /\.(?:pdf|docx?|docm|dotx?|dotm|xlsx?|xlsm|xlsb|xltx?|xltm|xlam|xla)$/i;
const installedClients = new WeakSet<SupabaseClient>();

async function lookupDocumentDriveFile(client: SupabaseClient, bucket: string, path: string): Promise<DriveReference | null> {
  if (!DOCUMENT_EXTENSION.test(path)) return null;
  const { data, error } = await client.rpc('document_drive_lookup', { target_bucket: bucket, target_path: path });
  if (error) throw error;
  if (data === null) return null;
  if (!data || typeof data.drive_file_id !== 'string' || !data.drive_file_id) {
    throw new Error('La référence Google Drive du document est invalide.');
  }
  return data as DriveReference;
}

/** Check the current user's access before choosing the gateway over a desktop-only reader. */
export async function hasDocumentDriveFile(client: SupabaseClient, bucket?: string | null, path?: string | null): Promise<boolean> {
  return Boolean(bucket && path && await lookupDocumentDriveFile(client, bucket, path));
}

async function storageError(failure: unknown): Promise<StorageApiError> {
  if (failure instanceof StorageApiError) return failure;
  const detail = failure && typeof failure === 'object' ? failure as { message?: string; code?: string; context?: unknown } : {};
  const response = detail.context instanceof Response ? detail.context : null;
  const body = response ? await response.clone().json().catch(() => null) : null;
  return new StorageApiError(
    typeof body?.error === 'string' ? body.error : detail.message || 'Le document Google Drive est indisponible.',
    response?.status || (detail.code === '42501' ? 403 : 502),
    detail.code || 'document_drive_error',
  );
}

/** Route verified historical document addresses through the authenticated Drive gateway. */
export function documentDriveStorage(client: SupabaseClient, bucket: string, legacy: BucketApi): BucketApi {
  let throwErrors = false;
  const lookup = (path: string) => lookupDocumentDriveFile(client, bucket, path);
  const operation = async <T>(perform: () => Promise<Result<T>>): Promise<Result<T>> => {
    try {
      const result = await perform();
      if (result.error && throwErrors) throw result.error;
      return result;
    } catch (failure) {
      const error = await storageError(failure);
      if (throwErrors) throw error;
      return { data: null, error };
    }
  };
  const driveUrl = async (path: string, expiresIn: number, options?: SignedOptions): Promise<{ signedUrl: string }> => {
    if (options?.transform && Object.keys(options.transform).length) {
      throw new Error('Les transformations d’image ne sont pas disponibles pour un document Google Drive.');
    }
    const { data, error } = await client.functions.invoke('document-drive', {
      body: { operation: 'url', bucket, path, expiresIn, ...(options?.download !== undefined ? { download: options.download } : {}) },
    });
    if (error) throw error;
    if (!data || typeof data.signedUrl !== 'string' || !/^https?:\/\//.test(data.signedUrl)) {
      throw new Error('Le lien du document Google Drive n’a pas pu être confirmé.');
    }
    return { signedUrl: data.signedUrl };
  };
  const download = (path: string, options?: DownloadOptions, parameters?: DownloadParameters) => {
    const result = operation<Blob>(async () => {
      const reference = await lookup(path);
      if (!reference) return await legacy.download(path, options, parameters) as Result<Blob>;
      if (options?.transform && Object.keys(options.transform).length) {
        throw new Error('Les transformations d’image ne sont pas disponibles pour un document Google Drive.');
      }
      const { data, error } = await client.functions.invoke('document-drive', {
        body: { operation: 'download', bucket, path },
        ...(parameters?.signal ? { signal: parameters.signal } : {}),
      });
      if (error) throw error;
      if (!(data instanceof Blob)) throw new Error('Le téléchargement Google Drive n’a pas renvoyé un fichier valide.');
      return { data: new Blob([data], { type: reference.mime_type || data.type }), error: null };
    });
    // Supabase download is both awaitable and exposes asStream(). Preserve that contract.
    return Object.assign(result, { asStream: () => result.then(value => value.error ? value : { data: value.data.stream(), error: null }) });
  };
  const createSignedUrl = (path: string, expiresIn: number, options?: SignedOptions) => operation(async () => {
    if (!await lookup(path)) return await legacy.createSignedUrl(path, expiresIn, options) as Result<{ signedUrl: string }>;
    return { data: await driveUrl(path, expiresIn, options), error: null };
  });
  const createSignedUrls = (paths: string[], expiresIn: number, options?: BatchOptions) => operation<SignedEntry[]>(async () => {
    const references = await Promise.all(paths.map(async path => {
      try { return { path, reference: await lookup(path), error: null }; }
      catch (failure) { return { path, reference: null, error: await storageError(failure) }; }
    }));
    if (references.every(item => !item.reference && !item.error)) {
      return await legacy.createSignedUrls(paths, expiresIn, options) as Result<SignedEntry[]>;
    }
    const unmapped = references.filter(item => !item.reference && !item.error).map(item => item.path);
    const fallback = unmapped.length ? await legacy.createSignedUrls(unmapped, expiresIn, options) : null;
    const legacyEntries = new Map((fallback?.data || []).map(item => [item.path, item]));
    const entries = await Promise.all(references.map(async item => {
      if (item.error) return { path: item.path, signedUrl: null, error: item.error.message };
      if (!item.reference) {
        const entry = legacyEntries.get(item.path);
        return entry || { path: item.path, signedUrl: null, error: fallback?.error?.message || 'Le document est indisponible.' };
      }
      try { return { path: item.path, signedUrl: (await driveUrl(item.path, expiresIn, options)).signedUrl, error: null }; }
      catch (failure) { return { path: item.path, signedUrl: null, error: (await storageError(failure)).message }; }
    }));
    return { data: entries, error: null };
  });
  const proxy = new Proxy(legacy, {
    get(target, property) {
      if (property === 'download') return download;
      if (property === 'createSignedUrl') return createSignedUrl;
      if (property === 'createSignedUrls') return createSignedUrls;
      if (property === 'throwOnError') return () => { throwErrors = true; target.throwOnError(); return proxy; };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return proxy;
}

export function installDocumentDriveStorage(client: SupabaseClient): void {
  if (installedClients.has(client)) return;
  const originalFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => documentDriveStorage(client, bucket, originalFrom(bucket));
  installedClients.add(client);
}
