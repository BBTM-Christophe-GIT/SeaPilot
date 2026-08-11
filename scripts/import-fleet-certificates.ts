import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

interface IqyCertificateRow {
  alarmOn: string | null;
  category: string;
  comments: string;
  documentTitle: string;
  expiresOn: string | null;
  fileName: string;
  plannedOn: string | null;
  provider: string;
  sourcePath: string;
  vesselName: string;
  visitLocation: string;
}

interface IqyBundle {
  exportedAt: string;
  rows: IqyCertificateRow[];
  source: string;
  viewId: string;
}

interface DriveDocument {
  createdAt: string | null;
  driveId: string;
  itemId: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
  updatedAt: string | null;
  webUrl: string;
}

interface PreparedCertificate extends IqyCertificateRow {
  categoryKey: string;
  drive: DriveDocument | null;
  fileSizeBytes: number;
  mimeType: string;
  sourceFilePath: string;
  storagePath: string;
}

interface ParsedArgs {
  documentsDir: string;
  drivePath: string;
  iqyPath: string;
  migrationPath: string;
  stagingDir: string;
}

const VESSEL_ACRONYMS: Record<string, string> = {
  ECREHOUEL: 'ECR',
  GOURY: 'GRY',
  'HIRONDELLE DE LA MANCHE': 'HIR',
  'HOLENN EUSA': 'HE',
  KROKDUR: 'KDR',
  LANDEMER: 'LDM',
  'LE ROZEL': 'RZL',
  SUROIT: 'SUR',
  'YARD - Le Havre': 'YRD',
};

function parseArgs(args: string[]): ParsedArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    values.set(args[index], args[index + 1] || '');
  }

  const required = ['--iqy', '--drive', '--documents', '--staging', '--migration'];
  for (const key of required) {
    if (!values.get(key)) {
      throw new Error(`Missing required argument ${key}.`);
    }
  }

  return {
    documentsDir: resolve(values.get('--documents')!),
    drivePath: resolve(values.get('--drive')!),
    iqyPath: resolve(values.get('--iqy')!),
    migrationPath: resolve(values.get('--migration')!),
    stagingDir: resolve(values.get('--staging')!),
  };
}

function sqlText(value: string | null | undefined): string {
  if (!value) return 'null';
  return `'${value.replaceAll("'", "''")}'`;
}

function asciiSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' et ')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function categoryKey(category: string): string {
  const match = category.match(/^(\d{2})\s*-\s*(.+)$/);
  return match ? `${match[1]}-${asciiSlug(match[2]).toLowerCase()}` : asciiSlug(category).toLowerCase() || 'certificate';
}

function mimeType(fileName: string, drive: DriveDocument | null): string {
  if (drive?.mimeType) return drive.mimeType;
  const extension = extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/pdf';
}

async function prepareCertificates(args: ParsedArgs): Promise<PreparedCertificate[]> {
  const iqy = JSON.parse(await readFile(args.iqyPath, 'utf8')) as IqyBundle;
  const drive = JSON.parse(await readFile(args.drivePath, 'utf8')) as DriveDocument[];
  const driveByTitle = new Map(drive.map((document) => [document.title, document]));
  const prepared: PreparedCertificate[] = [];

  for (const [index, row] of iqy.rows.entries()) {
    const sourceFilePath = join(args.documentsDir, row.fileName);
    const sourceStat = await stat(sourceFilePath);
    const acronym = VESSEL_ACRONYMS[row.vesselName] || asciiSlug(row.vesselName).toUpperCase();
    const storageFileName = `${String(index + 1).padStart(3, '0')}-${asciiSlug(row.fileName)}`;
    prepared.push({
      ...row,
      categoryKey: categoryKey(row.category),
      drive: driveByTitle.get(row.fileName) || null,
      fileSizeBytes: sourceStat.size,
      mimeType: mimeType(row.fileName, driveByTitle.get(row.fileName) || null),
      sourceFilePath,
      storagePath: `1/${acronym}/legacy/${storageFileName}`,
    });
  }

  return prepared;
}

async function stageFiles(certificates: PreparedCertificate[], stagingDir: string) {
  for (const certificate of certificates) {
    const destination = join(stagingDir, ...certificate.storagePath.split('/'));
    await mkdir(resolve(destination, '..'), { recursive: true });
    await copyFile(certificate.sourceFilePath, destination);
  }
}

