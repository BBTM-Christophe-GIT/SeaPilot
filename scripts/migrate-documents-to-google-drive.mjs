/** Verified cutover of existing PDF/Word/Excel documents. Never uploads to Drive. */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'szlvyrrmvdvhzixilymh';
const MAX_BYTES = 104857600;
const MAX_PROOF_AGE = 24 * 60 * 60 * 1000;
const BUCKETS = new Set(['procedure-documents', 'fleet-certificates', 'hr-documents', 'project-files',
  'expense-note-pdfs', 'working-time-imports', 'documentary-audit-files', 'purchase-request-attachments',
  'lifting-certificates', 'annual-review-reports', 'vessel-visits']);
const MIMES = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
};
const BROKER_HOSTS = new Set(['sea-pilot-ten.vercel.app', 'sea-pilot-bbtm-app.vercel.app']);
const FILE_ID = /^[a-zA-Z0-9_-]{10,200}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MD5 = /^[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PROOF_FIELDS = ['source_bucket', 'source_path', 'source_id', 'source_bytes', 'source_md5', 'source_sha256',
  'source_updated_at', 'source_etag', 'drive_file_id', 'drive_path', 'file_name', 'mime_type', 'bytes', 'sha256',
  'verified_at', 'archive_drive_file_id', 'archive_sha256'];

export class MigrationError extends Error {}
function requireProof(condition, message) { if (!condition) throw new MigrationError(message); }
function location(record) { return `${record.source_bucket}\0${record.source_path}`; }
function validPath(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/(^\/|(^|\/)\.\.?($|\/)|[\\\u0000-\u001f\u007f])/.test(value);
}
function safeName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[/\\\u0000-\u001f\u007f]/.test(value);
}
function mimeFamily(mime) {
  return mime === MIMES.pdf ? 'pdf' : mime === MIMES.doc || mime?.includes('wordprocessingml') ? 'word'
    : mime?.includes('excel') || mime?.includes('spreadsheetml') ? 'excel' : null;
}
export function canonicalMime(mime, name) {
  const normalized = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  if (Object.values(MIMES).includes(normalized)) return normalized;
  return normalized === 'application/octet-stream' ? MIMES[extname(name || '').slice(1).toLowerCase()] || null : null;
}
function validBytes(value) { return Number.isSafeInteger(value) && value > 0 && value <= MAX_BYTES; }
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function recentProof(value, now, label) {
  requireProof(validDate(value) && now - Date.parse(value) <= MAX_PROOF_AGE && Date.parse(value) <= now + 300000,
    `${label}: preuve absente, expirée ou datée dans le futur.`);
}

