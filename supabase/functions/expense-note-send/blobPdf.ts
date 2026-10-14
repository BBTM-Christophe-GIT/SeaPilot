const DOCUMENT_API = 'https://sea-pilot-ten.vercel.app/api/documents';
export const MAX_EXPENSE_PDF_BYTES = 4_000_000;
const PDF_MIME = 'application/pdf';
const mime = (value: unknown) => typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : '';

export class ExpensePdfAccessError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const unavailable = () => new ExpensePdfAccessError(502, 'PDF privé indisponible.');
const invalid = () => new ExpensePdfAccessError(422, 'Le PDF privé ne correspond pas à sa référence vérifiée.');
const oversized = () => new ExpensePdfAccessError(413, 'Le PDF dépasse la limite d’envoi de 4 Mo.');

async function boundedBody(response: Response, limit: number, signal: AbortSignal, tooLarge: () => Error): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw unavailable();
  const length = response.headers.get('content-length');
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > limit)) {
    void response.body.cancel().catch(() => {});
    throw length && /^[0-9]+$/.test(length) ? tooLarge() : invalid();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let aborted: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    aborted = () => reject(unavailable());
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), abort]);
      if (part.done) break;
      received += part.value.byteLength;
      if (received > limit) throw tooLarge();
      chunks.push(part.value);
    }
    if (length !== null && received !== Number(length)) throw invalid();
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    if (aborted) signal.removeEventListener('abort', aborted);
    reader.releaseLock();
  }
}

function privateLocation(raw: unknown, pathname: string, signed: boolean): URL {
  if (typeof raw !== 'string' || /[\\\u0000-\u0020\u007f]/.test(raw)) throw invalid();
  let url: URL;
  try { url = new URL(raw); } catch { throw invalid(); }
  const authority = /^https:\/\/([^/?#]+)\//.exec(raw)?.[1];
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname)
    || authority?.toLowerCase() !== url.hostname || url.username || url.password || url.port || url.hash
    || (!signed && url.search) || (signed && !url.search)) throw invalid();
  try { if (decodeURIComponent(url.pathname.slice(1)) !== pathname) throw invalid(); }
  catch { throw invalid(); }
  return url;
}

/** Caller JWT stays on the fixed application endpoint; the provider receives only its signed URL. */
export async function readExpenseBlobPdf(send: typeof fetch, authorization: string, path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const signal = AbortSignal.timeout(30_000);
    const response = await send(DOCUMENT_API, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'url', bucket: 'expense-note-pdfs', path, expiresIn: 120 }),
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal });
    if (mime(response.headers.get('content-type')) !== 'application/json') {
      void response.body?.cancel().catch(() => {});
      throw unavailable();
    }
    const raw = await boundedBody(response, 64_000, signal, unavailable);
    let value: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
      value = parsed as Record<string, unknown>;
    } catch { throw unavailable(); }
    // This exact response is the only permission to try the deployed Drive/Storage reader.
    if (response.status === 404 && value.error === 'DOCUMENT_NOT_FOUND') return null;
    if (!response.ok) throw new ExpensePdfAccessError([401, 403].includes(response.status) ? response.status : 502, 'Accès au PDF privé indisponible.');
    const info = value.document as Record<string, unknown> | null;
    if (!info || typeof info !== 'object' || Array.isArray(info) || info.provider !== 'vercel-blob'
      || typeof info.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(info.id)
      || typeof info.verified_at !== 'string' || !Number.isFinite(Date.parse(info.verified_at))
      || mime(info.mime_type) !== PDF_MIME || typeof info.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(info.sha256)
      || (info.source_sha256 !== undefined && info.source_sha256 !== info.sha256)
      || typeof info.file_name !== 'string' || !info.file_name || info.file_name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(info.file_name)
      || typeof info.blob_pathname !== 'string' || !info.blob_pathname.startsWith('documents/')
      || /[\\?#\u0000-\u001f\u007f]/.test(info.blob_pathname) || /(^|\/)\.\.?($|\/)/.test(info.blob_pathname)
      || typeof info.bytes !== 'number' || !Number.isSafeInteger(info.bytes) || info.bytes < 1 || info.bytes > 104857600
      || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 125_000) throw invalid();
    if (info.bytes > MAX_EXPENSE_PDF_BYTES) throw oversized();
    const original = privateLocation(info.blob_url, info.blob_pathname, false);
    const signed = privateLocation(value.signedUrl, info.blob_pathname, true);
    if (original.hostname !== signed.hostname) throw invalid();
    const pdf = await send(signed.href, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal });
    if (pdf.status !== 200 || mime(pdf.headers.get('content-type')) !== PDF_MIME) {
      void pdf.body?.cancel().catch(() => {});
      throw invalid();
    }
    const length = pdf.headers.get('content-length');
    if (length !== null && Number(length) <= MAX_EXPENSE_PDF_BYTES && Number(length) !== info.bytes) {
      void pdf.body?.cancel().catch(() => {});
      throw invalid();
    }
    const bytes = await boundedBody(pdf, MAX_EXPENSE_PDF_BYTES, signal, oversized);
    if (bytes.byteLength !== info.bytes || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw invalid();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (sha !== info.sha256) throw invalid();
    return bytes;
  } catch (error) {
    if (error instanceof ExpensePdfAccessError) throw error;
    throw unavailable();
  }
}
