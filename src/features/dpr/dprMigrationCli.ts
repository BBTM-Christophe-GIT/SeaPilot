import type { SupabaseClient } from '@supabase/supabase-js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { SharePointExportBundle } from '../sharepoint/sharePointImport.ts';
import {
  buildDprMigrationManifest,
  DPR_DRIVE_ID,
  DPR_LIBRARY_ID,
  DPR_LIST_ID,
  DPR_SITE_ID,
  DPR_SITE_URL,
  manifestSha256,
  sha256,
  stableJson,
  storageObjectPath,
  validateDprManifest,
  type DprMigrationFile,
  type DprMigrationManifest,
  type DprMigrationReport,
} from './dprMigration.ts';

type MigrationMode = 'inventory' | 'dry-run' | 'apply' | 'resume' | 'reconcile' | 'verify-idempotence' | 'historical-load';

interface ParsedArgs {
  companyCode: string;
  expectedAttachments: number;
  expectedHtml: number;
  expectedPdfs: number;
  expectedReports: number;
  inputPath: string;
  manifestPath: string;
  mode: MigrationMode;
  reportPath: string;
  rulesVersion: string;
  sourceFilesDirectory: string;
}

interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface DprMigrationCliDependencies {
  createClient(url: string, key: string, options?: Record<string, unknown>): SupabaseClient;
  now(): Date;
  readBinaryFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  runCommand(command: string, args: string[]): Promise<CommandResult>;
  writeLine(line: string): void;
  writeTextFile(path: string, content: string): Promise<void>;
}

interface TargetReference {
  id: number;
  name: string;
  sharePointItemId: string | null;
}

interface TargetPerson {
  active: boolean;
  functionLabel: string | null;
  gradeLabel: string | null;
  id: number;
  name: string;
  sharePointItemId: string | null;
}

interface LoadedReport {
  action: 'inserted' | 'updated' | 'unchanged';
  dprId: number;
  report: DprMigrationReport;
}

interface ApplyCounters {
  reportsInserted: number;
  reportsUpdated: number;
  reportsUnchanged: number;
  filesUploaded: number;
  filesReused: number;
  filesExcluded: number;
  filesLinked: number;
}

let activeSourceFilesDirectory = resolve('.data/dpr-source-files');

function numberArg(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer.`);
  return parsed;
}

export function parseDprMigrationArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    companyCode: 'bbtm',
    expectedAttachments: 10,
    expectedHtml: 15,
    expectedPdfs: 325,
    expectedReports: 981,
    inputPath: '.data/sharepoint-dpr-full.json',
    manifestPath: '.data/dpr-migration-manifest.json',
    mode: 'dry-run',
    reportPath: '.data/dpr-migration-report.json',
    rulesVersion: '2026-07-22.1',
    sourceFilesDirectory: '.data/dpr-source-files',
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === '--input' && value) parsed.inputPath = value;
    else if (flag === '--manifest' && value) parsed.manifestPath = value;
    else if (flag === '--report' && value) parsed.reportPath = value;
    else if (flag === '--company' && value) parsed.companyCode = value;
    else if (flag === '--rules-version' && value) parsed.rulesVersion = value;
    else if (flag === '--source-files' && value) parsed.sourceFilesDirectory = value;
    else if (flag === '--mode' && value && ['inventory', 'dry-run', 'apply', 'resume', 'reconcile', 'verify-idempotence', 'historical-load'].includes(value)) parsed.mode = value as MigrationMode;
    else if (flag === '--expected-reports' && value) parsed.expectedReports = numberArg(value, flag);
    else if (flag === '--expected-pdfs' && value) parsed.expectedPdfs = numberArg(value, flag);
    else if (flag === '--expected-html' && value) parsed.expectedHtml = numberArg(value, flag);
    else if (flag === '--expected-attachments' && value) parsed.expectedAttachments = numberArg(value, flag);
    else throw new Error(`Unknown or incomplete argument: ${flag}.`);
    index += 1;
  }
  return parsed;
}

function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { shell: process.platform === 'win32', windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (exitCode) => resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

export const defaultDprMigrationCliDependencies: Omit<DprMigrationCliDependencies, 'createClient'> = {
  now: () => new Date(),
  readBinaryFile: (path) => readFile(path),
  readTextFile: (path) => readFile(path, 'utf8'),
  runCommand: defaultRunCommand,
  writeLine: (line) => console.log(line),
  writeTextFile: async (path, content) => {
    await writeFile(path, content, 'utf8');
  },
};

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function loadManifest(args: ParsedArgs, dependencies: DprMigrationCliDependencies): Promise<DprMigrationManifest> {
  if (args.mode === 'inventory' || args.mode === 'dry-run') {
    const bundle = JSON.parse(await dependencies.readTextFile(resolve(args.inputPath))) as SharePointExportBundle;
    return buildDprMigrationManifest(bundle, dependencies.now());
  }
  return JSON.parse(await dependencies.readTextFile(resolve(args.manifestPath))) as DprMigrationManifest;
}

async function writeJson(path: string, value: unknown, dependencies: DprMigrationCliDependencies) {
  const absolutePath = resolve(path);
  const parent = dirname(absolutePath);
  await dependencies.runCommand('powershell', ['-NoProfile', '-Command', `New-Item -ItemType Directory -Force -LiteralPath '${parent.replace(/'/g, "''")}' | Out-Null`]);
  await dependencies.writeTextFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalize(value: string | null | undefined): string {
  return (value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function getReferences(client: SupabaseClient, table: 'projects' | 'vessels', companyId: number): Promise<TargetReference[]> {
  const selection = table === 'projects' ? 'id,title,project_code,sharepoint_item_id' : 'id,name,acronym,sharepoint_item_id';
  const { data, error } = await client.from(table).select(selection).eq('company_id', companyId).limit(5000);
  if (error) throw new Error(`Cannot load ${table}: ${error.message}`);
  return (data || []).map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    name: String(row.name || row.title || row.project_code || row.acronym || ''),
    sharePointItemId: row.sharepoint_item_id === null || row.sharepoint_item_id === undefined ? null : String(row.sharepoint_item_id),
  }));
}

