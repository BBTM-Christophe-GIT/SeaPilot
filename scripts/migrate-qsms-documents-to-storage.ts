import { createClient } from '@supabase/supabase-js';
import { getSharePointSourceByKey } from '../src/features/sharepoint/sharePointInventory.ts';

interface LegacyProcedureRow {
  file_name?: string | null;
  file_url: string | null;
  id: number;
  procedure_id?: number | null;
  sharepoint_file_ref: string | null;
  source_file_name?: string | null;
  source_storage_bucket?: string | null;
  source_storage_path?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  title: string;
}

const BUCKET = 'procedure-documents';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 180) || 'document';
}

function mimeType(fileName: string, responseType: string | null): string {
  if (responseType && responseType !== 'application/octet-stream') return responseType.split(';')[0];
  const extension = fileName.toLowerCase().split('.').pop();
  const types: Record<string, string> = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    html: 'text/html',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odt: 'application/vnd.oasis.opendocument.text',
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return types[extension || ''] || 'application/octet-stream';
}

function graphContentUrl(driveId: string, libraryRoot: string, fileRef: string): string {
  const decodedRoot = decodeURIComponent(libraryRoot).replace(/\/+$/, '');
  const decodedRef = decodeURIComponent(fileRef);
  if (!decodedRef.toLowerCase().startsWith(`${decodedRoot.toLowerCase()}/`)) {
    throw new Error(`SharePoint path ${fileRef} is outside ${libraryRoot}.`);
  }
  const relativePath = decodedRef.slice(decodedRoot.length + 1).split('/').map(encodeURIComponent).join('/');
  return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root:/${relativePath}:/content`;
}

async function downloadSharePointFile(accessToken: string, driveId: string, root: string, fileRef: string) {
  const response = await fetch(graphContentUrl(driveId, root, fileRef), {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Graph download failed (${response.status}) for ${fileRef}.`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}

const apply = process.argv.includes('--apply');
const accessToken = apply ? requiredEnvironment('MS_GRAPH_ACCESS_TOKEN') : '';
const client = createClient(requiredEnvironment('SUPABASE_URL'), requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sourceDefinitions = [
  { key: 'library-qsms', table: 'procedures', kind: 'source' as const },
  { key: 'library-qsms-pdf', table: 'published_procedures', kind: 'published' as const },
];
const report = {
  apply,
  migrated: [] as Array<{ id: number; kind: string; objectPath: string; sizeBytes: number }>,
  skipped: [] as Array<{ fileName?: string; id: number; kind: string; reason: string; sizeBytes?: number }>,
};

for (const definition of sourceDefinitions) {
  const source = getSharePointSourceByKey(definition.key);
  if (!source?.driveId || !source.serverRelativeUrl) throw new Error(`Incomplete SharePoint source ${definition.key}.`);

  const select = definition.kind === 'source'
    ? 'id,title,file_url,sharepoint_file_ref,source_file_name,source_storage_bucket,source_storage_path'
    : 'id,procedure_id,title,file_name,file_url,sharepoint_file_ref,storage_bucket,storage_path';
  const { data, error } = await client.from(definition.table).select(select).order('id', { ascending: true }).limit(1000);
  if (error) throw new Error(`Cannot load ${definition.table}: ${error.message}`);

  for (const row of (data || []) as unknown as LegacyProcedureRow[]) {
    const currentBucket = definition.kind === 'source' ? row.source_storage_bucket : row.storage_bucket;
    const currentPath = definition.kind === 'source' ? row.source_storage_path : row.storage_path;
    if (currentBucket && currentPath) {
      report.skipped.push({ id: row.id, kind: definition.kind, reason: 'already-migrated' });
      continue;
    }
    if (!row.sharepoint_file_ref) {
      report.skipped.push({ id: row.id, kind: definition.kind, reason: 'missing-sharepoint-file-ref' });
      continue;
    }

    const fileName = row.source_file_name || row.file_name || row.title;
    if (definition.kind === 'published' && !fileName.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Published procedure ${row.id} is not a PDF.`);
    }
    const objectPath = definition.kind === 'source'
      ? `sources/migration/${row.id}-${safeFileName(fileName)}`
      : `published/${row.procedure_id || 'legacy'}/${row.id}-${safeFileName(fileName)}`;
    if (!apply) {
      report.migrated.push({ id: row.id, kind: definition.kind, objectPath, sizeBytes: 0 });
      continue;
    }

    const downloaded = await downloadSharePointFile(accessToken, source.driveId, source.serverRelativeUrl, row.sharepoint_file_ref);
    if (downloaded.bytes.byteLength > MAX_FILE_SIZE_BYTES) {
      report.skipped.push({
        fileName,
        id: row.id,
        kind: definition.kind,
        reason: 'file-too-large',
        sizeBytes: downloaded.bytes.byteLength,
      });
      continue;
    }
    const resolvedMimeType = mimeType(fileName, downloaded.contentType);
    if (definition.kind === 'published' && resolvedMimeType !== 'application/pdf') {
      throw new Error(`Published procedure ${row.id} was returned as ${resolvedMimeType}, expected application/pdf.`);
    }
    const { error: uploadError } = await client.storage.from(BUCKET).upload(objectPath, downloaded.bytes, {
      cacheControl: '3600', contentType: resolvedMimeType, upsert: false,
    });
    if (uploadError) throw new Error(`Cannot upload ${definition.kind} ${row.id}: ${uploadError.message}`);

    const payload = definition.kind === 'source'
      ? {
          source_storage_bucket: BUCKET,
          source_storage_path: objectPath,
          source_file_name: fileName,
          source_mime_type: resolvedMimeType,
          source_size_bytes: downloaded.bytes.byteLength,
        }
      : {
          storage_bucket: BUCKET,
          storage_path: objectPath,
          file_name: fileName,
          mime_type: 'application/pdf',
          size_bytes: downloaded.bytes.byteLength,
        };
    const { data: updated, error: updateError } = await client.from(definition.table).update(payload).eq('id', row.id).select('id').single();
    if (updateError || !updated) {
      await client.storage.from(BUCKET).remove([objectPath]);
      throw new Error(`Cannot register ${definition.kind} ${row.id}: ${updateError?.message || 'row not updated'}`);
    }
    report.migrated.push({ id: row.id, kind: definition.kind, objectPath, sizeBytes: downloaded.bytes.byteLength });
  }
}

console.log(JSON.stringify(report, null, 2));