function buildMigration(certificates: PreparedCertificate[]): string {
  const values = certificates.map((certificate) => {
    const drive = certificate.drive;
    const isActiveFleet = certificate.vesselName !== 'ECREHOUEL' && certificate.vesselName !== 'YARD - Le Havre';
    return `(
      1,
      (select min(id) from public.vessels where company_id = 1 and name = ${sqlText(certificate.vesselName)}),
      ${sqlText(certificate.vesselName)},
      ${sqlText(certificate.categoryKey)},
      ${sqlText(certificate.category)},
      ${sqlText(certificate.documentTitle || basename(certificate.fileName, extname(certificate.fileName)))},
      ${sqlText(certificate.documentTitle || basename(certificate.fileName, extname(certificate.fileName)))},
      case
        when ${sqlText(certificate.expiresOn)}::date < current_date then 'expired'
        when ${sqlText(certificate.expiresOn)}::date <= current_date + 90 then 'renew_due'
        else 'valid'
      end,
      ${sqlText(certificate.expiresOn)},
      ${sqlText(certificate.plannedOn)},
      ${sqlText(certificate.alarmOn)},
      ${sqlText(certificate.provider)},
      ${sqlText(certificate.visitLocation)},
      ${sqlText(certificate.comments)},
      ${sqlText(certificate.fileName)},
      ${sqlText(certificate.fileName)},
      'sharepoint-iqy',
      'fleet-certificates',
      ${sqlText(certificate.storagePath)},
      ${sqlText(certificate.mimeType)},
      ${certificate.fileSizeBytes},
      'https://bbtm668.sharepoint.com/sites/QHSE',
      'fff33cda-20da-4a9b-8b55-46630ee5e8b0',
      'Certificats Flotte BBTM',
      ${sqlText(`/sites/QHSE/Certificats Flotte BBTM/${certificate.fileName}`)},
      ${sqlText(drive?.webUrl)},
      ${sqlText(drive?.driveId)},
      ${sqlText(drive?.itemId)},
      ${sqlText(drive?.createdAt)},
      ${sqlText(drive?.updatedAt)},
      ${isActiveFleet ? 'true' : 'false'},
      case
        when ${sqlText(certificate.plannedOn)}::date is not null then 'planned'
        when ${sqlText(certificate.expiresOn)}::date <= current_date + 90 then 'due'
        else 'not_started'
      end
    )`;
  });

  return `insert into public.fleet_certificates (
  company_id, vessel_id, vessel_name, category_key, category_label, document_title,
  title, status, expires_on, planned_on, alarm_on, provider_name, visit_location,
  renewal_notes, original_file_name, file_name, source_label, storage_bucket,
  storage_path, mime_type, file_size_bytes, sharepoint_site_url, sharepoint_list_id,
  sharepoint_list_title, sharepoint_file_ref, sharepoint_encoded_abs_url,
  sharepoint_drive_id, sharepoint_drive_item_id, source_created_at, source_modified_at,
  is_active_fleet, workflow_status
)
values
${values.join(',\n')}
on conflict (company_id, original_file_name) where original_file_name is not null
do update set
  vessel_id = excluded.vessel_id,
  vessel_name = excluded.vessel_name,
  category_key = excluded.category_key,
  category_label = excluded.category_label,
  document_title = excluded.document_title,
  title = excluded.title,
  status = excluded.status,
  expires_on = excluded.expires_on,
  planned_on = excluded.planned_on,
  alarm_on = excluded.alarm_on,
  provider_name = excluded.provider_name,
  visit_location = excluded.visit_location,
  renewal_notes = excluded.renewal_notes,
  file_name = excluded.file_name,
  source_label = excluded.source_label,
  storage_bucket = excluded.storage_bucket,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  file_size_bytes = excluded.file_size_bytes,
  sharepoint_file_ref = excluded.sharepoint_file_ref,
  sharepoint_encoded_abs_url = excluded.sharepoint_encoded_abs_url,
  sharepoint_drive_id = excluded.sharepoint_drive_id,
  sharepoint_drive_item_id = excluded.sharepoint_drive_item_id,
  source_created_at = excluded.source_created_at,
  source_modified_at = excluded.source_modified_at,
  is_active_fleet = excluded.is_active_fleet,
  workflow_status = excluded.workflow_status,
  updated_at = now();

insert into public.fleet_certificate_versions (
  company_id, certificate_id, version_no, status, original_file_name,
  normalized_file_name, storage_bucket, storage_path, mime_type, file_size_bytes,
  expires_on, is_current, source_label, validated_at
)
select
  certificate.company_id,
  certificate.id,
  1,
  'active',
  certificate.original_file_name,
  certificate.file_name,
  certificate.storage_bucket,
  certificate.storage_path,
  certificate.mime_type,
  certificate.file_size_bytes,
  certificate.expires_on,
  true,
  'sharepoint-iqy',
  now()
from public.fleet_certificates certificate
where certificate.source_label = 'sharepoint-iqy'
  and not exists (
    select 1
    from public.fleet_certificate_versions version
    where version.certificate_id = certificate.id
  );
`;
}

const args = parseArgs(process.argv.slice(2));
const certificates = await prepareCertificates(args);
await stageFiles(certificates, args.stagingDir);
await writeFile(args.migrationPath, buildMigration(certificates), 'utf8');

const activeFleet = certificates.filter((certificate) => !['ECREHOUEL', 'YARD - Le Havre'].includes(certificate.vesselName));
const expired = activeFleet.filter((certificate) => certificate.expiresOn && certificate.expiresOn < '2026-08-11').length;
const renewalDue = activeFleet.filter(
  (certificate) => certificate.expiresOn && certificate.expiresOn >= '2026-08-11' && certificate.expiresOn <= '2026-11-09',
).length;

console.log(JSON.stringify({
  activeFleet: activeFleet.length,
  expired,
  migrationPath: args.migrationPath,
  renewalDue,
  staged: certificates.length,
  stagingDir: args.stagingDir,
  total: certificates.length,
}, null, 2));