async function getPeople(client: SupabaseClient, companyId: number): Promise<TargetPerson[]> {
  const { data, error } = await client.from('people')
    .select('id,first_name,last_name,function_label,grade_label,active,sharepoint_item_id')
    .eq('company_id', companyId).limit(5000);
  if (error) throw new Error(`Cannot load people: ${error.message}`);
  return (data || []).map((row: Record<string, unknown>) => ({
    active: Boolean(row.active),
    functionLabel: row.function_label ? String(row.function_label) : null,
    gradeLabel: row.grade_label ? String(row.grade_label) : null,
    id: Number(row.id),
    name: `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim(),
    sharePointItemId: row.sharepoint_item_id === null || row.sharepoint_item_id === undefined ? null : String(row.sharepoint_item_id),
  }));
}

function canonicalPerson(person: TargetPerson, people: TargetPerson[]): TargetPerson {
  const sameName = people.filter((candidate) => normalize(candidate.name) === normalize(person.name));
  return sameName.sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id)[0] || person;
}

function resolvePerson(sourceId: string | null, sourceName: string | null, people: TargetPerson[]): TargetPerson {
  const byId = sourceId ? people.filter((person) => person.sharePointItemId === sourceId) : [];
  if (byId.length === 1) return canonicalPerson(byId[0], people);
  const byName = sourceName ? people.filter((person) => normalize(person.name) === normalize(sourceName)) : [];
  if (byName.length === 1) return canonicalPerson(byName[0], people);
  throw new Error(`Cannot resolve person id=${sourceId || '-'}, name=${sourceName || '-'}: ${byName.length || byId.length} matches.`);
}

function crewFunction(person: TargetPerson): 'captain' | 'chief-engineer' | 'second-captain' | 'execution' {
  const label = normalize(`${person.functionLabel || ''} ${person.gradeLabel || ''}`);
  if (label.includes('chef mecanicien')) return 'chief-engineer';
  if (label.includes('second capitaine') || label.includes('2nd capitaine')) return 'second-captain';
  if (label.includes('capitaine')) return 'captain';
  return 'execution';
}

async function consolidateTanguySimonet(client: SupabaseClient, companyId: number, people: TargetPerson[]) {
  const duplicates = people.filter((person) => normalize(person.name) === 'tanguy simonet')
    .sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
  if (duplicates.length <= 1) return;
  const duplicateIds = duplicates.slice(1).map((person) => person.id);
  const { error } = await client.from('people').update({ active: false }).eq('company_id', companyId).in('id', duplicateIds);
  if (error) throw new Error(`Cannot logically deactivate duplicate Tanguy SIMONET people: ${error.message}`);
  duplicateIds.forEach((id) => { const person = people.find((entry) => entry.id === id); if (person) person.active = false; });
}

async function ensureHistoricalPeople(client: SupabaseClient, companyId: number, reports: DprMigrationReport[], people: TargetPerson[]): Promise<TargetPerson[]> {
  const candidates = new Map<string, { functionLabel: string | null; name: string; sourceId: string | null }>();
  for (const report of reports) {
    report.crewPersonNames.forEach((name, index) => {
      if (name) candidates.set(normalize(name), { name, sourceId: report.crewPersonSharePointItemIds[index] || null, functionLabel: report.crewPersonFunctions[index] || null });
    });
    if (report.issuerName !== 'Import SharePoint') candidates.set(normalize(report.issuerName), { name: report.issuerName, sourceId: report.issuerSharePointItemId, functionLabel: null });
  }
  for (const candidate of candidates.values()) {
    if (people.some((person) => normalize(person.name) === normalize(candidate.name))) continue;
    const parts = candidate.name.trim().split(/\s+/);
    const lastName = parts.pop() || candidate.name;
    const firstName = parts.join(' ') || 'Historique';
    const { data, error } = await client.from('people').insert({
      company_id: companyId, first_name: firstName, last_name: lastName,
      function_label: candidate.functionLabel, grade_label: 'Historique SharePoint', active: false,
      sharepoint_item_id: candidate.sourceId,
    }).select('id,first_name,last_name,function_label,grade_label,active,sharepoint_item_id').single();
    if (error) throw new Error(`Cannot import historical person ${candidate.name}: ${error.message}`);
    people.push({
      active: Boolean(data.active), functionLabel: data.function_label, gradeLabel: data.grade_label,
      id: Number(data.id), name: `${data.first_name} ${data.last_name}`.trim(), sharePointItemId: data.sharepoint_item_id,
    });
  }
  return people;
}

function resolveReference(report: DprMigrationReport, references: TargetReference[], type: 'project' | 'vessel'): number | null {
  const originalId = type === 'project' ? report.projectSharePointItemId : report.vesselSharePointItemId;
  const sourceId = type === 'project' && originalId === '28' ? '52' : originalId;
  const sourceName = type === 'project' ? report.projectTitle : report.vesselName;
  if (!sourceId && !sourceName) return null;
  if (type === 'vessel' && sourceId === '17') return null;
  const byId = sourceId ? references.filter((entry) => entry.sharePointItemId === sourceId) : [];
  if (byId.length === 1) return byId[0].id;
  const byName = sourceName ? references.filter((entry) => normalize(entry.name) === normalize(sourceName)) : [];
  if (byName.length === 1) return byName[0].id;
  throw new Error(`Cannot resolve ${type} for DPR ${report.sourceItemId}: source id=${sourceId || '-'}, name=${sourceName || '-'}.`);
}

function sameBusinessReport(existing: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const keys = ['dpr_number', 'report_date', 'project_id', 'unlisted_project_name', 'vessel_id', 'issuer_name_snapshot', 'description', 'qhse_note'];
  if (!keys.every((key) => String(existing[key] ?? '') === String(payload[key] ?? ''))) return false;
  const existingModifiedAt = existing.source_modified_at ? Date.parse(String(existing.source_modified_at)) : null;
  const payloadModifiedAt = payload.source_modified_at ? Date.parse(String(payload.source_modified_at)) : null;
  return existingModifiedAt === payloadModifiedAt;
}

async function loadReportRelations(client: SupabaseClient, companyId: number, dprId: number, report: DprMigrationReport, people: TargetPerson[]) {
  for (let index = 0; index < report.crewPersonSharePointItemIds.length; index += 1) {
    const person = resolvePerson(report.crewPersonSharePointItemIds[index], report.crewPersonNames[index] || null, people);
    const { error } = await client.from('dpr_crew_members').upsert({
      dpr_id: dprId, company_id: companyId, person_id: person.id, crew_function: crewFunction(person),
      roster_group: null, display_name_snapshot: person.name, display_order: index,
    }, { onConflict: 'dpr_id,person_id,crew_function' });
    if (error) throw new Error(`Cannot load crew for DPR ${report.sourceItemId}: ${error.message}`);
  }
  for (let index = 0; index < report.otherPeopleNames.length; index += 1) {
    const name = report.otherPeopleNames[index];
    const matches = people.filter((person) => normalize(person.name) === normalize(name));
    const person = matches.length ? canonicalPerson(matches[0], people) : null;
    const { data: existing, error: existingError } = await client.from('dpr_other_people').select('id')
      .eq('dpr_id', dprId).eq('display_name_snapshot', name).maybeSingle();
    if (existingError) throw new Error(`Cannot inspect other people for DPR ${report.sourceItemId}: ${existingError.message}`);
    if (!existing) {
      const { error } = await client.from('dpr_other_people').insert({
        dpr_id: dprId, company_id: companyId, person_id: person?.id || null, display_name_snapshot: name, display_order: index,
      });
      if (error) throw new Error(`Cannot load other people for DPR ${report.sourceItemId}: ${error.message}`);
    }
  }
  for (const incident of report.incidents) {
    const { error } = await client.from('dpr_incidents').upsert({ dpr_id: dprId, company_id: companyId, ...incident }, { onConflict: 'dpr_id,category' });
    if (error) throw new Error(`Cannot load incidents for DPR ${report.sourceItemId}: ${error.message}`);
  }
  const { error: hseError } = await client.from('dpr_hse_actions').upsert({
    dpr_id: dprId, company_id: companyId,
    tbt_performed: report.hseActions.tbtPerformed, tbt_theme: report.hseActions.tbtTheme,
    hse_visit_performed: report.hseActions.hseVisitPerformed, hse_audit_performed: report.hseActions.hseAuditPerformed,
    good_practices_count: report.hseActions.goodPracticesCount,
    dangerous_situations_count: report.hseActions.dangerousSituationsCount, stop_work_count: report.hseActions.stopWorkCount,
  }, { onConflict: 'dpr_id' });
  if (hseError) throw new Error(`Cannot load HSE actions for DPR ${report.sourceItemId}: ${hseError.message}`);
  for (const exercise of report.emergencyExercises) {
    const { error } = await client.from('dpr_emergency_exercises').upsert({
      dpr_id: dprId, company_id: companyId, exercise_type_key: exercise.key,
    }, { onConflict: 'dpr_id,exercise_type_key' });
    if (error) throw new Error(`Cannot load emergency exercises for DPR ${report.sourceItemId}: ${error.message}`);
  }
  if (report.portCall) {
    const calls = report.portCall.arrivalAt && report.portCall.departureAt && new Date(report.portCall.departureAt) < new Date(report.portCall.arrivalAt)
      ? [{ arrival_at: null, departure_at: report.portCall.departureAt, display_order: 0 }, { arrival_at: report.portCall.arrivalAt, departure_at: null, display_order: 1 }]
      : [{ arrival_at: report.portCall.arrivalAt, departure_at: report.portCall.departureAt, display_order: 0 }];
    for (const call of calls) {
      const { data: existing, error: existingError } = await client.from('dpr_port_calls').select('id')
        .eq('dpr_id', dprId).eq('display_order', call.display_order).maybeSingle();
      if (existingError) throw new Error(`Cannot inspect port calls for DPR ${report.sourceItemId}: ${existingError.message}`);
      let portCallId: number;
      if (existing) {
        portCallId = Number(existing.id);
        const { error } = await client.from('dpr_port_calls').update({ ...call, company_id: companyId }).eq('id', portCallId);
        if (error) throw new Error(`Cannot update port call for DPR ${report.sourceItemId}: ${error.message}`);
      } else {
        const { data, error } = await client.from('dpr_port_calls').insert({ ...call, dpr_id: dprId, company_id: companyId }).select('id').single();
        if (error) throw new Error(`Cannot insert port call for DPR ${report.sourceItemId}: ${error.message}`);
        portCallId = Number(data.id);
      }
      for (const reason of report.portCall.reasons) {
        const { error } = await client.from('dpr_port_call_reasons').upsert({
          port_call_id: portCallId, company_id: companyId, reason_type_key: reason,
        }, { onConflict: 'port_call_id,reason_type_key' });
        if (error) throw new Error(`Cannot load port-call reasons for DPR ${report.sourceItemId}: ${error.message}`);
      }
    }
  }
  if (Object.values(report.supplies).some((value) => value !== null)) {
    const { error } = await client.from('dpr_supplies').upsert({
      dpr_id: dprId, company_id: companyId, fuel_m3: report.supplies.fuelM3,
      oil_liters: report.supplies.oilLiters, water_m3: report.supplies.waterM3,
    }, { onConflict: 'dpr_id' });
    if (error) throw new Error(`Cannot load supplies for DPR ${report.sourceItemId}: ${error.message}`);
  }
  for (const waste of report.wasteRecords) {
    const { error } = await client.from('dpr_waste_records').upsert({
      dpr_id: dprId, company_id: companyId, waste_type_key: waste.key, quantity: waste.quantity, unit: waste.unit,
    }, { onConflict: 'dpr_id,waste_type_key' });
    if (error) throw new Error(`Cannot load waste records for DPR ${report.sourceItemId}: ${error.message}`);
  }
}

async function upsertMigrationRecord(
  client: SupabaseClient,
  companyId: number,
  batchId: number,
  entityType: string,
  containerId: string,
  sourceItemId: string,
  state: string,
  action: string,
  targetTable: string | null,
  targetId: number | null,
  sourcePayload: Record<string, unknown>,
) {
  const payloadHash = sha256(stableJson(sourcePayload));
  const recordPayload = {
    company_id: companyId, batch_id: batchId, entity_type: entityType, source_site_id: DPR_SITE_ID,
    source_container_id: containerId, source_item_id: sourceItemId, target_table: targetTable, target_id: targetId,
    state, action, attempts: 1, updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from('migration_records').upsert(recordPayload, {
    onConflict: 'company_id,source_site_id,source_container_id,source_item_id,entity_type',
  }).select('id').single();
  if (error) throw new Error(`Cannot record migration state for ${entityType} ${sourceItemId}: ${error.message}`);
  const { error: snapshotError } = await client.from('migration_source_snapshots').upsert({
    company_id: companyId, batch_id: batchId, migration_record_id: Number(data.id), source_payload: sourcePayload, payload_sha256: payloadHash,
  }, { onConflict: 'migration_record_id' });
  if (snapshotError) throw new Error(`Cannot persist source snapshot for ${entityType} ${sourceItemId}: ${snapshotError.message}`);
}

async function loadReports(
  client: SupabaseClient,
  manifest: DprMigrationManifest,
  companyId: number,
  batchId: number,
  counters: ApplyCounters,
  dependencies: DprMigrationCliDependencies,
): Promise<LoadedReport[]> {
  const projects = await getReferences(client, 'projects', companyId);
  const vessels = await getReferences(client, 'vessels', companyId);
  const people = await ensureHistoricalPeople(client, companyId, manifest.reports, await getPeople(client, companyId));
  await consolidateTanguySimonet(client, companyId, people);
  const exerciseTypes = new Map<string, string>();
  manifest.reports.flatMap((report) => report.emergencyExercises).forEach((exercise) => exerciseTypes.set(exercise.key, exercise.label));
  let historicalOrder = 100;
  for (const [key, label] of exerciseTypes) {
    const { error } = await client.from('emergency_exercise_types').upsert({ key, label, display_order: historicalOrder, active: !key.startsWith('historical-') }, { onConflict: 'key' });
    if (error) throw new Error(`Cannot load emergency exercise type ${label}: ${error.message}`);
    historicalOrder += 10;
  }
  const { data: completedRecords, error: completedRecordsError } = await client.from('migration_records')
    .select('source_item_id,target_id')
    .eq('company_id', companyId)
    .eq('entity_type', 'dpr-report')
    .eq('source_site_id', DPR_SITE_ID)
    .eq('source_container_id', DPR_LIST_ID)
    .eq('state', 'db-loaded')
    .limit(2000);
  if (completedRecordsError) throw new Error(`Cannot inspect completed DPR migration records: ${completedRecordsError.message}`);
  const completedReportTargets = new Map((completedRecords || []).map((row) => [String(row.source_item_id), Number(row.target_id)]));
  const loaded = new Array<LoadedReport>(manifest.reports.length);
  let nextIndex = 0;
  let completed = 0;
  async function loadNextReport() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= manifest.reports.length) return;
      const report = manifest.reports[index];
    const issuer = report.issuerSharePointItemId || report.issuerName !== 'Import SharePoint'
      ? resolvePerson(report.issuerSharePointItemId, report.issuerName === 'Import SharePoint' ? null : report.issuerName, people)
      : null;
    const payload: Record<string, unknown> = {
      company_id: companyId,
      dpr_number: report.dprNumber,
      status: 'validated',
      report_date: report.reportDate,
      project_id: resolveReference(report, projects, 'project'),
      unlisted_project_name: report.projectSharePointItemId ? null : report.unlistedProjectName,
      vessel_id: resolveReference(report, vessels, 'vessel'),
      issuer_user_id: null,
      issuer_name_snapshot: issuer?.name || report.issuerName,
      description: report.description,
      qhse_note: report.qhseNote,
      source_label: 'sharepoint',
      sharepoint_site_id: DPR_SITE_ID,
      sharepoint_site_url: DPR_SITE_URL,
      sharepoint_list_id: DPR_LIST_ID,
      sharepoint_item_id: report.sourceItemId,
      sharepoint_unique_id: report.sourceUniqueId,
      source_modified_at: report.sourceModifiedAt,
      migration_batch_id: batchId,
      source_payload: report.raw,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: existingError } = await client.from('dpr_reports').select('*')
      .eq('company_id', companyId).eq('sharepoint_site_id', DPR_SITE_ID).eq('sharepoint_list_id', DPR_LIST_ID)
      .eq('sharepoint_item_id', report.sourceItemId).maybeSingle();
    if (existingError) throw new Error(`Cannot inspect DPR ${report.sourceItemId}: ${existingError.message}`);
    let action: LoadedReport['action'];
    let dprId: number;
    if (!existing) {
      const { data, error } = await client.from('dpr_reports').insert(payload).select('id').single();
      if (error) throw new Error(`Cannot insert DPR ${report.sourceItemId}: ${error.message}`);
      dprId = Number(data.id);
      action = 'inserted';
      counters.reportsInserted += 1;
      const { error: auditError } = await client.from('dpr_audit_events').insert({
        company_id: companyId, dpr_id: dprId, version_no: 1, event_type: 'imported', metadata: { source: 'sharepoint', source_item_id: report.sourceItemId, migration_batch_id: batchId },
      });
      if (auditError) throw new Error(`Cannot audit imported DPR ${report.sourceItemId}: ${auditError.message}`);
    } else if (sameBusinessReport(existing as Record<string, unknown>, payload)) {
      dprId = Number(existing.id);
      action = 'unchanged';
      counters.reportsUnchanged += 1;
    } else {
      dprId = Number(existing.id);
      const { error } = await client.from('dpr_reports').update(payload).eq('id', dprId).eq('company_id', companyId);
      if (error) throw new Error(`Cannot update DPR ${report.sourceItemId}: ${error.message}`);
      action = 'updated';
      counters.reportsUpdated += 1;
    }
    const alreadyFullyLoaded = action === 'unchanged' && completedReportTargets.get(report.sourceItemId) === dprId;
    if (!alreadyFullyLoaded) {
      if (report.fuelConsumedLiters !== null || report.fuelOnBoardLiters !== null) {
        const { error } = await client.from('dpr_daily_metrics').upsert({
          dpr_id: dprId, company_id: companyId, fuel_consumed_liters: report.fuelConsumedLiters, fuel_on_board_liters: report.fuelOnBoardLiters,
        }, { onConflict: 'dpr_id' });
        if (error) throw new Error(`Cannot load DPR metrics ${report.sourceItemId}: ${error.message}`);
      }
      await loadReportRelations(client, companyId, dprId, report, people);
      await upsertMigrationRecord(client, companyId, batchId, 'dpr-report', DPR_LIST_ID, report.sourceItemId, 'db-loaded', action, 'dpr_reports', dprId, report.raw);
    }
      loaded[index] = { action, dprId, report };
      completed += 1;
      if (completed % 50 === 0 || completed === manifest.reports.length) {
        dependencies.writeLine(`DPR database progress: ${completed}/${manifest.reports.length}.`);
      }
    }
  }
  const concurrency = Math.min(8, manifest.reports.length);
  await Promise.all(Array.from({ length: concurrency }, () => loadNextReport()));
  return loaded;
}

function bucketFor(file: DprMigrationFile): 'dpr-pdfs' | 'dpr-photos' | 'dpr-attachments' {
  if (file.kind === 'pdf') return 'dpr-pdfs';
  if (file.kind === 'photo') return 'dpr-photos';
  return 'dpr-attachments';
}

function resolveFileReport(file: DprMigrationFile, reports: LoadedReport[]): LoadedReport {
  const bySource = file.dprSharePointItemId ? reports.filter((entry) => entry.report.sourceItemId === file.dprSharePointItemId) : [];
  if (bySource.length === 1) return bySource[0];
  const byNumber = file.dprNumber === null ? [] : reports.filter((entry) => entry.report.dprNumber === file.dprNumber);
  if (byNumber.length === 1) return byNumber[0];
  throw new Error(`Cannot unambiguously attach file ${file.sourceItemId} (${file.fileName}) to a DPR.`);
}

async function downloadSharePointFile(file: DprMigrationFile, targetPath: string, dependencies: DprMigrationCliDependencies) {
  const result = await dependencies.runCommand('pnpm', [
    '--package=@pnp/cli-microsoft365', 'dlx', 'm365', 'spo', 'file', 'get', '--webUrl', DPR_SITE_URL,
    '--url', file.serverRelativeUrl, '--asFile', '--path', targetPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`SharePoint download failed for ${file.fileName}: ${result.stderr || result.stdout}`);
}

async function loadFiles(client: SupabaseClient, manifest: DprMigrationManifest, companyId: number, batchId: number, reports: LoadedReport[], counters: ApplyCounters, dependencies: DprMigrationCliDependencies) {
  const tempDirectory = await mkdtemp(resolve(tmpdir(), 'seapilot-dpr-'));
  const { data: completedRecords, error: completedRecordsError } = await client.from('migration_records')
    .select('source_item_id,target_id')
    .eq('company_id', companyId)
    .eq('entity_type', 'dpr-file')
    .eq('source_site_id', DPR_SITE_ID)
    .eq('source_container_id', DPR_LIBRARY_ID)
    .eq('state', 'reconciled')
    .limit(2000);
  if (completedRecordsError) throw new Error(`Cannot inspect completed file migration records: ${completedRecordsError.message}`);
  const completedFileTargets = new Map((completedRecords || []).map((row) => [String(row.source_item_id), Number(row.target_id)]));
  let completedFiles = 0;
  try {
    for (const file of manifest.files) {
      if (file.kind === 'excluded') {
        counters.filesExcluded += 1;
        await upsertMigrationRecord(client, companyId, batchId, 'dpr-file', DPR_LIBRARY_ID, file.sourceItemId, 'excluded', 'excluded', null, null, file.raw);
        completedFiles += 1;
        continue;
      }
      const linkedReport = resolveFileReport(file, reports);
      const localSourcePath = resolve(activeSourceFilesDirectory, file.fileName);
      const tempPath = resolve(tempDirectory, `${file.sourceItemId}-${basename(file.fileName)}`);
      let bytes: Uint8Array;
      try {
        bytes = await dependencies.readBinaryFile(localSourcePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await downloadSharePointFile(file, tempPath, dependencies);
        bytes = await dependencies.readBinaryFile(tempPath);
      }
      const checksum = sha256(bytes);
      const sizeBytes = bytes.byteLength;
      if (file.sizeBytes !== null && file.sizeBytes !== sizeBytes) throw new Error(`Size mismatch for ${file.fileName}: SharePoint=${file.sizeBytes}, downloaded=${sizeBytes}.`);
      const bucket = bucketFor(file);
      let objectPath = storageObjectPath(companyId, linkedReport.dprId, file);
      if (file.kind !== 'pdf') {
        const { data: duplicate, error: duplicateError } = await client.from('dpr_files').select('object_path')
          .eq('company_id', companyId).eq('file_kind', file.kind).eq('sha256', checksum).eq('size_bytes', sizeBytes).eq('status', 'ready').limit(1).maybeSingle();
        if (duplicateError) throw new Error(`Cannot inspect attachment deduplication: ${duplicateError.message}`);
        if (duplicate?.object_path) objectPath = String(duplicate.object_path);
      }
      const { data: existingMetadata, error: existingMetadataError } = await client.from('dpr_files').select('*')
        .eq('company_id', companyId).eq('sharepoint_site_id', DPR_SITE_ID).eq('sharepoint_drive_id', DPR_DRIVE_ID)
        .eq('sharepoint_item_id', file.sourceItemId).maybeSingle();
      if (existingMetadataError) throw new Error(`Cannot inspect file metadata ${file.sourceItemId}: ${existingMetadataError.message}`);
      if (!existingMetadata || existingMetadata.sha256 !== checksum || existingMetadata.status !== 'ready') {
        const { data: existingObject } = await client.storage.from(bucket).download(objectPath);
        if (existingObject) {
          const targetChecksum = sha256(new Uint8Array(await existingObject.arrayBuffer()));
          if (targetChecksum !== checksum) throw new Error(`Storage checksum conflict at ${bucket}/${objectPath}.`);
          counters.filesReused += 1;
        } else {
          const { error: uploadError } = await client.storage.from(bucket).upload(objectPath, bytes, { contentType: file.mimeType, upsert: false });
          if (uploadError) throw new Error(`Cannot upload ${file.fileName}: ${uploadError.message}`);
          counters.filesUploaded += 1;
        }
      } else {
        counters.filesReused += 1;
      }
      const metadata = {
        company_id: companyId, dpr_id: linkedReport.dprId, file_kind: file.kind, bucket_name: bucket,
        object_path: objectPath, original_filename: file.fileName, display_filename: file.fileName,
        mime_type: file.mimeType, size_bytes: sizeBytes, sha256: checksum, status: 'ready',
        version_no: file.kind === 'pdf' ? 1 : null, is_current: file.kind === 'pdf', ready_at: dependencies.now().toISOString(),
        sharepoint_site_id: DPR_SITE_ID, sharepoint_drive_id: DPR_DRIVE_ID, sharepoint_item_id: file.sourceItemId,
        source_modified_at: file.sourceModifiedAt, migration_batch_id: batchId,
      };
      let fileId: number;
      if (existingMetadata) {
        const { data, error } = await client.from('dpr_files').update(metadata).eq('id', existingMetadata.id).select('id').single();
        if (error) throw new Error(`Cannot update metadata ${file.fileName}: ${error.message}`);
        fileId = Number(data.id);
      } else {
        const { data, error } = await client.from('dpr_files').insert(metadata).select('id').single();
        if (error) throw new Error(`Cannot insert metadata ${file.fileName}: ${error.message}`);
        fileId = Number(data.id);
      }
      counters.filesLinked += 1;
      if (completedFileTargets.get(file.sourceItemId) !== fileId) {
        await upsertMigrationRecord(client, companyId, batchId, 'dpr-file', DPR_LIBRARY_ID, file.sourceItemId, 'reconciled', existingMetadata ? 'unchanged' : 'inserted', 'dpr_files', fileId, file.raw);
      }
      await rm(tempPath, { force: true });
      completedFiles += 1;
      if (completedFiles % 25 === 0 || completedFiles === manifest.files.length) {
        dependencies.writeLine(`DPR file progress: ${completedFiles}/${manifest.files.length}.`);
      }
    }
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

async function reconcile(client: SupabaseClient, companyId: number, manifest: DprMigrationManifest) {
  const { count: reportCount, error: reportError } = await client.from('dpr_reports').select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('source_label', 'sharepoint').eq('sharepoint_list_id', DPR_LIST_ID);
  if (reportError) throw new Error(`Cannot count target DPR reports: ${reportError.message}`);
  const { data: files, error: fileError } = await client.from('dpr_files').select('id,dpr_id,file_kind,bucket_name,object_path,size_bytes,sha256,status')
    .eq('company_id', companyId).eq('sharepoint_site_id', DPR_SITE_ID).eq('sharepoint_drive_id', DPR_DRIVE_ID);
  if (fileError) throw new Error(`Cannot inspect target DPR files: ${fileError.message}`);
  const objectErrors: string[] = [];
  for (const file of files || []) {
    const { data, error } = await client.storage.from(String(file.bucket_name)).download(String(file.object_path));
    if (error || !data) {
      objectErrors.push(`Missing object for dpr_files.id=${file.id}: ${file.bucket_name}/${file.object_path}`);
      continue;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.byteLength !== Number(file.size_bytes) || sha256(bytes) !== file.sha256) objectErrors.push(`Checksum or size mismatch for dpr_files.id=${file.id}.`);
  }
  const eligibleFiles = manifest.files.filter((file) => file.kind !== 'excluded').length;
  const orphanMetadata = (files || []).filter((file) => !file.dpr_id).map((file) => file.id);
  return {
    sourceReports: manifest.reports.length,
    targetReports: reportCount || 0,
    sourceEligibleFiles: eligibleFiles,
    targetFileMetadata: files?.length || 0,
    objectErrors,
    orphanMetadata,
    ok: reportCount === manifest.reports.length && files?.length === eligibleFiles && objectErrors.length === 0 && orphanMetadata.length === 0,
  };
}

async function getOrCreateBatch(client: SupabaseClient, companyId: number, args: ParsedArgs, manifest: DprMigrationManifest) {
  const hash = manifestSha256(manifest);
  const migrationKey = `dpr-sharepoint-${hash.slice(0, 16)}`;
  const payload = {
    company_id: companyId, migration_key: migrationKey, source_kind: 'sharepoint', source_site_url: DPR_SITE_URL,
    mode: args.mode, status: 'running', manifest_sha256: hash, rules_version: args.rulesVersion,
    started_at: new Date().toISOString(), completed_at: null, counters: manifest.counters,
  };
  const { data, error } = await client.from('migration_batches').upsert(payload, { onConflict: 'company_id,migration_key' }).select('id').single();
  if (error) throw new Error(`Cannot create migration batch: ${error.message}`);
  return { batchId: Number(data.id), hash, migrationKey };
}

export async function runDprMigrationCli(
  argv: string[],
  environment: NodeJS.ProcessEnv,
  dependencies: DprMigrationCliDependencies,
): Promise<number> {
  try {
    const args = parseDprMigrationArgs(argv);
    activeSourceFilesDirectory = resolve(args.sourceFilesDirectory);
    const manifest = await loadManifest(args, dependencies);
    const validationErrors = validateDprManifest(manifest, {
      reports: args.expectedReports, pdfs: args.expectedPdfs, html: args.expectedHtml, attachments: args.expectedAttachments,
    });
    if (args.mode === 'inventory' || args.mode === 'dry-run') {
      await writeJson(args.manifestPath, manifest, dependencies);
      await writeJson(args.reportPath, { mode: args.mode, manifestSha256: manifestSha256(manifest), counters: manifest.counters, validationErrors }, dependencies);
      dependencies.writeLine(`DPR manifest: ${resolve(args.manifestPath)}`);
      dependencies.writeLine(`Reports=${manifest.counters.reports}, PDFs=${manifest.counters.pdfs}, attachments=${manifest.counters.attachments}, excluded HTML=${manifest.counters.excludedHtml}.`);
      if (validationErrors.length) {
        validationErrors.forEach((error) => dependencies.writeLine(`BLOCKING: ${error}`));
        return 2;
      }
      return 0;
    }
    if (validationErrors.length) throw new Error(`Manifest validation failed: ${validationErrors.join(' ')}`);
    const client = dependencies.createClient(requireEnvironment(environment, 'SUPABASE_URL'), requireEnvironment(environment, 'SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: company, error: companyError } = await client.from('companies').select('id,code').eq('code', args.companyCode).single();
    if (companyError) throw new Error(`Cannot resolve company ${args.companyCode}: ${companyError.message}`);
    const companyId = Number(company.id);
    if (args.mode === 'reconcile') {
      const result = await reconcile(client, companyId, manifest);
      await writeJson(args.reportPath, { mode: args.mode, manifestSha256: manifestSha256(manifest), reconciliation: result }, dependencies);
      return result.ok ? 0 : 3;
    }
    const { batchId, hash, migrationKey } = await getOrCreateBatch(client, companyId, args, manifest);
    const counters: ApplyCounters = { reportsInserted: 0, reportsUpdated: 0, reportsUnchanged: 0, filesUploaded: 0, filesReused: 0, filesExcluded: 0, filesLinked: 0 };
    const loadedReports = await loadReports(client, manifest, companyId, batchId, counters, dependencies);
    await loadFiles(client, manifest, companyId, batchId, loadedReports, counters, dependencies);
    const reconciliation = await reconcile(client, companyId, manifest);
    const finalStatus = reconciliation.ok ? 'completed' : 'failed';
    const { error: batchError } = await client.from('migration_batches').update({
      status: finalStatus, completed_at: dependencies.now().toISOString(), counters: { ...manifest.counters, ...counters, reconciliation },
    }).eq('id', batchId).eq('company_id', companyId);
    if (batchError) throw new Error(`Cannot finalize migration batch: ${batchError.message}`);
    await writeJson(args.reportPath, { mode: args.mode, migrationKey, batchId, manifestSha256: hash, counters, reconciliation }, dependencies);
    dependencies.writeLine(`DPR migration ${finalStatus}: batch=${batchId}, reports=${manifest.reports.length}, files=${counters.filesLinked}.`);
    return reconciliation.ok ? 0 : 3;
  } catch (error) {
    dependencies.writeLine(`DPR migration failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
