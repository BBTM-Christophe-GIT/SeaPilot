import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROJECT_REF, MigrationError, validateManifest, recordsProofDigest, parseOptions, parseEnvFile,
  createGoogleTokenSupplier, createMigrationCloud, assertStorageSnapshot, assertMapping, runMigration } from './migrate-documents-to-google-drive.mjs';

const now = Date.now();
const recent = new Date(now - 1000).toISOString();
const pdf = Buffer.from('%PDF-1.7\nverified source\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const md5 = bytes => createHash('md5').update(bytes).digest('hex');
function record(changes = {}) {
  return { source_bucket: 'hr-documents', source_path: 'person/document.pdf',
    source_id: '11111111-1111-1111-1111-111111111111', source_bytes: pdf.length, source_md5: md5(pdf), source_sha256: sha(pdf),
    source_updated_at: recent, source_etag: `"${md5(pdf)}"`, drive_file_id: 'drive_file_123456',
    drive_path: 'SeaPilot/RH/document.pdf', file_name: 'document.pdf', mime_type: 'application/pdf',
    bytes: pdf.length, sha256: sha(pdf), verified_at: recent, ...changes };
}
function manifest(records = [record()], changes = {}) {
  const result = { project_id: PROJECT_REF, count: records.length,
    expected_bytes: records.reduce((sum, item) => sum + item.source_bytes, 0), records,
    gateway_verified: true, gateway_verified_at: recent, role_fixtures_verified_at: recent, storage_snapshot_at: recent,
    drive_permissions_verified_at: recent, ...changes };
  result.gateway_records_sha256 = changes.gateway_records_sha256 ?? recordsProofDigest(records);
  result.drive_permissions_records_sha256 = changes.drive_permissions_records_sha256 ?? recordsProofDigest(records);
  return result;
}
function mapping(item) { return { ...item, active: true, archive_drive_file_id: item.archive_drive_file_id ?? null }; }
function snapshot(item) { return { id: item.source_id, updated_at: item.source_updated_at, metadata: { size: item.source_bytes, eTag: item.source_etag } }; }
const options = { mode: 'purge', apply: true, projectRef: PROJECT_REF, concurrency: 2 };
const key = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.testsignature123456789`;
const broker = { GOOGLE_DRIVE_TOKEN_BROKER_URL: 'https://sea-pilot-ten.vercel.app/api/google-drive-token', GOOGLE_DRIVE_TOKEN_BROKER_SECRET: 's'.repeat(64) };

test('dry-run is the default and apply requires an exact project reference', () => {
  assert.equal(parseOptions(['--manifest', 'private.json', '--env-file', 'private.env']).apply, false);
  assert.throws(() => validateManifest(manifest(), { mode: 'purge', apply: true }), /--project-ref/);
  assert.throws(() => validateManifest(manifest(), { ...options, projectRef: 'other-project' }), /projet explicite/);
  for (const args of [['--apply', '--dry-run'], ['--dry-run', '--apply']]) assert.throws(() => parseOptions(args), /incompatibles/);
});

test('manifest rejects stale, absent and mismatched gateway or role proofs', () => {
  assert.equal(validateManifest(manifest(), { ...options, now }), recordsProofDigest([record()]));
  for (const changes of [{ gateway_verified: false }, { gateway_records_sha256: '0'.repeat(64) },
    { role_fixtures_verified_at: new Date(now - 86400001).toISOString() }, { gateway_verified_at: null },
    { storage_snapshot_at: new Date(now + 3600000).toISOString() }, { drive_permissions_verified_at: null },
    { drive_permissions_records_sha256: 'f'.repeat(64) }]) assert.throws(() => validateManifest(manifest(undefined, changes), { ...options, now }), MigrationError);
  assert.doesNotThrow(() => validateManifest(manifest(undefined, { gateway_verified: false }), { mode: 'activate' }));
});

test('only the allowed documentary scope and uniquely identified source objects are accepted', () => {
  for (const changes of [{ source_path: 'photo.png' }, { source_bucket: 'avatars' }, { source_path: '../document.pdf' },
    { source_path: 'folder\\document.pdf' }, { source_id: 'unknown' }, { source_md5: 'unknown' }, { source_etag: null },
    { source_updated_at: 'unknown' }, { mime_type: 'text/html' }, { bytes: 104857601 }, { file_name: '../bad.pdf' }]) {
    assert.throws(() => validateManifest(manifest([record(changes)])), MigrationError);
  }
  assert.throws(() => validateManifest(manifest([record(), record()])), /même objet/);
  assert.throws(() => validateManifest(manifest(undefined, { expected_bytes: 0 })), /volume/);
  assert.throws(() => validateManifest(manifest(undefined, { project_id: 'other' })), /projet SeaPilot/);
});

test('a newer Drive version requires a separate archive identical to the source', () => {
  const newer = record({ sha256: 'b'.repeat(64), bytes: pdf.length + 100 });
  assert.throws(() => validateManifest(manifest([newer])), /archive identique/);
  assert.throws(() => validateManifest(manifest([{ ...newer, archive_drive_file_id: newer.drive_file_id, archive_sha256: newer.source_sha256 }])), /archive identique/);
  assert.throws(() => validateManifest(manifest([{ ...newer, archive_drive_file_id: 'archive_file_12345', archive_sha256: 'c'.repeat(64) }])), /archive identique/);
  assert.doesNotThrow(() => validateManifest(manifest([{ ...newer, archive_drive_file_id: 'archive_file_12345', archive_sha256: newer.source_sha256 }])));
});

test('canonical records digest is order-independent and binds every critical source and Drive proof', () => {
  const a = record(), b = record({ source_path: 'person/other.pdf', source_id: '22222222-2222-2222-2222-222222222222' });
  assert.equal(recordsProofDigest([a, b]), recordsProofDigest([b, a]));
  for (const changes of [{ source_etag: 'multipart-2' }, { source_updated_at: new Date(now).toISOString() },
    { drive_file_id: 'different_id_1234' }, { source_md5: 'c'.repeat(32) }, { sha256: 'a'.repeat(64) },
    { archive_drive_file_id: 'archive_file_12345' }]) assert.notEqual(recordsProofDigest([a]), recordsProofDigest([{ ...a, ...changes }]));
});

test('source snapshot detects replacements and handles multipart ETags without assuming they are MD5', () => {
  const item = record();
  assert.doesNotThrow(() => assertStorageSnapshot(item, snapshot(item)));
  for (const object of [{ ...snapshot(item), id: 'new-id' }, { ...snapshot(item), updated_at: new Date(now + 1000).toISOString() },
    { ...snapshot(item), metadata: { size: 1, eTag: item.source_etag } },
    { ...snapshot(item), metadata: { size: item.source_bytes, eTag: 'changed' } }]) assert.throws(() => assertStorageSnapshot(item, object), /Storage/);
  const multipart = record({ source_etag: '"long-etag-2"' });
  assert.doesNotThrow(() => assertStorageSnapshot(multipart, snapshot(multipart)));
  assert.throws(() => assertStorageSnapshot(record({ source_md5: 'a'.repeat(32) }), snapshot(item)), /MD5/);
});

test('active DB mappings must match the exact destination and proof', () => {
  const item = record();
  assert.doesNotThrow(() => assertMapping(item, mapping(item)));
  for (const changes of [{ active: false }, { drive_file_id: 'other_file_12345' }, { sha256: 'a'.repeat(64) },
    { file_name: 'new.pdf' }, { verified_at: new Date(now + 1000).toISOString() },
    { archive_drive_file_id: 'archive_file_12345' }]) assert.throws(() => assertMapping(item, { ...mapping(item), ...changes }), /Correspondance/);
});

test('env parser reads literal values without executing shell syntax', () => {
  const values = parseEnvFile('A="literal\\nvalue"\nB=\'$(shell)\'\nC={"literal":true}\n#ignored\n');
  assert.equal(values.A, 'literal\nvalue'); assert.equal(values.B, '$(shell)'); assert.equal(values.C, '{"literal":true}');
  assert.equal(parseEnvFile('{"GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON":{"client_email":"test"}}').GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, '{"client_email":"test"}');
  assert.throws(() => parseEnvFile('no-value'), /configuration/);
});

test('Google broker refuses unsafe or partial configs without falling back to OAuth', () => {
  assert.throws(() => createGoogleTokenSupplier({}), /Accès Google Drive absent/);
  for (const url of ['https://evil.example/api/google-drive-token', 'https://sea-pilot-ten.vercel.app:444/api/google-drive-token',
    'https://user:pass@sea-pilot-ten.vercel.app/api/google-drive-token', `${broker.GOOGLE_DRIVE_TOKEN_BROKER_URL}?x=1`,
    'http://sea-pilot-ten.vercel.app/api/google-drive-token', 'https://sea-pilot-ten.vercel.app/api/other']) {
    assert.throws(() => createGoogleTokenSupplier({ ...broker, GOOGLE_DRIVE_TOKEN_BROKER_URL: url }), /broker Drive invalide/);
  }
  assert.throws(() => createGoogleTokenSupplier({ GOOGLE_DRIVE_TOKEN_BROKER_URL: broker.GOOGLE_DRIVE_TOKEN_BROKER_URL,
    GOOGLE_DRIVE_CLIENT_ID: 'existing', GOOGLE_DRIVE_CLIENT_SECRET: 'existing', GOOGLE_DRIVE_REFRESH_TOKEN: 'existing' }), /broker Drive invalide/);
});

test('Google broker caches safe tokens and never logs or follows arbitrary redirects', async () => {
  let calls = 0;
  const supplier = createGoogleTokenSupplier(broker, async (url, init) => {
    calls++; assert.equal(url, broker.GOOGLE_DRIVE_TOKEN_BROKER_URL); assert.equal(init.method, 'POST');
    assert.equal(init.body, undefined); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${broker.GOOGLE_DRIVE_TOKEN_BROKER_SECRET}`);
    return Response.json({ access_token: 'private-test-token', expires_in: 600 });
  });
  assert.deepEqual(await Promise.all([supplier(), supplier()]), ['private-test-token', 'private-test-token']);
  await supplier(); assert.equal(calls, 1);
  for (const result of [{ access_token: 'token', expires_in: 601 }, { access_token: 'has whitespace', expires_in: 600 }]) {
    await assert.rejects(createGoogleTokenSupplier(broker, async () => Response.json(result))(), /autorisation Drive invalide/);
  }
});