/** Stable digest shared with the authenticated gateway verification step. */
export function recordsProofDigest(records) {
  const canonical = [...records].sort((a, b) => location(a) < location(b) ? -1 : location(a) > location(b) ? 1 : 0)
    .map(record => Object.fromEntries(PROOF_FIELDS.map(field => [field, record[field] ?? null])));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function validateManifest(manifest, { mode = 'activate', apply = false, projectRef, now = Date.now() } = {}) {
  requireProof(mode === 'activate' || mode === 'purge', 'Mode requis: activate ou purge.');
  requireProof(manifest?.project_id === PROJECT_REF, 'Le manifeste ne désigne pas le projet SeaPilot attendu.');
  requireProof(!projectRef || projectRef === PROJECT_REF, 'Le projet explicite ne correspond pas au manifeste.');
  requireProof(!apply || projectRef === PROJECT_REF, '--apply exige --project-ref avec le projet SeaPilot exact.');
  requireProof(Array.isArray(manifest.records) && manifest.records.length > 0
    && manifest.count === manifest.records.length, 'Le nombre de documents du manifeste est incohérent.');
  const seen = new Set();
  let total = 0;
  for (const record of manifest.records) {
    requireProof(record && BUCKETS.has(record.source_bucket) && validPath(record.source_path, 2000)
      && Object.hasOwn(MIMES, extname(record.source_path).slice(1).toLowerCase()), 'Un objet sort du périmètre documentaire autorisé.');
    requireProof(!seen.has(location(record)), 'Deux records désignent le même objet Storage.');
    seen.add(location(record));
    requireProof(typeof record.source_id === 'string' && UUID.test(record.source_id) && validBytes(record.source_bytes)
      && MD5.test(record.source_md5) && SHA256.test(record.source_sha256), 'Preuve source ID/taille/MD5/SHA-256 invalide.');
    requireProof(validDate(record.source_updated_at) && typeof record.source_etag === 'string' && record.source_etag.length > 0
      && record.source_etag.length <= 255 && !/[\u0000-\u001f\u007f]/.test(record.source_etag), 'Snapshot Storage date/ETag requis.');
    requireProof(FILE_ID.test(record.drive_file_id) && validPath(record.drive_path, 1000) && safeName(record.file_name)
      && validBytes(record.bytes) && SHA256.test(record.sha256) && validDate(record.verified_at), 'Preuve de destination Drive invalide.');
    const mime = canonicalMime(record.mime_type, record.file_name);
    requireProof(mime && mimeFamily(mime) === mimeFamily(MIMES[extname(record.source_path).slice(1).toLowerCase()]),
      'La destination Drive ne conserve pas la famille documentaire source.');
    if (record.sha256 !== record.source_sha256 || record.archive_drive_file_id != null) {
      requireProof(FILE_ID.test(record.archive_drive_file_id) && record.archive_drive_file_id !== record.drive_file_id
        && record.archive_sha256 === record.source_sha256, 'Une version Drive différente exige une archive identique à la source.');
    } else requireProof(record.bytes === record.source_bytes, 'Taille incohérente pour un contenu identique.');
    total += record.source_bytes;
    if (mode === 'purge') recentProof(record.verified_at, now, 'Document');
  }
  requireProof(Number.isSafeInteger(total) && total === manifest.expected_bytes, 'Le volume source du manifeste est incohérent.');
  const digest = recordsProofDigest(manifest.records);
  if (mode === 'purge') {
    requireProof(manifest.gateway_verified === true, 'Purge interdite: passerelle non vérifiée.');
    for (const field of ['gateway_verified_at', 'role_fixtures_verified_at', 'storage_snapshot_at', 'drive_permissions_verified_at']) recentProof(manifest[field], now, field);
    requireProof(manifest.gateway_records_sha256 === digest, 'La preuve de passerelle ne couvre pas ces correspondances.');
    requireProof(manifest.drive_permissions_records_sha256 === digest, 'La preuve des droits et emplacements Drive ne couvre pas ces correspondances.');
  }
  return digest;
}

export function parseOptions(args) {
  const options = { mode: 'activate', apply: false, concurrency: 4 };
  let explicitDryRun = false;
  const names = { '--mode': 'mode', '--manifest': 'manifest', '--env-file': 'envFile', '--project-ref': 'projectRef',
    '--journal': 'journal', '--concurrency': 'concurrency' };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') return { help: true };
    if (arg === '--apply') { requireProof(!explicitDryRun, '--apply et --dry-run sont incompatibles.'); options.apply = true; continue; }
    if (arg === '--dry-run') { requireProof(!options.apply, '--apply et --dry-run sont incompatibles.'); explicitDryRun = true; continue; }
    requireProof(Object.hasOwn(names, arg) && args[index + 1] && !args[index + 1].startsWith('--'), 'Option CLI inconnue ou valeur manquante.');
    options[names[arg]] = args[++index];
  }
  requireProof(['activate', 'purge'].includes(options.mode), '--mode doit valoir activate ou purge.');
  requireProof(options.manifest && options.envFile, '--manifest et --env-file sont obligatoires.');
  options.concurrency = Number(options.concurrency);
  requireProof(Number.isInteger(options.concurrency) && options.concurrency >= 1 && options.concurrency <= 8, 'Concurrence autorisée: 1 à 8.');
  return options;
}

