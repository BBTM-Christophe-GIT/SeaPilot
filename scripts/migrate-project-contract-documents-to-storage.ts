import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface ContractDocumentRow {
  company_id: number;
  file_name: string | null;
  id: number;
  mime_type: string | null;
  project_id: number;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_sha256: string | null;
  title: string;
}

const BUCKET = 'project-files';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : '';
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}.`);
  return value;
}

function safeStorageFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'document';
}

function mimeTypeFor(fileName: string, storedMimeType: string | null): string {
  if (storedMimeType) return storedMimeType;
  const extension = fileName.toLocaleLowerCase('fr').split('.').pop();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return 'application/octet-stream';
}

async function sha256(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex');
}

const projectCode = argumentValue('--project-code').trim().toUpperCase();
const sourceDirectory = resolve(argumentValue('--source-dir'));
const apply = process.argv.includes('--apply');
const client = createClient(
  requiredEnvironment('SUPABASE_URL'),
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const sourceStats = await stat(sourceDirectory);
if (!sourceStats.isDirectory()) throw new Error(`Source directory not found: ${sourceDirectory}`);

const { data: project, error: projectError } = await client
  .from('projects')
  .select('id,company_id,project_code')
  .eq('project_code', projectCode)
  .is('archived_at', null)
  .single();
if (projectError || !project) throw new Error(projectError?.message || `Project ${projectCode} not found.`);

const { data: documentRows, error: documentsError } = await client
  .from('contract_documents')
  .select('id,company_id,project_id,title,file_name,mime_type,storage_bucket,storage_path,storage_sha256')
  .eq('project_id', project.id)
  .eq('is_folder', false)
  .order('id', { ascending: true });
if (documentsError) throw new Error(`Cannot load contract documents: ${documentsError.message}`);

const sourceFiles = await readdir(sourceDirectory);
const documents = (documentRows || []) as ContractDocumentRow[];
const report = {
  apply,
  candidates: documents.length,
  migrated: [] as Array<{ id: number; objectPath: string; sha256: string; sizeBytes: number }>,
  projectCode,
  skipped: [] as Array<{ id: number; reason: string }>,
};

for (const document of documents) {
  const sourceName = sourceFiles.find((fileName) => fileName.startsWith(`${document.id}--`));
  if (!sourceName) throw new Error(`Missing source file for contract document ${document.id}.`);
  const sourcePath = resolve(sourceDirectory, sourceName);
  if (!sourcePath.startsWith(`${sourceDirectory}\\`) && !sourcePath.startsWith(`${sourceDirectory}/`)) {
    throw new Error(`Unsafe source path for contract document ${document.id}.`);
  }
  const buffer = await readFile(sourcePath);
  const digest = await sha256(buffer);
  const displayFileName = document.file_name || document.title || basename(sourcePath).replace(/^\d+--/, '');
  const objectPath = `projects/${project.id}/contract-documents/${document.id}-${safeStorageFileName(displayFileName)}`;
  const metadataMatches = (
    document.storage_bucket === BUCKET
    && document.storage_path === objectPath
    && document.storage_sha256 === digest
  );

  if (!apply) {
    if (metadataMatches) report.skipped.push({ id: document.id, reason: 'already-migrated' });
    else report.migrated.push({ id: document.id, objectPath, sha256: digest, sizeBytes: buffer.byteLength });
    continue;
  }

  const folderPath = objectPath.slice(0, objectPath.lastIndexOf('/'));
  const objectName = objectPath.slice(objectPath.lastIndexOf('/') + 1);
  const { data: existingObjects, error: listError } = await client.storage
    .from(BUCKET)
    .list(folderPath, { limit: 10, search: objectName });
  if (listError) throw new Error(`Cannot inspect Storage for document ${document.id}: ${listError.message}`);
  const objectExists = existingObjects?.some((object) => object.name === objectName) ?? false;
  let uploaded = false;

  if (objectExists) {
    const { data: storedFile, error: downloadError } = await client.storage.from(BUCKET).download(objectPath);
    if (downloadError || !storedFile) {
      throw new Error(downloadError?.message || `Cannot verify existing Storage object for document ${document.id}.`);
    }
    const storedDigest = await sha256(Buffer.from(await storedFile.arrayBuffer()));
    if (storedDigest !== digest) {
      throw new Error(`Storage checksum mismatch for contract document ${document.id}.`);
    }
  } else {
    const { error: uploadError } = await client.storage.from(BUCKET).upload(objectPath, buffer, {
      cacheControl: '3600',
      contentType: mimeTypeFor(displayFileName, document.mime_type),
      upsert: false,
    });
    if (uploadError) throw new Error(`Cannot upload contract document ${document.id}: ${uploadError.message}`);
    uploaded = true;
  }

  if (metadataMatches) {
    report.skipped.push({ id: document.id, reason: 'already-migrated-and-checksum-verified' });
    continue;
  }

  const { data: updatedDocument, error: updateError } = await client
    .from('contract_documents')
    .update({
      file_size_bytes: buffer.byteLength,
      mime_type: mimeTypeFor(displayFileName, document.mime_type),
      storage_bucket: BUCKET,
      storage_migrated_at: new Date().toISOString(),
      storage_path: objectPath,
      storage_sha256: digest,
      updated_at: new Date().toISOString(),
    })
    .eq('id', document.id)
    .eq('company_id', project.company_id)
    .eq('project_id', project.id)
    .select('id')
    .single();
  if (updateError || !updatedDocument) {
    if (uploaded) await client.storage.from(BUCKET).remove([objectPath]);
    throw new Error(`Cannot register contract document ${document.id}: ${updateError?.message || 'row not updated'}`);
  }

  report.migrated.push({ id: document.id, objectPath, sha256: digest, sizeBytes: buffer.byteLength });
}

console.log(JSON.stringify(report, null, 2));
