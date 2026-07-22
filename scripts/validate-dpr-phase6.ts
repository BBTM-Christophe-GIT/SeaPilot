import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { DprMigrationManifest } from '../src/features/dpr/dprMigration.ts';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

const client = createClient(requiredEnvironment('SUPABASE_URL'), requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll(table: string, select: string, filters: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let query = client.from(table).select(select).range(from, from + 999);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value as never);
    const { data, error } = await query;
    if (error) throw new Error(`Cannot read ${table}: ${error.message}`);
    rows.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  values.forEach((value) => { const group = key(value); counts[group] = (counts[group] || 0) + 1; });
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function sameCounts(left: Record<string, number>, right: Record<string, number>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

const reportPath = resolve(process.argv[2] || '.data/dpr-phase6-validation.json');
const manifestPath = resolve(process.argv[3] || '.data/dpr-migration-manifest.json');
const migrationReportPath = resolve(process.argv[4] || '.data/dpr-migration-report.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DprMigrationManifest;
const migrationReport = JSON.parse(await readFile(migrationReportPath, 'utf8')) as {
  counters: Record<string, number>;
  reconciliation: { objectErrors: string[]; ok: boolean; orphanMetadata: number[] };
};
const { data: company, error: companyError } = await client.from('companies').select('id').eq('code', 'bbtm').single();
if (companyError) throw new Error(`Cannot resolve bbtm: ${companyError.message}`);
const companyId = Number(company.id);

const [reports, files, projects, vessels, crew, incidents, portCalls, errors, records] = await Promise.all([
  fetchAll('dpr_reports', 'id,dpr_number,sharepoint_item_id,project_id,vessel_id', { company_id: companyId, source_label: 'sharepoint' }),
  fetchAll('dpr_files', 'id,dpr_id,file_kind,bucket_name,object_path,status,sharepoint_item_id', { company_id: companyId }),
  fetchAll('projects', 'id,sharepoint_item_id', { company_id: companyId }),
  fetchAll('vessels', 'id,sharepoint_item_id', { company_id: companyId }),
  fetchAll('dpr_crew_members', 'dpr_id', { company_id: companyId }),
  fetchAll('dpr_incidents', 'dpr_id,level', { company_id: companyId }),
  fetchAll('dpr_port_calls', 'dpr_id', { company_id: companyId }),
  fetchAll('migration_errors', 'id,resolved_at', { company_id: companyId }),
  fetchAll('migration_records', 'entity_type,source_site_id,source_container_id,source_item_id', { company_id: companyId }),
]);

const projectTargets = new Map(projects.map((row) => [String(row.sharepoint_item_id), String(row.id)]));
const vesselTargets = new Map(vessels.map((row) => [String(row.sharepoint_item_id), String(row.id)]));
const sourceProjectCounts = countBy(manifest.reports, (report) => {
  if (!report.projectSharePointItemId) return 'null';
  const sourceId = report.projectSharePointItemId === '28' ? '52' : report.projectSharePointItemId;
  return projectTargets.get(sourceId) || `unresolved:${sourceId}`;
});
const targetProjectCounts = countBy(reports, (report) => report.project_id === null ? 'null' : String(report.project_id));
const sourceVesselCounts = countBy(manifest.reports, (report) => {
  if (!report.vesselSharePointItemId || report.vesselSharePointItemId === '17') return 'null';
  return vesselTargets.get(report.vesselSharePointItemId) || `unresolved:${report.vesselSharePointItemId}`;
});
const targetVesselCounts = countBy(reports, (report) => report.vessel_id === null ? 'null' : String(report.vessel_id));
const targetById = new Map(reports.map((report) => [Number(report.id), report]));
const crewCounts = countBy(crew, (row) => String(row.dpr_id));
const pdfReportIds = new Set(files.filter((file) => file.file_kind === 'pdf').map((file) => Number(file.dpr_id)));
const duplicateMigrationIdentities = records.length - new Set(records.map((record) => [
  record.entity_type, record.source_site_id, record.source_container_id, record.source_item_id,
].join('|'))).size;

const sampleReasons = new Map<number, Set<string>>();
function addSample(dprId: number | undefined, reason: string) {
  if (!dprId || !targetById.has(dprId)) return;
  const reasons = sampleReasons.get(dprId) || new Set<string>();
  reasons.add(reason);
  sampleReasons.set(dprId, reasons);
}
Object.entries(crewCounts).find(([, count]) => count > 1) && addSample(Number(Object.entries(crewCounts).find(([, count]) => count > 1)?.[0]), 'équipage multiple');
addSample(Number(incidents.find((row) => row.level !== 'T0')?.dpr_id), 'incident QHSE T1/T2');
addSample(Number(portCalls[0]?.dpr_id), 'escale');
addSample(Number(files.find((file) => file.file_kind === 'photo')?.dpr_id), 'photo');
addSample(Number(files.find((file) => file.file_kind === 'pdf')?.dpr_id), 'PDF');
for (const vesselId of [...new Set(reports.map((report) => report.vessel_id).filter(Boolean))].slice(0, 3)) {
  addSample(Number(reports.find((report) => report.vessel_id === vesselId)?.id), `navire ${vesselId}`);
}
for (const projectId of [...new Set(reports.map((report) => report.project_id).filter(Boolean))].slice(0, 3)) {
  addSample(Number(reports.find((report) => report.project_id === projectId)?.id), `projet ${projectId}`);
}
const manualSample = [...sampleReasons].map(([dprId, reasons]) => ({
  dprId,
  dprNumber: targetById.get(dprId)?.dpr_number,
  sharePointItemId: targetById.get(dprId)?.sharepoint_item_id,
  reasons: [...reasons],
}));

const checks = {
  reports981: reports.length === 981 && reports.length === manifest.reports.length,
  pdfs325: files.filter((file) => file.file_kind === 'pdf').length === 325,
  photos10: files.filter((file) => file.file_kind === 'photo').length === 10,
  reportsWithoutPdf656: reports.filter((report) => !pdfReportIds.has(Number(report.id))).length === 656,
  noOrphanFiles: files.every((file) => file.dpr_id !== null),
  allFilesReady: files.every((file) => file.status === 'ready'),
  allStorageChecksumsVerified: migrationReport.reconciliation.ok && migrationReport.reconciliation.objectErrors.length === 0,
  noMigrationErrors: errors.length === 0,
  noDuplicateSourceIdentifiers: duplicateMigrationIdentities === 0,
  projectTotalsMatch: sameCounts(sourceProjectCounts, targetProjectCounts),
  vesselTotalsMatch: sameCounts(sourceVesselCounts, targetVesselCounts),
  idempotentReplay: migrationReport.counters.reportsInserted === 0 && migrationReport.counters.reportsUpdated === 0
    && migrationReport.counters.reportsUnchanged === 981 && migrationReport.counters.filesReused === 335,
};
const result = {
  generatedAt: new Date().toISOString(), companyId, manifestVersion: manifest.manifestVersion,
  counts: {
    reports: reports.length,
    pdfs: files.filter((file) => file.file_kind === 'pdf').length,
    photos: files.filter((file) => file.file_kind === 'photo').length,
    attachments: files.filter((file) => file.file_kind === 'attachment').length,
    reportsWithoutPdf: reports.filter((report) => !pdfReportIds.has(Number(report.id))).length,
    migrationErrors: errors.length,
    duplicateMigrationIdentities,
  },
  checks,
  projectTotals: { source: sourceProjectCounts, target: targetProjectCounts },
  vesselTotals: { source: sourceVesselCounts, target: targetVesselCounts },
  manualSample,
  ok: Object.values(checks).every(Boolean),
};
await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(`Phase 6 validation: ${result.ok ? 'PASS' : 'FAIL'}; reports=${reports.length}; PDFs=${result.counts.pdfs}; photos=${result.counts.photos}; sample=${manualSample.length}.`);
console.log(`Report written to ${reportPath}.`);
if (!result.ok) process.exitCode = 2;