export function parseEnvFile(contents) {
  const env = Object.create(null);
  if (contents.trimStart().startsWith('{')) {
    let values;
    try { values = JSON.parse(contents); } catch { throw new MigrationError('Fichier de configuration JSON invalide.'); }
    requireProof(values && typeof values === 'object' && !Array.isArray(values), 'Configuration JSON attendue.');
    for (const [key, value] of Object.entries(values)) env[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return env;
  }
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    requireProof(match, 'Une ligne du fichier de configuration est invalide.');
    let value = match[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { throw new MigrationError('Valeur entre guillemets invalide dans la configuration.'); }
    } else if (value.startsWith("'")) {
      requireProof(value.endsWith("'"), 'Valeur entre guillemets invalide dans la configuration.');
      value = value.slice(1, -1);
    }
    requireProof(typeof value === 'string', 'Les valeurs de configuration doivent être des chaînes.');
    env[match[1]] = value;
  }
  return env;
}

async function request(send, url, init = {}, label = 'Service', allowMissing = false) {
  let response;
  try { response = await send(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(120000) }); }
  catch { throw new MigrationError(`${label}: requête réseau interrompue.`); }
  if (allowMissing && response.status === 404) return null;
  requireProof(response.ok, `${label}: requête refusée (HTTP ${response.status}).`);
  return response;
}
async function json(response, label) {
  try { return await response.json(); } catch { throw new MigrationError(`${label}: réponse JSON invalide.`); }
}

