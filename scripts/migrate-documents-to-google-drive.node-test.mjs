import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROJECT_REF, MigrationError, validateManifest, recordsProofDigest, parseOptions, parseEnvFile,
  createGoogleTokenSupplier, createMigrationCloud, assertStorageSnapshot, assertMapping, runMigration, validateVerifiedJournal } from './migrate-documents-to-google-drive.mjs';

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
function verifiedJournal(records = [record()], changes = {}) {
  return { project_id: PROJECT_REF, mode: 'activate', apply: false, records_sha256: recordsProofDigest(records),
    started_at: new Date(now - 60000).toISOString(), verified_at: recent, finished_at: recent,
    records: records.map(item => ({ source_bucket: item.source_bucket, source_path: item.source_path, status: 'verified',
      source: { bytes: item.source_bytes, sha256: item.source_sha256, md5: item.source_md5 },
      drive: { current: { bytes: item.bytes, sha256: item.sha256, md5: item.sha256 === item.source_sha256 ? item.source_md5 : 'c'.repeat(32), verified_at: recent },
        archive: item.archive_drive_file_id ? { bytes: item.source_bytes, sha256: item.source_sha256, md5: item.source_md5, verified_at: recent } : null } })), ...changes };
}
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

test('verified journal requires an original complete, fresh, unapplied activation pass with exact content proofs', () => {
  const item = record(), data = manifest(), journal = verifiedJournal();
  assert.equal(validateVerifiedJournal(data, journal, now).size, 1);
  assert.equal(parseOptions(['--manifest', 'private.json', '--env-file', 'private.env', '--verified-journal', 'complete.json']).verifiedJournal, 'complete.json');
  for (const changes of [{ project_id: 'other' }, { mode: 'purge' }, { apply: true },
    { verification_method: 'native_metadata_with_verified_journal' }, { records_sha256: 'a'.repeat(64) },
    { finished_at: null }, { records: [] }, { records: [...journal.records, ...journal.records] },
    { started_at: new Date(now - 86400001).toISOString() }, { verified_at: new Date(now + 3600000).toISOString() },
    { started_at: new Date(now).toISOString() }]) assert.throws(() => validateVerifiedJournal(data, { ...journal, ...changes }, now), MigrationError);
  for (const status of ['activated', 'purged', 'already_purged', 'recover_pending_journal']) {
    const changed = structuredClone(journal); changed.records[0].status = status;
    assert.throws(() => validateVerifiedJournal(data, changed, now), MigrationError);
  }
  for (const field of ['delete_attempted_at', 'storage_deleted_at', 'purged_at']) {
    const changed = structuredClone(journal); changed.records[0][field] = null;
    assert.throws(() => validateVerifiedJournal(data, changed, now), MigrationError);
  }
  for (const [section, changes] of [['source', { bytes: item.source_bytes + 1 }], ['source', { sha256: 'a'.repeat(64) }],
    ['source', { md5: null }], ['source', { md5: 'a'.repeat(32) }], ['current', { bytes: item.bytes + 1 }],
    ['current', { sha256: 'a'.repeat(64) }], ['current', { md5: 'a'.repeat(32) }],
    ['current', { verified_at: new Date(now - 86400001).toISOString() }]]) {
    const changed = structuredClone(journal), proof = section === 'source' ? changed.records[0].source : changed.records[0].drive.current;
    Object.assign(proof, changes); assert.throws(() => validateVerifiedJournal(data, changed, now), MigrationError);
  }
  const duplicate = [item, record({ source_path: 'person/other.pdf' })], dupJournal = verifiedJournal(duplicate);
  dupJournal.records[1] = structuredClone(dupJournal.records[0]);
  assert.throws(() => validateVerifiedJournal(manifest(duplicate), dupJournal, now), /dupliqué/);
});