function mockCloud(records = [record()], hooks = {}) {
  const events = [], deleted = new Set(), rows = new Map(records.map(item => [`${item.source_bucket}\0${item.source_path}`, mapping(item)]));
  return { events, rows, deleted,
    async mappings() { events.push('mappings'); return rows; },
    async verifyDrive(item) { events.push(`drive:${item.source_path}`); await hooks.verifyDrive?.(item); return { current: { sha256: item.sha256 }, archive: item.archive_drive_file_id ? { sha256: item.source_sha256 } : null }; },
    async statStorage(item) { events.push(`stat:${item.source_path}`); return hooks.statStorage ? hooks.statStorage(item) : deleted.has(item.source_path) ? null : snapshot(item); },
    async verifyStorage(item) { events.push(`source:${item.source_path}`); await hooks.verifyStorage?.(item); return { sha256: item.source_sha256, md5: item.source_md5 }; },
    async activate(items) { events.push('activate'); for (const item of items) rows.set(`${item.source_bucket}\0${item.source_path}`, mapping(item)); },
    async removeStorage(bucket, items) { events.push('delete'); assert.equal(bucket, records[0].source_bucket); for (const item of items) deleted.add(item.source_path); },
    async markPurged(item, at) { events.push('purged'); rows.get(`${item.source_bucket}\0${item.source_path}`).purged_at = at; },
  };
}

