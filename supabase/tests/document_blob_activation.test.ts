// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { activateDocumentMigration, activationErrorCode, parseActivationArguments, validatePrivateActivationPaths,
  type ActivationDependencies, type MigrationRecord } from '../../scripts/activate-vercel-document-migration.ts';

const storeId = 'store_fixture';
const content = new TextEncoder().encode('PDF fixture');
function fixture() {
  const sha256 = createHash('sha256').update(content).digest('hex');
  const item = { source_bucket: 'hr-documents', source_path: 'people/7/file.pdf', source_kind: 'storage', verified: true,
    blob_pathname: 'documents/fixture/file.pdf', blob_url: 'https://fixture.private.blob.vercel-storage.com/documents/fixture/file.pdf',
    file_name: 'file.pdf', mime_type: 'application/pdf', bytes: content.length, sha256, source_sha256: sha256,
    original_owner_id: 'fixture-owner', provenance: { source_kind: 'storage', original_reference: 'fixture' }, context: {}, source_retained: true };
  const alias = { source_bucket: 'hr-drive', source_path: '7', canonical_bucket: item.source_bucket, canonical_path: item.source_path,
    sha256, bytes: item.bytes, mime_type: item.mime_type, file_name: item.file_name, context: { person_id: 7 }, drive_path: 'fixture/file.pdf' };
  const meta = { url: item.blob_url, pathname: item.blob_pathname, size: item.bytes, contentType: item.mime_type, etag: 'etag-v1' };
  const metadata = vi.fn().mockImplementation(async () => ({ ...meta }));
  const read = vi.fn().mockImplementation(async () => ({ statusCode: 200, blob: { ...meta }, stream: new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(content.slice(0, 3)); controller.enqueue(content.slice(3)); controller.close(); },
  }) }));
  const register = vi.fn().mockImplementation(async (value: MigrationRecord) => ({ ...value, id: 'fixture-registry-id', provider: 'vercel-blob' }));
  const deps = { metadata, read, register } as ActivationDependencies;
  return { item, alias, meta, proof: { storeId, records: [item], aliases: [alias], excluded: [] }, deps, metadata, read, register };
}
describe('verified Blob migration activation', () => {
  it('defaults to dry-run and verifies a full stream once before reusing its canonical proof for an alias', async () => {
    const { proof, deps, read, metadata, register } = fixture();
    const report = await activateDocumentMigration(proof, storeId, false, deps);
    expect(report.mode).toBe('dry-run');
    expect(report.counts).toMatchObject({ records: 1, aliases: 1, verified: 2, registered: 0, failed: 0 });
    expect(read).toHaveBeenCalledOnce();
    expect(metadata).toHaveBeenCalledTimes(3);
    expect(register).not.toHaveBeenCalled();
    expect(report.results[1].record).toMatchObject({ source_bucket: 'hr-drive', source_path: '7', context: { person_id: 7 }, migration: true });
  });
  it('registers only verified exact bytes, original ownership and provenance, without overwriting on an idempotent rerun', async () => {
    const { proof, deps, item } = fixture();
    const saved = new Map<string, unknown>();
    const register = vi.fn().mockImplementation(async (value: MigrationRecord) => {
      const key = JSON.stringify([value.source_bucket, value.source_path]);
      const previous = saved.get(key);
      if (previous) return previous;
      const result = { ...value, id: `fixture-${saved.size}`, provider: 'vercel-blob' };
      saved.set(key, result);
      return result;
    });
    const live = { ...deps, register };
    expect((await activateDocumentMigration(proof, storeId, true, live)).counts).toMatchObject({ registered: 2, failed: 0 });
    expect((await activateDocumentMigration(proof, storeId, true, live)).counts).toMatchObject({ registered: 2, failed: 0 });
    expect(saved.size).toBe(2);
    expect(register.mock.calls[0][0]).toMatchObject({ migration: true, original_owner_id: item.original_owner_id,
      provenance: item.provenance, verified_bytes: item.bytes, verified_sha256: item.sha256, verified_mime_type: item.mime_type, source_sha256: item.sha256 });
  });
  it.each(['other-store', 'public-host', 'path-mismatch'])('refuses %s before any provider access or registration', async issue => {
    const { proof, deps, read, metadata, register } = fixture();
    if (issue === 'other-store') proof.records[0].blob_url = proof.records[0].blob_url.replace('fixture.private', 'other.private');
    if (issue === 'public-host') proof.records[0].blob_url = proof.records[0].blob_url.replace('.private', '.public');
    if (issue === 'path-mismatch') proof.records[0].blob_url += '-other';
    const report = await activateDocumentMigration(proof, storeId, true, deps);
    expect(report.counts.failed).toBe(2);
    expect(read).not.toHaveBeenCalled(); expect(metadata).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled();
  });
  it('requires the expected store id and refuses unverified sources', async () => {
    const { proof, deps, read, register } = fixture();
    await expect(activateDocumentMigration(proof, 'store_other', true, deps)).rejects.toThrow('BLOB_STORE_MISMATCH');
    proof.records[0].verified = false;
    expect((await activateDocumentMigration(proof, storeId, true, deps)).codes).toMatchObject({ SOURCE_UNVERIFIED: 1 });
    expect(read).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled();
  });
  it('rejects duplicate logical keys across canonical records and aliases without activating either', async () => {
    const { proof, deps, read, register } = fixture();
    Object.assign(proof.aliases[0], { source_bucket: proof.records[0].source_bucket, source_path: proof.records[0].source_path });
    expect((await activateDocumentMigration(proof, storeId, true, deps)).codes).toEqual({ DUPLICATE_LOGICAL_KEY: 2 });
    expect(read).not.toHaveBeenCalled(); expect(register).not.toHaveBeenCalled();
  });
  it.each(['hash', 'short-stream', 'oversized-stream', 'mime', 'etag'])('rejects changed %s and never activates its aliases', async issue => {
    const { proof, deps, meta, metadata, read, register } = fixture();
    if (issue === 'hash') {
      proof.records[0].sha256 = 'a'.repeat(64); proof.records[0].source_sha256 = 'a'.repeat(64);
    }
    if (issue === 'mime') metadata.mockResolvedValue({ ...meta, contentType: 'text/html' });
    if (issue === 'etag') metadata.mockResolvedValueOnce(meta).mockResolvedValueOnce({ ...meta, etag: 'changed' });
    if (issue.includes('stream')) read.mockResolvedValue({ statusCode: 200, blob: meta, stream: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(issue === 'short-stream' ? 2 : 100)); controller.close(); },
    }) });
    const report = await activateDocumentMigration(proof, storeId, true, deps);
    expect(report.counts.failed).toBe(2);
    expect(report.codes.ALIAS_CANONICAL_NOT_VERIFIED).toBe(1);
    expect(register).not.toHaveBeenCalled();
  });
  it('refuses an alias with different byte/hash evidence while preserving a valid canonical registration', async () => {
    const { proof, deps, register } = fixture();
    proof.aliases[0].sha256 = 'b'.repeat(64);
    const report = await activateDocumentMigration(proof, storeId, true, deps);
    expect(report.counts).toMatchObject({ registered: 1, failed: 1 });
    expect(report.codes).toEqual({ ALIAS_PROOF_MISMATCH: 1 });
    expect(register).toHaveBeenCalledOnce();
  });
  it('does not activate an alias if its canonical registration conflicted with an existing mapping', async () => {
    const { proof, deps, register } = fixture();
    register.mockRejectedValue({ code: '23505', message: 'private name and secret URL must never be logged' });
    const report = await activateDocumentMigration(proof, storeId, true, deps);
    expect(report.codes).toEqual({ '23505': 1, ALIAS_CANONICAL_NOT_VERIFIED: 1 });
    expect(JSON.stringify(report)).not.toContain('secret URL');
    expect(register).toHaveBeenCalledOnce();
  });
  it('requires a new full response and checks the registry confirmation', async () => {
    const { proof, deps, read, register } = fixture();
    read.mockResolvedValue({ statusCode: 304, blob: {}, stream: null });
    expect((await activateDocumentMigration(proof, storeId, true, deps)).codes.BLOB_FULL_READ_REQUIRED).toBe(1);
    expect(register).not.toHaveBeenCalled();
    const next = fixture();
    next.register.mockResolvedValue({ id: 'fixture-id', provider: 'vercel-blob', sha256: 'wrong' });
    expect((await activateDocumentMigration(next.proof, storeId, true, next.deps)).codes.REGISTRY_CONFIRMATION_MISMATCH).toBe(1);
  });
  it('accepts a GET charset parameter while keeping HEAD MIME verification exact', async () => {
    const { proof, deps, meta, metadata, read } = fixture();
    proof.records[0].mime_type = 'text/plain';
    proof.aliases[0].mime_type = 'text/plain';
    metadata.mockResolvedValue({ ...meta, contentType: 'text/plain' });
    read.mockImplementation(async () => ({ statusCode: 200, blob: { ...meta, contentType: 'text/plain; charset=utf-8' },
      stream: new ReadableStream({ start(controller) { controller.enqueue(content); controller.close(); } }) }));
    expect((await activateDocumentMigration(proof, storeId, false, deps)).counts.failed).toBe(0);
    proof.records[0].mime_type = 'text/plain; charset=utf-8';
    expect((await activateDocumentMigration(proof, storeId, false, deps)).codes.BLOB_METADATA_MISMATCH).toBe(1);
    metadata.mockResolvedValue({ ...meta, contentType: 'text/plain; charset=utf-8' });
    proof.aliases[0].mime_type = 'text/plain; charset=utf-8';
    expect((await activateDocumentMigration(proof, storeId, false, deps)).counts.failed).toBe(0);
  });
  it('uses at most four workers, completes every canonical registration before aliases, and keeps report input order', async () => {
    const { proof, deps, item, alias } = fixture();
    const records = Array.from({ length: 8 }, (_, index) => ({ ...item, source_path: `people/7/file-${index}.pdf`,
      blob_pathname: `documents/fixture/file-${index}.pdf`, blob_url: `https://fixture.private.blob.vercel-storage.com/documents/fixture/file-${index}.pdf` }));
    let active = 0, maximum = 0, registered = 0;
    const calls = new Map<string, number>();
    const metadata = vi.fn().mockImplementation(async (url: string) => {
      active++; maximum = Math.max(maximum, active);
      try {
        const current = records.find(record => record.blob_url === url)!;
        const count = (calls.get(url) || 0) + 1; calls.set(url, count);
        if (count === 3) expect(registered).toBe(8);
        await new Promise(resolve => setTimeout(resolve, url.includes('file-0') ? 5 : 1));
        return { url, pathname: current.blob_pathname, size: current.bytes, contentType: current.mime_type, etag: 'etag-v1' };
      } finally { active--; }
    });
    const read = vi.fn().mockImplementation(async (url: string) => {
      const current = records.find(record => record.blob_url === url)!;
      return { statusCode: 200, blob: { url, pathname: current.blob_pathname, size: current.bytes, contentType: current.mime_type, etag: 'etag-v1' },
        stream: new ReadableStream({ start(controller) { controller.enqueue(content); controller.close(); } }) };
    });
    const register = vi.fn().mockImplementation(async (value: MigrationRecord) => {
      if (value.source_bucket === 'hr-drive') expect(registered).toBe(8);
      else registered++;
      return { ...value, id: 'fixture-registry-id', provider: 'vercel-blob' };
    });
    const batch = { ...proof, records, aliases: [{ ...alias, canonical_path: records[0].source_path }] };
    const report = await activateDocumentMigration(batch, storeId, true, { ...deps, metadata, read, register });
    expect(maximum).toBe(4);
    expect(report.counts).toMatchObject({ registered: 9, failed: 0 });
    expect(report.results.map(result => `${result.kind}:${result.index}`)).toEqual([...records.map((_, index) => `record:${index}`), 'alias:0']);
  });
  it('sanitizes unknown errors to codes and requires explicit CLI apply', () => {
    expect(activationErrorCode(new Error('https://private.example/secret'))).toBe('ACTIVATION_FAILED');
    expect(activationErrorCode({ code: 'secret URL with spaces' })).toBe('ACTIVATION_FAILED');
    expect(activationErrorCode({ code: 'PERSON_PRIVATE_NAME' })).toBe('ACTIVATION_FAILED');
    expect(parseActivationArguments(['--proof', 'private.json', '--store-id', storeId, '--report', 'report.json']).apply).toBe(false);
    expect(() => parseActivationArguments(['--apply'])).toThrow('PROOF_STORE_REPORT_REQUIRED');
    expect(() => parseActivationArguments(['--token', 'secret'])).toThrow('UNKNOWN_ARGUMENT');
  });
  it('requires proof and report outside the checkout and prevents replacement of the source proof', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seapilot-activation-fixture-'));
    const repo = join(root, 'checkout');
    await mkdir(repo);
    const proof = join(root, 'proof.json');
    await writeFile(proof, '{}');
    try {
      await expect(validatePrivateActivationPaths(proof, join(root, 'report.json'), repo)).resolves.toMatchObject({ input: proof });
      await expect(validatePrivateActivationPaths(proof, proof, repo)).rejects.toThrow('REPORT_MUST_NOT_REPLACE_PROOF');
      await expect(validatePrivateActivationPaths(proof, join(repo, 'report.json'), repo)).rejects.toThrow('PRIVATE_PATH_OUTSIDE_REPOSITORY_REQUIRED');
    } finally {
      const target = await realpath(root);
      if (dirname(target) !== await realpath(tmpdir()) || !basename(target).startsWith('seapilot-activation-fixture-')) throw new Error('Unsafe test cleanup');
      await rm(target, { recursive: true, force: true });
    }
  });
});