test('verified journal requires complete archive proofs for every divergent Drive version', () => {
  const item = record({ bytes: pdf.length + 1, sha256: 'b'.repeat(64), archive_drive_file_id: 'archive_file_12345', archive_sha256: sha(pdf) });
  const data = manifest([item]), journal = verifiedJournal([item]);
  assert.doesNotThrow(() => validateVerifiedJournal(data, journal, now));
  for (const change of [null, { ...journal.records[0].drive.archive, bytes: 1 },
    { ...journal.records[0].drive.archive, md5: 'a'.repeat(32) }, { ...journal.records[0].drive.archive, sha256: 'a'.repeat(64) },
    { ...journal.records[0].drive.archive, verified_at: new Date(now - 86400001).toISOString() }]) {
    const changed = structuredClone(journal); changed.records[0].drive.archive = change;
    assert.throws(() => validateVerifiedJournal(data, changed, now), MigrationError);
  }
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

function cachedCloud(records = [record()], hooks = {}) {
  const cloud = mockCloud(records, hooks);
  cloud.assertSourcesFrozen = async items => { cloud.events.push('freeze'); assert.deepEqual(items, records); await hooks.freeze?.(); };
  cloud.verifyDriveMetadata = async (item, proof) => {
    cloud.events.push(`native:${item.source_path}`); await hooks.native?.(item); return structuredClone(proof.drive);
  };
  cloud.verifyDrive = cloud.verifyStorage = async () => { throw new Error('Cached pass must never reread media or fall back'); };
  return cloud;
}

test('cached activation validates every native file and unchanged frozen snapshot before its first upsert', async () => {
  const records = [record(), record({ source_path: 'person/other.pdf', source_etag: '"multipart-2"' })];
  const cloud = cachedCloud(records); cloud.rows.clear();
  const result = await runMigration(manifest(records, { gateway_verified: false }),
    { ...options, mode: 'activate', verifiedJournal: 'complete.json' }, cloud, undefined, undefined, null, verifiedJournal(records));
  assert.equal(result.verification_method, 'native_metadata_with_verified_journal');
  assert.ok(result.records.every(proof => proof.status === 'activated'));
  assert.equal(cloud.events.filter(event => event.startsWith('native:')).length, records.length);
  assert.equal(cloud.events.filter(event => event.startsWith('stat:')).length, records.length * 2);
  assert.equal(cloud.events.filter(event => event === 'freeze').length, 3);
  assert.ok(cloud.events.indexOf('activate') > cloud.events.lastIndexOf('freeze'));
});

test('cached pass fails closed on incomplete freeze, any native hash change, source replacement or purged mapping', async () => {
  for (const hooks of [{ freeze: () => { throw new MigrationError('Freeze mismatch'); } },
    { native: () => { throw new MigrationError('Native SHA mismatch'); } },
    { statStorage: item => ({ ...snapshot(item), id: 'replaced' }) }, { statStorage: () => null }]) {
    const cloud = cachedCloud(undefined, hooks); cloud.rows.clear();
    await assert.rejects(runMigration(manifest(), { ...options, mode: 'activate', verifiedJournal: 'complete.json' },
      cloud, undefined, undefined, null, verifiedJournal()), MigrationError);
    assert.ok(!cloud.events.includes('activate') && !cloud.events.includes('delete'));
  }
  for (const changes of [{ active: false }, { purged_at: recent }]) {
    const cloud = cachedCloud(); Object.assign([...cloud.rows.values()][0], changes);
    await assert.rejects(runMigration(manifest(), { ...options, verifiedJournal: 'complete.json' },
      cloud, undefined, undefined, null, verifiedJournal()), MigrationError);
    assert.ok(!cloud.events.includes('delete'));
  }
  await assert.rejects(runMigration(manifest(), { ...options, verifiedJournal: 'missing.json' }, cachedCloud()), /absent/);
});

test('cached purge keeps attested access proofs, fresh native pre-delete checks, freeze and final mapping checks', async () => {
  const cloud = cachedCloud();
  await assert.rejects(runMigration(manifest(undefined, { gateway_verified: false }), { ...options, verifiedJournal: 'complete.json' },
    cloud, undefined, undefined, null, verifiedJournal()), /passerelle/);
  const result = await runMigration(manifest(), { ...options, verifiedJournal: 'complete.json' },
    cloud, () => { cloud.events.push('checkpoint'); }, undefined, null, verifiedJournal());
  assert.equal(result.records[0].status, 'purged');
  assert.equal(cloud.events.filter(event => event.startsWith('native:')).length, 2);
  assert.deepEqual(cloud.events.slice(cloud.events.indexOf('delete') - 3, cloud.events.indexOf('delete')), ['freeze', 'mappings', 'checkpoint']);
  const changed = cachedCloud(undefined, { native: (() => { let count = 0; return () => { if (++count === 2) throw new MigrationError('Changed before DELETE'); }; })() });
  await assert.rejects(runMigration(manifest(), { ...options, verifiedJournal: 'complete.json' }, changed, undefined, undefined, null, verifiedJournal()), /Changed before DELETE/);
  assert.ok(!changed.events.includes('delete') && !changed.events.includes('purged'));
});

test('cached purge rechecks manifest access-proof age before each DELETE even when the content journal remains fresh', async t => {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  const data = manifest(undefined, { gateway_verified_at: new Date(now - 86400000 + 10000).toISOString() });
  let nativeCalls = 0;
  const cloud = cachedCloud(undefined, { native: () => { if (++nativeCalls === 2) clock = now + 20000; } });
  await assert.rejects(runMigration(data, { ...options, verifiedJournal: 'complete.json' }, cloud,
    undefined, undefined, null, verifiedJournal()), /gateway_verified_at/);
  assert.ok(!cloud.events.includes('delete') && !cloud.events.includes('purged'));
});

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

test('pre-delete batch reads are concurrent and bounded, then mapping checks and DELETE remain sequential', async () => {
  const records = Array.from({ length: 23 }, (_, index) => record({ source_path: `person/doc-${index}.pdf`,
    source_id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  const driveCalls = new Map(), statCalls = new Map(), prechecked = new Set();
  let active = 0, peak = 0, deletes = 0;
  const read = async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; };
  const cloud = mockCloud(records, {
    async verifyDrive(item) {
      const count = (driveCalls.get(item.source_path) || 0) + 1; driveCalls.set(item.source_path, count);
      if (count === 2) await read();
    },
    async statStorage(item) {
      const count = (statCalls.get(item.source_path) || 0) + 1; statCalls.set(item.source_path, count);
      if (count === 3) { await read(); prechecked.add(item.source_path); }
      return cloud.deleted.has(item.source_path) ? null : snapshot(item);
    },
  });
  const remove = cloud.removeStorage.bind(cloud);
  cloud.removeStorage = async (bucket, batch) => {
    assert.equal(active, 0); assert.ok(batch.every(item => prechecked.has(item.source_path)));
    assert.deepEqual(cloud.events.slice(-2), ['mappings', 'checkpoint']);
    deletes++; await remove(bucket, batch);
  };
  const journal = await runMigration(manifest(records), { ...options, concurrency: 3 }, cloud, () => { cloud.events.push('checkpoint'); });
  assert.equal(peak, 3); assert.equal(prechecked.size, records.length); assert.equal(deletes, 2);
  assert.ok(journal.records.every(item => item.status === 'purged'));
});

test('a failed concurrent pre-delete read drains in-flight reads and never journals a deletion attempt or issues DELETE', async () => {
  const records = Array.from({ length: 6 }, (_, index) => record({ source_path: `person/doc-${index}.pdf`,
    source_id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  const driveCalls = new Map(), checkpoints = [];
  let active = 0, peak = 0;
  const cloud = mockCloud(records, { async verifyDrive(item) {
    const count = (driveCalls.get(item.source_path) || 0) + 1; driveCalls.set(item.source_path, count);
    if (count === 2) {
      active++; peak = Math.max(peak, active);
      try {
        await new Promise(resolve => setImmediate(resolve));
        if (item.source_path === 'person/doc-1.pdf') throw new MigrationError('Pre-delete Drive verification failed');
      } finally { active--; }
    }
  } });
  await assert.rejects(runMigration(manifest(records), { ...options, concurrency: 3 }, cloud,
    journal => { checkpoints.push(structuredClone(journal)); }), /Pre-delete Drive verification failed/);
  assert.equal(peak, 3); assert.equal(active, 0);
  assert.ok(!cloud.events.includes('delete') && !cloud.events.includes('purged'));
  assert.equal(cloud.events.filter(event => event === 'mappings').length, 2);
  assert.ok(checkpoints.every(journal => journal.records.every(item => !item.delete_attempted_at)));
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

test('native verification requires exact Google SHA256 and MD5, IDs, sizes, name and canonical MIME without media fallback', async () => {
  const item = record({ bytes: pdf.length + 1, sha256: 'b'.repeat(64), archive_drive_file_id: 'archive_file_12345', archive_sha256: sha(pdf) });
  const proof = verifiedJournal([item]).records[0];
  const check = async (changes = {}, archiveChanges = {}) => {
    const calls = [];
    const cloud = createMigrationCloud({ SUPABASE_SERVICE_ROLE_KEY: key, ...broker }, async (url, init) => {
      calls.push(url);
      if (url === broker.GOOGLE_DRIVE_TOKEN_BROKER_URL) return Response.json({ access_token: 'test-token', expires_in: 600 });
      if (url.includes('/rpc/')) {
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(init.body).p_records, [{ source_bucket: item.source_bucket, source_path: item.source_path,
          source_id: item.source_id, source_sha256: item.source_sha256 }]);
        return Response.json(true);
      }
      assert.ok(url.includes('sha256Checksum') && !url.includes('alt=media'));
      const archive = url.includes(item.archive_drive_file_id);
      return Response.json({ id: archive ? item.archive_drive_file_id : item.drive_file_id,
        name: archive ? 'source-archive.pdf' : item.file_name, mimeType: 'application/pdf', trashed: false,
        size: String(archive ? item.source_bytes : item.bytes), md5Checksum: archive ? item.source_md5 : proof.drive.current.md5,
        sha256Checksum: archive ? item.source_sha256 : item.sha256, ...(archive ? archiveChanges : changes) });
    });
    await cloud.assertSourcesFrozen([item]);
    const result = await cloud.verifyDriveMetadata(item, proof);
    assert.deepEqual(result, proof.drive);
    assert.equal(calls.filter(url => url.includes('/drive/v3/files/')).length, 2);
  };
  await check();
  await check({ mimeType: 'application/octet-stream' });
  for (const changes of [{ id: 'other_file_12345' }, { size: '1' }, { name: 'renamed.pdf' }, { trashed: true },
    { mimeType: 'application/msword' }, { md5Checksum: null }, { md5Checksum: 'a'.repeat(32) },
    { sha256Checksum: null }, { sha256Checksum: 'a'.repeat(64) }]) await assert.rejects(check(changes), /empreintes natives/);
  for (const changes of [{ size: '1' }, { md5Checksum: null }, { md5Checksum: 'a'.repeat(32) },
    { sha256Checksum: null }, { sha256Checksum: 'a'.repeat(64) }]) await assert.rejects(check({}, changes), /empreintes natives/);
  const absent = createMigrationCloud({ SUPABASE_SERVICE_ROLE_KEY: key, ...broker }, async () => Response.json(false));
  await assert.rejects(absent.assertSourcesFrozen([item]), /Gel des sources/);
});