/** Uses existing credentials only. The keyless broker takes precedence. */
export function createGoogleTokenSupplier(env, send = fetch, now = Date.now) {
  const brokerUrl = env.GOOGLE_DRIVE_TOKEN_BROKER_URL, brokerSecret = env.GOOGLE_DRIVE_TOKEN_BROKER_SECRET;
  let account;
  if (brokerUrl || brokerSecret) {
    let url;
    try { url = new URL(brokerUrl || ''); } catch { throw new MigrationError('Configuration du broker Drive invalide.'); }
    requireProof(url.protocol === 'https:' && BROKER_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password
      && !url.search && !url.hash && url.pathname === '/api/google-drive-token'
      && typeof brokerSecret === 'string' && /^[\x21-\x7e]{43,256}$/.test(brokerSecret), 'Configuration du broker Drive invalide.');
  } else if (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try { account = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || env.GOOGLE_SERVICE_ACCOUNT_JSON); }
    catch { throw new MigrationError('Configuration du compte de service existant invalide.'); }
    requireProof(typeof account?.client_email === 'string' && /^[^\s@]+@[^\s@]+$/.test(account.client_email)
      && typeof account.private_key === 'string', 'Configuration du compte de service existant invalide.');
  } else requireProof(env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN,
    'Accès Google Drive absent: configurez le broker ou une autorisation existante avant activation/purge.');
  let cached, refreshing;
  return async () => {
    if (cached && cached.expires > now() + 60000) return cached.token;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      let response;
      if (brokerUrl) response = await request(send, brokerUrl, { method: 'POST', headers: { Authorization: `Bearer ${brokerSecret}` } }, 'Broker Drive');
      else {
        let body;
        if (account) {
          const iat = Math.floor(now() / 1000);
          const unsigned = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
            Buffer.from(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
              aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })).toString('base64url')].join('.');
          let signature;
          try { signature = sign('RSA-SHA256', Buffer.from(unsigned), createPrivateKey(account.private_key)).toString('base64url'); }
          catch { throw new MigrationError('Clé du compte de service existant invalide.'); }
          body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` });
        } else body = new URLSearchParams({ grant_type: 'refresh_token', client_id: env.GOOGLE_DRIVE_CLIENT_ID,
          client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET, refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN });
        response = await request(send, 'https://oauth2.googleapis.com/token', { method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 'Autorisation Drive');
      }
      const result = await json(response, 'Autorisation Drive');
      requireProof(typeof result.access_token === 'string' && /^[^\s]{1,16384}$/.test(result.access_token)
        && Number.isInteger(result.expires_in) && result.expires_in > 0 && result.expires_in <= (brokerUrl ? 600 : 3600),
      'Réponse d’autorisation Drive invalide.');
      cached = { token: result.access_token, expires: now() + result.expires_in * 1000 };
      return cached.token;
    })().finally(() => { refreshing = null; });
    return refreshing;
  };
}

async function hashes(response, expectedBytes, label) {
  const sha256 = createHash('sha256'), md5 = createHash('md5');
  let bytes = 0;
  requireProof(response.body, `${label}: contenu absent.`);
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      requireProof(bytes <= expectedBytes && bytes <= MAX_BYTES, `${label}: volume supérieur à la preuve.`);
      sha256.update(chunk); md5.update(chunk);
    }
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError(`${label}: lecture du contenu interrompue.`);
  }
  requireProof(bytes === expectedBytes, `${label}: volume différent de la preuve.`);
  return { bytes, sha256: sha256.digest('hex'), md5: md5.digest('hex') };
}

export function assertStorageSnapshot(record, object) {
  requireProof(object && object.id === record.source_id && Number(object.metadata?.size ?? object.size) === record.source_bytes,
    'Storage: ID ou taille a changé depuis le snapshot.');
  requireProof((object.metadata?.eTag ?? object.metadata?.etag ?? object.etag) === record.source_etag,
    'Storage: ETag a changé depuis le snapshot.');
  requireProof(Date.parse(object.updated_at ?? object.last_modified) === Date.parse(record.source_updated_at),
    'Storage: date de modification a changé depuis le snapshot.');
  const etagMd5 = String(record.source_etag).replace(/^W\//, '').replace(/^"|"$/g, '').toLowerCase();
  if (MD5.test(etagMd5)) requireProof(etagMd5 === record.source_md5, 'Storage: MD5 du snapshot incohérent.');
}
function mappingFor(record) {
  return { source_bucket: record.source_bucket, source_path: record.source_path, drive_file_id: record.drive_file_id,
    drive_path: record.drive_path, file_name: record.file_name, mime_type: canonicalMime(record.mime_type, record.file_name),
    bytes: record.bytes, sha256: record.sha256, source_sha256: record.source_sha256, verified_at: record.verified_at,
    archive_drive_file_id: record.archive_drive_file_id ?? null, active: true };
}
export function assertMapping(record, mapping) {
  requireProof(mapping?.active === true && mapping.drive_file_id === record.drive_file_id && mapping.sha256 === record.sha256
    && mapping.source_sha256 === record.source_sha256 && Number(mapping.bytes) === record.bytes
    && mapping.drive_path === record.drive_path && mapping.file_name === record.file_name
    && canonicalMime(mapping.mime_type, mapping.file_name) === canonicalMime(record.mime_type, record.file_name)
    && Date.parse(mapping.verified_at) === Date.parse(record.verified_at)
    && (mapping.archive_drive_file_id ?? null) === (record.archive_drive_file_id ?? null), 'Correspondance active DB différente du manifeste.');
}

async function mapConcurrent(records, concurrency, action) {
  let next = 0, failed;
  await Promise.all(Array.from({ length: Math.min(concurrency, records.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= records.length) return;
      try { await action(records[index], index); } catch (error) { failed = error; }
    }
  }));
  if (failed) throw failed;
}

export function createMigrationCloud(env, send = fetch) {
  const base = `https://${PROJECT_REF}.supabase.co`;
  requireProof(!env.SUPABASE_URL || env.SUPABASE_URL.replace(/\/$/, '') === base, 'SUPABASE_URL ne désigne pas le projet attendu.');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  requireProof(typeof key === 'string' && key.length > 20 && !/\s/.test(key), 'Clé de service Supabase absente ou invalide.');
  if (!key.startsWith('sb_secret_')) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { /* reported below */ }
    requireProof(payload?.role === 'service_role', 'La clé Supabase doit être une clé de service, jamais une clé client.');
  }
  const token = createGoogleTokenSupplier(env, send);
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const storagePath = record => `${encodeURIComponent(record.source_bucket)}/${record.source_path.split('/').map(encodeURIComponent).join('/')}`;
  async function rest(path, init = {}) {
    return request(send, `${base}/rest/v1/${path}`, { ...init, headers: { ...headers, 'Content-Type': 'application/json', ...init.headers } }, 'Supabase DB');
  }
  async function driveFile(id, bytes, sha256, mime, expectedName, expectedMd5) {
    const endpoint = `https://www.googleapis.com/drive/v3/files/${id}`;
    const driveHeaders = { Authorization: `Bearer ${await token()}` };
    const metadata = await json(await request(send, `${endpoint}?fields=id,name,mimeType,size,md5Checksum,trashed&supportsAllDrives=true`,
      { headers: driveHeaders }, 'Métadonnées Drive'), 'Métadonnées Drive');
    requireProof(metadata.id === id && metadata.trashed === false && Number(metadata.size) === bytes
      && (!expectedName || metadata.name === expectedName) && mimeFamily(canonicalMime(metadata.mimeType, metadata.name)) === mimeFamily(mime),
    'Drive: métadonnées courantes différentes de la preuve.');
    const response = await request(send, `${endpoint}?alt=media&supportsAllDrives=true`, { headers: driveHeaders }, 'Contenu Drive');
    const contentType = response.headers.get('content-type');
    requireProof(!contentType || mimeFamily(canonicalMime(contentType, metadata.name)) === mimeFamily(mime), 'Drive: format du contenu refusé.');
    const proof = await hashes(response, bytes, 'Drive');
    requireProof(proof.sha256 === sha256 && (!metadata.md5Checksum || metadata.md5Checksum.toLowerCase() === proof.md5)
      && (!expectedMd5 || proof.md5 === expectedMd5), 'Drive: hash courant différent de la preuve.');
    return { ...proof, verified_at: new Date().toISOString() };
  }
  return {
    async verifyDrive(record) {
      const mime = canonicalMime(record.mime_type, record.file_name);
      const current = await driveFile(record.drive_file_id, record.bytes, record.sha256, mime, record.file_name,
        record.sha256 === record.source_sha256 ? record.source_md5 : null);
      const archive = record.archive_drive_file_id ? await driveFile(record.archive_drive_file_id, record.source_bytes,
        record.source_sha256, mime, null, record.source_md5) : null;
      return { current, archive };
    },
    async statStorage(record) {
      // list() retains the original DB updated_at and raw metadata.eTag, including multipart ETags.
      const slash = record.source_path.lastIndexOf('/');
      const prefix = slash >= 0 ? record.source_path.slice(0, slash) : '';
      const name = record.source_path.slice(slash + 1);
      const response = await request(send, `${base}/storage/v1/object/list/${encodeURIComponent(record.source_bucket)}`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, search: name, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }) }, 'Snapshot Storage');
      const objects = await json(response, 'Snapshot Storage');
      requireProof(Array.isArray(objects), 'Storage: liste invalide.');
      const matches = objects.filter(object => object.name === name && object.id);
      requireProof(matches.length <= 1, 'Storage: plusieurs objets pour la même référence.');
      return matches[0] || null;
    },
    async verifyStorage(record) {
      const response = await request(send, `${base}/storage/v1/object/authenticated/${storagePath(record)}`, { headers }, 'Contenu Storage');
      const proof = await hashes(response, record.source_bytes, 'Storage');
      requireProof(proof.sha256 === record.source_sha256 && proof.md5 === record.source_md5, 'Storage: octets différents du snapshot source.');
      return proof;
    },
    async mappings() {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const page = await json(await rest(`document_drive_files?select=*&order=source_bucket.asc,source_path.asc&limit=500&offset=${offset}`), 'Correspondances DB');
        requireProof(Array.isArray(page), 'Supabase: correspondances invalides.');
        rows.push(...page);
        if (page.length < 500) return new Map(rows.map(row => [location(row), row]));
      }
    },
    async activate(records) {
      const response = await rest('document_drive_files?on_conflict=source_bucket,source_path', { method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(records.map(mappingFor)) });
      const rows = await json(response, 'Activation DB');
      requireProof(Array.isArray(rows) && rows.length === records.length, 'Activation DB: résultat incomplet.');
      for (const record of records) assertMapping(record, rows.find(row => location(row) === location(record)));
    },
    async removeStorage(bucket, records) {
      await request(send, `${base}/storage/v1/object/${encodeURIComponent(bucket)}`, { method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: records.map(record => record.source_path) }) }, 'Purge Storage');
    },
    async markPurged(record, at) {
      const query = new URLSearchParams({ source_bucket: `eq.${record.source_bucket}`, source_path: `eq.${record.source_path}`,
        drive_file_id: `eq.${record.drive_file_id}`, sha256: `eq.${record.sha256}`, source_sha256: `eq.${record.source_sha256}`, active: 'eq.true' });
      const rows = await json(await rest(`document_drive_files?${query}`, { method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ purged_at: at }) }), 'Journal DB');
      requireProof(Array.isArray(rows) && rows.length === 1 && validDate(rows[0].purged_at), 'Journal DB: purge non enregistrée.');
      assertMapping(record, rows[0]);
    },
  };
}