test('dry-run verifies all binary proofs with zero activation, DELETE or purged_at mutation', async () => {
  const cloud = mockCloud();
  const journal = await runMigration(manifest(), { ...options, apply: false }, cloud);
  assert.equal(journal.records[0].status, 'verified'); assert.equal(journal.apply, false);
  assert.ok(cloud.events.includes('source:person/document.pdf'));
  assert.ok(!cloud.events.includes('delete') && !cloud.events.includes('activate') && !cloud.events.includes('purged'));
});

test('one failed source/Drive proof stops the entire batch before any mutation', async () => {
  const records = [record(), record({ source_path: 'person/other.pdf', source_id: '22222222-2222-2222-2222-222222222222' })];
  const cloud = mockCloud(records, { verifyStorage: item => { if (item.source_path.endsWith('other.pdf')) throw new MigrationError('Hash changed'); } });
  await assert.rejects(runMigration(manifest(records), options, cloud), /Hash changed/);
  assert.ok(!cloud.events.includes('delete') && !cloud.events.includes('purged'));
});

test('activation verifies existing source and destination before upserting, without gateway prerequisite', async () => {
  const cloud = mockCloud(); cloud.rows.clear();
  const journal = await runMigration(manifest(undefined, { gateway_verified: false }), { ...options, mode: 'activate' }, cloud);
  assert.equal(journal.records[0].status, 'activated');
  assert.ok(cloud.events.indexOf('activate') > cloud.events.indexOf('source:person/document.pdf'));
  assert.ok(!cloud.events.includes('delete'));
});

test('purge checkpoints attempted deletion, confirms absence, then marks purged_at', async () => {
  const cloud = mockCloud(), checkpoints = [];
  const journal = await runMigration(manifest(), options, cloud, data => {
    checkpoints.push(structuredClone(data)); cloud.events.push('checkpoint');
  });
  const deletion = cloud.events.indexOf('delete'), purged = cloud.events.indexOf('purged');
  assert.equal(cloud.events[deletion - 1], 'checkpoint');
  assert.ok(checkpoints.some(data => data.records[0].delete_attempted_at && data.records[0].status === 'verified'));
  assert.ok(cloud.events.slice(deletion + 1, purged).includes('stat:person/document.pdf'));
  assert.equal(journal.records[0].status, 'purged');
});

