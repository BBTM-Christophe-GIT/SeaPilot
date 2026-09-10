import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { BBTM_FLEET_PHOTOS } from '../src/features/fleet/fleetPhotoCatalog.ts';

// Run with pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts.
// Credentials stay in the process environment. Dry run unless --apply is supplied.
const { values } = parseArgs({ options: {
  'source-dir': { type: 'string' }, 'company-code': { type: 'string', default: 'bbtm' },
  'backup-file': { type: 'string' }, apply: { type: 'boolean', default: false },
  'copy-preview': { type: 'boolean', default: false },
} });
if (!values['source-dir']) throw new Error('--source-dir is required.');
if (values.apply && !values['backup-file']) throw new Error('--backup-file is required for an import.');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: company, error: companyError } = await client.from('companies').select('id').eq('code', values['company-code']).single();
if (companyError || !company) throw new Error('Company not found.');
const fields = 'id,company_id,name,acronym,photo_url,photo_storage_bucket,photo_storage_path';
const { data: vessels, error: vesselError } = await client.from('vessels').select(fields).eq('company_id', company.id).eq('active', true);
if (vesselError || !vessels) throw new Error('Unable to read fleet.');
const normalize = (text: string) => text.trim().toLocaleUpperCase('fr');
const plan = await Promise.all(BBTM_FLEET_PHOTOS.map(async (photo) => {
  const matches = vessels.filter((vessel) => normalize(vessel.name) === normalize(photo.name) && vessel.acronym === photo.acronym);
  if (matches.length !== 1) throw new Error(`Expected one active vessel for ${photo.name}; found ${matches.length}.`);
  const source = resolve(values['source-dir']!, photo.file);
  const bytes = await readFile(source);
  if (bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${photo.file}`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const vessel = matches[0];
  const path = `${company.id}/${vessel.id}/bbtm-${photo.slug}-${digest.slice(0, 16)}.png`;
  return { photo, vessel, source, bytes, digest, path };
}));
console.log(JSON.stringify(plan.map(({ photo, vessel, path, bytes }) => ({ vessel: photo.name, id: vessel.id, path, bytes: bytes.length })), null, 2));
if (values.apply) {
  // Exclusive creation prevents a rerun from replacing the original backup.
  await writeFile(resolve(values['backup-file']!), JSON.stringify(plan.map(({ vessel }) => vessel), null, 2), { flag: 'wx' });
  for (const entry of plan) {
    if (entry.vessel.photo_storage_path !== entry.path || entry.vessel.photo_storage_bucket !== 'fleet-media') {
      const uploaded = await client.storage.from('fleet-media').upload(entry.path, entry.bytes, { contentType: 'image/png', cacheControl: '3600', upsert: false });
      if (uploaded.error && !['409', 'Duplicate'].includes(String(uploaded.error.statusCode)) && uploaded.error.message !== 'The resource already exists') throw new Error(`Upload failed for ${entry.photo.name}: ${uploaded.error.message}`);
    }
    const downloaded = await client.storage.from('fleet-media').download(entry.path);
    if (downloaded.error || !downloaded.data) throw new Error(`Image verification failed for ${entry.photo.name}.`);
    const hash = createHash('sha256').update(Buffer.from(await downloaded.data.arrayBuffer())).digest('hex');
    if (hash !== entry.digest) throw new Error(`Image content mismatch for ${entry.photo.name}.`);
  }
  for (const entry of plan) {
    const updated = await client.from('vessels').update({ photo_url: null, photo_storage_bucket: 'fleet-media', photo_storage_path: entry.path, updated_at: new Date().toISOString() })
      .eq('company_id', company.id).eq('id', entry.vessel.id).eq('active', true).select('id,photo_storage_path').single();
    if (updated.error || updated.data?.photo_storage_path !== entry.path) throw new Error(`Photo reference update failed for ${entry.photo.name}.`);
    console.log(`Saved and verified: ${entry.photo.name}`);
  }
}
if (values['copy-preview']) {
  const target = resolve('public/vessels/bbtm');
  await mkdir(target, { recursive: true });
  for (const entry of plan) await copyFile(entry.source, resolve(target, `${entry.photo.slug}.png`));
  console.log('Nine original PNGs copied for the preview.');
}
