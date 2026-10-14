import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { get, head } from '@vercel/blob';

type Json = Record<string, unknown>;
const MAX_BYTES = 100 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
class ActivationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
function fail(code: string): never { throw new ActivationError(code); }
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PROOF_RECORD');
  return value as Json;
}
export function activationErrorCode(error: unknown): string {
  if (error instanceof ActivationError) return error.code;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const known = new Set(['42501', '23505', '22023', '22P02', '22003', '42883', '42P01', 'P0001', '08000', '08006', '57014',
    '53200', '53300', 'XX000', 'ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EPIPE']);
  return known.has(code) || /^PGRST[0-9]{3}$/.test(code) ? code : 'ACTIVATION_FAILED';
}
function key(value: Json): string {
  if (typeof value.source_bucket !== 'string' || !/^[a-z0-9-]{1,100}$/.test(value.source_bucket)
    || typeof value.source_path !== 'string' || !value.source_path || value.source_path.length > 2000
    || /[\\\u0000-\u001f\u007f]/.test(value.source_path) || value.source_path.startsWith('/')
    || /(^|\/)\.\.?($|\/)/.test(value.source_path)) fail('INVALID_LOGICAL_KEY');
  return JSON.stringify([value.source_bucket, value.source_path]);
}
function privateUrl(url: unknown, pathname: unknown, storeId: string): string {
  if (typeof url !== 'string' || typeof pathname !== 'string' || !pathname.startsWith('documents/')
    || /[\\\u0000-\u001f\u007f]/.test(pathname) || /(^|\/)\.\.?($|\/)/.test(pathname)) fail('INVALID_BLOB_LOCATION');
  let parsed: URL;
  try { parsed = new URL(url); } catch { return fail('INVALID_BLOB_LOCATION'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash
    || parsed.hostname !== `${storeId.replace(/^store_/, '').toLowerCase()}.private.blob.vercel-storage.com`) fail('BLOB_STORE_MISMATCH');
  let decoded: string;
  try { decoded = decodeURIComponent(parsed.pathname.slice(1)); } catch { return fail('INVALID_BLOB_LOCATION'); }
  if (decoded !== pathname) fail('BLOB_PATH_MISMATCH');
  return url;
}
export interface MigrationRecord extends Json {
  source_bucket: string; source_path: string; blob_pathname: string; blob_url: string;
  file_name: string; mime_type: string; bytes: number; sha256: string; source_sha256: string;
  original_owner_id: string | null; provenance: Json; context: Json;
}
function record(value: unknown, storeId: string): MigrationRecord {
  const item = object(value);
  key(item);
  if (item.verified !== true) fail('SOURCE_UNVERIFIED');
  privateUrl(item.blob_url, item.blob_pathname, storeId);
  if (typeof item.bytes !== 'number' || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_BYTES
    || typeof item.sha256 !== 'string' || !SHA256.test(item.sha256)
    || typeof item.source_sha256 !== 'string' || !SHA256.test(item.source_sha256)
    || item.sha256 !== item.source_sha256) fail('INVALID_SOURCE_PROOF');
  if (typeof item.file_name !== 'string' || !item.file_name || item.file_name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(item.file_name)
    || typeof item.mime_type !== 'string' || item.mime_type.length > 200 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+(?:;[^\u0000-\u001f\u007f]*)?$/.test(item.mime_type)
    || item.original_owner_id !== null && (typeof item.original_owner_id !== 'string' || !item.original_owner_id || item.original_owner_id.length > 255)) fail('INVALID_DOCUMENT_METADATA');
  if (item.source_retained !== true) fail('SOURCE_RETENTION_UNCONFIRMED');
  object(item.provenance);
  object(item.context);
  return item as MigrationRecord;
}
interface BlobMetadata { url: string; pathname: string; size: number | null; contentType: string | null; etag: string }
interface BlobRead { statusCode: number; stream: ReadableStream<Uint8Array> | null; blob: BlobMetadata }
export interface ActivationDependencies {
  metadata: (url: string) => Promise<BlobMetadata>;
  read: (url: string) => Promise<BlobRead | null>;
  register?: (value: Json) => Promise<unknown>;
  now?: () => Date;
  progress?: (counts: { completed: number; failed: number }) => void;
}
function assertMetadata(meta: BlobMetadata, item: MigrationRecord, storeId: string, responseMime = false) {
  privateUrl(meta.url, meta.pathname, storeId);
  const mimeMatches = responseMime
    ? meta.contentType?.split(';')[0].trim().toLowerCase() === item.mime_type.split(';')[0].trim().toLowerCase()
    : meta.contentType === item.mime_type;
  if (meta.url !== item.blob_url || meta.pathname !== item.blob_pathname || meta.size !== item.bytes
    || !mimeMatches || typeof meta.etag !== 'string' || !meta.etag) fail('BLOB_METADATA_MISMATCH');
}
async function verify(item: MigrationRecord, storeId: string, deps: ActivationDependencies) {
  const before = await deps.metadata(item.blob_url);
  assertMetadata(before, item, storeId);
  const response = await deps.read(item.blob_url);
  if (!response || response.statusCode !== 200 || !response.stream) fail('BLOB_FULL_READ_REQUIRED');
  try {
    assertMetadata(response.blob, item, storeId, true);
    if (response.blob.etag !== before.etag) fail('BLOB_CHANGED');
  } catch (error) { await response.stream.cancel().catch(() => undefined); throw error; }
  const digest = createHash('sha256');
  const reader = response.stream.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > item.bytes || bytes > MAX_BYTES) fail('BLOB_SIZE_MISMATCH');
      digest.update(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  const sha256 = digest.digest('hex');
  if (bytes !== item.bytes) fail('BLOB_SIZE_MISMATCH');
  if (sha256 !== item.sha256 || sha256 !== item.source_sha256) fail('BLOB_HASH_MISMATCH');
  const after = await deps.metadata(item.blob_url);
  assertMetadata(after, item, storeId);
  if (after.etag !== before.etag) fail('BLOB_CHANGED');
  return { verified_bytes: bytes, verified_sha256: sha256, verified_mime_type: after.contentType, etag: after.etag };
}
function confirmRegistration(value: unknown, item: MigrationRecord) {
  const saved = object(value);
  if (!saved.id || saved.provider !== 'vercel-blob' || ['source_bucket', 'source_path', 'blob_pathname', 'blob_url', 'file_name',
    'mime_type', 'bytes', 'sha256', 'source_sha256'].some(field => saved[field] !== item[field])) fail('REGISTRY_CONFIRMATION_MISMATCH');
}
interface ItemResult { kind: 'record' | 'alias'; index: number; status: 'verified' | 'registered' | 'failed'; code?: string; record?: Json }
export interface ActivationReport {
  version: 1; mode: 'dry-run' | 'apply'; storeId: string; startedAt: string; finishedAt: string;
  counts: { records: number; aliases: number; excluded: number; verified: number; registered: number; failed: number };
  codes: Record<string, number>; results: ItemResult[];
}
async function boundedWorkers<T>(items: T[], perform: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await perform(items[index], index);
    }
  }));
}
/** All registration calls follow a complete new binary verification. No provider objects are changed. */
export async function activateDocumentMigration(proofValue: unknown, storeId: string, apply: boolean, deps: ActivationDependencies): Promise<ActivationReport> {
  const proof = object(proofValue);
  if (!/^store_[a-zA-Z0-9]+$/.test(storeId) || proof.storeId !== storeId) fail('BLOB_STORE_MISMATCH');
  if (!Array.isArray(proof.records) || !Array.isArray(proof.aliases) || !Array.isArray(proof.excluded)) fail('INVALID_PROOF');
  if (apply && !deps.register) fail('REGISTRY_NOT_CONFIGURED');
  const now = () => (deps.now?.() || new Date()).toISOString();
  const report: ActivationReport = { version: 1, mode: apply ? 'apply' : 'dry-run', storeId, startedAt: now(), finishedAt: '',
    counts: { records: proof.records.length, aliases: proof.aliases.length, excluded: proof.excluded.length, verified: 0, registered: 0, failed: 0 }, codes: {}, results: [] };
  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const item of [...proof.records, ...proof.aliases]) {
    try { const identity = key(object(item)); if (seen.has(identity)) duplicateKeys.add(identity); seen.add(identity); } catch { /* Report invalid entries individually. */ }
  }
  const completed = new Map<string, { item: MigrationRecord; verified: Awaited<ReturnType<typeof verify>> }>();
  const failed = (kind: ItemResult['kind'], index: number, error: unknown) => {
    const code = activationErrorCode(error);
    report.counts.failed++;
    report.codes[code] = (report.codes[code] || 0) + 1;
    report.results.push({ kind, index, status: 'failed', code });
  };
  const save = async (item: MigrationRecord, verified: Awaited<ReturnType<typeof verify>>, kind: ItemResult['kind'], index: number) => {
    const value = { ...item, migration: true, ...verified, verified_at: now() };
    if (apply) { confirmRegistration(await deps.register!(value), item); report.counts.registered++; }
    report.counts.verified++;
    report.results.push({ kind, index, status: apply ? 'registered' : 'verified', record: value });
  };
  let processed = 0;
  await boundedWorkers(proof.records, async (raw, index) => {
    try {
      const item = record(raw, storeId);
      if (duplicateKeys.has(key(item))) fail('DUPLICATE_LOGICAL_KEY');
      const verified = await verify(item, storeId, deps);
      await save(item, verified, 'record', index);
      completed.set(key(item), { item, verified });
    } catch (error) { failed('record', index, error); }
    processed++;
    if (processed % 25 === 0) deps.progress?.({ completed: processed, failed: report.counts.failed });
  });
  // This barrier includes successful registry confirmations before any alias can reuse a canonical proof.
  await boundedWorkers(proof.aliases, async (raw, index) => {
    try {
      const alias = object(raw);
      if (duplicateKeys.has(key(alias))) fail('DUPLICATE_LOGICAL_KEY');
      const canonicalKey = key({ source_bucket: alias.canonical_bucket, source_path: alias.canonical_path });
      const canonical = completed.get(canonicalKey);
      if (!canonical) fail('ALIAS_CANONICAL_NOT_VERIFIED');
      if (alias.sha256 !== canonical.item.sha256 || alias.bytes !== canonical.item.bytes || alias.mime_type !== canonical.item.mime_type) fail('ALIAS_PROOF_MISMATCH');
      const item = record({ ...canonical.item, ...alias, verified: true,
        blob_pathname: canonical.item.blob_pathname, blob_url: canonical.item.blob_url,
        source_sha256: canonical.item.source_sha256, original_owner_id: canonical.item.original_owner_id,
        provenance: { ...canonical.item.provenance,
        alias: { canonical_bucket: alias.canonical_bucket, canonical_path: alias.canonical_path, drive_directory: alias.drive_directory,
          drive_path: alias.drive_path, drive_file_id: alias.drive_file_id } } }, storeId);
      const fresh = await deps.metadata(item.blob_url);
      assertMetadata(fresh, item, storeId);
      if (fresh.etag !== canonical.verified.etag) fail('BLOB_CHANGED');
      await save(item, canonical.verified, 'alias', index);
    } catch (error) { failed('alias', index, error); }
    processed++;
    if (processed % 25 === 0) deps.progress?.({ completed: processed, failed: report.counts.failed });
  });
  report.results.sort((a, b) => (a.kind === b.kind ? a.index - b.index : a.kind === 'record' ? -1 : 1));
  report.codes = Object.fromEntries(Object.entries(report.codes).sort(([a], [b]) => a.localeCompare(b)));
  report.finishedAt = now();
  return report;
}
export function parseActivationArguments(args: string[]) {
  const options: { proof?: string; storeId?: string; report?: string; apply: boolean; help: boolean } = { apply: false, help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) fail('DUPLICATE_ARGUMENT');
    seen.add(flag);
    if (flag === '--apply') options.apply = true;
    else if (flag === '--help') options.help = true;
    else if (['--proof', '--store-id', '--report'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('ARGUMENT_VALUE_REQUIRED');
      if (flag === '--proof') options.proof = resolve(value);
      if (flag === '--store-id') options.storeId = value;
      if (flag === '--report') options.report = resolve(value);
    } else fail('UNKNOWN_ARGUMENT');
  }
  if (!options.help && (!options.proof || !options.storeId || !options.report)) fail('PROOF_STORE_REPORT_REQUIRED');
  return options;
}
function outside(root: string, path: string) {
  const child = relative(root, path);
  return child.startsWith(`..${sep}`) || isAbsolute(child);
}
export async function validatePrivateActivationPaths(proofPath: string, reportPath: string, repository = REPOSITORY) {
  const root = await realpath(repository);
  const input = await realpath(proofPath);
  const outputParent = await realpath(dirname(reportPath));
  const output = resolve(outputParent, relative(dirname(reportPath), reportPath));
  if (!outside(root, input) || !outside(root, output)) fail('PRIVATE_PATH_OUTSIDE_REPOSITORY_REQUIRED');
  if (input.toLowerCase() === output.toLowerCase()) fail('REPORT_MUST_NOT_REPLACE_PROOF');
  const existing = await realpath(output).catch(() => null);
  if (existing && (!outside(root, existing) || existing.toLowerCase() === input.toLowerCase())) fail('UNSAFE_REPORT_DESTINATION');
  return { input, output };
}
function requiredEnv(name: string) { const value = process.env[name]; if (!value) fail('SERVER_CREDENTIAL_MISSING'); return value; }
function liveDependencies(apply: boolean): ActivationDependencies {
  if (process.env.VERCEL_BLOB_API_URL || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) fail('BLOB_API_OVERRIDE_FORBIDDEN');
  const token = requiredEnv('BLOB_READ_WRITE_TOKEN');
  const backend = apply ? createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return {
    metadata: url => head(url, { token, abortSignal: AbortSignal.timeout(120_000) }),
    read: url => get(url, { access: 'private', useCache: false, token, abortSignal: AbortSignal.timeout(120_000) }),
    register: backend ? async value => {
      const result = await backend.rpc('document_blob_register_verified', { p_record: value });
      if (result.error) throw result.error;
      return result.data;
    } : undefined,
    progress: counts => process.stdout.write(`${JSON.stringify({ phase: 'verification', ...counts })}\n`),
  };
}
export async function activationMain(args = process.argv.slice(2)) {
  try {
    const options = parseActivationArguments(args);
    if (options.help) { process.stdout.write('Usage: node --experimental-strip-types scripts/activate-vercel-document-migration.ts --proof <private.json> --store-id <store_id> --report <private-report.json> [--apply]\n'); return 0; }
    const paths = await validatePrivateActivationPaths(options.proof!, options.report!);
    const proof = JSON.parse((await readFile(paths.input, 'utf8')).replace(/^\uFEFF/, '')) as unknown;
    const report = await activateDocumentMigration(proof, options.storeId!, options.apply, liveDependencies(options.apply));
    const temporary = `${paths.output}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, paths.output);
    process.stdout.write(`${JSON.stringify({ mode: report.mode, ...report.counts, codes: report.codes })}\n`);
    return report.counts.failed ? 1 : 0;
  } catch (error) { process.stderr.write(`${JSON.stringify({ code: activationErrorCode(error) })}\n`); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await activationMain();