/** All objects are verified before the first mutation; the journal is checkpointed before each DELETE. */
export async function runMigration(manifest, options, cloud, checkpoint = async () => {}, progress = () => {}, previousJournal = null) {
  const digest = validateManifest(manifest, options);
  const journal = { project_id: PROJECT_REF, mode: options.mode, apply: options.apply === true, records_sha256: digest,
    started_at: new Date().toISOString(), records: [] };
  const previous = previousJournal?.records_sha256 === digest && previousJournal.project_id === PROJECT_REF && previousJournal.mode === 'purge'
    && previousJournal.apply === true ? new Map(previousJournal.records.map(record => [location(record), record])) : new Map();
  const mappings = await cloud.mappings();
  let done = 0;
  await mapConcurrent(manifest.records, options.concurrency || 4, async record => {
    const mapping = mappings.get(location(record));
    if (options.mode === 'purge') assertMapping(record, mapping);
    else if (mapping) {
      requireProof(mapping.active === true && mapping.drive_file_id === record.drive_file_id,
        'Activation refusée: une correspondance existante pointe ailleurs ou est désactivée.');
      requireProof(!mapping.purged_at || mapping.source_sha256 === record.source_sha256, 'Activation refusée: provenance déjà purgée différente.');
    }
    const drive = await cloud.verifyDrive(record);
    const source = await cloud.statStorage(record);
    const proof = { source_bucket: record.source_bucket, source_path: record.source_path, drive, status: 'verified' };
    if (source) {
      assertStorageSnapshot(record, source);
      proof.source = await cloud.verifyStorage(record);
      assertStorageSnapshot(record, await cloud.statStorage(record));
    } else {
      const prior = previous.get(location(record));
      requireProof(options.mode === 'purge' && (validDate(mapping.purged_at) || validDate(prior?.delete_attempted_at)),
        'Storage: objet absent sans preuve antérieure de purge.');
      proof.status = validDate(mapping.purged_at) ? 'already_purged' : 'recover_pending_journal';
      proof.delete_attempted_at = prior?.delete_attempted_at;
    }
    journal.records.push(proof);
    progress(++done, manifest.count, 'verified');
  });
  journal.records.sort((a, b) => location(a) < location(b) ? -1 : 1);
  journal.verified_at = new Date().toISOString();
  await checkpoint(journal);
  if (!options.apply) { journal.finished_at = new Date().toISOString(); await checkpoint(journal); return journal; }
  // Recheck proof freshness after a long download pass, before any mutation.
  validateManifest(manifest, { ...options, now: Date.now() });
  const journalMap = new Map(journal.records.map(record => [location(record), record]));
  if (options.mode === 'activate') {
    for (let offset = 0; offset < manifest.count; offset += 20) {
      const batch = manifest.records.slice(offset, offset + 20);
      await cloud.activate(batch);
      for (const record of batch) journalMap.get(location(record)).status = 'activated';
      await checkpoint(journal);
      progress(Math.min(offset + 20, manifest.count), manifest.count, 'activated');
    }
  } else {
    // Re-read active mappings to prevent deleting after a concurrent revocation/change.
    const latestMappings = await cloud.mappings();
    for (const record of manifest.records) assertMapping(record, latestMappings.get(location(record)));
    const buckets = new Map();
    for (const record of manifest.records) {
      const proof = journalMap.get(location(record));
      if (proof.status === 'already_purged') continue;
      if (proof.status === 'recover_pending_journal') {
        requireProof(await cloud.statStorage(record) === null, 'Storage: objet réapparu depuis la vérification de reprise.');
        await cloud.markPurged(record, new Date().toISOString());
        proof.status = 'purged'; await checkpoint(journal); continue;
      }
      if (!buckets.has(record.source_bucket)) buckets.set(record.source_bucket, []);
      buckets.get(record.source_bucket).push(record);
    }
    let purged = 0;
    for (const [bucket, records] of buckets) {
      for (let offset = 0; offset < records.length; offset += 20) {
        const batch = records.slice(offset, offset + 20);
        // Check the current Drive version and source metadata again immediately before this batch.
        for (const record of batch) { await cloud.verifyDrive(record); assertStorageSnapshot(record, await cloud.statStorage(record)); }
        const currentMappings = await cloud.mappings();
        for (const record of batch) assertMapping(record, currentMappings.get(location(record)));
        const at = new Date().toISOString();
        for (const record of batch) journalMap.get(location(record)).delete_attempted_at = at;
        await checkpoint(journal);
        await cloud.removeStorage(bucket, batch);
        for (const record of batch) {
          requireProof(await cloud.statStorage(record) === null, 'Storage: suppression non confirmée.');
          const proof = journalMap.get(location(record));
          proof.storage_deleted_at = new Date().toISOString();
          await checkpoint(journal);
          await cloud.markPurged(record, proof.storage_deleted_at);
          proof.status = 'purged'; await checkpoint(journal);
          progress(++purged, manifest.count, 'purged');
        }
      }
    }
  }
  journal.finished_at = new Date().toISOString();
  await checkpoint(journal);
  return journal;
}