test('a changed source immediately before DELETE aborts without deletion', async () => {
  let stats = 0;
  const cloud = mockCloud(undefined, { statStorage: item => ++stats > 2 ? { ...snapshot(item), id: 'new-version' } : snapshot(item) });
  await assert.rejects(runMigration(manifest(), options, cloud), /ID ou taille/);
  assert.ok(!cloud.events.includes('delete'));
});

test('an absent object cannot be treated as purged without DB or a matching attempted-deletion journal', async () => {
  const cloud = mockCloud(undefined, { statStorage: () => null });
  await assert.rejects(runMigration(manifest(), options, cloud), /objet absent/);
  const previous = { project_id: PROJECT_REF, mode: 'purge', apply: true, records_sha256: recordsProofDigest([record()]),
    records: [{ source_bucket: record().source_bucket, source_path: record().source_path, delete_attempted_at: recent }] };
  const journal = await runMigration(manifest(), options, cloud, undefined, undefined, previous);
  assert.equal(journal.records[0].status, 'purged'); assert.ok(!cloud.events.includes('delete'));
});

test('cloud helper reads and hashes actual current Drive and archive bytes and uses Storage DELETE API', async t => {
  const timeouts = new WeakMap();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    const signal = new AbortController().signal;
    timeouts.set(signal, milliseconds);
    return signal;
  });
  const newerBytes = Buffer.from('%PDF-1.7\nnewer Drive version\n');
  const item = record({ bytes: newerBytes.length, sha256: sha(newerBytes), archive_drive_file_id: 'archive_file_12345', archive_sha256: sha(pdf) });
  const calls = [];
  const cloud = createMigrationCloud({ SUPABASE_SERVICE_ROLE_KEY: key, ...broker }, async (url, init) => {
    calls.push({ url, init });
    if (url === broker.GOOGLE_DRIVE_TOKEN_BROKER_URL) return Response.json({ access_token: 'test-token', expires_in: 600 });
    if (url.includes('/drive/v3/files/')) {
      const archive = url.includes(item.archive_drive_file_id), bytes = archive ? pdf : newerBytes;
      if (url.includes('alt=media')) return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
      return Response.json({ id: archive ? item.archive_drive_file_id : item.drive_file_id, name: archive ? 'archive.pdf' : item.file_name,
        mimeType: 'application/pdf', size: String(bytes.length), md5Checksum: md5(bytes), trashed: false });
    }
    if (url.includes('/object/list/')) return Response.json([{ ...snapshot(item), name: 'document.pdf' }]);
    if (url.includes('/object/authenticated/')) return new Response(pdf);
    if (init.method === 'DELETE') { assert.deepEqual(JSON.parse(init.body), { prefixes: [item.source_path] }); return Response.json([]); }
    throw new Error('Unexpected mock request');
  });
  const proof = await cloud.verifyDrive(item);
  assert.equal(proof.current.sha256, sha(newerBytes)); assert.equal(proof.archive.sha256, sha(pdf));
  assertStorageSnapshot(item, await cloud.statStorage(item));
  assert.equal((await cloud.verifyStorage(item)).sha256, sha(pdf));
  await cloud.removeStorage(item.source_bucket, [item]);
  assert.ok(calls.some(call => call.init.method === 'DELETE' && call.url.includes('/storage/v1/object/')));
  assert.ok(calls.every(call => call.init.redirect === 'error'));
  const mediaCalls = calls.filter(call => call.url.includes('alt=media') || call.url.includes('/object/authenticated/'));
  assert.equal(mediaCalls.length, 3); // Current Drive file, its source archive and Storage source.
  assert.ok(mediaCalls.every(call => timeouts.get(call.init.signal) === 600000));
  assert.ok(calls.filter(call => !mediaCalls.includes(call)).every(call => timeouts.get(call.init.signal) === 120000));
});

test('cloud helper rejects a current Drive version changed after manifest verification', async () => {
  const item = record();
  const cloud = createMigrationCloud({ SUPABASE_SERVICE_ROLE_KEY: key, ...broker }, async url => {
    if (url === broker.GOOGLE_DRIVE_TOKEN_BROKER_URL) return Response.json({ access_token: 'test-token', expires_in: 600 });
    if (url.includes('alt=media')) return new Response(Buffer.alloc(pdf.length), { headers: { 'Content-Type': 'application/pdf' } });
    return Response.json({ id: item.drive_file_id, name: item.file_name, mimeType: 'application/pdf', size: String(item.bytes), trashed: false });
  });
  await assert.rejects(cloud.verifyDrive(item), /hash courant différent/);
});