async function privateJournal(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}
async function main(args) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode activate|purge --manifest <private.json> --env-file <private.env> [--apply --project-ref szlvyrrmvdvhzixilymh] [--journal <private.json>] [--concurrency 1..8]');
    return;
  }
  let manifest, env;
  try { manifest = JSON.parse(await readFile(resolve(options.manifest), 'utf8')); env = parseEnvFile(await readFile(resolve(options.envFile), 'utf8')); }
  catch (error) { if (error instanceof MigrationError) throw error; throw new MigrationError('Impossible de lire les fichiers privés de migration.'); }
  validateManifest(manifest, options);
  const journalFile = resolve(options.journal || `${dirname(resolve(options.manifest))}/${basename(options.manifest, extname(options.manifest))}.${options.mode}.journal.json`);
  requireProof(journalFile !== resolve(options.manifest) && journalFile !== resolve(options.envFile), 'Le journal doit être distinct du manifeste et de la configuration.');
  let previous = null;
  try { previous = JSON.parse(await readFile(journalFile, 'utf8')); } catch { /* first run */ }
  const cloud = createMigrationCloud(env);
  console.log(`${options.mode}: ${manifest.count} documents; ${options.apply ? 'application explicite' : 'simulation sans mutation cloud'}.`);
  let lastUpdate = 0;
  const journal = await runMigration(manifest, options, cloud, value => privateJournal(journalFile, value), (done, total, phase) => {
    if (Date.now() - lastUpdate > 10000 || done === total) { console.log(`${phase}: ${done}/${total}`); lastUpdate = Date.now(); }
  }, previous);
  console.log(`Terminé: ${journal.records.length} preuves vérifiées; journal privé enregistré.`);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof MigrationError ? error.message : 'Migration interrompue; aucun détail sensible n’est affiché.');
    process.exitCode = 1;
  });
}
